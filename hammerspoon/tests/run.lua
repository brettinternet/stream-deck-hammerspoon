-- Self-contained Lua 5.4 tests for the Hammerspoon bridge.
-- The fake hs modules below keep these tests independent of Hammerspoon,
-- Stream Deck, and physical audio hardware.

package.path = "hammerspoon/?.lua;hammerspoon/?/init.lua;" .. package.path

local frames = {}
local fakeHttp
local fakeHttpInstances = {}

local function fakeJsonString(value)
  local valueType = type(value)
  if value == nil then return "null" end
  if valueType == "boolean" or valueType == "number" then return tostring(value) end
  if valueType == "string" then
    local escaped = value:gsub("\\", "\\\\"):gsub('"', '\\"')
    escaped = escaped:gsub("\b", "\\b"):gsub("\t", "\\t"):gsub("\n", "\\n")
    escaped = escaped:gsub("\f", "\\f"):gsub("\r", "\\r")
    escaped = escaped:gsub("[%z\1-\31]", function(character)
      return string.format("\\u%04x", string.byte(character))
    end)
    return '"' .. escaped .. '"'
  end
  if valueType ~= "table" then error("unsupported fake JSON value") end
  local numeric = true
  local maxIndex = 0
  for key in pairs(value) do
    if type(key) ~= "number" or key < 1 or math.floor(key) ~= key then numeric = false break end
    maxIndex = math.max(maxIndex, key)
  end
  if numeric then
    local items = {}
    for index = 1, maxIndex do items[#items + 1] = fakeJsonString(value[index]) end
    return "[" .. table.concat(items, ",") .. "]"
  end
  local keys = {}
  for key in pairs(value) do keys[#keys + 1] = tostring(key) end
  table.sort(keys)
  local fields = {}
  for _, key in ipairs(keys) do fields[#fields + 1] = fakeJsonString(key) .. ":" .. fakeJsonString(value[key]) end
  return "{" .. table.concat(fields, ",") .. "}"
end

local function fakeEncode(value)
  local encoded = fakeJsonString(value)
  frames[encoded] = value
  return encoded
end

local function fakeDecode(raw)
  if type(raw) ~= "string" or frames[raw] == nil then error("invalid fake JSON frame") end
  return frames[raw]
end

local function fileExists(path)
  local handle = io.open(path, "r")
  if not handle then
    return false
  end
  handle:close()
  return true
end

local reloadCalls = 0
local consoleCalls = 0
local consoleVisible = false

local function fakeReload()
  reloadCalls = reloadCalls + 1
end

local function fakeToggleConsole()
  consoleCalls = consoleCalls + 1
  consoleVisible = not consoleVisible
end

local fakeConsoleWindow = {
  isVisible = function()
    return consoleVisible
  end,
}

local fakeConsole = {
  hswindow = function()
    return fakeConsoleWindow
  end,
}

local lastRunTimer
local lastScheduledTimer

local pendingTimers = {}
local function fakeDoAfter(delay, callback)
  local timer = { delay = delay, callback = callback, stopped = false }
  lastScheduledTimer = timer
  function timer:stop()
    self.stopped = true
  end
  pendingTimers[#pendingTimers + 1] = timer
  return timer
end

local function runPendingTimer()
  for index, timer in ipairs(pendingTimers) do
    if not timer.stopped then
      table.remove(pendingTimers, index)
      lastRunTimer = timer
      timer.callback()
      return timer.delay
    end
  end
  return nil
end

local function runLastTimerAgain()
  if lastRunTimer ~= nil then
    lastRunTimer.callback()
  end
end

local function clearPendingTimers()
  pendingTimers = {}
end

local function nextPendingDelay()
  for _, timer in ipairs(pendingTimers) do
    if not timer.stopped then
      return timer.delay
    end
  end
  return nil
end

local fakeSoundConstructors = { name = 0, file = 0 }
local fakeSoundObjects = {}
local fakeSoundPlays = {}
local fakeSoundStops = {}
local fakeSoundReloadStops = {}
local fakeSoundPlayFailures = {}
local fakeSoundVolumes = {}
local function fakeSound(kind, value)
  local key = kind .. ":" .. value
  local object = fakeSoundObjects[key]
  if object ~= nil then return object end
  object = { kind = kind, value = value, looping = false }
  function object:loopSound(value)
    self.looping = value
    return true
  end
  function object:volume(value)
    fakeSoundVolumes[#fakeSoundVolumes + 1] = { kind = kind, value = self.value, volume = value }
    return true
  end
  function object:stop()
    fakeSoundStops[#fakeSoundStops + 1] = key
    return true
  end
  function object:stopOnReload(value)
    fakeSoundReloadStops[#fakeSoundReloadStops + 1] = { key = key, value = value }
    return true
  end
  function object:play()
    fakeSoundPlays[#fakeSoundPlays + 1] = key
    if fakeSoundPlayFailures[key] then return false end
    return true
  end
  fakeSoundObjects[key] = object
  return object
end

local fakeTimer = {
  doAfter = fakeDoAfter,
}
local function fakeHmacSha256(key, data)
  local output = {}
  for index = 1, 32 do
    local keyByte = string.byte(key, ((index - 1) % #key) + 1) or 0
    local dataByte = string.byte(data, ((index - 1) % #data) + 1) or 0
    output[index] = string.char((keyByte + dataByte + index) % 256)
  end
  return table.concat(output)
end


_G.hs = {
  json = {
    encode = fakeEncode,
    decode = fakeDecode,
  },
  hash = {
    hmacSHA256 = fakeHmacSha256,
  },
  fs = {
    attributes = function(path)
      if fileExists(path) then
        return { permissions = "rw-------" }
      end
      return nil
    end,
  },
  host = {
    uuid = function()
      return "00000000-0000-4000-8000-000000000001"
    end,
  },
  reload = fakeReload,
  toggleConsole = fakeToggleConsole,
  console = fakeConsole,
  timer = fakeTimer,
  sound = {
    getByName = function(name)
      fakeSoundConstructors.name = fakeSoundConstructors.name + 1
      return fakeSound("name", name)
    end,
    getByFile = function(path)
      fakeSoundConstructors.file = fakeSoundConstructors.file + 1
      return fakeSound("file", path)
    end,
  },
  audiodevice = {},
  httpserver = {
    new = function()
      fakeHttp = {
        sent = {},
        interface = nil,
        port = nil,
        websocketPath = nil,
        websocketCallback = nil,
        started = false,
        stopped = false,
      }
      fakeHttpInstances[#fakeHttpInstances + 1] = fakeHttp
      _G.fakeHttp = fakeHttp

      function fakeHttp:setInterface(interface)
        self.interface = interface
        return self
      end

      function fakeHttp:setPort(port)
        self.port = port
        return self
      end

      function fakeHttp:websocket(path, callback)
        self.websocketPath = path
        self.websocketCallback = callback
        return self
      end

      function fakeHttp:maxBodySize(size)
        self.bodySize = size
        return self
      end

      function fakeHttp:start()
        self.started = true
        return self
      end

      function fakeHttp:stop()
        self.stopped = true
        return self
      end

      function fakeHttp:send(raw)
        self.sent[#self.sent + 1] = raw
        return true
      end

      return fakeHttp
    end,
  },
}

local Registry = require("streamdeck.registry")
local Sound = require("streamdeck.sound")
local Crypto = require("streamdeck.crypto")
local Builtins = require("streamdeck.builtins")
local StreamDeck = require("streamdeck")
local Protocol = require("streamdeck.protocol")
local Context = require("streamdeck.context")
local Helpers = require("streamdeck.helpers")
local Server = require("streamdeck.server")

local passed = 0

local function fail(message)
  error(message, 2)
end

local function assertTrue(value, message)
  if not value then
    fail(message or "expected true")
  end
end

local function assertFalse(value, message)
  if value then
    fail(message or "expected false")
  end
end

local function assertEqual(actual, expected, message)
  if actual ~= expected then
    fail((message or "values differ") .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual))
  end
end

local function assertError(code, responses, message)
  assertTrue(#responses >= 1, message or "expected an error response")
  assertEqual(responses[1].type, "error", message or "expected an error response")
  assertEqual(responses[1].code, code, message or "unexpected error code")
end

local function message(messageType, fields)
  local result = fields or {}
  result.protocolVersion = Protocol.VERSION
  result.type = messageType
  return result
end

local function tokenAt(path)
  local handle = assert(io.open(path, "r"))
  local token = assert(handle:read("*a"))
  assert(handle:close())
  return token
end

local function newServer(registry, tokenPath)
  local server = Server.new(registry, Protocol, Context)
  server:start({ port = 17321, tokenPath = tokenPath })
  assertEqual(#server.slots, 1, "default startup must create only the legacy loopback slot")
  assertEqual(server.legacySlot.mode, "loopback", "default startup must retain loopback mode")
  assertEqual(fakeHttp.interface, "localhost", "server must bind loopback")
  assertEqual(fakeHttp.websocketPath, "/streamdeck", "server websocket path")
  return server
end

local function exchange(server, request)
  local slot = server.legacySlot
  if request.type ~= "hello" and request.sessionId == nil and slot.authenticated then
    request.sessionId = slot.sessionId
  end
  local sentAtStart = #slot.http.sent
  local first = slot:_onMessage(fakeEncode(request))
  local responses = {}
  if first ~= "" then
    responses[#responses + 1] = fakeDecode(first)
  end
  for index = sentAtStart + 1, #slot.http.sent do
    responses[#responses + 1] = fakeDecode(slot.http.sent[index])
  end
  return responses
end

local function authenticate(server, tokenPath)
  local responses = exchange(server, message("hello", {
    token = tokenAt(tokenPath),
    pluginVersion = "test-plugin",
  }))
  assertEqual(responses[1].type, "helloAck", "hello must be acknowledged")
  assertTrue(type(responses[1].sessionId) == "string" and responses[1].sessionId ~= "", "hello must return a session ID")
  assertEqual(responses[1].sessionId, server.legacySlot.sessionId, "server must retain the acknowledged session ID")
  return responses[1].sessionId
end

local function withTokenPath(callback)
  local path = os.tmpname()
  os.remove(path)
  local ok, err = xpcall(function()
    callback(path)
  end, debug.traceback)
  os.remove(path)
  if not ok then
    error(err, 0)
  end
end
local function writeCredential(path, value)
  local handle = assert(io.open(path, "wb"))
  assert(handle:write(value))
  assert(handle:close())
  assert(os.execute("/bin/chmod 600 " .. "'" .. path:gsub("'", "'\\''") .. "'"))
end

local function withCredentials(callback)
  local first, second = os.tmpname(), os.tmpname()
  os.remove(first)
  os.remove(second)
  local ok, err = xpcall(function()
    writeCredential(first, string.rep("K", 32))
    writeCredential(second, string.rep("L", 32))
    callback(first, second)
  end, debug.traceback)
  os.remove(first)
  os.remove(second)
  if not ok then error(err, 0) end
end

local function withJson(json, callback)
  local previous = _G.hs.json
  _G.hs.json = json
  local ok, err = xpcall(callback, debug.traceback)
  _G.hs.json = previous
  if not ok then
    error(err, 0)
  end
end


local function test(name, callback)
  local ok, err = xpcall(callback, debug.traceback)
  if not ok then
    io.stderr:write("not ok - " .. name .. "\n" .. err .. "\n")
    os.exit(1)
  end
  passed = passed + 1
  io.write("ok - " .. name .. "\n")
end

test("registry rejects malformed definitions and duplicate IDs", function()
  local registry = Registry.new()
  local definition = {
    id = "com.test.one",
    name = "One",
    appearance = function() return { title = "One", state = "inactive" } end,
    press = function() end,
    release = function() end,
  }

  assertFalse(pcall(registry.register, registry, {}), "missing fields must be rejected")
  assertFalse(pcall(registry.register, registry, {
    id = "com.test.bad",
    name = "Bad",
    appearance = function() end,
    press = function() end,
    unsupported = true,
  }), "unknown fields must be rejected")
  assertFalse(pcall(registry.register, registry, {
    id = "com.test.bad-release",
    name = "Bad release",
    appearance = function() end,
    press = function() end,
    release = true,
  }), "non-function release callbacks must be rejected")
  registry:register(definition)
  for index, badDescription in ipairs({ "", 0, string.rep("😀", 513) }) do
    assertFalse(pcall(registry.register, registry, {
      id = "com.test.bad-action-description-" .. tostring(index),
      name = "Bad action description",
      description = badDescription,
      appearance = function() end,
      press = function() end,
    }), "malformed or overlong action descriptions must be rejected")
    assertFalse(pcall(registry.register, registry, {
      id = "com.test.bad-field-description-" .. tostring(index),
      name = "Bad field description",
      settingsSchemaVersion = 1,
      settingsSchema = {{ type = "text", key = "label", description = badDescription }},
      appearance = function() end,
      press = function() end,
    }), "malformed or overlong field descriptions must be rejected")
  end
  assertFalse(pcall(registry.register, registry, definition), "duplicate IDs must be rejected")
  assertEqual(#registry:list(), 1, "duplicate registration must not append")
end)

test("sound specs cache default playback and restart repeat cues", function()
  Sound._resetForTests()
  local nameCount = fakeSoundConstructors.name
  local fileCount = fakeSoundConstructors.file
  local playCount = #fakeSoundPlays
  local stopCount = #fakeSoundStops
  local systemSpec = Sound.system("Test", { volume = 0.4, loop = true, stopOnReload = true })
  local fileSpec = Sound.file("/tmp/test.wav")
  assertTrue(Sound.play(systemSpec))
  assertTrue(Sound.play(systemSpec))
  assertTrue(Sound.play(fileSpec))
  assertEqual(fakeSoundConstructors.name, nameCount + 1)
  assertEqual(fakeSoundConstructors.file, fileCount + 1)
  assertEqual(#fakeSoundPlays, playCount + 3)
  assertEqual(#fakeSoundStops, stopCount + 2)
  assertEqual(#fakeSoundReloadStops, 3)
  assertTrue(Sound.play(Sound.system("Test", { loop = false })))
  assertFalse(fakeSoundObjects["name:Test"].looping)
  fakeSoundPlayFailures["name:Failed"] = true
  assertFalse(Sound.play(Sound.system("Failed")))
  fakeSoundPlayFailures["name:Failed"] = nil
  local savedSound = _G.hs.sound
  _G.hs.sound = nil
  assertFalse(Sound.play(Sound.system("Missing")))
  _G.hs.sound = savedSound
end)

test("sound configuration validates and custom providers are authoritative", function()
  Sound._resetForTests()
  local onSentinel = Sound.ON
  local offSentinel = Sound.OFF
  assertTrue(onSentinel ~= offSentinel)
  assertFalse(pcall(function() Sound.ON = Sound.OFF end))
  assertFalse(pcall(function() Sound.OFF = Sound.ON end))
  assertEqual(Sound.ON, onSentinel)
  assertEqual(Sound.OFF, offSentinel)
  local spec = Sound.system("Provider")
  local calls = 0
  Sound.configure({
    provider = function(received, context)
      calls = calls + 1
      assertEqual(received, spec)
      assertEqual(context, "context")
      return true
    end,
  })
  assertTrue(Sound.play(spec, "context"))
  assertEqual(calls, 1)
  Sound.configure({ provider = function() return nil end })
  assertFalse(Sound.play(spec))
  assertFalse(pcall(Sound.system, "bad", { volume = 2 }))
  assertFalse(pcall(Sound.file, "", {}))
  assertFalse(pcall(Sound.press, { kind = "invalid" }))
  assertFalse(pcall(Sound.toggle, { on = spec, invalid = spec }))
  assertFalse(pcall(Sound.configure, { provider = "not a function" }))
  Sound._resetForTests()
end)

test("context preserves callback returns and isolates sound playback", function()
  Sound._resetForTests()
  local played
  local context = Context.new({
    definition = {
      invoke = function() return "first", nil, "third" end,
    },
    instanceId = "sound-context",
    actionId = "com.test.sound-context",
    emitAppearance = function() end,
    emitError = function() end,
    sound = {
      play = function(spec)
        played = spec
        return true
      end,
    },
  })
  local ok, first, second, third = context:invoke("invoke")
  assertTrue(ok)
  assertEqual(first, "first")
  assertEqual(second, nil)
  assertEqual(third, "third")
  assertTrue(context:playSound(Sound.system("Escape")))
  assertTrue(played ~= nil)
  local failed = Context.new({
    definition = { invoke = function() error("callback") end },
    instanceId = "sound-failure",
    actionId = "com.test.sound-failure",
    emitAppearance = function() end,
    emitError = function() end,
    sound = { play = function() error("sound") end },
  })
  local failure = failed:invoke("invoke")
  assertFalse(failure)
  assertFalse(failed:playSound(Sound.system("Failed")))
  Sound._resetForTests()
end)

test("server dispatches press and toggle sounds only for successful press callbacks", function()
  Sound._resetForTests()
  local sounds = {}
  Sound.configure({
    provider = function(spec)
      sounds[#sounds + 1] = spec
      return true
    end,
  })
  local toggleState = false
  local longPresses = 0
  local pushes = 0
  local registry = Registry.new()
  registry:register({
    id = "com.test.sound-toggle",
    name = "Sound toggle",
    appearance = function() return { title = "Toggle", state = "inactive" } end,
    sound = Sound.toggle({
      on = Sound.system("On"),
      off = Sound.system("Off"),
    }),
    press = function()
      toggleState = not toggleState
      return toggleState and Sound.ON or Sound.OFF
    end,
    release = function() end,
  })
  registry:register({
    id = "com.test.sound-long",
    name = "Sound long",
    appearance = function() return { title = "Long", state = "inactive" } end,
    sound = Sound.press(Sound.system("Long")),
    press = function() end,
    longPress = function() longPresses = longPresses + 1 end,
    release = function() end,
  })
  registry:register({
    id = "com.test.sound-encoder",
    name = "Sound encoder",
    appearance = function() return { title = "Encoder", state = "inactive" } end,
    sound = Sound.press(Sound.system("Push")),
    press = function() error("encoder press must not run") end,
    push = function() pushes = pushes + 1 end,
  })
  withTokenPath(function(path)
    local server = newServer(registry, path)
    authenticate(server, path)
    exchange(server, message("instanceAppeared", { instanceId = "sound-toggle", actionId = "com.test.sound-toggle", settings = {} }))
    exchange(server, message("keyDown", { instanceId = "sound-toggle", actionId = "com.test.sound-toggle" }))
    exchange(server, message("keyUp", { instanceId = "sound-toggle", actionId = "com.test.sound-toggle" }))
    exchange(server, message("keyDown", { instanceId = "sound-toggle", actionId = "com.test.sound-toggle" }))
    assertEqual(#sounds, 2)
    assertEqual(sounds[1].value, "On")
    assertEqual(sounds[2].value, "Off")

    clearPendingTimers()
    exchange(server, message("instanceAppeared", { instanceId = "sound-long", actionId = "com.test.sound-long", settings = {} }))
    exchange(server, message("keyDown", { instanceId = "sound-long", actionId = "com.test.sound-long" }))
    runPendingTimer()
    exchange(server, message("keyUp", { instanceId = "sound-long", actionId = "com.test.sound-long" }))
    assertEqual(longPresses, 1)
    assertEqual(#sounds, 2, "long press must not play press audio")

    exchange(server, message("instanceAppeared", { instanceId = "sound-encoder", actionId = "com.test.sound-encoder", settings = {} }))
    exchange(server, message("dialDown", { instanceId = "sound-encoder", actionId = "com.test.sound-encoder" }))
    assertEqual(pushes, 1)
    assertEqual(#sounds, 2, "encoder push must not play press audio")
    server:stop()
  end)
  clearPendingTimers()
  Sound._resetForTests()
end)

test("built-in Hammerspoon utility actions register idempotently", function()
  local registry = Registry.new()
  Builtins.register(registry)
  Builtins.register(registry)

  local actions = registry:list()
  assertEqual(#actions, 2, "built-ins must not be duplicated")
  assertEqual(actions[1].actionId, "com.brettinternet.hammerspoon.reload")
  assertEqual(actions[1].name, "Reload Hammerspoon")
  assertEqual(actions[1].description, "Reload the Hammerspoon configuration.")
  assertEqual(actions[2].actionId, "com.brettinternet.hammerspoon.console")
  assertEqual(actions[2].name, "Toggle Hammerspoon Console")
  assertEqual(actions[2].description, "Show or hide the Hammerspoon Console.")

  local reloadAction = registry:get("com.brettinternet.hammerspoon.reload")
  assertEqual(reloadAction.appearance().title, "Reload")
  clearPendingTimers()
  lastScheduledTimer = nil
  reloadCalls = 0
  reloadAction.press({})
  assertEqual(reloadCalls, 0, "reload must wait for the timer callback")
  assertEqual(lastScheduledTimer.delay, 0)
  assertEqual(runPendingTimer(), 0)
  assertEqual(reloadCalls, 1, "reload must invoke Hammerspoon after dispatch")

  local consoleAction = registry:get("com.brettinternet.hammerspoon.console")
  local inactiveAppearance = consoleAction.appearance()
  assertEqual(inactiveAppearance.title, "Console")
  assertEqual(inactiveAppearance.state, "inactive")
  assertEqual(inactiveAppearance.appearanceVersion, 1)
  assertEqual(inactiveAppearance.icon.kind, "bundled")
  assertEqual(inactiveAppearance.icon.name, "hammerspoon")

  consoleCalls = 0
  consoleVisible = false
  local refreshCalls = 0
  local context = {
    refresh = function()
      refreshCalls = refreshCalls + 1
    end,
  }
  consoleAction.press(context)
  assertEqual(consoleCalls, 1)
  assertTrue(consoleVisible, "console action must show the console")
  assertEqual(refreshCalls, 1, "console action must refresh its appearance")

  local activeAppearance = consoleAction.appearance()
  assertEqual(activeAppearance.title, "Console")
  assertEqual(activeAppearance.state, "active")
  assertEqual(activeAppearance.appearanceVersion, 1)
  assertEqual(activeAppearance.icon.kind, "bundled")
  assertEqual(activeAppearance.icon.name, "hammerspoon")

  consoleAction.press(context)
  assertEqual(consoleCalls, 2)
  assertFalse(consoleVisible, "console action must hide the console")
  assertEqual(refreshCalls, 2, "console action must refresh after hiding")
  assertEqual(consoleAction.appearance().state, "inactive")

  local savedReload = _G.hs.reload
  _G.hs.reload = nil
  assertFalse(pcall(reloadAction.appearance), "reload must report missing API")
  _G.hs.reload = savedReload

  local savedToggleConsole = _G.hs.toggleConsole
  _G.hs.toggleConsole = nil
  assertFalse(pcall(consoleAction.appearance), "console must report missing API")
  _G.hs.toggleConsole = savedToggleConsole

  local savedConsole = _G.hs.console
  _G.hs.console = nil
  assertFalse(pcall(consoleAction.appearance), "console window API must be available")
  _G.hs.console = savedConsole
end)

test("streamdeck module publishes built-in utility actions", function()
  withTokenPath(function(path)
    StreamDeck.start({ port = 17321, tokenPath = path })
    local ok, err = xpcall(function()
      local hello = fakeDecode(fakeHttp.websocketCallback(fakeEncode(message("hello", {
        token = tokenAt(path),
        pluginVersion = "test-plugin",
      }))))
      assertEqual(hello.type, "helloAck")

      local actions = fakeDecode(fakeHttp.websocketCallback(fakeEncode(message("listActions", {
        sessionId = hello.sessionId,
        requestId = "built-in-actions",
      }))))
      local names = {}
      for _, action in ipairs(actions.actions) do
        names[action.actionId] = action.name
      end
      assertEqual(names["com.brettinternet.hammerspoon.reload"], "Reload Hammerspoon")
      assertEqual(names["com.brettinternet.hammerspoon.console"], "Toggle Hammerspoon Console")
    end, debug.traceback)
    StreamDeck.stop()
    if not ok then
      error(err, 0)
    end
  end)
end)

test("action listing preserves names and order", function()
  local maximumDescription = string.rep("😀", 512)
  local registry = Registry.new()
  registry:register({
    id = "com.test.first",
    name = "First action",
    description = maximumDescription,
    appearance = function() return { title = "First", state = "inactive" } end,
    press = function() end,
  })
  registry:register({
    id = "com.test.second",
    name = "Second action",
    description = maximumDescription,
    settingsSchemaVersion = 1,
    settingsSchema = {
      { type = "text", key = "label", description = maximumDescription },
    },
    appearance = function() return { title = "Second", state = "active" } end,
    press = function() end,
  })

  assertFalse(pcall(registry.register, registry, {
    id = "com.test.invalid-schema",
    name = "Invalid schema",
    settingsSchema = { type = "object" },
    appearance = function() return { title = "Invalid", state = "inactive" } end,
    press = function() end,
  }), "object-shaped settings schemas must be rejected")

  withTokenPath(function(path)
    local server = newServer(registry, path)
    authenticate(server, path)
    local responses = exchange(server, message("listActions", { requestId = "list-1" }))
    assertEqual(responses[1].type, "actions")
    assertEqual(responses[1].actions[1].actionId, "com.test.first")
    assertEqual(responses[1].actions[1].name, "First action")
    assertEqual(responses[1].actions[1].description, maximumDescription)
    assertEqual(responses[1].actions[2].actionId, "com.test.second")
    assertEqual(responses[1].actions[2].name, "Second action")
    assertEqual(responses[1].actions[2].description, maximumDescription)
    assertEqual(responses[1].actions[2].settingsSchemaVersion, 1)
    assertEqual(responses[1].actions[2].settingsSchema[1].description, maximumDescription)
    server:stop()
  end)
end)

test("versioned settings schemas validate kinds, bounds, defaults, and errors", function()
  local registry = Registry.new()
  local callback = function() end
  local base = {
    id = "com.test.settings",
    name = "Settings",
    appearance = callback,
    press = callback,
  }
  registry:register({
    id = base.id,
    name = base.name,
    settingsSchemaVersion = 1,
    settingsSchema = {
      { type = "text", key = "text", default = "ok", minLength = 1, maxLength = 4 },
      { type = "number", key = "number", default = 2, min = 0, max = 4, step = 1 },
      { type = "boolean", key = "boolean", default = true },
      { type = "select", key = "select", options = {
        { value = "one", label = "One" },
        { value = "two", label = "Two" },
      }, default = "one" },
    },
    appearance = callback,
    press = callback,
  })
  local invalid = {
    { type = "text", key = "x", unsupported = true },
    { type = "text", key = "" },
    { type = "boolean", key = "x", default = "wrong" },
    { type = "select", key = "x", options = {{ value = "a", label = "A" }}, default = "b" },
  }
  for _, field in ipairs(invalid) do
    local definition = {
      id = "com.test.invalid-" .. tostring(#registry.order + 1),
      name = "Invalid",
      settingsSchemaVersion = 1,
      settingsSchema = { field },
      appearance = callback,
      press = callback,
    }
    assertFalse(pcall(registry.register, registry, definition), "invalid versioned schema must be rejected")
  end
end)

test("versioned schema bounds use UTF-8 characters", function()
  local registry = Registry.new()
  local callback = function() end
  local repeated = string.rep("é", 64)
  registry:register({
    id = "com.test.utf8",
    name = "UTF-8 settings",
    settingsSchemaVersion = 1,
    settingsSchema = {
      { type = "text", key = repeated, label = repeated, default = string.rep("é", 4), maxLength = 4 },
    },
    appearance = callback,
    press = callback,
  })
  assertFalse(pcall(registry.register, registry, {
    id = "com.test.utf8-too-long",
    name = "UTF-8 invalid settings",
    settingsSchemaVersion = 1,
    settingsSchema = {{ type = "boolean", key = string.rep("é", 65) }},
    appearance = callback,
    press = callback,
  }), "UTF-8 character limits must match the JSON Schema")
  assertFalse(pcall(registry.register, registry, {
    id = "com.test.utf8-invalid",
    name = "Invalid UTF-8 settings",
    settingsSchemaVersion = 1,
    settingsSchema = {{ type = "boolean", key = string.char(0xff) }},
    appearance = callback,
    press = callback,
  }), "invalid UTF-8 must be rejected")
end)

test("protocol preflight bounds JSON structure before decoding", function()
  assertTrue(Protocol.preflight(string.rep("[", 16) .. "0" .. string.rep("]", 16)))
  assertTrue(Protocol.preflight('{"value":"\\"[{\\u0041]"}'))
  assertTrue(Protocol.preflight("[1,2]"))
  assertFalse(Protocol.preflight(string.rep("[", 17) .. "0" .. string.rep("]", 17)))
  assertFalse(Protocol.preflight("[" .. string.rep("0,", 128) .. "0]"))
  assertFalse(Protocol.preflight('{"value":"\\u12x4"}'))
  assertFalse(Protocol.preflight('{"protocolVersion":1} {"type":"helloAck"}'))
  for _, malformed in ipairs({ '{"a":tru}', "[1 2]", '{"a":1,}', "undefined", "01", "1." }) do
    assertFalse(Protocol.preflight(malformed))
  end
end)

test("server admission limits are bounded and refill deterministically", function()
  withTokenPath(function(path)
    local server = newServer(Registry.new(), path)
    local slot = server.legacySlot
    local now = 0
    local listener = {}
    slot._now = function() return now end

    for _ = 1, 6 do assertTrue(slot:_admitInbound(listener, false)) end
    assertFalse(slot:_admitInbound(listener, false))
    now = now + 5
    assertTrue(slot:_admitInbound(listener, false))

    for _ = 1, 240 do assertTrue(slot:_admitInbound(listener, true)) end
    assertFalse(slot:_admitInbound(listener, true))
    now = now + (1 / 120)
    assertTrue(slot:_admitInbound(listener, true))
    server:stop()
  end)
end)

test("rate exhaustion never invokes lifecycle callbacks or evicts another listener", function()
  withTokenPath(function(path)
    local disappeared = 0
    local registry = Registry.new()
    registry:register({
      id = "com.test.rate",
      name = "Rate",
      appearance = function() return { title = "Rate", state = 0 } end,
      press = function() end,
      longPress = function() end,
      disappear = function() disappeared = disappeared + 1 end,
    })
    clearPendingTimers()
    local server = newServer(registry, path)
    local now = 0
    server._now = function() return now end
    authenticate(server, path)
    exchange(server, message("instanceAppeared", {
      instanceId = "rate-instance",
      actionId = "com.test.rate",
      settings = {},
    }))
    exchange(server, message("keyDown", {
      instanceId = "rate-instance",
      actionId = "com.test.rate",
    }))
    assertTrue(lastScheduledTimer ~= nil and not lastScheduledTimer.stopped)
    for index = 1, 238 do
      exchange(server, message("listActions", { requestId = "rate-" .. tostring(index) }))
    end
    assertError("AUTH_FAILED", exchange(server, message("listActions", { requestId = "rate-limit" })))
    assertEqual(disappeared, 0, "rate rejection must not invoke disappear")
    assertTrue(lastScheduledTimer.stopped, "rate rejection must cancel pending long-press work")

    local legacy = server.legacySlot
    legacy.authenticated = true
    legacy.sessionMode = "lan"
    for _ = 1, 7 do
      legacy:_onMessage('{"protocolVersion":1,"type":"listActions","requestId":"other-listener"}', "loopback", legacy.http)
    end
    assertTrue(legacy.authenticated and legacy.sessionMode == "lan", "one listener must not evict another")
    server:stop()
  end)
end)

test("protocol codec rejects defensive frame and JSON failures", function()
  local originalJson = _G.hs.json
  local validMessage = message("helloAck", { sessionId = "session" })

  withJson({ decode = function()
    error("decoder must not run for invalid frames")
  end }, function()
    local value, code = Protocol.decode(42)
    assertEqual(value, nil)
    assertEqual(code, "MALFORMED_MESSAGE")
    value, code = Protocol.decode(string.rep("x", Protocol.MAX_FRAME_BYTES + 1))
    assertEqual(value, nil)
    assertEqual(code, "MALFORMED_MESSAGE")
  end)

  withJson({}, function()
    local value, code = Protocol.decode("{}")
    assertEqual(value, nil)
    assertEqual(code, "INTERNAL")
  end)

  withJson({ decode = function()
    error("decoder failure")
  end }, function()
    local value, code = Protocol.decode("{}")
    assertEqual(value, nil)
    assertEqual(code, "MALFORMED_MESSAGE")
  end)

  withJson({ decode = function()
    return nil
  end }, function()
    local value, code = Protocol.decode("frame")
    assertEqual(value, nil)
    assertEqual(code, "MALFORMED_MESSAGE")
  end)

  withJson({}, function()
    local value, code = Protocol.encode(validMessage)
    assertEqual(value, nil)
    assertEqual(code, "INTERNAL")
  end)

  withJson({ encode = function()
    error("encoder failure")
  end }, function()
    local value, code = Protocol.encode(validMessage)
    assertEqual(value, nil)
    assertEqual(code, "INTERNAL")
  end)

  withJson({ encode = function()
    return {}
  end }, function()
    local value, code = Protocol.encode(validMessage)
    assertEqual(value, nil)
    assertEqual(code, "INTERNAL")
  end)

  withJson({ encode = function()
    return string.rep("x", Protocol.MAX_FRAME_BYTES + 1)
  end }, function()
    local value, code = Protocol.encode(validMessage)
    assertEqual(value, nil)
    assertEqual(code, "MALFORMED_MESSAGE")
  end)

  assertEqual(_G.hs.json, originalJson, "fake JSON module must be restored")
end)

test("protocol validation and authentication failures are explicit", function()
  local valid, code = Protocol.validate({})
  assertFalse(valid)
  assertEqual(code, "MALFORMED_MESSAGE")
  valid, code = Protocol.validate({ protocolVersion = 1, type = "unknown" })
  assertFalse(valid)
  assertEqual(code, "UNKNOWN_TYPE")
  valid, code = Protocol.validate(message("appearance", {
    instanceId = "instance",
    actionId = "action",
    title = "Ready",
    state = 2,
  }))
  assertFalse(valid)
  assertEqual(code, "INVALID_FIELD")
  valid, code = Protocol.validate(message("actions", {
    requestId = "legacy",
    actions = {{ actionId = "legacy", name = "Legacy", settingsSchema = {{ arbitrary = true }} }},
  }))
  assertTrue(valid, "legacy schemas must remain opaque")
  valid, code = Protocol.validate(message("actions", {
    requestId = "versioned",
    actions = {{
      actionId = "versioned",
      name = "Versioned",
      settingsSchemaVersion = 1,
      settingsSchema = {
        { type = "text", key = "text", default = "ok", minLength = 1, maxLength = 4 },
        { type = "number", key = "number", default = 2, min = 0, max = 4, step = 1 },
        { type = "boolean", key = "boolean", default = true },
        { type = "select", key = "select", options = {{ value = "one", label = "One" }}, default = "one" },
      },
    }},
  }))
  assertTrue(valid, "supported versioned schemas must validate")
  valid, code = Protocol.validate(message("actions", {
    requestId = "invalid",
    actions = {{
      actionId = "invalid",
      name = "Invalid",
      settingsSchemaVersion = 1,
      settingsSchema = {{ type = "text", key = "x", unsupported = true }},
    }},
  }))
  assertFalse(valid)
  assertEqual(code, "INVALID_FIELD")
  local touch = message("touchTap", {
    sessionId = "session",
    instanceId = "instance",
    actionId = "action",
    hold = true,
    tapPos = { 400, 50 },
  })
  valid, code = Protocol.validate(touch)
  assertTrue(valid, "valid touch taps must pass")
  for _, invalidTouch in ipairs({
    message("touchTap", { sessionId = "session", instanceId = "instance", actionId = "action", hold = "true", tapPos = { 400, 50 } }),
    message("touchTap", { sessionId = "session", instanceId = "instance", actionId = "action", hold = true, tapPos = { -1, 50 } }),
    message("touchTap", { sessionId = "session", instanceId = "instance", actionId = "action", hold = true, tapPos = { 400, 101 } }),
    message("touchTap", { sessionId = "session", instanceId = "instance", actionId = "action", hold = true, tapPos = { 400 } }),
  }) do
    valid, code = Protocol.validate(invalidTouch)
    assertFalse(valid)
    assertEqual(code, "INVALID_FIELD")
  end

  local registry = Registry.new()
  registry:register({
    id = "com.test.auth",
    name = "Auth",
    appearance = function() return { title = "Auth", state = "inactive" } end,
    press = function() end,
  })
  withTokenPath(function(path)
    local server = newServer(registry, path)
    assertError("INVALID_FIELD", exchange(server, message("listActions", { requestId = "unauth" })))
    assertError("AUTH_FAILED", exchange(server, message("hello", {
      token = "wrong-token",
      pluginVersion = "test-plugin",
    })))
    authenticate(server, path)
    server:stop()
  end)
end)

test("versioned appearance fields validate and render safely", function()
  local appearance = {
    title = "Ready",
    state = "active",
    appearanceVersion = 1,
    presentationState = 3,
    foregroundColor = "#FFFFFF",
    backgroundColor = "#202020",
    progress = 0.5,
    badge = "<&",
    icon = { kind = "bundled", name = "future-icon" },
  }
  local valid, code = Protocol.validate(message("appearance", {
    instanceId = "instance",
    actionId = "action",
    title = appearance.title,
    state = 1,
    appearanceVersion = appearance.appearanceVersion,
    presentationState = appearance.presentationState,
    foregroundColor = appearance.foregroundColor,
    backgroundColor = appearance.backgroundColor,
    progress = appearance.progress,
    badge = appearance.badge,
    icon = appearance.icon,
  }))
  assertTrue(valid, code or "valid appearance fields must pass")
  for _, presentationState in ipairs({ 0, 1, 2, 3 }) do
    local boundaryValid, boundaryCode = Protocol.validate(message("appearance", {
      instanceId = "instance",
      actionId = "action",
      title = "State",
      state = 0,
      appearanceVersion = 1,
      presentationState = presentationState,
    }))
    assertTrue(boundaryValid, boundaryCode or "presentation state boundary must pass")
  end
  local futureIconValid, futureIconCode = Protocol.validate(message("appearance", {
    instanceId = "instance",
    actionId = "action",
    title = "Future",
    state = 0,
    appearanceVersion = 1,
    icon = { kind = "bundled", name = "future-icon" },
  }))
  assertTrue(futureIconValid, futureIconCode or "unknown semantic icons must use the bundled fallback")
  local pngIconValid, pngIconCode = Protocol.validate(message("appearance", {
    instanceId = "instance",
    actionId = "action",
    title = "PNG",
    state = 0,
    appearanceVersion = 1,
    icon = {
      kind = "custom",
      mediaType = "image/png",
      dataBase64 = "iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAAAK0lEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAujBRSAAB/UYCuQAAAABJRU5ErkJggg==",
    },
  }))
  assertTrue(pngIconValid, pngIconCode or "valid PNG icons must pass Lua validation")
  local customIconValid, customIconCode = Protocol.validate(message("appearance", {
    instanceId = "instance",
    actionId = "action",
    title = "Custom",
    state = 0,
    appearanceVersion = 1,
    icon = {
      kind = "custom",
      mediaType = "image/svg+xml",
      dataBase64 = "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA3MiA3MiI+PC9zdmc+",
    },
  }))
  assertTrue(customIconValid, customIconCode or "valid custom SVG icons must pass Lua validation")

  local encoderAppearance = {
    title = "Volume",
    state = "active",
    appearanceVersion = 1,
    value = "72%",
    indicator = 72,
    icon = { kind = "bundled", name = "hammerspoon" },
  }
  local encoderValid, encoderCode = Protocol.validate(message("appearance", {
    instanceId = "instance",
    actionId = "action",
    title = encoderAppearance.title,
    state = 1,
    appearanceVersion = encoderAppearance.appearanceVersion,
    value = encoderAppearance.value,
    indicator = encoderAppearance.indicator,
    icon = encoderAppearance.icon,
  }))
  assertTrue(encoderValid, encoderCode or "valid paired encoder fields must pass")

  local invalidFields = {
    { appearanceVersion = 2 },
    { presentationState = 0 },
    { appearanceVersion = 1, presentationState = -1 },
    { appearanceVersion = 1, presentationState = 4 },
    { appearanceVersion = 1, presentationState = 1.5 },
    { appearanceVersion = 1, presentationState = "1" },
    { appearanceVersion = 1, foregroundColor = "#FFF" },
    { appearanceVersion = 1, progress = -0.01 },
    { appearanceVersion = 1, progress = 1.01 },
    { appearanceVersion = 1, badge = string.rep("x", 5) },
    { appearanceVersion = 1, badge = string.char(0) },
    { appearanceVersion = 1, icon = { kind = "bundled", name = "bad_name" } },
    { appearanceVersion = 1, icon = { kind = "custom", mediaType = "image/svg+xml", dataBase64 = "bad!" } },
    { appearanceVersion = 1, icon = { kind = "custom", mediaType = "image/png", dataBase64 = "iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABU7bNHAAAAHElEQVR4nO3BMQEAAADCoPVPbQo/oAAAAAAAuhoUiAABdg1dRQAAAABJRU5ErkJggg==" } },
    { appearanceVersion = 1, icon = { kind = "custom", mediaType = "image/png", dataBase64 = "iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAAALElEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAujBRSAABAGBCoqcAAAAASUVORK5CYII=" } },
    { appearanceVersion = 1, icon = { kind = "custom", mediaType = "image/png", dataBase64 = "iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAAAL0lEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAujBRSAABUUgAAV2q6GkAAAAASUVORK5CYII=" } },
    { appearanceVersion = 1, icon = { kind = "custom", mediaType = "image/png", dataBase64 = "iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAAAAABwhuybAAAAHUlEQVR4nO3BMQEAAADCoPVPbQo/oAAAAAAAuhoUiAABAaPFZ1kAAAAASUVORK5CYII=" } },
    { appearanceVersion = 1, icon = { kind = "custom", mediaType = "image/svg+xml", dataBase64 = "eDxzdmcgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgNzIgNzIiPjwvc3ZnPg==" } },
    { appearanceVersion = 1, icon = { kind = "custom", mediaType = "image/svg+xml", dataBase64 = "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA3MiA3MiIgc3R5bGU9ImZpbGw6I2ZmZiI+PC9zdmc+" } },
    { appearanceVersion = 1, icon = { kind = "custom", mediaType = "image/svg+xml", dataBase64 = "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOmZvcmVpZ249InVybjp4IiB2aWV3Qm94PSIwIDAgNzIgNzIiPjwvc3ZnPg==" } },
    { progress = 0.5 },
    { appearanceVersion = 1, value = "72%" },
    { appearanceVersion = 1, indicator = 72 },
    { appearanceVersion = 1, value = "", indicator = 0 },
    { appearanceVersion = 1, value = string.char(0), indicator = 0 },
    { appearanceVersion = 1, value = string.rep("x", 17), indicator = 0 },
    { appearanceVersion = 1, value = "72%", indicator = -0.01 },
    { appearanceVersion = 1, value = "72%", indicator = 100.01 },
    { appearanceVersion = 1, value = "72%", indicator = 0 / 0 },
    { appearanceVersion = 1, value = "72%", indicator = 72, progress = 0.5 },
  }
  for _, fields in ipairs(invalidFields) do
    local invalid = {
      instanceId = "instance",
      actionId = "action",
      title = "Invalid",
      state = 0,
    }
    for key, value in pairs(fields) do
      invalid[key] = value
    end
    local invalidValid = Protocol.validate(message("appearance", invalid))
    assertFalse(invalidValid, "invalid appearance fields must be rejected")
  end

  for _, messageType in ipairs({ "instanceDisappeared", "keyDown", "keyUp", "requestAppearance" }) do
    local missingActionId, missingCode = Protocol.validate(message(messageType, {
      sessionId = "session",
      instanceId = "instance",
    }))
    assertFalse(missingActionId, messageType .. " must require actionId")
    assertEqual(missingCode, "INVALID_FIELD")
  end

  local registry = Registry.new()
  registry:register({
    id = "com.test.presentation",
    name = "Presentation",
    appearance = function() return appearance end,
    press = function() end,
  })
  withTokenPath(function(path)
    local server = newServer(registry, path)
    authenticate(server, path)
    local responses = exchange(server, message("instanceAppeared", {
      instanceId = "presentation",
      actionId = "com.test.presentation",
      settings = {},
    }))
    assertEqual(responses[1].type, "appearance")
    assertEqual(responses[1].appearanceVersion, 1)
    assertEqual(responses[1].presentationState, 3)
    assertEqual(responses[1].icon.kind, "bundled")
    assertEqual(responses[1].icon.name, "future-icon")
    assertEqual(responses[1].backgroundColor, "#202020")
    assertEqual(responses[1].progress, 0.5)
    assertEqual(responses[1].badge, "<&")

    appearance = encoderAppearance
    local encoderResponses = exchange(server, message("requestAppearance", {
      instanceId = "presentation",
      actionId = "com.test.presentation",
    }))
    assertEqual(encoderResponses[1].value, "72%")
    assertEqual(encoderResponses[1].indicator, 72)
    assertEqual(encoderResponses[1].icon.name, "hammerspoon")

    appearance.indicator = 101
    assertError("CALLBACK_FAILED", exchange(server, message("requestAppearance", {
      instanceId = "presentation",
      actionId = "com.test.presentation",
    })))
    server:stop()
  end)
end)

test("unknown actions return an invocation error", function()
  local registry = Registry.new()
  registry:register({
    id = "com.test.known",
    name = "Known",
    appearance = function() return { title = "Known", state = "inactive" } end,
    press = function() end,
  })
  withTokenPath(function(path)
    local server = newServer(registry, path)
    authenticate(server, path)
    local responses = exchange(server, message("instanceAppeared", {
      instanceId = "instance-unknown",
      actionId = "com.test.missing",
      settings = {},
    }))
    assertError("UNKNOWN_ACTION", responses)
    assertEqual(responses[1].instanceId, "instance-unknown")
    server:stop()
  end)
end)

test("multiple instances keep independent settings and callbacks", function()
  local pressed = {}
  local released = {}
  local registry = Registry.new()
  registry:register({
    id = "com.test.multi",
    name = "Multiple",
    appearance = function(context)
      local settings = context:getSettings()
      return {
        title = settings.label,
        state = settings.active and "active" or "inactive",
      }
    end,
    press = function(context)
      pressed[context.instanceId] = (pressed[context.instanceId] or 0) + 1
      context:refresh()
    end,
    release = function(context)
      released[#released + 1] = context.instanceId .. ":" .. context.actionId
    end,
  })

  withTokenPath(function(path)
    local server = newServer(registry, path)
    authenticate(server, path)
    local first = exchange(server, message("instanceAppeared", {
      instanceId = "instance-a",
      actionId = "com.test.multi",
      settings = { label = "A", active = true },
    }))
    local second = exchange(server, message("instanceAppeared", {
      instanceId = "instance-b",
      actionId = "com.test.multi",
      settings = { label = "B", active = false },
    }))
    assertEqual(first[1].title, "A")
    assertEqual(first[1].state, 1)
    assertEqual(second[1].title, "B")
    assertEqual(second[1].state, 0)

    local pressedResponse = exchange(server, message("keyDown", {
      instanceId = "instance-a",
      actionId = "com.test.multi",
    }))
    assertEqual(pressed["instance-a"], 1)
    assertEqual(pressed["instance-b"], nil)
    assertEqual(pressedResponse[1].instanceId, "instance-a")
    assertEqual(pressedResponse[1].title, "A")

    exchange(server, message("keyUp", {
      instanceId = "instance-b",
      actionId = "com.test.multi",
    }))
    exchange(server, message("keyUp", {
      instanceId = "instance-a",
      actionId = "com.test.multi",
    }))
    assertEqual(released[1], "instance-b:com.test.multi")
    assertEqual(released[2], "instance-a:com.test.multi")
    server:stop()
  end)
end)

test("encoder events preserve independent contexts and callback payloads", function()
  local pushes = {}
  local rotations = {}
  local releases = {}
  local touches = {}
  local registry = Registry.new()
  registry:register({
    id = "com.test.encoder",
    name = "Encoder",
    appearance = function(context)
      return { title = context:getSettings().label, state = "inactive" }
    end,
    press = function()
      error("encoder push must prefer push callback")
    end,
    push = function(context)
      pushes[#pushes + 1] = context.instanceId .. ":" .. context:getSettings().label
    end,
    rotate = function(context, ticks, pressed)
      rotations[#rotations + 1] = {
        instanceId = context.instanceId,
        label = context:getSettings().label,
        ticks = ticks,
        pressed = pressed,
      }
    end,
    touchTap = function(context, hold, tapPos)
      touches[#touches + 1] = {
        instanceId = context.instanceId,
        label = context:getSettings().label,
        hold = hold,
        x = tapPos[1],
        y = tapPos[2],
      }
    end,
    release = function(context)
      releases[#releases + 1] = context.instanceId
    end,
  })

  withTokenPath(function(path)
    local server = newServer(registry, path)
    authenticate(server, path)
    exchange(server, message("instanceAppeared", {
      instanceId = "encoder-a",
      actionId = "com.test.encoder",
      settings = { label = "A" },
      metadata = { controllerType = "encoder", device = { type = "stream-deck-plus", size = { columns = 4, rows = 1 } } },
    }))
    exchange(server, message("instanceAppeared", {
      instanceId = "encoder-b",
      actionId = "com.test.encoder",
      settings = { label = "B" },
      metadata = { controllerType = "encoder", device = { type = "stream-deck-plus", size = { columns = 4, rows = 1 } } },
    }))

    exchange(server, message("dialDown", { instanceId = "encoder-a", actionId = "com.test.encoder" }))
    exchange(server, message("dialRotate", {
      instanceId = "encoder-a",
      actionId = "com.test.encoder",
      ticks = 2,
      pressed = true,
    }))
    exchange(server, message("dialRotate", {
      instanceId = "encoder-b",
      actionId = "com.test.encoder",
      ticks = -1,
      pressed = false,
    }))
    exchange(server, message("dialUp", { instanceId = "encoder-b", actionId = "com.test.encoder" }))
    exchange(server, message("touchTap", {
      instanceId = "encoder-a",
      actionId = "com.test.encoder",
      hold = true,
      tapPos = { 120, 40 },
    }))
    exchange(server, message("touchTap", {
      instanceId = "encoder-b",
      actionId = "com.test.encoder",
      hold = false,
      tapPos = { 800, 100 },
    }))

    assertEqual(pushes[1], "encoder-a:A")
    assertEqual(pushes[2], nil)
    assertEqual(rotations[1].instanceId, "encoder-a")
    assertEqual(rotations[1].label, "A")
    assertEqual(rotations[1].ticks, 2)
    assertTrue(rotations[1].pressed)
    assertEqual(rotations[2].instanceId, "encoder-b")
    assertEqual(rotations[2].label, "B")
    assertEqual(rotations[2].ticks, -1)
    assertFalse(rotations[2].pressed)
    assertEqual(releases[1], "encoder-b")
    assertEqual(touches[1].instanceId, "encoder-a")
    assertEqual(touches[1].label, "A")
    assertTrue(touches[1].hold)
    assertEqual(touches[1].x, 120)
    assertEqual(touches[1].y, 40)
    assertEqual(touches[2].instanceId, "encoder-b")
    assertEqual(touches[2].label, "B")
    assertFalse(touches[2].hold)
    assertEqual(touches[2].x, 800)
    assertEqual(touches[2].y, 100)
    server:stop()
  end)
end)

test("long press configuration validates and defaults deterministically", function()
  local callback = function() end
  local function definition(id, extra)
    local value = {
      id = id,
      name = id,
      appearance = callback,
      press = callback,
    }
    for key, item in pairs(extra or {}) do
      value[key] = item
    end
    return value
  end
  local registry = Registry.new()
  assertFalse(pcall(registry.register, registry, definition("com.test.long-callback-not-function", {
    longPress = true,
  })))
  assertFalse(pcall(registry.register, registry, definition("com.test.threshold-without-callback", {
    longPressThresholdMs = 500,
  })))
  assertFalse(pcall(registry.register, registry, definition("com.test.threshold-too-short", {
    longPress = callback,
    longPressThresholdMs = 99,
  })))
  assertFalse(pcall(registry.register, registry, definition("com.test.threshold-fraction", {
    longPress = callback,
    longPressThresholdMs = 100.5,
  })))
  assertFalse(pcall(registry.register, registry, definition("com.test.threshold-too-long", {
    longPress = callback,
    longPressThresholdMs = 10001,
  })))
  local defaulted = definition("com.test.threshold-default", { longPress = callback })
  registry:register(defaulted)
  clearPendingTimers()
  withTokenPath(function(path)
    local server = newServer(registry, path)
    authenticate(server, path)
    exchange(server, message("instanceAppeared", {
      instanceId = "default-threshold",
      actionId = "com.test.threshold-default",
      settings = {},
    }))
    exchange(server, message("keyDown", {
      instanceId = "default-threshold",
      actionId = "com.test.threshold-default",
    }))
    assertEqual(nextPendingDelay(), 0.5, "longPress must use the documented default threshold")
    exchange(server, message("keyUp", {
      instanceId = "default-threshold",
      actionId = "com.test.threshold-default",
    }))
    server:stop()
  end)
  clearPendingTimers()
end)

test("double press configuration validates and defaults deterministically", function()
  local callback = function() end
  local function definition(id, extra)
    local value = {
      id = id,
      name = id,
      appearance = callback,
      press = callback,
    }
    for key, item in pairs(extra or {}) do
      value[key] = item
    end
    return value
  end
  local registry = Registry.new()
  assertFalse(pcall(registry.register, registry, definition("com.test.double-callback-not-function", {
    doublePress = true,
  })))
  assertFalse(pcall(registry.register, registry, definition("com.test.double-threshold-without-callback", {
    doublePressThresholdMs = 350,
  })))
  assertFalse(pcall(registry.register, registry, definition("com.test.double-threshold-too-short", {
    doublePress = callback,
    doublePressThresholdMs = 99,
  })))
  assertFalse(pcall(registry.register, registry, definition("com.test.double-threshold-fraction", {
    doublePress = callback,
    doublePressThresholdMs = 100.5,
  })))
  assertFalse(pcall(registry.register, registry, definition("com.test.double-threshold-too-long", {
    doublePress = callback,
    doublePressThresholdMs = 10001,
  })))
  registry:register(definition("com.test.double-threshold-default", { doublePress = callback }))
  clearPendingTimers()
  withTokenPath(function(path)
    local server = newServer(registry, path)
    authenticate(server, path)
    exchange(server, message("instanceAppeared", {
      instanceId = "default-double-threshold",
      actionId = "com.test.double-threshold-default",
      settings = {},
    }))
    exchange(server, message("keyDown", {
      instanceId = "default-double-threshold",
      actionId = "com.test.double-threshold-default",
    }))
    exchange(server, message("keyUp", {
      instanceId = "default-double-threshold",
      actionId = "com.test.double-threshold-default",
    }))
    assertEqual(nextPendingDelay(), 0.35, "doublePress must use the documented default threshold")
    server:stop()
  end)
  clearPendingTimers()
end)

test("double press defers taps and composes with long presses safely", function()
  clearPendingTimers()
  local pressed = 0
  local doublePressed = 0
  local longPressed = 0
  local released = 0
  local registry = Registry.new()
  registry:register({
    id = "com.test.double-press",
    name = "Double press",
    doublePressThresholdMs = 350,
    longPressThresholdMs = 100,
    appearance = function() return { title = "Ready", state = "inactive" } end,
    press = function() pressed = pressed + 1 end,
    doublePress = function() doublePressed = doublePressed + 1 end,
    longPress = function() longPressed = longPressed + 1 end,
    release = function() released = released + 1 end,
  })
  withTokenPath(function(path)
    local server = newServer(registry, path)
    authenticate(server, path)
    exchange(server, message("instanceAppeared", {
      instanceId = "double-instance",
      actionId = "com.test.double-press",
      settings = {},
    }))

    exchange(server, message("keyDown", {
      instanceId = "double-instance",
      actionId = "com.test.double-press",
    }))
    exchange(server, message("keyDown", {
      instanceId = "double-instance",
      actionId = "com.test.double-press",
    }))
    exchange(server, message("keyUp", {
      instanceId = "double-instance",
      actionId = "com.test.double-press",
    }))
    assertEqual(pressed, 0, "a first tap must wait for the double-press window")
    assertEqual(released, 1, "duplicate keyDown must not duplicate release")
    assertEqual(nextPendingDelay(), 0.35, "short tap must schedule the double-press window")
    assertEqual(runPendingTimer(), 0.35)
    assertEqual(pressed, 1, "expired double-press window must invoke press once")

    exchange(server, message("keyDown", {
      instanceId = "double-instance",
      actionId = "com.test.double-press",
    }))
    exchange(server, message("keyUp", {
      instanceId = "double-instance",
      actionId = "com.test.double-press",
    }))
    local staleDoubleTimer = lastScheduledTimer
    exchange(server, message("keyDown", {
      instanceId = "double-instance",
      actionId = "com.test.double-press",
    }))
    staleDoubleTimer.callback()
    assertEqual(pressed, 1, "cancelled single-tap timer must not invoke press")
    exchange(server, message("keyUp", {
      instanceId = "double-instance",
      actionId = "com.test.double-press",
    }))
    assertEqual(doublePressed, 1, "two short taps must invoke doublePress once")
    assertEqual(released, 3, "release runs once for each completed physical press")

    exchange(server, message("keyDown", {
      instanceId = "double-instance",
      actionId = "com.test.double-press",
    }))
    exchange(server, message("keyUp", {
      instanceId = "double-instance",
      actionId = "com.test.double-press",
    }))
    exchange(server, message("keyDown", {
      instanceId = "double-instance",
      actionId = "com.test.double-press",
    }))
    assertEqual(runPendingTimer(), 0.1)
    assertEqual(longPressed, 1, "long press must cancel the preceding pending tap")
    exchange(server, message("keyUp", {
      instanceId = "double-instance",
      actionId = "com.test.double-press",
    }))
    assertEqual(pressed, 1, "long press must not invoke press")
    assertEqual(doublePressed, 1, "long press must not invoke doublePress")
    assertEqual(released, 5, "release remains available after longPress")

    exchange(server, message("keyDown", {
      instanceId = "double-instance",
      actionId = "com.test.double-press",
    }))
    exchange(server, message("keyUp", {
      instanceId = "double-instance",
      actionId = "com.test.double-press",
    }))
    exchange(server, message("instanceAppeared", {
      instanceId = "double-instance",
      actionId = "com.test.double-press",
      settings = {},
    }))
    assertEqual(runPendingTimer(), nil, "settings replacement must cancel pending doublePress")
    assertEqual(pressed, 1, "cancelled sequence must not become a tap")
    server:stop()
  end)
  clearPendingTimers()
end)

test("long press classifies tap and long transitions once and cancels safely", function()
  clearPendingTimers()
  local pressed = 0
  local longPressed = 0
  local released = 0
  local registry = Registry.new()
  registry:register({
    id = "com.test.long-press",
    name = "Long press",
    longPressThresholdMs = 750,
    appearance = function() return { title = "Ready", state = "inactive" } end,
    press = function() pressed = pressed + 1 end,
    longPress = function() longPressed = longPressed + 1 end,
    release = function() released = released + 1 end,
  })
  withTokenPath(function(path)
    local server = newServer(registry, path)
    authenticate(server, path)
    exchange(server, message("instanceAppeared", {
      instanceId = "long-instance",
      actionId = "com.test.long-press",
      settings = {},
    }))

    exchange(server, message("keyDown", {
      instanceId = "long-instance",
      actionId = "com.test.long-press",
    }))
    assertEqual(nextPendingDelay(), 0.75, "configured threshold must be scheduled in seconds")
    exchange(server, message("keyUp", {
      instanceId = "long-instance",
      actionId = "com.test.long-press",
    }))
    exchange(server, message("keyUp", {
      instanceId = "long-instance",
      actionId = "com.test.long-press",
    }))
    assertEqual(pressed, 1, "tap must invoke press once")
    assertEqual(longPressed, 0, "tap must not invoke longPress")
    assertEqual(released, 1, "duplicate keyUp must not duplicate release")

    exchange(server, message("keyDown", {
      instanceId = "long-instance",
      actionId = "com.test.long-press",
    }))
    local staleTimer = lastScheduledTimer
    exchange(server, message("keyDown", {
      instanceId = "long-instance",
      actionId = "com.test.long-press",
    }))
    staleTimer.callback()
    assertEqual(longPressed, 0, "replaced timer callback must not invoke longPress")
    assertEqual(runPendingTimer(), 0.75)
    assertEqual(longPressed, 1, "threshold must invoke longPress once")
    runLastTimerAgain()
    assertEqual(longPressed, 1, "duplicate timer callback must not duplicate longPress")
    exchange(server, message("keyUp", {
      instanceId = "long-instance",
      actionId = "com.test.long-press",
    }))
    assertEqual(pressed, 1, "long press must not invoke tap press")
    assertEqual(longPressed, 1, "long press must not duplicate callback")
    assertEqual(released, 2, "release remains available after longPress")

    exchange(server, message("keyDown", {
      instanceId = "long-instance",
      actionId = "com.test.long-press",
    }))
    exchange(server, message("instanceAppeared", {
      instanceId = "long-instance",
      actionId = "com.test.long-press",
      settings = {},
    }))
    assertEqual(runPendingTimer(), nil, "settings replacement must cancel pending longPress")
    exchange(server, message("keyUp", {
      instanceId = "long-instance",
      actionId = "com.test.long-press",
    }))
    assertEqual(pressed, 1, "cancelled sequence must not become a tap")
    server:stop()
  end)
  clearPendingTimers()
end)


test("long press callback errors stay isolated from release", function()
  clearPendingTimers()
  local released = 0
  local registry = Registry.new()
  registry:register({
    id = "com.test.long-press-error",
    name = "Long press error",
    longPressThresholdMs = 100,
    appearance = function() return { title = "Ready", state = "inactive" } end,
    press = function() error("tap must not run") end,
    longPress = function() error("intentional long press failure") end,
    release = function() released = released + 1 end,
  })
  withTokenPath(function(path)
    local server = newServer(registry, path)
    authenticate(server, path)
    exchange(server, message("instanceAppeared", {
      instanceId = "long-error",
      actionId = "com.test.long-press-error",
      settings = {},
    }))
    exchange(server, message("keyDown", {
      instanceId = "long-error",
      actionId = "com.test.long-press-error",
    }))
    runPendingTimer()
    local callbackError = fakeHttp.sent[#fakeHttp.sent]
    assertEqual(fakeDecode(callbackError).code, "CALLBACK_FAILED")
    exchange(server, message("keyUp", {
      instanceId = "long-error",
      actionId = "com.test.long-press-error",
    }))
    assertEqual(released, 1, "release must still run after longPress failure")
    server:stop()
  end)
  clearPendingTimers()
end)



test("settings replay rebuilds independent contexts after reconnect", function()
  local pressed = {}
  local states = {}
  local registry = Registry.new()
  registry:register({
    id = "com.test.replay-per-instance",
    name = "Replay per instance",
    appearance = function(context)
      local settings = context:getSettings()
      local label = type(settings.label) == "string" and settings.label or "Unknown"
      return {
        title = label,
        state = states[context.instanceId] and "active" or "inactive",
      }
    end,
    press = function(context)
      states[context.instanceId] = not states[context.instanceId]
      pressed[context.instanceId] = (pressed[context.instanceId] or 0) + 1
      context:refresh()
    end,
    appear = function(context)
      states[context.instanceId] = false
    end,
    disappear = function(context)
      states[context.instanceId] = nil
    end,
  })

  withTokenPath(function(path)
    local server = newServer(registry, path)
    local firstSession = authenticate(server, path)
    local first = exchange(server, message("instanceAppeared", {
      instanceId = "profile-a-device-one",
      actionId = "com.test.replay-per-instance",
      settings = { label = "Alpha" },
    }))
    local second = exchange(server, message("instanceAppeared", {
      instanceId = "profile-b-device-two",
      actionId = "com.test.replay-per-instance",
      settings = { label = "Beta" },
    }))
    assertEqual(first[1].title, "Alpha")
    assertEqual(second[1].title, "Beta")

    local pressedFirst = exchange(server, message("keyDown", {
      instanceId = "profile-a-device-one",
      actionId = "com.test.replay-per-instance",
    }))
    assertEqual(pressed["profile-a-device-one"], 1)
    assertEqual(pressed["profile-b-device-two"], nil)
    assertEqual(pressedFirst[1].state, 1)
    assertEqual(exchange(server, message("requestAppearance", {
      instanceId = "profile-b-device-two",
      actionId = "com.test.replay-per-instance",
    }))[1].state, 0)

    local updated = exchange(server, message("instanceAppeared", {
      instanceId = "profile-a-device-one",
      actionId = "com.test.replay-per-instance",
      settings = { label = "Alpha updated" },
    }))
    assertEqual(updated[1].title, "Alpha updated")
    assertEqual(updated[1].state, 1, "settings updates must retain the same context state")

    local restarted = exchange(server, message("hello", {
      token = tokenAt(path),
      pluginVersion = "restarted-plugin",
    }))
    assertEqual(restarted[1].type, "helloAck")
    assertTrue(restarted[1].sessionId ~= firstSession)
    assertEqual(states["profile-a-device-one"], nil, "reconnect must discard old mutable context state")
    assertEqual(states["profile-b-device-two"], nil, "reconnect must discard every old context state")
    assertError("AUTH_REQUIRED", exchange(server, message("keyDown", {
      sessionId = firstSession,
      instanceId = "profile-a-device-one",
      actionId = "com.test.replay-per-instance",
    })))

    local replayedFirst = exchange(server, message("instanceAppeared", {
      instanceId = "profile-a-device-one",
      actionId = "com.test.replay-per-instance",
      settings = { label = "Alpha updated" },
    }))
    local replayedSecond = exchange(server, message("instanceAppeared", {
      instanceId = "profile-b-device-two",
      actionId = "com.test.replay-per-instance",
      settings = { label = "Beta" },
    }))
    assertEqual(replayedFirst[1].title, "Alpha updated")
    assertEqual(replayedFirst[1].state, 0)
    assertEqual(replayedSecond[1].title, "Beta")
    assertEqual(replayedSecond[1].state, 0)

    exchange(server, message("instanceDisappeared", {
      instanceId = "profile-a-device-one",
      actionId = "com.test.replay-per-instance",
    }))
    assertError("STALE_INSTANCE", exchange(server, message("keyDown", {
      instanceId = "profile-a-device-one",
      actionId = "com.test.replay-per-instance",
    })))
    local pressedSecond = exchange(server, message("keyDown", {
      instanceId = "profile-b-device-two",
      actionId = "com.test.replay-per-instance",
    }))
    assertEqual(pressed["profile-b-device-two"], 1)
    assertEqual(pressedSecond[1].instanceId, "profile-b-device-two")
    server:stop()
  end)
end)

test("stale instance IDs are rejected", function()
  local registry = Registry.new()
  registry:register({
    id = "com.test.stale",
    name = "Stale",
    appearance = function() return { title = "Stale", state = "inactive" } end,
    press = function() end,
  })
  withTokenPath(function(path)
    local server = newServer(registry, path)
    authenticate(server, path)
    local responses = exchange(server, message("keyDown", {
      instanceId = "not-visible",
      actionId = "com.test.stale",
    }))
    assertError("STALE_INSTANCE", responses)
    server:stop()
  end)
end)

test("repeated appearance refreshes settings without repeating lifecycle callbacks", function()
  local appeared = 0
  local disappeared = 0
  local registry = Registry.new()
  registry:register({
    id = "com.test.idempotent",
    name = "Idempotent",
    appearance = function(context)
      return { title = context:getSettings().label, state = "active" }
    end,
    press = function() end,
    appear = function() appeared = appeared + 1 end,
    disappear = function() disappeared = disappeared + 1 end,
  })
  registry:register({
    id = "com.test.other-action",
    name = "Other action",
    appearance = function() return { title = "Other", state = "inactive" } end,
    press = function() end,
  })

  withTokenPath(function(path)
    local server = newServer(registry, path)
    authenticate(server, path)
    local first = exchange(server, message("instanceAppeared", {
      instanceId = "same-instance",
      actionId = "com.test.idempotent",
      settings = { label = "first" },
    }))
    assertEqual(first[1].title, "first")
    assertEqual(appeared, 1)

    local refreshed = exchange(server, message("instanceAppeared", {
      instanceId = "same-instance",
      actionId = "com.test.idempotent",
      settings = { label = "updated" },
    }))
    assertEqual(refreshed[1].title, "updated")
    assertEqual(appeared, 1, "settings refresh must not invoke appear again")
    assertEqual(disappeared, 0)
    local conflicting = exchange(server, message("instanceAppeared", {
      instanceId = "same-instance",
      actionId = "com.test.other-action",
      settings = {},
    }))
    assertError("INVALID_STATE", conflicting)

    exchange(server, message("instanceAppeared", {
      instanceId = "new-instance",
      actionId = "com.test.idempotent",
      settings = { label = "new" },
    }))
    assertEqual(appeared, 2)

    exchange(server, message("instanceDisappeared", {
      instanceId = "same-instance",
      actionId = "com.test.idempotent",
    }))
    exchange(server, message("instanceDisappeared", {
      instanceId = "same-instance",
      actionId = "com.test.idempotent",
    }))
    assertEqual(disappeared, 1, "repeated removal must invoke disappear once")

    server:stop()
    assertEqual(disappeared, 2, "stop must disappear each remaining instance once")
  end)
end)
test("helper components isolate state and refresh only after success", function()
  local initialized = {}
  local state = Helpers.perInstanceState(function(context)
    initialized[#initialized + 1] = context
    return { count = 0 }
  end)
  local a = { instanceId = "helper-a" }
  local b = { instanceId = "helper-b" }

  state.appear(a)
  state.appear(b)
  assertEqual(initialized[1], a, "initializer must receive context A")
  assertEqual(initialized[2], b, "initializer must receive context B")
  assertEqual(state:get(a).count, 0)
  assertEqual(state:get(b).count, 0)

  state:set(a, { count = 1 })
  state.appear(a)
  assertEqual(#initialized, 2, "repeated appear must not reset state")
  assertEqual(state:get(a).count, 1)
  assertEqual(state:get(b).count, 0, "instances must not share state")

  state.disappear(a)
  assertEqual(state:get(a), nil, "disappear must clean up only its instance")
  assertEqual(state:get(b).count, 0, "disappear must preserve other instances")
  state.appear(a)
  assertEqual(#initialized, 3, "reappearing after disappear must initialize")
  local stale = { instanceId = "helper-reused" }
  local replacement = { instanceId = "helper-reused" }
  state.appear(stale)
  state:set(stale, { count = 7 })
  state.disappear(stale)
  state.appear(replacement)
  state:set(replacement, { count = 2 })
  assertEqual(state:get(stale), nil, "stale contexts must not read replacement state")
  assertFalse(pcall(state.set, stale, { count = 9 }), "stale contexts must not write replacement state")
  state.disappear(stale)
  assertEqual(state:get(replacement).count, 2, "stale disappear must preserve replacement state")


  assertFalse(pcall(Helpers.perInstanceState, "not a function"))
  assertFalse(pcall(state.appear, {}))
  assertFalse(pcall(state.disappear, {}))
  assertFalse(pcall(state.get, {}))
  assertFalse(pcall(state.set, {}, false))

  local refreshes = 0
  function a:refresh()
    refreshes = refreshes + 1
  end
  local wrapped = Helpers.refreshAfter(function(context, first, second)
    assertEqual(context, a, "refresh wrapper must preserve context")
    return first, nil, second
  end)
  local first, missing, second = wrapped(a, "first", "second")
  assertEqual(first, "first")
  assertEqual(missing, nil)
  assertEqual(second, "second")
  assertEqual(refreshes, 1, "successful callback must refresh once")

  local failed = Helpers.refreshAfter(function()
    error("expected helper callback failure")
  end)
  assertFalse(pcall(failed, a), "callback errors must propagate")
  assertEqual(refreshes, 1, "failed callback must not refresh")
  assertFalse(pcall(Helpers.refreshAfter, "not a function"))
end)
test("SVG helper wraps canonical base64 custom icons", function()
  local vectors = {
    { "", "" },
    { "f", "Zg==" },
    { "fo", "Zm8=" },
    { "foo", "Zm9v" },
  }
  for _, vector in ipairs(vectors) do
    local icon = Helpers.svg(vector[1])
    assertEqual(icon.kind, "custom")
    assertEqual(icon.mediaType, "image/svg+xml")
    assertEqual(icon.dataBase64, vector[2])
  end
  assertFalse(pcall(Helpers.svg, 123), "SVG helper must reject non-string input")
end)
test("PNG helper resizes images to device metadata and canonicalizes validated wire data", function()
  local pngBySize = {
    [72] = "iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAAAK0lEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAujBRSAAB/UYCuQAAAABJRU5ErkJggg==",
    [120] = "iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAIAAAC2BqGFAAAAQElEQVR4nO3BAQEAAACCIP+vbkhAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAnRipOAABp+xssgAAAABJRU5ErkJggg==",
  }
  local bitmapCalls = {}
  local image = {
    bitmapRepresentation = function(_, size)
      bitmapCalls[size.w] = (bitmapCalls[size.w] or 0) + 1
      assertEqual(size.h, size.w)
      assertTrue(pngBySize[size.w] ~= nil, "PNG helper must request a supported fixture size")
      return {
        encodeAsURLString = function(_, scale, imageType)
          assertTrue(scale)
          assertEqual(imageType, "PNG")
          return "data:image/png;base64," .. pngBySize[size.w] .. "\n"
        end,
      }
    end,
  }
  local active_context = {
    getDevice = function()
      return { imageSize = 120 }
    end,
  }
  local missing_context = {}

  local active = Helpers.png(active_context, image)
  assertEqual(active.kind, "custom")
  assertEqual(active.mediaType, "image/png")
  assertEqual(active.dataBase64, pngBySize[120])
  assertTrue(active.dataBase64:find("^data:", 1) == nil, "PNG wire data must not retain a data URL")
  assertTrue(Protocol.validateAppearanceIcon(active), "active PNG must pass the protocol icon validator")
  assertEqual(bitmapCalls[120], 1)

  local fallback = Helpers.png(missing_context, image)
  assertEqual(fallback.dataBase64, pngBySize[72], "missing metadata must fall back to 72 pixels")
  assertTrue(Protocol.validateAppearanceIcon(fallback), "fallback PNG must pass the protocol icon validator")
  assertEqual(bitmapCalls[72], 1)
end)
test("area chart helper clamps and bounds safe SVG geometry", function()
  local alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  local function decodeBase64(encoded)
    local output = {}
    for index = 1, #encoded, 4 do
      local first = alphabet:find(encoded:sub(index, index), 1, true)
      local second = alphabet:find(encoded:sub(index + 1, index + 1), 1, true)
      local thirdCharacter = encoded:sub(index + 2, index + 2)
      local fourthCharacter = encoded:sub(index + 3, index + 3)
      local third = thirdCharacter == "=" and 0 or alphabet:find(thirdCharacter, 1, true) - 1
      local fourth = fourthCharacter == "=" and 0 or alphabet:find(fourthCharacter, 1, true) - 1
      local combined = (first - 1) * 262144 + (second - 1) * 4096 + third * 64 + fourth
      output[#output + 1] = string.char(math.floor(combined / 65536))
      if thirdCharacter ~= "=" then
        output[#output + 1] = string.char(math.floor(combined / 256) % 256)
      end
      if fourthCharacter ~= "=" then
        output[#output + 1] = string.char(combined % 256)
      end
    end
    return table.concat(output)
  end

  local function svgFor(icon)
    assertEqual(icon.kind, "custom")
    assertEqual(icon.mediaType, "image/svg+xml")
    return decodeBase64(icon.dataBase64)
  end
  local fallback_context = {}
  local chart144_context = {
    getDevice = function()
      return { imageSize = 144 }
    end,
  }
  local chart120_context = {
    getDevice = function()
      return { imageSize = 120 }
    end,
  }
  local sparse = { [1] = 1, [3] = 3 }


  local emptySvg = svgFor(Helpers.areaChart(fallback_context, {}))
  assertTrue(emptySvg:find('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">', 1, true) ~= nil)
  assertTrue(emptySvg:find('<rect width="72" height="72" fill="#000000"/>', 1, true) ~= nil)
  assertTrue(emptySvg:find('<path fill="#FFFFFF" d="M0 72 Z"/>', 1, true) ~= nil)
  local singleSvg = svgFor(Helpers.areaChart(fallback_context, { 50 }))
  assertTrue(singleSvg:find('d="M0 72 L0 36 L0 72 Z"', 1, true) ~= nil)

  local multipleSvg = svgFor(Helpers.areaChart(fallback_context, { 0, 50, 100 }))
  assertTrue(multipleSvg:find('d="M0 72 L0 72 L36 36 L71 0 L71 72 Z"', 1, true) ~= nil)
  local clampedSvg = svgFor(Helpers.areaChart(fallback_context, { -10, 200 }))
  assertTrue(clampedSvg:find('d="M0 72 L0 72 L71 0 L71 72 Z"', 1, true) ~= nil)

  local samples = {}
  for index = 1, 120 do
    samples[index] = index - 1
  end
  local boundedSvg = svgFor(Helpers.areaChart(fallback_context, samples))
  local lineCount = 0
  for _ in boundedSvg:gmatch(" L") do
    lineCount = lineCount + 1
  end
  assertEqual(lineCount, 73, "downsampling must retain at most 72 plotted points plus baseline")
  assertTrue(boundedSvg:find("L71 0 L71 72 Z", 1, true) ~= nil, "downsampling must retain newest value")

  local chart144Svg = svgFor(Helpers.areaChart(chart144_context, { 0, 100 }, {
    backgroundColor = "#123456",
    fillColor = "#abcdef",
    strokeColor = "#0f4c75",
    strokeWidth = 3,
  }))
  assertTrue(chart144Svg:find('viewBox="0 0 144 144"', 1, true) ~= nil)
  assertTrue(chart144Svg:find('<rect width="144" height="144" fill="#123456"/>', 1, true) ~= nil)
  assertTrue(chart144Svg:find('<path fill="#abcdef"', 1, true) ~= nil)
  assertTrue(chart144Svg:find(
    '<path fill="none" stroke="#0f4c75" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="M0 144 L143 0"/>',
    1,
    true
  ) ~= nil, "the trace must remain open instead of outlining the baseline")
  local chart120Svg = svgFor(Helpers.areaChart(chart120_context, { 0, 100 }, {
    strokeColor = "#1B5E8A",
    strokeWidth = 2,
  }))
  assertTrue(chart120Svg:find('viewBox="0 0 120 120"', 1, true) ~= nil,
    "area charts must use active device image dimensions")
  assertTrue(chart120Svg:find('d="M0 120 L0 120 L119 0 L119 120 Z"', 1, true) ~= nil)
  local chart120Valid, chart120Code = Protocol.validate(message("appearance", {
    instanceId = "chart-120",
    actionId = "com.test.chart",
    title = "Chart",
    state = 0,
    appearanceVersion = 1,
    icon = Helpers.areaChart(chart120_context, { 25, 75 }),
  }))
  assertTrue(chart120Valid, chart120Code or "active-size area chart must pass the safe icon validator")

  local valid, code = Protocol.validate(message("appearance", {
    instanceId = "chart",
    actionId = "com.test.chart",
    title = "Chart",
    state = 0,
    appearanceVersion = 1,
    icon = Helpers.areaChart(fallback_context, { 25, 75 }, {
      strokeColor = "#1B5E8A",
      strokeWidth = 2,
    }),
  }))
  assertTrue(valid, code or "area chart SVG must pass the safe icon validator")

  local invalidArguments = {
    { fallback_context, "not an array" },
    { fallback_context, sparse },
    { fallback_context, { 1, math.huge } },
    { fallback_context, { 1 }, false },
    { fallback_context, { 1 }, { size = 73 } },
    { fallback_context, { 1 }, { size = 72.5 } },
    { fallback_context, { 1 }, { min = 1 / 0 } },
    { fallback_context, { 1 }, { max = 0 / 0 } },
    { fallback_context, { 1 }, { min = 10, max = 10 } },
    { fallback_context, { 1 }, { backgroundColor = "#fff" } },
    { fallback_context, { 1 }, { fillColor = "red" } },
    { fallback_context, { 1 }, { strokeColor = "#123" } },
    { fallback_context, { 1 }, { strokeWidth = 0 } },
    { fallback_context, { 1 }, { strokeWidth = 0.0004 } },
    { fallback_context, { 1 }, { strokeWidth = 73 } },
    { fallback_context, { 1 }, { unknown = true } },
  }
  for _, arguments in ipairs(invalidArguments) do
    assertFalse(pcall(Helpers.areaChart, table.unpack(arguments)), "malformed area chart arguments must fail")
  end
  local ok, err = pcall(Helpers.areaChart, fallback_context, "not an array")
  assertFalse(ok)
  assertTrue(tostring(err):find("dense numeric array", 1, true) ~= nil, "area chart errors must explain malformed values")
end)



test("requestAppearance refreshes an instance without pressing it", function()
  local pressed = 0
  local appearances = 0
  local registry = Registry.new()
  registry:register({
    id = "com.test.request-appearance",
    name = "Request appearance",
    appearance = function()
      appearances = appearances + 1
      return { title = "Render " .. tostring(appearances), state = "active" }
    end,
    press = function() pressed = pressed + 1 end,
  })

  withTokenPath(function(path)
    local server = newServer(registry, path)
    authenticate(server, path)
    local first = exchange(server, message("instanceAppeared", {
      instanceId = "request-instance",
      actionId = "com.test.request-appearance",
      settings = {},
    }))
    assertEqual(first[1].type, "appearance")
    assertEqual(first[1].title, "Render 1")

    local refreshed = exchange(server, message("requestAppearance", {
      instanceId = "request-instance",
      actionId = "com.test.request-appearance",
    }))
    assertEqual(refreshed[1].type, "appearance")
    assertEqual(refreshed[1].title, "Render 2")
    assertEqual(appearances, 2)
    assertEqual(pressed, 0, "requestAppearance must not invoke press")
    local released = exchange(server, message("keyUp", {
      instanceId = "request-instance",
      actionId = "com.test.request-appearance",
    }))
    assertEqual(#released, 0, "missing release callback must be a no-op")
    server:stop()
  end)
end)

test("server refreshes every matching instance and rejects unknown actions", function()
  local appearances = {}
  local registry = Registry.new()
  registry:register({
    id = "com.test.refresh-all",
    name = "Refresh all",
    appearance = function(context)
      local instanceId = context.instanceId
      appearances[instanceId] = (appearances[instanceId] or 0) + 1
      return {
        title = context:getSettings().label .. "-" .. tostring(appearances[instanceId]),
        state = "active",
      }
    end,
    press = function() end,
  })
  registry:register({
    id = "com.test.refresh-other",
    name = "Refresh other",
    appearance = function(context)
      local instanceId = context.instanceId
      appearances[instanceId] = (appearances[instanceId] or 0) + 1
      return { title = context:getSettings().label, state = "inactive" }
    end,
    press = function() end,
  })

  withTokenPath(function(path)
    local server = newServer(registry, path)
    authenticate(server, path)
    exchange(server, message("instanceAppeared", {
      instanceId = "refresh-first",
      actionId = "com.test.refresh-all",
      settings = { label = "First" },
    }))
    exchange(server, message("instanceAppeared", {
      instanceId = "refresh-second",
      actionId = "com.test.refresh-all",
      settings = { label = "Second" },
    }))
    exchange(server, message("instanceAppeared", {
      instanceId = "refresh-other-instance",
      actionId = "com.test.refresh-other",
      settings = { label = "Other" },
    }))

    local sentAtStart = #fakeHttp.sent
    assertEqual(server:refresh("com.test.refresh-all"), server)
    assertEqual(#fakeHttp.sent, sentAtStart + 2)
    local refreshed = {}
    for index = sentAtStart + 1, #fakeHttp.sent do
      local response = fakeDecode(fakeHttp.sent[index])
      assertEqual(response.type, "appearance")
      refreshed[response.instanceId] = response
    end
    assertEqual(refreshed["refresh-first"].title, "First-2")
    assertEqual(refreshed["refresh-second"].title, "Second-2")
    assertEqual(appearances["refresh-first"], 2)
    assertEqual(appearances["refresh-second"], 2)
    assertEqual(appearances["refresh-other-instance"], 1)
    assertFalse(pcall(server.refresh, server, "com.test.missing-refresh"), "unknown action refresh must fail")
    server:stop()
  end)
end)

test("session rotation rejects stale and missing clients before invocation", function()
  local pressed = 0
  local disappeared = 0
  local registry = Registry.new()
  registry:register({
    id = "com.test.sessions",
    name = "Sessions",
    appearance = function() return { title = "Session", state = "active" } end,
    press = function() pressed = pressed + 1 end,
    disappear = function(context)
      disappeared = disappeared + 1
      context:refresh()
      error("expected teardown failure")
    end,
  })

  withTokenPath(function(path)
    local server = newServer(registry, path)
    local oldSession = authenticate(server, path)
    exchange(server, message("instanceAppeared", {
      instanceId = "session-instance",
      actionId = "com.test.sessions",
      settings = {},
    }))

    local restarted = exchange(server, message("hello", {
      token = tokenAt(path),
      pluginVersion = "restarted-plugin",
    }))
    assertEqual(restarted[1].type, "helloAck")
    assertEqual(#restarted, 1, "old-context teardown must not emit into the new session")
    assertTrue(restarted[1].sessionId ~= oldSession, "plugin restart must rotate the session")
    assertEqual(disappeared, 1, "rotating a session must clear old contexts")

    assertError("AUTH_REQUIRED", exchange(server, message("keyDown", {
      sessionId = oldSession,
      instanceId = "session-instance",
      actionId = "com.test.sessions",
    })))
    assertError("INVALID_FIELD", exchange(server, message("keyDown", {
      sessionId = false,
      instanceId = "session-instance",
      actionId = "com.test.sessions",
    })))
    assertEqual(pressed, 0, "stale and missing sessions must not invoke callbacks")
    server:stop()
  end)
end)

test("session IDs remain unique across bridge restarts", function()
  local pressed = 0
  local registry = Registry.new()
  registry:register({
    id = "com.test.restart-session",
    name = "Restart session",
    appearance = function() return { title = "Restart", state = "active" } end,
    press = function() pressed = pressed + 1 end,
  })

  withTokenPath(function(path)
    local firstServer = newServer(registry, path)
    local oldSession = authenticate(firstServer, path)
    firstServer:stop()

    local restartedServer = newServer(registry, path)
    local currentSession = authenticate(restartedServer, path)
    assertTrue(currentSession ~= oldSession, "restart must not reuse a session ID")
    exchange(restartedServer, message("instanceAppeared", {
      instanceId = "restart-session-instance",
      actionId = "com.test.restart-session",
      settings = {},
    }))

    assertError("AUTH_REQUIRED", exchange(restartedServer, message("keyDown", {
      sessionId = oldSession,
      instanceId = "restart-session-instance",
      actionId = "com.test.restart-session",
    })))
    assertEqual(pressed, 0, "a pre-restart session ID must not invoke a callback")
    restartedServer:stop()
  end)
end)

test("callback exceptions are protected and reported", function()
  local registry = Registry.new()
  registry:register({
    id = "com.test.callback-error",
    name = "Callback error",
    appearance = function() return { title = "Ready", state = "inactive" } end,
    press = function() error("intentional press failure") end,
    release = function() error("intentional release failure") end,
  })
  withTokenPath(function(path)
    local server = newServer(registry, path)
    authenticate(server, path)
    exchange(server, message("instanceAppeared", {
      instanceId = "callback-instance",
      actionId = "com.test.callback-error",
      settings = {},
    }))
    local responses = exchange(server, message("keyDown", {
      instanceId = "callback-instance",
      actionId = "com.test.callback-error",
    }))
    assertEqual(responses[1].type, "feedback", "callback failures should emit immediate feedback")
    assertEqual(responses[1].kind, "error", "callback failure feedback should be an error")
    assertEqual(responses[1].message, "Action failed", "callback failure feedback should be concise")
    assertError("CALLBACK_FAILED", { responses[2] })
    local releaseResponses = exchange(server, message("keyUp", {
      instanceId = "callback-instance",
      actionId = "com.test.callback-error",
    }))
    assertEqual(releaseResponses[1].type, "feedback", "release failures should emit immediate feedback")
    assertError("CALLBACK_FAILED", { releaseResponses[2] })
    server:stop()
  end)
end)

test("context lifecycle callbacks and appearance emitter failures are reported", function()
  local errors = {}
  local context = Context.new({
    instanceId = "context-instance",
    actionId = "com.test.context",
    settings = {},
    definition = {
      appearance = function() return { title = "Ready", state = "active" } end,
    },
    emitAppearance = function()
      error("appearance emitter failed")
    end,
    emitError = function(code, instanceId)
      errors[#errors + 1] = { code = code, instanceId = instanceId }
    end,
  })

  assertTrue(context:invoke("appear"), "missing appear callback must be a no-op")
  assertTrue(context:invoke("disappear"), "missing disappear callback must be a no-op")
  assertEqual(#errors, 0)
  assertFalse(context:refresh(), "appearance emitter failure must fail refresh")
  assertEqual(errors[1].code, "INTERNAL")
  assertEqual(errors[1].instanceId, "context-instance")

  errors = {}
  local failing = Context.new({
    instanceId = "failing-context",
    actionId = "com.test.context",
    settings = {},
    definition = {
      appearance = function() return { title = "Ready", state = "active" } end,
      appear = function() error("appear callback failed") end,
      disappear = function() error("disappear callback failed") end,
    },
    emitAppearance = function() end,
    emitError = function(code, instanceId)
      errors[#errors + 1] = { code = code, instanceId = instanceId }
    end,
  })
  assertFalse(failing:invoke("appear"))
  assertFalse(failing:invoke("disappear"))
  assertEqual(errors[1].code, "CALLBACK_FAILED")
  assertEqual(errors[1].instanceId, "failing-context")
  assertEqual(errors[2].code, "CALLBACK_FAILED")
  assertEqual(errors[2].instanceId, "failing-context")
end)

test("malformed appearance never reaches the wire", function()
  local registry = Registry.new()
  registry:register({
    id = "com.test.bad-appearance",
    name = "Bad appearance",
    appearance = function()
      return { title = "Invalid", state = "inactive", unexpected = true }
    end,
    press = function() end,
  })
  withTokenPath(function(path)
    local server = newServer(registry, path)
    authenticate(server, path)
    local responses = exchange(server, message("instanceAppeared", {
      instanceId = "bad-appearance-instance",
      actionId = "com.test.bad-appearance",
      settings = {},
    }))
    assertError("CALLBACK_FAILED", responses)
    assertEqual(#responses, 1, "malformed appearance must not be emitted")
    server:stop()
  end)
end)

test("reconnect resets authentication and instance state", function()
  local appeared = 0
  local disappeared = 0
  local pressed = 0
  local registry = Registry.new()
  registry:register({
    id = "com.test.reconnect",
    name = "Reconnect",
    appearance = function() return { title = "Online", state = "active" } end,
    press = function() pressed = pressed + 1 end,
    appear = function() appeared = appeared + 1 end,
    disappear = function() disappeared = disappeared + 1 end,
  })

  withTokenPath(function(path)
    local server = newServer(registry, path)
    authenticate(server, path)
    local responses = exchange(server, message("instanceAppeared", {
      instanceId = "visible-before-reload",
      actionId = "com.test.reconnect",
      settings = {},
    }))
    assertEqual(responses[1].type, "appearance")
    assertEqual(appeared, 1)
    local stoppedSlot = server.legacySlot

    server:stop()
    assertEqual(disappeared, 1, "stopping must discard visible contexts")
    assertTrue(next(stoppedSlot.instances) == nil, "stop must clear the listener instance registry")
    assertFalse(stoppedSlot.authenticated, "stop must clear listener authentication")
    assertEqual(#server.slots, 0, "stop must clear every listener slot")
    assertFalse(server.started, "stop must clear server state")

    server:start({ port = 17321, tokenPath = path })
    assertError("INVALID_FIELD", exchange(server, message("keyDown", {
      sessionId = false,
      instanceId = "visible-before-reload",
      actionId = "com.test.reconnect",
    })))
    assertEqual(pressed, 0, "tokenless commands after disconnect must not invoke callbacks")
    assertError("INVALID_FIELD", exchange(server, message("listActions", { requestId = "after-reload" })))
    authenticate(server, path)
    assertError("STALE_INSTANCE", exchange(server, message("keyDown", {
      instanceId = "visible-before-reload",
      actionId = "com.test.reconnect",
    })))
    local restartedSlot = server.legacySlot
    server:stop()
    assertEqual(disappeared, 1, "restarting must not re-fire disappear callbacks")
    assertTrue(next(restartedSlot.instances) == nil, "reconnect teardown must clear listener instances")
    assertFalse(restartedSlot.authenticated, "reconnect teardown must clear listener authentication")
    assertEqual(#server.slots, 0, "reconnect teardown must leave no listener slots")
  end)
end)

test("feedback validates safe bounds and correlates instance actions", function()
  local valid = message("feedback", {
    instanceId = "feedback-instance",
    actionId = "com.test.feedback",
    kind = "success",
    message = "Completed",
    durationMs = 250,
  })
  local validResult, validCode = Protocol.validate(valid)
  assertTrue(validResult, validCode or "valid feedback must pass")

  local invalid = {
    message("feedback", {
      instanceId = "feedback-instance",
      actionId = "com.test.feedback",
      kind = "success",
      message = "bad" .. string.char(0),
      durationMs = 250,
    }),
    message("feedback", {
      instanceId = "feedback-instance",
      actionId = "com.test.feedback",
      kind = "warning",
      message = "bad",
      durationMs = 250,
    }),
    message("feedback", {
      instanceId = "feedback-instance",
      actionId = "com.test.feedback",
      kind = "error",
      message = "bad",
      durationMs = 99,
    }),
    message("feedback", {
      instanceId = "feedback-instance",
      actionId = "com.test.feedback",
      kind = "error",
      message = string.rep("x", 257),
      durationMs = 10001,
    }),
  }
  for _, candidate in ipairs(invalid) do
    local candidateResult = Protocol.validate(candidate)
    assertFalse(candidateResult, "invalid feedback must fail validation")
  end
end)

test("context feedback emission is isolated from callback and emitters", function()
  local emitted = {}
  local errors = {}
  local instance = Context.new({
    instanceId = "feedback-instance",
    actionId = "com.test.feedback",
    settings = {},
    definition = {},
    emitAppearance = function() end,
    emitError = function(code, instanceId)
      errors[#errors + 1] = { code = code, instanceId = instanceId }
    end,
    emitFeedback = function(instanceId, actionId, kind, feedbackMessage, durationMs)
      emitted[#emitted + 1] = {
        instanceId = instanceId,
        actionId = actionId,
        kind = kind,
        message = feedbackMessage,
        durationMs = durationMs,
      }
      return true
    end,
  })
  assertTrue(instance:success("Saved", 250))
  assertEqual(emitted[1].instanceId, "feedback-instance")
  assertEqual(emitted[1].actionId, "com.test.feedback")
  assertEqual(emitted[1].kind, "success")
  assertFalse(instance:error("bad" .. string.char(1), 250))
  assertFalse(instance:error("bad", 99))
  assertEqual(#errors, 0, "invalid feedback must not expose callback errors")

  local failing = Context.new({
    instanceId = "failing-feedback",
    actionId = "com.test.feedback",
    settings = {},
    definition = {},
    emitAppearance = function() end,
    emitError = function(code, instanceId)
      errors[#errors + 1] = { code = code, instanceId = instanceId }
    end,
    emitFeedback = function()
      error("feedback emitter failed")
    end,
  })
  assertFalse(failing:error("Failed", 250))
  assertEqual(errors[#errors].code, "INTERNAL")
  assertEqual(errors[#errors].instanceId, "failing-feedback")
end)

test("server emits feedback without breaking callback loop", function()
  local registry = Registry.new()
  registry:register({
    id = "com.test.feedback",
    name = "Feedback",
    appearance = function() return { title = "Ready", state = "inactive" } end,
    press = function(context)
      assertTrue(context:success("Done", 250))
    end,
  })
  withTokenPath(function(path)
    local server = newServer(registry, path)
    authenticate(server, path)
    exchange(server, message("instanceAppeared", {
      instanceId = "feedback-instance",
      actionId = "com.test.feedback",
      settings = {},
    }))
    local responses = exchange(server, message("keyDown", {
      instanceId = "feedback-instance",
      actionId = "com.test.feedback",
    }))
    assertEqual(responses[1].type, "feedback")
    assertEqual(responses[1].instanceId, "feedback-instance")
    assertEqual(responses[1].actionId, "com.test.feedback")
    assertEqual(responses[1].message, "Done")
    assertEqual(responses[1].durationMs, 250)
    server:stop()
  end)
end)

local function authenticateLan(http, clientId, key, nonceByte)
  local clientNonce = string.rep(string.char(nonceByte), Crypto.NONCE_BYTES)
  local challenge = fakeDecode(http.websocketCallback(fakeEncode({
    protocolVersion = Protocol.VERSION,
    type = "lanHello",
    clientId = clientId,
    clientNonce = Crypto.hexEncode(clientNonce),
  })))
  assertEqual(challenge.type, "lanChallenge")
  local serverNonce = assert(Crypto.hexDecode(challenge.serverNonce, Crypto.NONCE_BYTES))
  local clientProof = assert(Crypto.proof(_G.hs, key, "client", clientId, clientNonce, serverNonce))
  local ready = fakeDecode(http.websocketCallback(fakeEncode({
    protocolVersion = Protocol.VERSION,
    type = "lanProof",
    clientId = clientId,
    clientProof = Crypto.hexEncode(clientProof),
  })))
  assertEqual(ready.type, "lanReady")
  local salt = Crypto.kdfSalt(clientId, clientNonce, serverNonce)
  return ready.sessionId,
    assert(Crypto.hkdf(_G.hs, key, salt, Crypto.frameInfo("client-to-server"), 32))
end

local function lanFrame(payload, key, sequence)
  local mac = assert(Crypto.frameMac(_G.hs, key, "client-to-server", sequence, payload))
  return fakeEncode({
    protocolVersion = Protocol.VERSION,
    type = "lanFrame",
    sequence = sequence,
    payload = payload,
    mac = Crypto.hexEncode(mac),
  })
end

test("LAN slots isolate authentication, contexts, callbacks, and output", function()
  local pressed = 0
  local registry = Registry.new()
  registry:register({
    id = "com.test.slots",
    name = "Slots",
    appearance = function(context)
      return { title = context.instanceId, state = "inactive" }
    end,
    press = function(context)
      pressed = pressed + 1
      context:refresh()
    end,
  })
  withTokenPath(function(tokenPath)
    withCredentials(function(firstKeyPath, secondKeyPath)
      local server = Server.new(registry, Protocol, Context)
      server:start({
        tokenPath = tokenPath,
        lan = {
          clients = {
            alpha = { interface = "en0", port = 17322, keyPath = firstKeyPath },
            beta = { interface = "en1", port = 17323, keyPath = secondKeyPath },
          },
        },
      })
      assertEqual(#server.slots, 3, "legacy plus two LAN slots must start")
      assertEqual(server.slots[2].clientId, "alpha")
      assertEqual(server.slots[3].clientId, "beta")
      assertEqual(server.slots[2].interface, "en0")
      assertEqual(server.slots[3].port, 17323)

      local alpha = server.slots[2]
      local beta = server.slots[3]
      local alphaSession, alphaReceiveKey = authenticateLan(alpha.http, "alpha", string.rep("K", 32), 1)
      local betaSession, betaReceiveKey = authenticateLan(beta.http, "beta", string.rep("L", 32), 2)
      local alphaAppear = fakeEncode(message("instanceAppeared", {
        sessionId = alphaSession,
        instanceId = "same-instance",
        actionId = "com.test.slots",
        settings = {},
      }))
      local betaAppear = fakeEncode(message("instanceAppeared", {
        sessionId = betaSession,
        instanceId = "same-instance",
        actionId = "com.test.slots",
        settings = {},
      }))
      alpha.http.websocketCallback(lanFrame(alphaAppear, alphaReceiveKey, 1))
      beta.http.websocketCallback(lanFrame(betaAppear, betaReceiveKey, 1))
      assertTrue(alpha.instances["same-instance"] ~= nil)
      assertTrue(beta.instances["same-instance"] ~= nil)

      local alphaSent, betaSent = #alpha.http.sent, #beta.http.sent
      alpha.instances["same-instance"]:refresh()
      assertEqual(#alpha.http.sent, alphaSent + 1, "alpha context output must use alpha listener")
      assertEqual(#beta.http.sent, betaSent, "alpha output must not route to beta")

      local alphaKeyDown = fakeEncode(message("keyDown", {
        sessionId = alphaSession,
        instanceId = "same-instance",
        actionId = "com.test.slots",
      }))
      alpha.http.websocketCallback(lanFrame(alphaKeyDown, alphaReceiveKey, 2))
      assertEqual(pressed, 1)
      local betaKeyDown = fakeEncode(message("keyDown", {
        sessionId = betaSession,
        instanceId = "same-instance",
        actionId = "com.test.slots",
      }))
      beta.http.websocketCallback(lanFrame(betaKeyDown, betaReceiveKey, 2))
      assertEqual(pressed, 2, "beta callback must survive alpha traffic")

      local malformed = alpha.http.websocketCallback("not-json")
      assertEqual(fakeDecode(malformed).code, "MALFORMED_MESSAGE")
      assertEqual(pressed, 2, "alpha malformed input must not dispatch against another slot")
      assertTrue(beta.authenticated, "alpha malformed input must not retire beta")

      local oldAlphaSession = alphaSession
      alphaSession, alphaReceiveKey = authenticateLan(alpha.http, "alpha", string.rep("K", 32), 3)
      assertTrue(alphaSession ~= oldAlphaSession)
      assertTrue(beta.authenticated and beta.sessionId == betaSession, "alpha reconnect must not rotate beta")
      assertTrue(next(alpha.instances) == nil, "alpha reconnect must clear only alpha contexts")
      assertTrue(beta.instances["same-instance"] ~= nil, "beta context must survive alpha reconnect")

      local staleAlpha = fakeEncode(message("keyDown", {
        sessionId = oldAlphaSession,
        instanceId = "same-instance",
        actionId = "com.test.slots",
      }))
      local staleOuter = fakeDecode(alpha.http.websocketCallback(lanFrame(staleAlpha, alphaReceiveKey, 1)))
      local staleResponse = fakeDecode(staleOuter.payload)
      assertEqual(staleResponse.code, "AUTH_REQUIRED")
      assertEqual(pressed, 2, "stale alpha session must not invoke callbacks")
      server:stop()
    end)
  end)
end)

test("LAN slot bounds and startup rollback are deterministic", function()
  withTokenPath(function(tokenPath)
    withCredentials(function(firstKeyPath, secondKeyPath)
      local tooMany = {}
      for index = 1, 5 do
        tooMany["client-" .. tostring(index)] = {
          interface = "en" .. tostring(index),
          port = 17321 + index,
          keyPath = "/missing-" .. tostring(index),
        }
      end
      assertFalse(pcall(function()
        Server.new({}, Protocol, Context):start({ tokenPath = tokenPath, lan = { clients = tooMany } })
      end), "more than four LAN clients must fail before startup")

      assertFalse(pcall(function()
        Server.new({}, Protocol, Context):start({
          tokenPath = tokenPath,
          lan = {
            clients = {
              alpha = { interface = "en0", port = 17322, keyPath = firstKeyPath },
              beta = { interface = "en1", port = 17322, keyPath = secondKeyPath },
            },
          },
        })
      end), "duplicate LAN ports must fail before startup")

      local originalNew = _G.hs.httpserver.new
      local created = 0
      _G.hs.httpserver.new = function(...)
        created = created + 1
        local http = originalNew(...)
        if created == 3 then
          http.start = function() error("simulated LAN start failure") end
        end
        return http
      end
      local server = Server.new({}, Protocol, Context)
      local ok, errorMessage = pcall(function()
        server:start({
          tokenPath = tokenPath,
          lan = {
            clients = {
              alpha = { interface = "en0", port = 17322, keyPath = firstKeyPath },
              beta = { interface = "en1", port = 17323, keyPath = secondKeyPath },
            },
          },
        })
      end)
      _G.hs.httpserver.new = originalNew
      assertFalse(ok, "a later listener failure must fail startup")
      assertTrue(tostring(errorMessage):find("LAN server startup failed", 1, true) ~= nil)
      assertFalse(server.started)
      assertEqual(#server.slots, 0, "failed startup must not publish partial slots")
      assertTrue(fakeHttpInstances[#fakeHttpInstances - 2].stopped, "legacy listener must be stopped")
      assertTrue(fakeHttpInstances[#fakeHttpInstances - 1].stopped, "first LAN listener must be stopped")
      assertTrue(fakeHttpInstances[#fakeHttpInstances].stopped, "failed LAN listener must be stopped")
    end)
  end)
end)
test("LAN disconnect and per-slot instance exhaustion stay isolated", function()
  local pressed = 0
  local registry = Registry.new()
  registry:register({
    id = "com.test.exhaustion",
    name = "Exhaustion",
    appearance = function(context)
      return { title = context.instanceId, state = "inactive" }
    end,
    press = function()
      pressed = pressed + 1
    end,
    disappear = function() end,
  })
  withTokenPath(function(tokenPath)
    withCredentials(function(firstKeyPath, secondKeyPath)
      local server = Server.new(registry, Protocol, Context)
      server:start({
        tokenPath = tokenPath,
        lan = {
          clients = {
            alpha = { interface = "en0", port = 17322, keyPath = firstKeyPath },
            beta = { interface = "en1", port = 17323, keyPath = secondKeyPath },
          },
        },
      })
      local alpha = server.slots[2]
      local beta = server.slots[3]
      local alphaSession, alphaReceiveKey = authenticateLan(alpha.http, "alpha", string.rep("K", 32), 5)
      local betaSession, betaReceiveKey = authenticateLan(beta.http, "beta", string.rep("L", 32), 6)

      beta.http.websocketCallback(lanFrame(fakeEncode(message("instanceAppeared", {
        sessionId = betaSession,
        instanceId = "beta-instance",
        actionId = "com.test.exhaustion",
        settings = {},
      })), betaReceiveKey, 1))
      for index = 1, 64 do
        alpha.http.websocketCallback(lanFrame(fakeEncode(message("instanceAppeared", {
          sessionId = alphaSession,
          instanceId = "alpha-" .. tostring(index),
          actionId = "com.test.exhaustion",
          settings = {},
        })), alphaReceiveKey, index))
      end
      local alphaInstanceCount = 0
      for _ in pairs(alpha.instances) do alphaInstanceCount = alphaInstanceCount + 1 end
      assertEqual(alphaInstanceCount, 64, "each slot must admit at most 64 visible instances")
      assertTrue(beta.instances["beta-instance"] ~= nil, "beta context must survive alpha saturation")

      local exhaustedRaw = alpha.http.websocketCallback(lanFrame(fakeEncode(message("instanceAppeared", {
        sessionId = alphaSession,
        instanceId = "alpha-65",
        actionId = "com.test.exhaustion",
        settings = {},
      })), alphaReceiveKey, 65))
      local exhausted = fakeDecode(exhaustedRaw)
      local diagnostic = fakeDecode(exhausted.payload)
      assertError("INVALID_STATE", { diagnostic }, "instance exhaustion must use a stable safe diagnostic")
      assertEqual(diagnostic.message, "Invalid protocol state.", "resource diagnostics must use the stable message")
      assertFalse(exhaustedRaw:find(firstKeyPath, 1, true), "resource diagnostics must not expose credential paths")
      local alphaAfterExhaustion = 0
      for _ in pairs(alpha.instances) do alphaAfterExhaustion = alphaAfterExhaustion + 1 end
      assertEqual(alphaAfterExhaustion, 64, "rejected instances must not grow the slot registry")
      assertTrue(beta.authenticated and beta.instances["beta-instance"] ~= nil, "alpha exhaustion must not evict beta")

      alpha:stop()
      assertFalse(alpha.authenticated, "disconnect teardown must clear only the disconnected slot")
      assertTrue(next(alpha.instances) == nil, "disconnect teardown must discard only that slot's contexts")
      assertTrue(beta.authenticated and beta.instances["beta-instance"] ~= nil, "disconnect teardown must preserve beta")
      beta.http.websocketCallback(lanFrame(fakeEncode(message("keyDown", {
        sessionId = betaSession,
        instanceId = "beta-instance",
        actionId = "com.test.exhaustion",
      })), betaReceiveKey, 2))
      assertEqual(pressed, 1, "the surviving slot must continue dispatching after a peer disconnects")
      server:stop()
    end)
  end)
end)

test("LAN startup diagnostics stay bounded when client admission is exceeded", function()
  withTokenPath(function(tokenPath)
    withCredentials(function(firstKeyPath)
      local clients = {}
      for index = 1, 5 do
        clients["client-" .. tostring(index)] = {
          interface = "en" .. tostring(index),
          port = 17321 + index,
          keyPath = firstKeyPath .. "-" .. tostring(index),
        }
      end
      local ok, errorMessage = pcall(function()
        Server.new({}, Protocol, Context):start({ tokenPath = tokenPath, lan = { clients = clients } })
      end)
      assertFalse(ok, "admission beyond four LAN slots must fail")
      assertTrue(tostring(errorMessage):find("Stream Deck LAN client limit is 4", 1, true) ~= nil)
      assertFalse(tostring(errorMessage):find(firstKeyPath, 1, true), "client-limit diagnostics must not expose credential paths")
    end)
  end)
end)

passed = passed + dofile("hammerspoon/tests/examples.lua")
passed = passed + dofile("hammerspoon/tests/crypto.test.lua")
passed = passed + dofile("hammerspoon/tests/lan.test.lua")
io.write("Lua bridge tests passed: " .. passed .. "\n")
