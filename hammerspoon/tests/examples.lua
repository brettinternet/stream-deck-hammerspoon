-- Hardware-free behavioral tests for the example configurations.

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

local function assertSame(actual, expected, message)
  if actual ~= expected then
    fail(message or "values are not identical")
  end
end

local function assertError(callback, expected, message)
  local ok, err = pcall(callback)
  assertFalse(ok, message or "expected an error")
  if expected ~= nil then
    assertTrue(string.find(tostring(err), expected, 1, true) ~= nil,
      (message or "unexpected error") .. ": " .. tostring(err))
  end
end

local function test(name, callback)
  local ok, err = xpcall(callback, debug.traceback)
  if not ok then
    error(err, 0)
  end
  passed = passed + 1
  io.write("ok - " .. name .. "\n")
end

local function load_fixture(path, fake_hs)
  local previous_hs = _G.hs
  local previous_loaded = package.loaded.streamdeck
  local previous_preload = package.preload.streamdeck
  local streamdeck = {
    registrations = {},
    refreshes = {},
    starts = 0,
  }

  local function invoke_with_fake_hs(callback, ...)
    local previous_hs = _G.hs
    local arguments = table.pack(...)
    _G.hs = fake_hs
    local results = {
      xpcall(function()
        return callback(table.unpack(arguments, 1, arguments.n))
      end, debug.traceback),
    }
    _G.hs = previous_hs
    if not results[1] then
      error(results[2], 0)
    end
    return table.unpack(results, 2)
  end

  function streamdeck.register(definition)
    local registered = {}
    for key, value in pairs(definition) do
      registered[key] = value
    end
    for _, field in ipairs({ "appearance", "press", "appear", "disappear" }) do
      if type(definition[field]) == "function" then
        local callback = definition[field]
        registered[field] = function(...)
          return invoke_with_fake_hs(callback, ...)
        end
      end
    end
    streamdeck.registrations[#streamdeck.registrations + 1] = registered
    return registered
  end

  function streamdeck.refresh(action_id)
    streamdeck.refreshes[#streamdeck.refreshes + 1] = action_id
    return streamdeck
  end

  function streamdeck.start()
    streamdeck.starts = streamdeck.starts + 1
    return streamdeck
  end

  package.preload.streamdeck = function()
    return streamdeck
  end
  package.loaded.streamdeck = nil
  _G.hs = fake_hs

  local ok, err = xpcall(function()
    dofile(path)
  end, debug.traceback)

  _G.hs = previous_hs
  package.loaded.streamdeck = previous_loaded
  package.preload.streamdeck = previous_preload

  if not ok then
    error(err, 0)
  end
  return streamdeck
end

local function context(instance_id, settings)
  return {
    instanceId = instance_id,
    settings = settings,
    refreshes = 0,
    getSettings = function(self)
      return self.settings
    end,
    refresh = function(self)
      self.refreshes = self.refreshes + 1
    end,
  }
end

test("example fixture loader restores module and hs state after failure", function()
  local sentinel_hs = {}
  local sentinel_module = {}
  local sentinel_preload = function()
    return sentinel_module
  end
  local previous_hs = _G.hs
  local previous_loaded = package.loaded.streamdeck
  local previous_preload = package.preload.streamdeck
  _G.hs = sentinel_hs
  package.loaded.streamdeck = sentinel_module
  package.preload.streamdeck = sentinel_preload

  assertError(function()
    load_fixture("hammerspoon/examples/example-that-does-not-exist.lua", {})
  end, "example-that-does-not-exist.lua")

  assertSame(_G.hs, sentinel_hs, "hs must be restored after a fixture failure")
  assertSame(package.loaded.streamdeck, sentinel_module,
    "loaded streamdeck must be restored after a fixture failure")
  assertSame(package.preload.streamdeck, sentinel_preload,
    "preloaded streamdeck must be restored after a fixture failure")
  _G.hs = previous_hs
  package.loaded.streamdeck = previous_loaded
  package.preload.streamdeck = previous_preload
end)

test("microphone example covers appearance, toggling, and no-device errors", function()
  local microphone = {
    muted_state = false,
    set_calls = 0,
  }
  function microphone:muted()
    return self.muted_state
  end
  function microphone:setMuted(value)
    self.muted_state = value
    self.set_calls = self.set_calls + 1
  end

  local available = microphone
  local streamdeck = load_fixture("hammerspoon/examples/microphone.lua", {
    audiodevice = {
      defaultInputDevice = function()
        return available
      end,
    },
  })
  assertEqual(#streamdeck.registrations, 1, "microphone must register one action")
  local action = streamdeck.registrations[1]
  assertEqual(action.id, "com.brettinternet.hammerspoon.microphone-toggle")
  assertEqual(streamdeck.starts, 1, "microphone must start the bridge")

  local appearance = action.appearance(context("mic"))
  assertEqual(appearance.title, "Live")
  assertEqual(appearance.state, "inactive")

  local press_context = context("mic")
  action.press(press_context)
  assertEqual(microphone.set_calls, 1)
  assertEqual(press_context.refreshes, 1)
  appearance = action.appearance(press_context)
  assertEqual(appearance.title, "Muted")
  assertEqual(appearance.state, "active")

  available = nil
  appearance = action.appearance(press_context)
  assertEqual(appearance.title, "No mic")
  assertEqual(appearance.state, "inactive")
  assertError(function()
    action.press(press_context)
  end, "no default input device")
  assertEqual(press_context.refreshes, 1, "failed microphone press must not refresh")
end)

test("application example covers appearance, hide errors, and watcher refreshes", function()
  local frontmost
  local watcher_callback
  local watcher_started = false
  local events = {
    activated = "activated",
    deactivated = "deactivated",
    hidden = "hidden",
    unhidden = "unhidden",
    launched = "launched",
    terminated = "terminated",
  }
  local fake_hs = {
    application = {
      frontmostApplication = function()
        return frontmost
      end,
      watcher = {
        activated = events.activated,
        deactivated = events.deactivated,
        hidden = events.hidden,
        unhidden = events.unhidden,
        launched = events.launched,
        terminated = events.terminated,
        new = function(callback)
          watcher_callback = callback
          return {
            start = function()
              watcher_started = true
            end,
          }
        end,
      },
    },
  }
  local streamdeck = load_fixture("hammerspoon/examples/application.lua", fake_hs)
  assertEqual(#streamdeck.registrations, 1, "application must register one action")
  local action = streamdeck.registrations[1]
  assertEqual(action.id, "com.brettinternet.hammerspoon.application-toggle")
  assertEqual(streamdeck.starts, 1, "application must start the bridge")
  assertTrue(watcher_started, "application watcher must start")

  local press_context = context("application")
  local appearance = action.appearance(press_context)
  assertEqual(appearance.title, "No app")
  assertEqual(appearance.state, "inactive")
  assertError(function()
    action.press(press_context)
  end, "no frontmost application")
  assertEqual(press_context.refreshes, 0)

  local hide_result = true
  local app = {
    app_name = "Editor",
    hide_calls = 0,
    name = function(self)
      return self.app_name
    end,
    hide = function(self)
      self.hide_calls = self.hide_calls + 1
      return hide_result
    end,
  }
  frontmost = app
  appearance = action.appearance(press_context)
  assertEqual(appearance.title, "Editor")
  assertEqual(appearance.state, "active")
  action.press(press_context)
  assertEqual(app.hide_calls, 1)
  assertEqual(press_context.refreshes, 1)

  hide_result = false
  assertError(function()
    action.press(press_context)
  end, "failed to hide frontmost application")
  assertEqual(press_context.refreshes, 1, "failed hide must not refresh")

  local relevant = {
    events.activated,
    events.deactivated,
    events.hidden,
    events.unhidden,
    events.launched,
    events.terminated,
  }
  for _, event in ipairs(relevant) do
    watcher_callback("Editor", event, app)
  end
  assertEqual(#streamdeck.refreshes, #relevant,
    "all relevant application events must refresh")
  watcher_callback("Editor", "replaced", app)
  assertEqual(#streamdeck.refreshes, #relevant,
    "irrelevant application events must not refresh")
  for _, action_id in ipairs(streamdeck.refreshes) do
    assertEqual(action_id, action.id, "watcher must refresh the application action")
  end
end)

test("multi-instance example isolates state, labels, and lifecycle", function()
  local streamdeck = load_fixture("hammerspoon/examples/multi-instance.lua", {})
  assertEqual(#streamdeck.registrations, 1, "multi-instance must register one action")
  local action = streamdeck.registrations[1]
  assertEqual(action.id, "com.brettinternet.hammerspoon.per-instance-toggle")
  assertEqual(streamdeck.starts, 1, "multi-instance must start the bridge")

  local a = context("instance-a", { label = "Alpha" })
  local b = context("instance-b", { label = "Beta" })
  action.appear(a)
  action.appear(b)
  local a_appearance = action.appearance(a)
  local b_appearance = action.appearance(b)
  assertEqual(a_appearance.title, "Alpha")
  assertEqual(b_appearance.title, "Beta")
  assertEqual(a_appearance.state, "inactive")
  assertEqual(b_appearance.state, "inactive")

  action.press(a)
  assertEqual(a.refreshes, 1, "A press must refresh A")
  assertEqual(b.refreshes, 0, "A press must not refresh B")
  assertEqual(action.appearance(a).state, "active")
  assertEqual(action.appearance(b).state, "inactive")
  action.press(b)
  assertEqual(a.refreshes, 1)
  assertEqual(b.refreshes, 1, "B press must refresh B")
  assertEqual(action.appearance(a).state, "active")
  assertEqual(action.appearance(b).state, "active")

  local no_settings = context("instance-no-settings", nil)
  local invalid_label = context("instance-invalid-label", { label = 42 })
  action.appear(no_settings)
  action.appear(invalid_label)
  assertEqual(action.appearance(no_settings).title, "Toggle")
  assertEqual(action.appearance(invalid_label).title, "Toggle")

  action.disappear(a)
  assertEqual(action.appearance(a).title, "Alpha")
  assertEqual(action.appearance(a).state, "inactive", "disappear must reset A state")
  action.appear(a)
  assertEqual(action.appearance(a).state, "inactive", "reappear must start A inactive")
  assertEqual(action.appearance(b).state, "active", "B state must survive A lifecycle")
end)

return passed
