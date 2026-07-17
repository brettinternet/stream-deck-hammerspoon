-- Self-contained Lua 5.4 tests for defensive Stream Deck server startup paths.

package.path = "hammerspoon/?.lua;hammerspoon/?/init.lua;" .. package.path

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

local function assertEqual(actual, expected, message)
  if actual ~= expected then
    fail((message or "values differ") .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual))
  end
end

local function expectError(callback, expectedText)
  local ok, err = pcall(callback)
  assertTrue(not ok, "expected an error")
  if expectedText then
    assertTrue(tostring(err):find(expectedText, 1, true) ~= nil,
      "error did not contain " .. expectedText .. ": " .. tostring(err))
  end
end

local function newServer()
  return Server.new({}, { MAX_FRAME_BYTES = 1024 }, {})
end

local function withHs(hsapi, callback)
  local previous = rawget(_G, "hs")
  _G.hs = hsapi
  local ok, err = xpcall(callback, debug.traceback)
  _G.hs = previous
  if not ok then
    error(err, 0)
  end
end

local function withMissingTokenPath(callback)
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

local function withTokenFile(callback)
  local path = os.tmpname()
  os.remove(path)
  local handle, openError = io.open(path, "w")
  if not handle then
    error(openError or "could not create temporary token file", 0)
  end
  local wrote, writeError = handle:write("deterministic-token")
  local closed, closeError = handle:close()
  if not wrote or not closed then
    os.remove(path)
    error(writeError or closeError or "could not write temporary token file", 0)
  end

  local ok, err = xpcall(function()
    callback(path)
  end, debug.traceback)
  os.remove(path)
  if not ok then
    error(err, 0)
  end
end

local function tokenFs()
  return {
    attributes = function(path)
      local handle = io.open(path, "r")
      if not handle then
        return nil
      end
      handle:close()
      return { permissions = "rw-------" }
    end,
  }
end

local function httpFor(failure)
  local http = { stopCalls = 0 }
  http.setInterface = function(self, interface)
    if failure == "interface" then
      error("interface failure")
    end
    self.interface = interface
    self.interfaceConfigured = true
  end
  http.setPort = function(self, port)
    if failure == "port" then
      error("port failure")
    end
    self.port = port
    self.portConfigured = true
  end
  http.websocket = function(self, path, callback)
    if failure == "websocket" then
      error("websocket failure")
    end
    self.websocketPath = path
    self.websocketCallback = callback
    self.websocketConfigured = true
  end
  http.maxBodySize = function(self, size)
    self.bodySize = size
  end
  http.start = function(self)
    if failure == "start" then
      error("start failure")
    end
    self.startCalls = (self.startCalls or 0) + 1
  end
  http.stop = function(self)
    self.stopCalls = self.stopCalls + 1
  end
  return http
end

local function hsWithHttp(http, constructor)
  return {
    fs = tokenFs(),
    httpserver = {
      new = constructor or function()
        return http
      end,
    },
  }
end

local function test(name, callback)
  local ok, err = xpcall(callback, debug.traceback)
  if not ok then
    io.stderr:write("not ok - " .. name .. "\n" .. tostring(err) .. "\n")
    os.exit(1)
  end
  passed = passed + 1
  io.write("ok - " .. name .. "\n")
end

test("rejects non-table and unknown startup options", function()
  local server = newServer()
  expectError(function()
    server:start("invalid")
  end, "options must be a table")
  expectError(function()
    server:start({ unknown = true })
  end, "Unknown Stream Deck start option")
end)

test("rejects invalid, non-integer, and out-of-range ports", function()
  for _, port in ipairs({ "17321", 1.5, 0, 65536 }) do
    expectError(function()
      newServer():start({ port = port })
    end, "port must be an integer")
  end
end)

test("rejects an empty token path", function()
  expectError(function()
    newServer():start({ tokenPath = "" })
  end, "tokenPath must be a non-empty string")
end)

test("rejects startup when the Hammerspoon HTTP server is unavailable", function()
  withHs({}, function()
    expectError(function()
      newServer():start({ tokenPath = os.tmpname() })
    end, "HTTP server is unavailable")
  end)
end)

test("rejects token startup when host.uuid is unavailable", function()
  withMissingTokenPath(function(path)
    withHs({
      fs = tokenFs(),
      httpserver = { new = function()
        error("HTTP constructor must not run")
      end },
    }, function()
      expectError(function()
        newServer():start({ tokenPath = path })
      end, "token startup failed")
    end)
  end)
end)

test("cleans up after an HTTP constructor failure", function()
  withTokenFile(function(path)
    local constructorCalled = false
    withHs(hsWithHttp(nil, function()
      constructorCalled = true
      error("constructor failure")
    end), function()
      expectError(function()
        newServer():start({ tokenPath = path })
      end, "server startup failed")
    end)
    assertTrue(constructorCalled, "HTTP constructor should be called")
  end)
end)

test("cleans up after HTTP configuration failures", function()
  for _, failure in ipairs({ "interface", "port", "websocket" }) do
    withTokenFile(function(path)
      local http = httpFor(failure)
      withHs(hsWithHttp(http), function()
        expectError(function()
          newServer():start({ tokenPath = path })
        end, "server startup failed")
      end)
      assertEqual(http.stopCalls, 1, failure .. " failure should stop HTTP server")
    end)
  end
end)

test("cleans up after an HTTP start failure", function()
  withTokenFile(function(path)
    local http = httpFor("start")
    withHs(hsWithHttp(http), function()
      expectError(function()
        newServer():start({ tokenPath = path })
      end, "server startup failed")
    end)
    assertEqual(http.stopCalls, 1, "start failure should stop HTTP server")
  end)
end)

test("wires HTTP startup and supports idempotent stop and restart", function()
  withTokenFile(function(path)
    local http = httpFor(nil)
    local server = newServer()
    withHs(hsWithHttp(http), function()
      assertEqual(server:start({ port = 17321, tokenPath = path }), server)
      assertEqual(http.interface, "localhost")
      assertEqual(http.port, 17321)
      assertEqual(http.websocketPath, "/streamdeck")
      assertTrue(type(http.websocketCallback) == "function", "websocket callback must be registered")
      assertEqual(http.bodySize, 1024, "HTTP body limit must match protocol")
      assertEqual(http.startCalls, 1)
      assertTrue(server.started)
    end)

    server:stop()
    assertTrue(not server.started, "stop must clear started state")
    assertEqual(http.stopCalls, 1)
    server:stop()
    assertEqual(http.stopCalls, 1, "stop must be idempotent")

    withHs(hsWithHttp(http), function()
      server:start({ port = 17322, tokenPath = path })
    end)
    assertEqual(http.port, 17322)
    assertEqual(http.startCalls, 2, "restart must start HTTP again")
    server:stop()
    assertEqual(http.stopCalls, 2, "restart cleanup must stop HTTP")
  end)
end)

test("guards against starting an already-started server", function()
  withTokenFile(function(path)
    local http = httpFor(nil)
    local server = newServer()
    withHs(hsWithHttp(http), function()
      assertEqual(server:start({ tokenPath = path }), server, "start should return the server")
      assertTrue(server.started, "server should be marked started")
      expectError(function()
        server:start({ tokenPath = path })
      end, "already started")
    end)
    server:stop()
    assertEqual(http.stopCalls, 1, "stopping the started server should stop HTTP")
  end)
end)

io.write("Lua server startup tests passed: " .. passed .. "\n")
