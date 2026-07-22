local Crypto = require("streamdeck.crypto")
local server = {}

local DEFAULT_PORT = 17321
local DEFAULT_LAN_PORT = 17322
local DEFAULT_TOKEN_SUFFIX = "/.hammerspoon/streamdeck-token"
local SOCKET_PATH = "/streamdeck"
local LAN_CLIENT_ID_PATTERN = "^[A-Za-z0-9%._%-]+$"
local MAX_LAN_CLIENTS = 4
local MAX_INSTANCES = 64

local function isSpecificInterface(interface)
  return type(interface) == "string"
    and interface ~= ""
    and interface ~= "0.0.0.0"
    and interface ~= "::"
end

local UNAUTH_RATE_BURST = 6
local UNAUTH_RATE_REFILL_PER_SECOND = 12 / 60
local AUTH_RATE_BURST = 240
local AUTH_RATE_REFILL_PER_SECOND = 120

local function isInteger(value)
  return type(value) == "number"
    and value == value
    and value ~= math.huge
    and value ~= -math.huge
    and math.floor(value) == value
end

local function isSafeInteger(value)
  return isInteger(value) and value <= 9007199254740991
end

local function shellQuote(value)
  return "'" .. tostring(value):gsub("'", "'\\''") .. "'"
end

local function chmod0600(path)
  local ok, result = pcall(os.execute, "/bin/chmod 600 " .. shellQuote(path))
  return ok and (result == true or result == 0)
end

local function permissionsAre0600(hsapi, path)
  if not hsapi.fs or type(hsapi.fs.attributes) ~= "function" then
    return false
  end
  local attributes = hsapi.fs.attributes(path)
  return type(attributes) == "table" and attributes.permissions == "rw-------"
end

local function ensureToken(hsapi, path)
  local attributes = hsapi.fs and hsapi.fs.attributes and hsapi.fs.attributes(path)
  if attributes == nil then
    if not hsapi.host or type(hsapi.host.uuid) ~= "function" then
      return nil, "token unavailable"
    end
    local handle, openError = io.open(path, "w")
    if not handle then
      return nil, openError or "token unavailable"
    end
    local token = hsapi.host.uuid() .. hsapi.host.uuid()
    local wrote, writeError = handle:write(token)
    local closed, closeError = handle:close()
    if not wrote or not closed then
      return nil, writeError or closeError or "token unavailable"
    end
  end

  if not chmod0600(path) or not permissionsAre0600(hsapi, path) then
    return nil, "token permissions"
  end

  local handle, openError = io.open(path, "r")
  if not handle then
    return nil, openError or "token unavailable"
  end
  local token, readError = handle:read("*a")
  local closed, closeError = handle:close()
  if not closed or not token or token == "" then
    return nil, readError or closeError or "token unavailable"
  end
  return token
end

local function validateOptions(options)
  if options ~= nil and type(options) ~= "table" then
    error("Stream Deck start options must be a table", 3)
  end
  options = options or {}
  for key in pairs(options) do
    if key ~= "port" and key ~= "tokenPath" and key ~= "lan" then
      error("Unknown Stream Deck start option: " .. tostring(key), 3)
    end
  end

  local port = options.port or DEFAULT_PORT
  if not isInteger(port) or port < 1 or port > 65535 then
    error("Stream Deck port must be an integer from 1 to 65535", 3)
  end

  local home = os.getenv("HOME")
  local defaultTokenPath = home and (home .. DEFAULT_TOKEN_SUFFIX) or nil
  local tokenPath = options.tokenPath or defaultTokenPath
  if type(tokenPath) ~= "string" or tokenPath == "" then
    error("Stream Deck tokenPath must be a non-empty string", 3)
  end

  local lan = options.lan
  if lan == nil then return port, tokenPath, {} end
  if type(lan) ~= "table" then error("Stream Deck lan option must be a table", 3) end
  for key in pairs(lan) do
    if key ~= "interface" and key ~= "port" and key ~= "clients" then
      error("Unknown Stream Deck LAN option: " .. tostring(key), 3)
    end
  end
  if type(lan.clients) ~= "table" then error("Stream Deck LAN clients must be a table", 3) end

  local entries = {}
  local list = true
  for key in pairs(lan.clients) do
    if type(key) ~= "number" then list = false break end
  end
  if list then
    for index, value in ipairs(lan.clients) do
      entries[#entries + 1] = { clientId = value and value.clientId, value = value, index = index }
    end
  else
    for clientId, value in pairs(lan.clients) do
      entries[#entries + 1] = { clientId = clientId, value = value }
    end
  end
  if #entries == 0 then error("Stream Deck LAN clients must not be empty", 3) end
  if #entries > MAX_LAN_CLIENTS then
    error("Stream Deck LAN client limit is " .. tostring(MAX_LAN_CLIENTS), 3)
  end

  local specs = {}
  local clientIds = {}
  local keyPaths = {}
  local ports = { [port] = true }
  local legacyInterface = lan.interface
  local legacyPort = lan.port or DEFAULT_LAN_PORT
  for _, entry in ipairs(entries) do
    local clientId = entry.clientId
    local value = entry.value
    if type(clientId) ~= "string" or #clientId < 1 or #clientId > 64
        or clientId:match(LAN_CLIENT_ID_PATTERN) == nil or clientIds[clientId] then
      error("Stream Deck LAN client IDs must be unique and use 1-64 safe characters", 3)
    end
    clientIds[clientId] = true

    local interface
    local listenerPort
    local keyPath
    if type(value) == "string" then
      if #entries ~= 1 then
        error("Stream Deck LAN clients must define one listener per client", 3)
      end
      interface, listenerPort, keyPath = legacyInterface, legacyPort, value
    elseif type(value) == "table" then
      for key in pairs(value) do
        if key ~= "clientId" and key ~= "interface" and key ~= "port" and key ~= "keyPath" then
          error("Unknown Stream Deck LAN client option: " .. tostring(key), 3)
        end
      end
      interface, listenerPort, keyPath = value.interface, value.port, value.keyPath
    else
      error("Stream Deck LAN client must define a keyPath", 3)
    end
    if not isSpecificInterface(interface) then
      error("Stream Deck LAN client interface must name a specific interface", 3)
    end
    if not isInteger(listenerPort) or listenerPort < 1 or listenerPort > 65535 or ports[listenerPort] then
      error("Stream Deck LAN client ports must be unique integers from 1 to 65535", 3)
    end
    if type(keyPath) ~= "string" or keyPath == "" or keyPaths[keyPath] then
      error("Stream Deck LAN credential paths must be unique non-empty strings", 3)
    end
    ports[listenerPort] = true
    keyPaths[keyPath] = true
    specs[#specs + 1] = {
      clientId = clientId,
      interface = interface,
      port = listenerPort,
      keyPath = keyPath,
    }
  end
  table.sort(specs, function(left, right) return left.clientId < right.clientId end)
  return port, tokenPath, specs
end

local function stopHttp(http)
  if http and type(http.stop) == "function" then
    pcall(http.stop, http)
  end
end

function server.new(registry, protocol, contextFactory)
  local object = {
    registry = registry,
    protocol = protocol,
    contextFactory = contextFactory,
    slots = {},
    slotsByHttp = {},
    legacySlot = nil,
    rateBuckets = {},
    started = false,
  }

  local function newSlot(spec)
    local slot = {
      isSlot = true,
      registry = registry,
      protocol = protocol,
      contextFactory = contextFactory,
      slotId = spec.slotId,
      clientId = spec.clientId,
      mode = spec.mode,
      interface = spec.interface,
      port = spec.port,
      credentialPath = spec.keyPath,
      http = nil,
      instances = {},
      lanKey = nil,
      lanClientNonce = nil,
      lanServerNonce = nil,
      lanSendKey = nil,
      lanReceiveKey = nil,
      lanSendSequence = 0,
      lanReceiveSequence = 0,
      token = nil,
      sessionId = nil,
      sessionMode = nil,
      rateBuckets = {},
      sessionGeneration = 0,
      started = false,
      authenticated = false,
      dispatching = false,
      responseQueue = nil,
    }
    return setmetatable(slot, { __index = object })
  end

  function object:_lanFrame(payload)
    local hsapi = rawget(_G, "hs")
    local key = self.lanSendKey
    if not key or type(payload) ~= "string" or #payload > self.protocol.MAX_LAN_PAYLOAD_BYTES then return nil end
    local sequence = self.lanSendSequence + 1
    local mac = Crypto.frameMac(hsapi, key, "server-to-client", sequence, payload)
    if not mac then return nil end
    local encoded = hsapi.json.encode({
      protocolVersion = self.protocol.VERSION,
      type = "lanFrame",
      sequence = sequence,
      payload = payload,
      mac = Crypto.hexEncode(mac),
    })
    if not encoded or #encoded > self.protocol.MAX_FRAME_BYTES then return nil end
    self.lanSendSequence = sequence
    return encoded
  end

  function object:_queue(message)
    local encoded = self.protocol.encode(message)
    if not encoded then return false end
    if self.mode == "lan" then
      encoded = self:_lanFrame(encoded)
      if not encoded then return false end
    end
    if self.responseQueue then
      self.responseQueue[#self.responseQueue + 1] = encoded
      return true
    end
    return self:_sendRaw(encoded)
  end

  function object:_queueError(code, requestId, instanceId)
    return self:_queue(self.protocol.error(code, requestId, instanceId))
  end

  function object:_sendRaw(encoded)
    local http = self.http
    if not self.started or not http or type(http.send) ~= "function" then
      return false
    end
    local ok = pcall(http.send, http, encoded)
    return ok
  end

  function object:_now()
    local hsapi = rawget(_G, "hs")
    local timer = hsapi and hsapi.timer
    if timer and type(timer.secondsSinceEpoch) == "function" then
      local ok, value = pcall(timer.secondsSinceEpoch)
      if ok and type(value) == "number" and value == value then return value end
    end
    return os.clock()
  end

  function object:_admitInbound(http, authenticated)
    if not http then return false end
    local listener = self.rateBuckets[http]
    if not listener then
      listener = {
        unauth = { tokens = UNAUTH_RATE_BURST, at = self:_now() },
        auth = { tokens = AUTH_RATE_BURST, at = self:_now() },
      }
      self.rateBuckets[http] = listener
    end
    local bucket = authenticated and listener.auth or listener.unauth
    local capacity = authenticated and AUTH_RATE_BURST or UNAUTH_RATE_BURST
    local refill = authenticated and AUTH_RATE_REFILL_PER_SECOND or UNAUTH_RATE_REFILL_PER_SECOND
    local now = self:_now()
    local elapsed = math.max(0, now - bucket.at)
    bucket.tokens = math.min(capacity, bucket.tokens + elapsed * refill)
    bucket.at = now
    if bucket.tokens < 1 then return false end
    bucket.tokens = bucket.tokens - 1
    return true
  end


  function object:_safeError(code)
    local encoded = self.protocol.encode(self.protocol.error(code))
    return encoded or ""
  end

  function object:_emitAppearance(instanceId, actionId, title, state, appearance)
    local message = {
      protocolVersion = self.protocol.VERSION,
      type = "appearance",
      instanceId = instanceId,
      actionId = actionId,
      title = title,
      state = state,
    }
    if appearance and appearance.appearanceVersion ~= nil then message.appearanceVersion = appearance.appearanceVersion end
    if appearance and appearance.presentationState ~= nil then message.presentationState = appearance.presentationState end
    if appearance and appearance.foregroundColor ~= nil then message.foregroundColor = appearance.foregroundColor end
    if appearance and appearance.backgroundColor ~= nil then message.backgroundColor = appearance.backgroundColor end
    if appearance and appearance.progress ~= nil then message.progress = appearance.progress end
    if appearance and appearance.badge ~= nil then message.badge = appearance.badge end
    if appearance and appearance.icon ~= nil then message.icon = appearance.icon end
    if appearance and appearance.value ~= nil then message.value = appearance.value end
    if appearance and appearance.indicator ~= nil then message.indicator = appearance.indicator end
    return self:_queue(message)
  end

  function object:_emitFeedback(instanceId, actionId, kind, message, durationMs)
    return self:_queue({
      protocolVersion = self.protocol.VERSION,
      type = "feedback",
      instanceId = instanceId,
      actionId = actionId,
      kind = kind,
      message = message,
      durationMs = durationMs,
    })
  end

  function object:_emitError(code, instanceId)
    return self:_queueError(code, nil, instanceId)
  end

  function object:_context(instanceId, actionId, settings, definition, metadata)
    local instance = self.contextFactory.new({
      instanceId = instanceId,
      actionId = actionId,
      settings = settings,
      metadata = metadata,
      definition = definition,
      emitAppearance = function(contextInstanceId, contextActionId, title, state, appearance)
        return self:_emitAppearance(contextInstanceId, contextActionId, title, state, appearance)
      end,
      emitError = function(code, contextInstanceId)
        return self:_emitError(code, contextInstanceId)
      end,
      emitFeedback = function(contextInstanceId, contextActionId, kind, message, durationMs)
        return self:_emitFeedback(contextInstanceId, contextActionId, kind, message, durationMs)
      end,
    })
    instance.slot = self
    return instance
  end
  function object:_invokePress(instance)
    local ok, callbackReturn = instance:invoke("press")
    if ok and instance.definition.sound ~= nil then
      instance:playSoundPolicy(instance.definition.sound, callbackReturn)
    end
    return ok, callbackReturn
  end


  local function cancelLongPress(instance)
    instance.longPressGeneration = (instance.longPressGeneration or 0) + 1
    if instance.longPressTimer ~= nil then
      local timer = instance.longPressTimer
      instance.longPressTimer = nil
      pcall(function()
        if type(timer.stop) == "function" then
          timer:stop()
        end
      end)
    end
    instance.pressed = false
    instance.longPressTriggered = false
  end

  function object:_beginPress(instance)

    cancelLongPress(instance)
    if instance.definition.longPress == nil then
      self:_invokePress(instance)
      return
    end

    instance.pressed = true
    local hsapi = rawget(_G, "hs")
    local timerApi = hsapi and hsapi.timer
    if not timerApi or type(timerApi.doAfter) ~= "function" then
      instance.pressed = false
      self:_invokePress(instance)
      return
    end

    local thresholdMs = instance.definition.longPressThresholdMs or 500
    local generation = instance.longPressGeneration
    local callback = function()
      if self.instances[instance.instanceId] ~= instance
          or not instance.pressed
          or instance.longPressGeneration ~= generation
          or instance.longPressTriggered then
        return
      end
      instance.longPressTimer = nil
      instance.longPressTriggered = true
      instance:invoke("longPress")
    end
    local ok, timer = pcall(timerApi.doAfter, thresholdMs / 1000, callback)
    if not ok or timer == nil then
      instance.pressed = false
      self:_invokePress(instance)
      return
    end
    instance.longPressTimer = timer
  end

  function object:_endPress(instance)
    if instance.definition.longPress == nil then
      instance:invoke("release")
      return
    end
    if not instance.pressed then
      return
    end
    local longPressTriggered = instance.longPressTriggered == true
    cancelLongPress(instance)
    if not longPressTriggered then
      self:_invokePress(instance)
    end
    instance:invoke("release")
  end

  function object:_cancelPress(instance)
    cancelLongPress(instance)
  end

  local function cancelInstancePress(instance)
    if instance then
      instance.slot:_cancelPress(instance)
    end
  end

  function object:_dropSession()
    local instances = self.instances
    self.instances = {}
    for _, instance in pairs(instances) do
      cancelInstancePress(instance)
    end
    self.authenticated = false
    self.sessionId = nil
    self.sessionMode = nil
    self:_resetLanSession()
  end

  function object:_clearInstances()
    local instances = self.instances
    self.instances = {}
    for _, instance in pairs(instances) do
      cancelInstancePress(instance)
      instance:invoke("disappear")
    end
  end

  function object:_newSessionId()
    local hsapi = rawget(_G, "hs")
    if not hsapi or not hsapi.host or type(hsapi.host.uuid) ~= "function" then
      return nil
    end
    local ok, sessionId = pcall(hsapi.host.uuid)
    if not ok or type(sessionId) ~= "string" or sessionId == "" then
      return nil
    end
    self.sessionGeneration = self.sessionGeneration + 1
    if self.sessionGeneration > 1 then
      sessionId = sessionId .. "-" .. tostring(self.sessionGeneration)
    end
    return sessionId
  end


  function object:_handle(message)
    if message.type == "hello" and self.authenticated and self.sessionMode ~= self.mode then
      self:_queueError("AUTH_FAILED")
      return
    end
    if message.type == "hello" then
      if message.token ~= self.token then
        self:_queueError("AUTH_FAILED")
        return
      end
      local sessionId = self:_newSessionId()
      if not sessionId then
        self:_queueError("INTERNAL")
        return
      end
      self:_clearInstances()
      self.responseQueue = {}
      self.sessionId = sessionId
      self.authenticated = true
      self.sessionMode = self.mode
      self:_queue({
        protocolVersion = self.protocol.VERSION,
        type = "helloAck",
        sessionId = sessionId,
      })
      return
    end

    if not self.authenticated then
      self:_queueError("AUTH_REQUIRED", message.requestId, message.instanceId)
      return
    end

    if message.sessionId ~= self.sessionId then
      self:_queueError("AUTH_REQUIRED", message.requestId, message.instanceId)
      return
    end

    if message.type == "listActions" then
      self:_queue({
        protocolVersion = self.protocol.VERSION,
        type = "actions",
        requestId = message.requestId,
        actions = self.registry:list(),
      })
      return
    end

    if message.type == "instanceAppeared" then
      local definition = self.registry:get(message.actionId)
      if not definition then
        self:_queueError("UNKNOWN_ACTION", nil, message.instanceId)
        return
      end
      local existing = self.instances[message.instanceId]
      if existing and existing.actionId ~= message.actionId then
        self:_queueError("INVALID_STATE", nil, message.instanceId)
        return
      end
      if existing then
        cancelInstancePress(existing)
        existing:updateSettings(message.settings)
        if message.metadata ~= nil then existing:updateMetadata(message.metadata) end
        existing:refresh()
      else
        local instanceCount = 0
        for _ in pairs(self.instances) do instanceCount = instanceCount + 1 end
        if instanceCount >= MAX_INSTANCES then
          self:_queueError("INVALID_STATE", nil, message.instanceId)
          return
        end
        local instance = self:_context(message.instanceId, message.actionId, message.settings, definition, message.metadata)
        self.instances[message.instanceId] = instance
        instance:invoke("appear")
        instance:refresh()
      end
      return
    end

    if message.type == "instanceDisappeared" then
      local definition = self.registry:get(message.actionId)
      if not definition then
        self:_queueError("UNKNOWN_ACTION", nil, message.instanceId)
        return
      end
      local instance = self.instances[message.instanceId]
      if not instance then
        return
      end
      if instance.actionId ~= message.actionId then
        self:_queueError("STALE_INSTANCE", nil, message.instanceId)
        return
      end
      self.instances[message.instanceId] = nil
      cancelInstancePress(instance)
      instance:invoke("disappear")
      return
    end

    if message.type == "keyDown"
        or message.type == "keyUp"
        or message.type == "dialDown"
        or message.type == "dialRotate"
        or message.type == "dialUp"
        or message.type == "touchTap"
        or message.type == "requestAppearance" then

      local definition = self.registry:get(message.actionId)
      if not definition then
        self:_queueError("UNKNOWN_ACTION", nil, message.instanceId)
        return
      end
      local instance = self.instances[message.instanceId]
      if not instance or instance.actionId ~= message.actionId then
        self:_queueError("STALE_INSTANCE", nil, message.instanceId)
        return
      end
      if message.type == "keyDown" then
        self:_beginPress(instance)
      elseif message.type == "keyUp" then
        self:_endPress(instance)
      elseif message.type == "dialDown" then
        if instance.definition.push == nil then
          self:_invokePress(instance)
        else
          instance:invoke("push")
        end
      elseif message.type == "dialRotate" then
        instance:invoke("rotate", message.ticks, message.pressed)
      elseif message.type == "dialUp" then
        instance:invoke("release")
      elseif message.type == "touchTap" then
        instance:invoke("touchTap", message.hold, message.tapPos)
      else
        instance:refresh()
      end
      return
    end

    self:_queueError("INVALID_STATE")
  end

  function object:_resetLanSession()
    self.lanClientId = nil
    self.lanKeyPath = nil
    self.lanKey = nil
    self.lanClientNonce = nil
    self.lanServerNonce = nil
    self.lanSendKey = nil
    self.lanReceiveKey = nil
    self.lanSendSequence = 0
  function object:_onLanMessage(raw, http)
    if not self.isSlot then
      local slot = self.slotsByHttp[http]
      if not slot then
        for _, candidate in ipairs(self.slots) do
          if candidate.mode == "lan" then slot = candidate break end
        end
      end
      if not slot then return self:_lanError("AUTH_FAILED") end
      return slot:_onLanMessage(raw, http)
    end
    http = self.http
    local isLanSession = self.authenticated and self.sessionMode == "lan"
    if not self:_admitInbound(http, isLanSession) then
      if isLanSession then self:_dropSession() end
      return self:_lanError("AUTH_FAILED")
    end
    if self.authenticated and self.sessionMode ~= "lan" then return self:_lanError("AUTH_FAILED") end
    local hsapi = rawget(_G, "hs")
    if not self.protocol.preflight(raw, self.protocol.MAX_FRAME_BYTES) then
      return self:_lanError("MALFORMED_MESSAGE")
    end
    local ok, value = pcall(hsapi.json.decode, raw)
    if not ok or type(value) ~= "table" then return self:_lanError("MALFORMED_MESSAGE") end
    if value.type ~= "lanFrame" and #raw > self.protocol.MAX_LAN_CONTROL_BYTES then
      return self:_lanError("MALFORMED_MESSAGE")
    end
    if value.protocolVersion ~= self.protocol.VERSION then return self:_lanError("VERSION_MISMATCH") end

    if value.type == "lanHello" then
      if self.authenticated and self.sessionMode ~= "lan" then return self:_lanError("AUTH_FAILED") end
      if type(value.clientId) ~= "string" or value.clientId ~= self.clientId
          or #value.clientId < 1 or #value.clientId > 64
          or value.clientId:match(LAN_CLIENT_ID_PATTERN) == nil then
        return self:_lanError("AUTH_FAILED")
      end
      local clientNonce = Crypto.hexDecode(value.clientNonce, Crypto.NONCE_BYTES)
      local keyPath = self.credentialPath
      if not clientNonce or not keyPath then return self:_lanError("AUTH_FAILED") end
      local key = Crypto.readKey(hsapi, keyPath)
      local serverNonce = Crypto.randomBytes(Crypto.NONCE_BYTES)
      if not key or not serverNonce then return self:_lanError("AUTH_FAILED") end
      local serverProof = Crypto.proof(hsapi, key, "server", value.clientId, clientNonce, serverNonce)
      if not serverProof then return self:_lanError("AUTH_FAILED") end
      if self.authenticated then
        self:_clearInstances()
        self.authenticated = false
        self.sessionId = nil
        self.sessionMode = nil
      end
      self:_resetLanSession()
      self.lanClientId = self.clientId
      self.lanKeyPath = self.credentialPath
      self.lanKey = key
      self.lanClientNonce = clientNonce
      self.lanServerNonce = serverNonce
      return hsapi.json.encode({
        protocolVersion = self.protocol.VERSION,
        type = "lanChallenge",
        clientId = value.clientId,
        serverNonce = Crypto.hexEncode(serverNonce),
        serverProof = Crypto.hexEncode(serverProof),
      }) or ""
    end

    if value.type == "lanProof" then
      if self.authenticated or not self.lanKey or value.clientId ~= self.lanClientId then return self:_lanError("AUTH_FAILED") end
      local clientProof = Crypto.hexDecode(value.clientProof, 32)
      local expected = Crypto.proof(hsapi, self.lanKey, "client", self.lanClientId, self.lanClientNonce, self.lanServerNonce)
      if not clientProof or not expected or not Crypto.doubleHmacEqual(hsapi, expected, clientProof) then
        return self:_lanError("AUTH_FAILED")
      end
      local sessionId = self:_newSessionId()
      if not sessionId then return self:_lanError("INTERNAL") end
      self:_clearInstances()
      self.sessionId = sessionId
      self.sessionMode = "lan"
      self.authenticated = true
      self.lanSendKey = Crypto.hkdf(
        hsapi,
        self.lanKey,
        Crypto.kdfSalt(self.lanClientId, self.lanClientNonce, self.lanServerNonce),
        Crypto.frameInfo("server-to-client"),
        32
      )
      self.lanReceiveKey = Crypto.hkdf(
        hsapi,
        self.lanKey,
        Crypto.kdfSalt(self.lanClientId, self.lanClientNonce, self.lanServerNonce),
        Crypto.frameInfo("client-to-server"),
        32
      )
      if not self.lanSendKey or not self.lanReceiveKey then
        self.authenticated = false
        self.sessionId = nil
        return self:_lanError("INTERNAL")
      end
      self.lanSendSequence = 0
      self.lanReceiveSequence = 0
      return hsapi.json.encode({
        protocolVersion = self.protocol.VERSION,
        type = "lanReady",
        sessionId = sessionId,
      }) or ""
    end

    if value.type == "lanFrame" then
      if not self.authenticated or self.sessionMode ~= "lan" or not self.lanReceiveKey then
        return self:_lanError("AUTH_REQUIRED")
      end
      local sequence = value.sequence
      local payload = value.payload
      if type(payload) ~= "string" or #payload > self.protocol.MAX_LAN_PAYLOAD_BYTES
          or not self.protocol.preflight(payload, self.protocol.MAX_LAN_PAYLOAD_BYTES) then
        self:_dropSession()
        return self:_lanError("AUTH_FAILED")
      end
      local mac = Crypto.hexDecode(value.mac, 32)
      local currentKey = self.lanKeyPath and Crypto.readKey(hsapi, self.lanKeyPath)
      if not currentKey or not Crypto.doubleHmacEqual(hsapi, self.lanKey, currentKey) then
        self:_dropSession()
        return self:_lanError("AUTH_FAILED")
      end
      local expected = isSafeInteger(sequence) and type(payload) == "string"
        and Crypto.frameMac(hsapi, self.lanReceiveKey, "client-to-server", sequence, payload)
      if not isSafeInteger(sequence) or sequence ~= self.lanReceiveSequence + 1
          or not mac or not expected or not Crypto.doubleHmacEqual(hsapi, expected, mac) then
        self:_dropSession()
        return self:_lanError("AUTH_FAILED")
      end
      self.lanReceiveSequence = sequence
      return self:_onMessage(payload, "lan", http, true)
    end
    return self:_lanError("AUTH_REQUIRED")
  end

  function object:_onMessage(raw, mode, http, admitted)
    if not self.isSlot then
      local slot = self.slotsByHttp[http] or self.legacySlot
      if not slot then return self:_safeError("AUTH_FAILED") end
      return slot:_onMessage(raw, mode or slot.mode, http, admitted)
    end
    mode = mode or self.mode
    local activeHttp = self.http
    local authenticatedForMode = self.authenticated and self.sessionMode == mode
    if mode ~= self.mode then return self:_safeError("AUTH_FAILED") end
    if not admitted and not self:_admitInbound(activeHttp, authenticatedForMode) then
      if authenticatedForMode then self:_dropSession() end
      return self:_safeError("AUTH_FAILED")
    end
    if self.authenticated and self.sessionMode ~= mode then return self:_safeError("AUTH_FAILED") end
    self.responseQueue = {}
    self.dispatching = true
    local ok, codeOrNil = xpcall(function()
      local message, code = self.protocol.decode(raw)
      if not message then
        self:_queueError(code or "MALFORMED_MESSAGE")
        return
      end
      self:_handle(message)
    end, function()
      return "internal"
    end)
    if not ok then
      self.responseQueue = {}
      self:_queueError("INTERNAL")
    end
    self.dispatching = false

    local first = table.remove(self.responseQueue, 1)
    for _, encoded in ipairs(self.responseQueue) do
      self:_sendRaw(encoded)
    end
    self.responseQueue = nil
    return first or ""
  end

  local function stopSlot(slot, clearInstances)
    slot.started = false
    if clearInstances then slot:_clearInstances() end
    stopHttp(slot.http)
    slot.http = nil
    slot.token = nil
    slot.sessionId = nil
    slot.sessionMode = nil
    slot.authenticated = false
    slot.rateBuckets = {}
    slot.responseQueue = nil
    slot:_resetLanSession()
  end

  local function configureAndStartSlot(hsapi, slot, startedSlots)
    local ok, httpOrError = pcall(hsapi.httpserver.new, false, false)
    if not ok or not httpOrError then return false end
    local http = httpOrError
    slot.http = http
    local callback
    if slot.mode == "lan" then
      callback = function(raw) return slot:_onLanMessage(raw, http) end
    else
      callback = function(raw) return slot:_onMessage(raw, "loopback", http) end
    end
    local configured = pcall(http.setInterface, http, slot.interface)
      and pcall(http.setPort, http, slot.port)
      and pcall(http.websocket, http, SOCKET_PATH, callback)
    if type(http.maxBodySize) == "function" then
      pcall(http.maxBodySize, http, slot.protocol.MAX_FRAME_BYTES)
    end
    if not configured then
      stopHttp(http)
      slot.http = nil
      return false
    end
    local started = pcall(http.start, http)
    if not started then
      stopHttp(http)
      slot.http = nil
      return false
    end
    slot.started = true
    startedSlots[#startedSlots + 1] = slot
    return true
  end

  function object:start(options)
    if self.started then
      error("Stream Deck server is already started", 2)
    end
    local port, tokenPath, lanSpecs = validateOptions(options)
    local hsapi = rawget(_G, "hs")
    if not hsapi or not hsapi.httpserver then
      error("Hammerspoon HTTP server is unavailable", 2)
    end

    local token = ensureToken(hsapi, tokenPath)
    if not token then
      error("Stream Deck token startup failed", 2)
    end
    for _, spec in ipairs(lanSpecs) do
      if not Crypto.readKey(hsapi, spec.keyPath) then
        error("Stream Deck LAN credential startup failed", 2)
      end
    end

    local startedSlots = {}
    local legacy = newSlot({
      slotId = "loopback",
      mode = "loopback",
      interface = "localhost",
      port = port,
    })
    legacy.token = token
    if not configureAndStartSlot(hsapi, legacy, startedSlots) then
      error("Stream Deck server startup failed", 2)
    end
    for _, spec in ipairs(lanSpecs) do
      local slot = newSlot({
        slotId = spec.clientId,
        clientId = spec.clientId,
        mode = "lan",
        interface = spec.interface,
        port = spec.port,
        keyPath = spec.keyPath,
      })
      if not configureAndStartSlot(hsapi, slot, startedSlots) then
        for _, startedSlot in ipairs(startedSlots) do stopSlot(startedSlot, false) end
        error("Stream Deck LAN server startup failed", 2)
      end
    end

    self.slots = startedSlots
    self.slotsByHttp = {}
    for _, slot in ipairs(startedSlots) do self.slotsByHttp[slot.http] = slot end
    self.legacySlot = legacy
    self.started = true
    return self
  end

  function object:stop()
    if self.isSlot then
      stopSlot(self, true)
      return self
    end
    for _, slot in ipairs(self.slots) do stopSlot(slot, true) end
    self.slots = {}
    self.slotsByHttp = {}
    self.legacySlot = nil
    self.started = false
    self.rateBuckets = {}
    return self
  end

  function object:refresh(actionId)
    if not self.registry:has(actionId) then
      error("Unknown Stream Deck action id: " .. tostring(actionId), 2)
    end
    if self.isSlot then
      for _, instance in pairs(self.instances) do
        if instance.actionId == actionId then instance:refresh() end
      end
      return self
    end
    for _, slot in ipairs(self.slots) do slot:refresh(actionId) end
    return self
  end

  setmetatable(object, {
    __index = function(target, key)
      local slot = target.legacySlot
      if not slot then return nil end
      if key == "lanHttp" then
        for _, candidate in ipairs(target.slots) do
          if candidate.mode == "lan" then return candidate.http end
        end
        return nil
      end
      local slotFields = {
        authenticated = true,
        dispatching = true,
        instances = true,
        http = true,
        lanKey = true,
        lanKeyPath = true,
        lanClientId = true,
        lanClientNonce = true,
        lanReceiveKey = true,
        lanReceiveSequence = true,
        lanSendKey = true,
        lanSendSequence = true,
        sessionId = true,
        sessionMode = true,
        token = true,
      }
      if slotFields[key] then return slot[key] end
      return nil
    end,
    __newindex = function(target, key, value)
      local slot = target.legacySlot
      local slotFields = {
        authenticated = true,
        dispatching = true,
        instances = true,
        lanKey = true,
        lanKeyPath = true,
        lanClientId = true,
        lanClientNonce = true,
        lanReceiveKey = true,
        lanReceiveSequence = true,
        lanSendKey = true,
        lanSendSequence = true,
        sessionId = true,
        sessionMode = true,
        token = true,
      }
      if slot and slotFields[key] then
        slot[key] = value
      else
        rawset(target, key, value)
      end
    end,
  })
  return object
end


return server
