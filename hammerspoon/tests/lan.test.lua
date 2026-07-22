package.path = "hammerspoon/?.lua;hammerspoon/?/init.lua;" .. package.path

local Crypto = require("streamdeck.crypto")
local Registry = require("streamdeck.registry")
local Protocol = require("streamdeck.protocol")
local Context = require("streamdeck.context")
local Server = require("streamdeck.server")

local function writeFile(path, value)
  local handle = assert(io.open(path, "wb"))
  assert(handle:write(value))
  assert(handle:close())
  os.execute("/bin/chmod 600 " .. string.format("'%s'", path:gsub("'", "'\\''")))
end
local function encode(value) return assert(_G.hs.json.encode(value)) end
local function decode(value) return assert(_G.hs.json.decode(value)) end
local function frame(payload, key, sequence, direction)
  local mac = Crypto.frameMac(_G.__streamdeckTestHash, key, direction, sequence, payload)
  return encode({ protocolVersion = 1, type = "lanFrame", sequence = sequence, payload = payload, mac = Crypto.hexEncode(mac) })
end
local function hello(clientId, nonce)
  return encode({ protocolVersion = 1, type = "lanHello", clientId = clientId, clientNonce = Crypto.hexEncode(nonce), protocolVersion = 1 })
end

local tokenPath, keyPath = os.tmpname(), os.tmpname()
writeFile(tokenPath, "legacy-token")
local key = string.rep("K", 32)
writeFile(keyPath, key)
local pressed = 0
local registry = Registry.new()
assert(registry:register({
  id = "com.test.lan",
  name = "LAN",
  appearance = function() return { title = "LAN", state = 0 } end,
  press = function() pressed = pressed + 1 end,
}))
local server = Server.new(registry, Protocol, Context)
assert(server:start({
  tokenPath = tokenPath,
  lan = { interface = "en0", port = 17322, clients = { remote = keyPath } },
}))
local http = _G.fakeHttp
assert(http and http.interface == "en0" and http.port == 17322)
local now = 0
server._now = function() return now end

local clientNonce = string.rep("\1", 32)
local challenge = decode(http.websocketCallback(hello("remote", clientNonce)))
assert(challenge.type == "lanChallenge" and challenge.clientId == "remote")
local serverNonce = assert(Crypto.hexDecode(challenge.serverNonce, 32))
local clientProof = Crypto.proof(_G.__streamdeckTestHash, key, "client", "remote", clientNonce, serverNonce)
local ready = decode(http.websocketCallback(encode({ protocolVersion = 1, type = "lanProof", clientId = "remote", clientProof = Crypto.hexEncode(clientProof) })))
assert(ready.type == "lanReady")
local sessionId = ready.sessionId
local salt = Crypto.kdfSalt("remote", clientNonce, serverNonce)
local clientToServer = assert(Crypto.hkdf(_G.__streamdeckTestHash, key, salt, Crypto.frameInfo("client-to-server"), 32))
local serverToClient = assert(Crypto.hkdf(_G.__streamdeckTestHash, key, salt, Crypto.frameInfo("server-to-client"), 32))
local listPayload = assert(Protocol.encode({ protocolVersion = 1, type = "listActions", sessionId = sessionId, requestId = "lan-list" }))
local listResponse = decode(http.websocketCallback(frame(listPayload, clientToServer, 1, "client-to-server")))
assert(listResponse.type == "lanFrame" and listResponse.sequence == 1)
local listMac = Crypto.frameMac(_G.__streamdeckTestHash, serverToClient, "server-to-client", 1, listResponse.payload)
assert(Crypto.doubleHmacEqual(_G.__streamdeckTestHash, listMac, assert(Crypto.hexDecode(listResponse.mac, 32))))

local appearedPayload = assert(Protocol.encode({ protocolVersion = 1, type = "instanceAppeared", sessionId = sessionId, instanceId = "lan-instance", actionId = "com.test.lan", settings = {} }))
http.websocketCallback(frame(appearedPayload, clientToServer, 2, "client-to-server"))
local pressPayload = assert(Protocol.encode({ protocolVersion = 1, type = "keyDown", sessionId = sessionId, instanceId = "lan-instance", actionId = "com.test.lan" }))
http.websocketCallback(frame(pressPayload, clientToServer, 3, "client-to-server"))
assert(pressed == 1, "authenticated LAN frame must dispatch")

local loopbackHttp = server.legacySlot.http
local lanHttp = server.slots[2].http
local loopbackError = decode(loopbackHttp.websocketCallback(encode({
  protocolVersion = 1,
  type = "listActions",
  sessionId = "unauthenticated-loopback",
  requestId = "unauthenticated-loopback",
})))
assert(loopbackError.type == "error" and loopbackError.code == "AUTH_REQUIRED")
local lanSent, loopbackSent = #lanHttp.sent, #loopbackHttp.sent
server:refresh("com.test.lan")
assert(#lanHttp.sent == lanSent + 1, "LAN session appearance must remain framed on the LAN listener")
assert(#loopbackHttp.sent == loopbackSent, "unauthenticated loopback traffic must not receive LAN appearance")

local tampered = encode({ protocolVersion = 1, type = "lanFrame", sequence = 4, payload = pressPayload, mac = Crypto.hexEncode(Crypto.frameMac(_G.__streamdeckTestHash, clientToServer, "client-to-server", 3, pressPayload)) })
local tamperedResponse = decode(http.websocketCallback(tampered))
assert(tamperedResponse.type == "error" and tamperedResponse.code == "AUTH_FAILED")
assert(pressed == 1, "tampered LAN frame must not dispatch")
local tamperedReplay = decode(http.websocketCallback(encode({
  protocolVersion = 1,
  type = "lanProof",
  clientId = "remote",
  clientProof = Crypto.hexEncode(clientProof),
})))
assert(tamperedReplay.type == "error" and tamperedReplay.code == "AUTH_FAILED", "tampered frame must discard its handshake")

local downgrade = decode(http.websocketCallback(encode({ protocolVersion = 1, type = "hello", token = "legacy-token", pluginVersion = "1.0.0" })))
assert(downgrade.type == "error" and downgrade.code == "AUTH_REQUIRED", "LAN listener must reject v1 hello")

local reconnectNonce = string.rep("\3", 32)
local reconnectChallenge = decode(http.websocketCallback(hello("remote", reconnectNonce)))
local reconnectServerNonce = assert(Crypto.hexDecode(reconnectChallenge.serverNonce, 32))
local reconnectProof = Crypto.proof(_G.__streamdeckTestHash, key, "client", "remote", reconnectNonce, reconnectServerNonce)
local reconnectReady = decode(http.websocketCallback(encode({ protocolVersion = 1, type = "lanProof", clientId = "remote", clientProof = Crypto.hexEncode(reconnectProof) })))
assert(reconnectReady.type == "lanReady" and reconnectReady.sessionId ~= sessionId, "reconnect must rotate the LAN session")
local reconnectSalt = Crypto.kdfSalt("remote", reconnectNonce, reconnectServerNonce)
local reconnectClientToServer = assert(Crypto.hkdf(_G.__streamdeckTestHash, key, reconnectSalt, Crypto.frameInfo("client-to-server"), 32))
local reconnectAppeared = assert(Protocol.encode({ protocolVersion = 1, type = "instanceAppeared", sessionId = reconnectReady.sessionId, instanceId = "lan-instance", actionId = "com.test.lan", settings = {} }))
http.websocketCallback(frame(reconnectAppeared, reconnectClientToServer, 1, "client-to-server"))

writeFile(keyPath, string.rep("R", 32))
local revoked = decode(http.websocketCallback(frame(reconnectAppeared, reconnectClientToServer, 2, "client-to-server")))
assert(revoked.type == "error" and revoked.code == "AUTH_FAILED", "revocation must drop the active LAN session")
assert(pressed == 1, "revoked LAN session must not dispatch")

now = now + 60

local rotatedKey = string.rep("N", 32)
writeFile(keyPath, rotatedKey)
local rotatedNonce = string.rep("\4", 32)
local rotatedChallenge = decode(http.websocketCallback(hello("remote", rotatedNonce)))
local rotatedServerNonce = assert(Crypto.hexDecode(rotatedChallenge.serverNonce, 32))
local rotatedProof = Crypto.proof(_G.__streamdeckTestHash, rotatedKey, "client", "remote", rotatedNonce, rotatedServerNonce)
local rotatedReady = decode(http.websocketCallback(encode({ protocolVersion = 1, type = "lanProof", clientId = "remote", clientProof = Crypto.hexEncode(rotatedProof) })))
assert(rotatedReady.type == "lanReady", "rotated key must reconnect")
local rotatedSalt = Crypto.kdfSalt("remote", rotatedNonce, rotatedServerNonce)
local rotatedClientToServer = assert(Crypto.hkdf(_G.__streamdeckTestHash, rotatedKey, rotatedSalt, Crypto.frameInfo("client-to-server"), 32))
local rotatedAppeared = assert(Protocol.encode({ protocolVersion = 1, type = "instanceAppeared", sessionId = rotatedReady.sessionId, instanceId = "lan-instance", actionId = "com.test.lan", settings = {} }))
http.websocketCallback(frame(rotatedAppeared, rotatedClientToServer, 1, "client-to-server"))
local rotatedPress = assert(Protocol.encode({ protocolVersion = 1, type = "keyDown", sessionId = rotatedReady.sessionId, instanceId = "lan-instance", actionId = "com.test.lan" }))
http.websocketCallback(frame(rotatedPress, rotatedClientToServer, 2, "client-to-server"))
assert(pressed == 2, "rotated key reconnect must dispatch")

local staleHello = decode(http.websocketCallback(hello("unknown", string.rep("\5", 32))))
assert(staleHello.type == "error" and staleHello.code == "AUTH_FAILED")
local replayedProof = decode(http.websocketCallback(encode({
  protocolVersion = 1,
  type = "lanProof",
  clientId = "remote",
  clientProof = Crypto.hexEncode(rotatedProof),
})))
assert(replayedProof.type == "error" and replayedProof.code == "AUTH_FAILED", "stale LAN proof must not restore a session")

local unsafeSequence = decode(http.websocketCallback(encode({
  protocolVersion = 1,
  type = "lanFrame",
  sequence = 9007199254740992,
  payload = rotatedPress,
  mac = string.rep("00", 32),
})))
assert(unsafeSequence.type == "error" and unsafeSequence.code == "AUTH_FAILED", "unsafe frame sequence must fail closed")

local replayNonce = string.rep("\6", 32)
local replayChallenge = decode(http.websocketCallback(hello("remote", replayNonce)))
local replayServerNonce = assert(Crypto.hexDecode(replayChallenge.serverNonce, 32))
local replayProof = Crypto.proof(_G.__streamdeckTestHash, rotatedKey, "client", "remote", replayNonce, replayServerNonce)
local replayReady = decode(http.websocketCallback(encode({
  protocolVersion = 1,
  type = "lanProof",
  clientId = "remote",
  clientProof = Crypto.hexEncode(replayProof),
})))
local replaySalt = Crypto.kdfSalt("remote", replayNonce, replayServerNonce)
local replayClientToServer = assert(Crypto.hkdf(_G.__streamdeckTestHash, rotatedKey, replaySalt, Crypto.frameInfo("client-to-server"), 32))
local replayAppeared = assert(Protocol.encode({
  protocolVersion = 1,
  type = "instanceAppeared",
  sessionId = replayReady.sessionId,
  instanceId = "lan-instance",
  actionId = "com.test.lan",
  settings = {},
}))
http.websocketCallback(frame(replayAppeared, replayClientToServer, 1, "client-to-server"))
local replayPress = assert(Protocol.encode({
  protocolVersion = 1,
  type = "keyDown",
  sessionId = replayReady.sessionId,
  instanceId = "lan-instance",
  actionId = "com.test.lan",
}))
http.websocketCallback(frame(replayPress, replayClientToServer, 2, "client-to-server"))
local replayedFrame = decode(http.websocketCallback(frame(replayPress, replayClientToServer, 2, "client-to-server")))
assert(replayedFrame.type == "error" and replayedFrame.code == "AUTH_FAILED", "replayed LAN frame must fail closed")

local reflectedNonce = string.rep("\7", 32)
local reflectedChallenge = decode(http.websocketCallback(hello("remote", reflectedNonce)))
local reflectedServerNonce = assert(Crypto.hexDecode(reflectedChallenge.serverNonce, 32))
local reflectedProof = Crypto.proof(_G.__streamdeckTestHash, rotatedKey, "client", "remote", reflectedNonce, reflectedServerNonce)
local reflectedReady = decode(http.websocketCallback(encode({
  protocolVersion = 1,
  type = "lanProof",
  clientId = "remote",
  clientProof = Crypto.hexEncode(reflectedProof),
})))
local reflectedSalt = Crypto.kdfSalt("remote", reflectedNonce, reflectedServerNonce)
local reflectedClientToServer = assert(Crypto.hkdf(_G.__streamdeckTestHash, rotatedKey, reflectedSalt, Crypto.frameInfo("client-to-server"), 32))
local reflectedServerToClient = assert(Crypto.hkdf(_G.__streamdeckTestHash, rotatedKey, reflectedSalt, Crypto.frameInfo("server-to-client"), 32))
local reflectedAppeared = assert(Protocol.encode({
  protocolVersion = 1,
  type = "instanceAppeared",
  sessionId = reflectedReady.sessionId,
  instanceId = "lan-instance",
  actionId = "com.test.lan",
  settings = {},
}))
http.websocketCallback(frame(reflectedAppeared, reflectedClientToServer, 1, "client-to-server"))
local reflectedFrame = decode(http.websocketCallback(frame(reflectedAppeared, reflectedServerToClient, 2, "server-to-client")))
assert(reflectedFrame.type == "error" and reflectedFrame.code == "AUTH_FAILED", "reflected LAN frame must fail closed")

now = now + 60

local wrongNonce = string.rep("\2", 32)
local wrongChallenge = decode(http.websocketCallback(hello("remote", wrongNonce)))
local wrongServerNonce = assert(Crypto.hexDecode(wrongChallenge.serverNonce, 32))
local wrongKeyProof = Crypto.proof(_G.__streamdeckTestHash, string.rep("W", 32), "client", "remote", wrongNonce, wrongServerNonce)
local wrongResponse = decode(http.websocketCallback(encode({ protocolVersion = 1, type = "lanProof", clientId = "remote", clientProof = Crypto.hexEncode(wrongKeyProof) })))
assert(wrongResponse.type == "error" and wrongResponse.code == "AUTH_FAILED")
assert(pressed == 3, "wrong-key LAN peer must not dispatch")

now = now + 60

local hmacCalls = 0
local realHmacSha256 = _G.hs.hash.hmacSHA256
_G.hs.hash.hmacSHA256 = function(...)
  hmacCalls = hmacCalls + 1
  return realHmacSha256(...)
end
local oversizedNonce = string.rep("\9", 32)
local oversizedChallenge = decode(http.websocketCallback(hello("remote", oversizedNonce)))
local oversizedServerNonce = assert(Crypto.hexDecode(oversizedChallenge.serverNonce, 32))
local oversizedProof = Crypto.proof(_G.__streamdeckTestHash, rotatedKey, "client", "remote", oversizedNonce, oversizedServerNonce)
local oversizedReady = decode(http.websocketCallback(encode({ protocolVersion = 1, type = "lanProof", clientId = "remote", clientProof = Crypto.hexEncode(oversizedProof) })))
assert(oversizedReady.type == "lanReady", "oversized-payload test needs an authenticated session")
assert(hmacCalls > 0, "instrumented hash must observe handshake MAC work")

hmacCalls = 0
local oversizedResponse = decode(http.websocketCallback(encode({
  protocolVersion = 1,
  type = "lanFrame",
  sequence = 1,
  payload = string.rep("a", Protocol.MAX_LAN_PAYLOAD_BYTES + 1),
  mac = string.rep("00", 32),
})))
_G.hs.hash.hmacSHA256 = realHmacSha256
assert(oversizedResponse.type == "error" and oversizedResponse.code == "AUTH_FAILED", "oversized LAN payload must fail closed")
assert(hmacCalls == 0, "oversized LAN payload must be rejected before MAC computation")
assert(pressed == 3, "oversized LAN payload must not dispatch")
local oversizedSalt = Crypto.kdfSalt("remote", oversizedNonce, oversizedServerNonce)
local oversizedClientToServer = assert(Crypto.hkdf(_G.__streamdeckTestHash, rotatedKey, oversizedSalt, Crypto.frameInfo("client-to-server"), 32))
local droppedFollowUp = decode(http.websocketCallback(frame(rotatedPress, oversizedClientToServer, 2, "client-to-server")))
assert(droppedFollowUp.type == "error" and droppedFollowUp.code == "AUTH_REQUIRED", "oversized LAN payload must retire the session")

server:stop()
os.remove(tokenPath)
os.remove(keyPath)
return 5
