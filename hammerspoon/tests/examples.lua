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
    set_result = true,
  }
  function microphone:inputMuted()
    return self.muted_state
  end
  function microphone:setInputMuted(value)
    self.set_calls = self.set_calls + 1
    if self.set_result then
      self.muted_state = value
    end
    return self.set_result
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
  microphone.set_result = false
  assertError(function()
    action.press(press_context)
  end, "failed to set microphone mute state")
  assertEqual(press_context.refreshes, 1, "failed microphone mute must not refresh")
  microphone.set_result = true

  available = nil
  appearance = action.appearance(press_context)
  assertEqual(appearance.title, "No mic")
  assertEqual(appearance.state, "inactive")
  assertError(function()
    action.press(press_context)
  end, "no default input device")
  assertEqual(press_context.refreshes, 1, "failed microphone press must not refresh")
end)

test("application example toggles focused and configured applications", function()
  local frontmost
  local configured
  local get_calls = 0
  local get_error
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

  local function application(name)
    local app = {
      app_name = name,
      hidden = false,
      hide_calls = 0,
      unhide_calls = 0,
      hide_result = true,
      unhide_result = true,
      name = function(self)
        return self.app_name
      end,
      isHidden = function(self)
        return self.hidden
      end,
      hide = function(self)
        self.hide_calls = self.hide_calls + 1
        if self.hide_result then
          self.hidden = true
        end
        return self.hide_result
      end,
      unhide = function(self)
        self.unhide_calls = self.unhide_calls + 1
        if self.unhide_result then
          self.hidden = false
        end
        return self.unhide_result
      end,
    }
    return app
  end

  local fake_hs = {
    application = {
      frontmostApplication = function()
        return frontmost
      end,
      get = function(bundle_id)
        get_calls = get_calls + 1
        if get_error then
          error(get_error)
        end
        assertEqual(bundle_id, "com.example.Editor", "configured lookup must use the bundle ID")
        return configured
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
  assertEqual(action.name, "Hide/show application")
  assertEqual(action.settingsSchemaVersion, 1)
  assertEqual(#action.settingsSchema, 1)
  assertEqual(action.settingsSchema[1].type, "text")
  assertEqual(action.settingsSchema[1].key, "bundleID")
  assertEqual(action.settingsSchema[1].maxLength, 128)
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

  local app = application("Editor")
  local other_app = application("Terminal")
  frontmost = app
  appearance = action.appearance(press_context)
  assertEqual(appearance.title, "Editor")
  assertEqual(appearance.state, "inactive")
  action.press(press_context)
  assertEqual(app.hide_calls, 1)
  assertTrue(app.hidden, "focused application must be hidden")
  assertEqual(press_context.refreshes, 1)
  appearance = action.appearance(press_context)
  assertEqual(appearance.title, "Editor", "hidden target must remain the focused toggle target")
  assertEqual(appearance.state, "active")

  frontmost = other_app
  action.press(press_context)
  assertEqual(app.unhide_calls, 1, "second click must unhide the first target")
  assertFalse(app.hidden)
  assertEqual(other_app.hide_calls, 0, "second click must not hide the new frontmost app")
  assertEqual(press_context.refreshes, 2)

  frontmost = app
  app.hide_result = false
  assertError(function()
    action.press(press_context)
  end, "failed to hide application")
  assertEqual(press_context.refreshes, 2, "failed hide must not refresh")
  app.hide_result = true

  local configured_context = context("configured", {
    bundleID = "com.example.Editor",
  })
  configured = app
  frontmost = other_app
  appearance = action.appearance(configured_context)
  assertEqual(appearance.title, "Editor")
  assertEqual(appearance.state, "inactive")
  assertEqual(get_calls, 1, "appearance must resolve configured applications")
  action.press(configured_context)
  assertTrue(app.hidden, "configured application must be hidden")
  assertEqual(app.hide_calls, 3)
  assertEqual(configured_context.refreshes, 1)
  action.press(configured_context)
  assertFalse(app.hidden, "configured application must be shown on the next click")
  assertEqual(app.unhide_calls, 2)
  assertEqual(configured_context.refreshes, 2)

  configured = nil
  assertEqual(action.appearance(configured_context).title, "No app")
  assertError(function()
    action.press(configured_context)
  end, "application not running: com.example.Editor")
  assertEqual(configured_context.refreshes, 2, "missing configured application must not refresh")

  get_error = "lookup unavailable"
  assertError(function()
    action.appearance(configured_context)
  end, "failed to find application")
  get_error = nil
  configured = app

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

test("focus timer example covers lifecycle, completion, stopping, and unavailable timers", function()
  local scheduled
  local fake_hs = {
    timer = {
      doAfter = function(seconds, callback)
        local timer = {
          seconds = seconds,
          callback = callback,
          stop_calls = 0,
        }
        function timer:stop()
          self.stop_calls = self.stop_calls + 1
          return true
        end
        scheduled = timer
        return timer
      end,
    },
  }
  local streamdeck = load_fixture("hammerspoon/examples/focus-timer.lua", fake_hs)
  local action = streamdeck.registrations[1]
  local focus = context("focus")

  assertEqual(action.id, "com.brettinternet.hammerspoon.focus-timer")
  assertEqual(action.appearance(focus).title, "Ready")
  assertEqual(action.appearance(focus).state, "inactive")
  action.appear(focus)
  action.press(focus)
  assertEqual(scheduled.seconds, 25 * 60, "focus timer must use a 25-minute duration")
  assertEqual(focus.refreshes, 1, "starting a focus timer must refresh")
  assertEqual(action.appearance(focus).title, "Focus")
  assertEqual(action.appearance(focus).state, "active")

  scheduled.callback()
  assertEqual(focus.refreshes, 2, "timer completion must refresh")
  assertEqual(action.appearance(focus).title, "Ready")
  assertEqual(action.appearance(focus).state, "inactive")

  action.press(focus)
  local running_timer = scheduled
  action.press(focus)
  assertEqual(running_timer.stop_calls, 1, "pressing a running timer must stop it")
  assertEqual(focus.refreshes, 4, "stopping a focus timer must refresh")
  assertEqual(action.appearance(focus).state, "inactive")

  action.press(focus)
  local disappearing_timer = scheduled
  action.disappear(focus)
  assertEqual(disappearing_timer.stop_calls, 1, "disappearing must stop the timer")
  action.appear(focus)
  assertEqual(action.appearance(focus).title, "Ready", "reappearing must reset timer state")

  local unavailable = load_fixture("hammerspoon/examples/focus-timer.lua", {})
  local unavailable_context = context("unavailable")
  unavailable.registrations[1].appear(unavailable_context)
  assertError(function()
    unavailable.registrations[1].press(unavailable_context)
  end, "focus timer unavailable")
end)

test("window zoom example covers appearance, lifecycle, toggling, and errors", function()
  local focused
  local zoom_result = true
  local application = {
    name = function()
      return "Editor"
    end,
  }
  local window = {
    toggle_calls = 0,
    application = function()
      return application
    end,
    toggleZoom = function(self)
      self.toggle_calls = self.toggle_calls + 1
      return zoom_result
    end,
  }
  local streamdeck = load_fixture("hammerspoon/examples/window-maximize.lua", {
    window = {
      focusedWindow = function()
        return focused
      end,
    },
  })
  local action = streamdeck.registrations[1]
  local window_context = context("window")

  assertEqual(action.id, "com.brettinternet.hammerspoon.window-maximize")
  assertEqual(action.appearance(window_context).title, "No window")
  assertError(function()
    action.press(window_context)
  end, "no focused window")
  assertEqual(window_context.refreshes, 0)

  focused = window
  action.appear(window_context)
  local appearance = action.appearance(window_context)
  assertEqual(appearance.title, "Editor")
  assertEqual(appearance.state, "inactive")
  action.press(window_context)
  assertEqual(window.toggle_calls, 1)
  assertEqual(window_context.refreshes, 1)
  assertEqual(action.appearance(window_context).state, "active")
  action.press(window_context)
  assertEqual(window.toggle_calls, 2)
  assertEqual(window_context.refreshes, 2)
  assertEqual(action.appearance(window_context).state, "inactive")

  zoom_result = false
  assertError(function()
    action.press(window_context)
  end, "failed to toggle focused window zoom")
  assertEqual(window_context.refreshes, 2, "failed zoom must not refresh")

  action.disappear(window_context)
  action.appear(window_context)
  assertEqual(action.appearance(window_context).state, "inactive",
    "reappearing must reset window zoom state")

  local unavailable = load_fixture("hammerspoon/examples/window-maximize.lua", {})
  local unavailable_context = context("unavailable-window")
  assertError(function()
    unavailable.registrations[1].press(unavailable_context)
  end, "no focused window")
end)

test("clipboard clean example covers trim, refresh, write errors, and unavailable clipboard", function()
  local clipboard
  local set_result = true
  local set_calls = 0
  local streamdeck = load_fixture("hammerspoon/examples/clipboard-clean.lua", {
    pasteboard = {
      getContents = function()
        return clipboard
      end,
      setContents = function(value)
        set_calls = set_calls + 1
        if set_result then
          clipboard = value
        end
        return set_result
      end,
    },
  })
  local action = streamdeck.registrations[1]
  local clipboard_context = context("clipboard")

  assertEqual(action.id, "com.brettinternet.hammerspoon.clipboard-clean")
  local appearance = action.appearance(clipboard_context)
  assertEqual(appearance.title, "No text")
  assertEqual(appearance.state, "inactive")
  assertError(function()
    action.press(clipboard_context)
  end, "no clipboard text")

  clipboard = "  hello world \n"
  appearance = action.appearance(clipboard_context)
  assertEqual(appearance.title, "Trim")
  assertEqual(appearance.state, "active")
  action.press(clipboard_context)
  assertEqual(clipboard, "hello world")
  assertEqual(set_calls, 1)
  assertEqual(clipboard_context.refreshes, 1)
  assertEqual(action.appearance(clipboard_context).title, "Clean")

  action.press(clipboard_context)
  assertEqual(set_calls, 2, "clean clipboard press should still write the normalized value")
  assertEqual(clipboard_context.refreshes, 2)

  clipboard = "  failed  "
  set_result = false
  assertError(function()
    action.press(clipboard_context)
  end, "failed to update clipboard")
  assertEqual(clipboard_context.refreshes, 2, "failed clipboard write must not refresh")

  local unavailable = load_fixture("hammerspoon/examples/clipboard-clean.lua", {})
  local unavailable_context = context("unavailable-clipboard")
  assertError(function()
    unavailable.registrations[1].appearance(unavailable_context)
  end, "clipboard unavailable")
end)

dofile("hammerspoon/tests/keyboard-layout-example.lua")(
  test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
dofile("hammerspoon/tests/url-launcher-example.lua")(
  test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
dofile("hammerspoon/tests/window-snap-example.lua")(
  test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
dofile("hammerspoon/tests/keep-awake-example.lua")(
  test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
dofile("hammerspoon/tests/app-launcher-example.lua")(
  test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
dofile("hammerspoon/tests/clipboard-stash-example.lua")(
  test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
dofile("hammerspoon/tests/window-center-example.lua")(
  test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
dofile("hammerspoon/tests/meeting-mode-example.lua")(
  test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
dofile("hammerspoon/tests/pomodoro-example.lua")(
  test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
dofile("hammerspoon/tests/lock-screen-example.lua")(
  test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)

return passed
