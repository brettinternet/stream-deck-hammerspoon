-- Self-contained Lua 5.4 tests for the Hammerspoon bridge.
-- The fake hs modules below keep these tests independent of Hammerspoon,
-- Stream Deck, and physical audio hardware.

package.path = "hammerspoon/?.lua;hammerspoon/?/init.lua;" .. package.path

local frames = {}
local frameNumber = 0
local fakeHttp

local function fakeEncode(value)
  frameNumber = frameNumber + 1
  local key = "fake-frame-" .. frameNumber
  frames[key] = value
  return key
end

local function fakeDecode(raw)
  if type(raw) ~= "string" or frames[raw] == nil then
    error("invalid fake JSON frame")
  end
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

_G.hs = {
  json = {
    encode = fakeEncode,
    decode = fakeDecode,
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
local Protocol = require("streamdeck.protocol")
local Context = require("streamdeck.context")
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
  assertEqual(fakeHttp.interface, "localhost", "server must bind loopback")
  assertEqual(fakeHttp.websocketPath, "/streamdeck", "server websocket path")
  return server
end

local function exchange(server, request)
  if request.type ~= "hello" and request.sessionId == nil and server.authenticated then
    request.sessionId = server.sessionId
  end
  local sentAtStart = #fakeHttp.sent
  local first = server:_onMessage(fakeEncode(request))
  local responses = {}
  if first ~= "" then
    responses[#responses + 1] = fakeDecode(first)
  end
  for index = sentAtStart + 1, #fakeHttp.sent do
    responses[#responses + 1] = fakeDecode(fakeHttp.sent[index])
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
  assertEqual(responses[1].sessionId, server.sessionId, "server must retain the acknowledged session ID")
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
  }

  assertFalse(pcall(registry.register, registry, {}), "missing fields must be rejected")
  assertFalse(pcall(registry.register, registry, {
    id = "com.test.bad",
    name = "Bad",
    appearance = function() end,
    press = function() end,
    unsupported = true,
  }), "unknown fields must be rejected")
  registry:register(definition)
  assertFalse(pcall(registry.register, registry, definition), "duplicate IDs must be rejected")
  assertEqual(#registry:list(), 1, "duplicate registration must not append")
end)

test("action listing preserves names and order", function()
  local registry = Registry.new()
  registry:register({
    id = "com.test.first",
    name = "First action",
    appearance = function() return { title = "First", state = "inactive" } end,
    press = function() end,
  })
  registry:register({
    id = "com.test.second",
    name = "Second action",
    settingsSchemaVersion = 1,
    settingsSchema = {
      { type = "text", key = "label" },
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
    assertEqual(responses[1].actions[2].actionId, "com.test.second")
    assertEqual(responses[1].actions[2].name, "Second action")
    assertEqual(responses[1].actions[2].settingsSchemaVersion, 1)
    assertTrue(responses[1].actions[2].settingsSchema ~= nil, "settings schema must be listed")
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
    local value, code = Protocol.decode("frame")
    assertEqual(value, nil)
    assertEqual(code, "INTERNAL")
  end)

  withJson({ decode = function()
    error("decoder failure")
  end }, function()
    local value, code = Protocol.decode("frame")
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
    foregroundColor = appearance.foregroundColor,
    backgroundColor = appearance.backgroundColor,
    progress = appearance.progress,
    badge = appearance.badge,
    icon = appearance.icon,
  }))
  assertTrue(valid, code or "valid appearance fields must pass")
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

  local invalidFields = {
    { appearanceVersion = 2 },
    { appearanceVersion = 1, foregroundColor = "#FFF" },
    { appearanceVersion = 1, backgroundColor = "red" },
    { appearanceVersion = 1, progress = -0.01 },
    { appearanceVersion = 1, progress = 1.01 },
    { appearanceVersion = 1, badge = string.rep("x", 5) },
    { appearanceVersion = 1, badge = string.char(0) },
    { appearanceVersion = 1, icon = { kind = "bundled", name = "bad_name" } },
    { appearanceVersion = 1, icon = { kind = "custom", mediaType = "image/svg+xml", dataBase64 = "bad!" } },
    { appearanceVersion = 1, icon = { kind = "custom", mediaType = "image/png", dataBase64 = "iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABU7bNHAAAAHElEQVR4nO3BMQEAAADCoPVPbQo/oAAAAAAAuhoUiAABdg1dRQAAAABJRU5ErkJggg==" } },
    { appearanceVersion = 1, icon = { kind = "custom", mediaType = "image/png", dataBase64 = "iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAAALElEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAujBRSAABAGBCoqcAAAAASUVORK5CYII=" } },
    { appearanceVersion = 1, icon = { kind = "custom", mediaType = "image/svg+xml", dataBase64 = "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA3MiA3MiIgc3R5bGU9ImZpbGw6I2ZmZiI+PC9zdmc+" } },
    { appearanceVersion = 1, icon = { kind = "custom", mediaType = "image/svg+xml", dataBase64 = "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOmZvcmVpZ249InVybjp4IiB2aWV3Qm94PSIwIDAgNzIgNzIiPjwvc3ZnPg==" } },
    { progress = 0.5 },
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

  for _, messageType in ipairs({ "instanceDisappeared", "keyDown", "requestAppearance" }) do
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
    assertEqual(responses[1].icon.kind, "bundled")
    assertEqual(responses[1].icon.name, "future-icon")
    assertEqual(responses[1].backgroundColor, "#202020")
    assertEqual(responses[1].progress, 0.5)
    assertEqual(responses[1].badge, "<&")

    appearance.progress = 2
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
    server:stop()
  end)
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

test("callback exceptions are protected and reported", function()
  local registry = Registry.new()
  registry:register({
    id = "com.test.callback-error",
    name = "Callback error",
    appearance = function() return { title = "Ready", state = "inactive" } end,
    press = function() error("intentional press failure") end,
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
    assertError("CALLBACK_FAILED", responses)
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

    server:stop()
    assertEqual(disappeared, 1, "stopping must discard visible contexts")
    assertTrue(next(server.instances) == nil, "stop must clear instance registry")
    assertFalse(server.authenticated, "stop must clear authentication")

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
    server:stop()
    assertEqual(disappeared, 1, "restarting must not re-fire disappear callbacks")
    assertTrue(next(server.instances) == nil, "reconnect teardown must leave no instances")
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

passed = passed + dofile("hammerspoon/tests/examples.lua")
io.write("Lua bridge tests passed: " .. passed .. "\n")
