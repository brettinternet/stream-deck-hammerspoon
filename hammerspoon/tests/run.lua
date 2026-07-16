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
    assertError("AUTH_REQUIRED", exchange(server, message("listActions", { requestId = "unauth" })))
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
  local registry = Registry.new()
  registry:register({
    id = "com.test.reconnect",
    name = "Reconnect",
    appearance = function() return { title = "Online", state = "active" } end,
    press = function() end,
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
    assertError("AUTH_REQUIRED", exchange(server, message("listActions", { requestId = "after-reload" })))
    authenticate(server, path)
    assertError("STALE_INSTANCE", exchange(server, message("keyDown", {
      instanceId = "visible-before-reload",
      actionId = "com.test.reconnect",
    })))
    server:stop()
  end)
end)

io.write("Lua bridge tests passed: " .. passed .. "\n")
