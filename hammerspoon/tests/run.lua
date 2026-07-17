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
    assertTrue(responses[1].actions[2].settingsSchema ~= nil, "settings schema must be listed")
    server:stop()
  end)
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
  end)
end)

passed = passed + dofile("hammerspoon/tests/examples.lua")
io.write("Lua bridge tests passed: " .. passed .. "\n")
