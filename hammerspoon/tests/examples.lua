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
  local invocation_context


  local function invoke_with_fake_hs(callback, ...)
    local previous_hs = _G.hs
    local arguments = table.pack(...)
    local previous_invocation_context = invocation_context
    invocation_context = arguments[1]
    _G.hs = fake_hs
    local results = {
      xpcall(function()
        return callback(table.unpack(arguments, 1, arguments.n))
      end, debug.traceback),
    }
    invocation_context = previous_invocation_context
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
    for _, field in ipairs({
      "appearance",
      "press",
      "release",
      "push",
      "longPress",
      "appear",
      "disappear",
      "rotate",
      "touchTap",
      "settingsSchemaProvider",
    }) do
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
    if invocation_context and type(invocation_context.refresh) == "function" then
      invocation_context:refresh()
    end
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
    local chunk, load_error = loadfile(path)
    if not chunk then
      error(load_error)
    end
    local action_name = path:match("/([^/]+)%.lua$")
    local module_name = "streamdeck.actions." .. action_name
    local previous_action_module = package.loaded[module_name]
    package.loaded[module_name] = nil
    require("streamdeck.actions").register(streamdeck, { action_name })
    package.loaded[module_name] = previous_action_module
  end, debug.traceback)

  _G.hs = previous_hs
  package.loaded.streamdeck = previous_loaded
  package.preload.streamdeck = previous_preload

  if not ok then
    error(err, 0)
  end
  return streamdeck
end

local function context(instance_id, settings, device)
  return {
    instanceId = instance_id,
    settings = settings,
    device = device,
    refreshes = 0,
    sounds = {},
    feedbacks = {},
    getSettings = function(self)
      return self.settings
    end,
    getDevice = function(self)
      return self.device
    end,
    refresh = function(self)
      self.refreshes = self.refreshes + 1
    end,
    success = function(self, message, duration_ms)
      self.feedbacks[#self.feedbacks + 1] = {
        kind = "success",
        message = message,
        durationMs = duration_ms,
      }
    end,
    playSound = function(self, spec)
      self.sounds[#self.sounds + 1] = spec
      return true
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
    load_fixture("hammerspoon/streamdeck/actions/example-that-does-not-exist.lua", {})
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


test("application example toggles focused and configured applications", function()
  local frontmost
  local configured
  local get_calls = 0
  local launch_calls = 0
  local launch_result = true
  local icon_requests = {}
  local icon_available = true
  local get_error
  local activate_error = false
  local fallback_after_hide
  local watcher_callback
  local watcher_started = false
  local watcher_stopped = false
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
      main_window = {},
      hide_calls = 0,
      unhide_calls = 0,
      activate_calls = 0,
      activate_all_windows = nil,
      kill_calls = 0,
      hide_result = true,
      unhide_result = true,
      activate_result = true,
      kill_result = true,
      name = function(self)
        return self.app_name
      end,
      bundleID = function(self)
        return "com.example." .. self.app_name
      end,
      mainWindow = function(self)
        return self.main_window
      end,
      activate = function(self, all_windows)
        self.activate_calls = self.activate_calls + 1
        self.activate_all_windows = all_windows
        if activate_error then
          error("activation unavailable")
        end
        return self.activate_result
      end,
      isHidden = function(self)
        return self.hidden
      end,
      hide = function(self)
        self.hide_calls = self.hide_calls + 1
        if self.hide_result then
          self.hidden = true
          if fallback_after_hide then
            frontmost = fallback_after_hide
          end
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
      kill = function(self)
        self.kill_calls = self.kill_calls + 1
        return self.kill_result
      end,
    }
    return app
  end

  local pngBySize = {
    [72] = "iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAAAK0lEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAujBRSAAB/UYCuQAAAABJRU5ErkJggg==",
    [120] = "iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAIAAAC2BqGFAAAAQElEQVR4nO3BAQEAAACCIP+vbkhAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAnRipOAABp+xssgAAAABJRU5ErkJggg==",
  }
  local icon_image = {
    bitmapRepresentation = function(_, size)
      assertTrue(pngBySize[size.w] ~= nil, "application icons must use a known device size")
      assertEqual(size.h, size.w, "application icons must remain square")
      return {
        encodeAsURLString = function(_, scale, image_type)
          assertTrue(scale, "application icons must be encoded in pixels")
          assertEqual(image_type, "PNG")
          return "data:image/png;base64," .. pngBySize[size.w] .. "\n"
        end,
      }
    end,
  }

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
      launchOrFocusByBundleID = function(bundle_id)
        launch_calls = launch_calls + 1
        assertEqual(bundle_id, "com.example.Editor", "launch must use the bundle ID")
        if launch_result and configured then
          configured.hidden = false
          configured.main_window = configured.main_window or {}
        end
        return launch_result
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
            stop = function()
              watcher_stopped = true
            end,
          }
        end,
      },
    },
    image = {
      imageFromAppBundle = function(bundle_id)
        icon_requests[#icon_requests + 1] = bundle_id
        return icon_available and icon_image or nil
      end,
    },
  }

  local Protocol = require("streamdeck.protocol")
  local streamdeck = load_fixture("hammerspoon/streamdeck/actions/application.lua", fake_hs)
  assertEqual(#streamdeck.registrations, 1, "application must register one action")
  local action = streamdeck.registrations[1]
  assertEqual(action.id, "com.brettinternet.hammerspoon.application-toggle")
  assertEqual(action.name, "Hide/show application")
  assertEqual(action.settingsSchemaVersion, 1)
  assertEqual(#action.settingsSchema, 2)
  assertEqual(action.settingsSchema[1].type, "text")
  assertEqual(action.settingsSchema[1].key, "bundleID")
  assertEqual(action.settingsSchema[1].maxLength, 128)
  assertEqual(action.settingsSchema[2].type, "boolean")
  local press_context = context("application", nil, {
    controllerType = "keypad",
    imageSize = 120,
    device = { type = "stream-deck-plus", size = { columns = 4, rows = 2 } },
  })
  assertFalse(action.settingsSchema[2].default)
  assertEqual(streamdeck.starts, 0, "action modules must not start the bridge")
  assertFalse(watcher_started, "application watcher must wait for a visible instance")

  action.appear(press_context)
  assertTrue(watcher_started, "application watcher must start for a visible instance")
  local appearance = action.appearance(press_context)
  assertEqual(appearance.title, "No app")
  assertEqual(appearance.state, "inactive")
  assertError(function()
    action.press(press_context)
  end, "no frontmost application")
  assertEqual(press_context.refreshes, 0)

  local app = application("Editor")
  local other_app = application("Terminal")
  local latest_app = application("Notes")
  frontmost = app
  appearance = action.appearance(press_context)
  assertEqual(appearance.title, "Editor")
  assertEqual(appearance.state, "inactive")
  assertEqual(appearance.appearanceVersion, 1, "application appearance must include the system icon")
  assertEqual(appearance.icon.kind, "custom")
  assertEqual(appearance.icon.mediaType, "image/png")
  assertEqual(appearance.icon.dataBase64, pngBySize[120],
    "icon data must be canonical base64 at the active keypad size")
  assertTrue(Protocol.validateAppearanceIcon(appearance.icon),
    "application PNG must pass the protocol icon validator")
  assertEqual(icon_requests[1], "com.example.Editor")
  icon_available = false
  local fallback_appearance = action.appearance(press_context)
  assertEqual(fallback_appearance.icon, nil, "missing system icons must fall back cleanly")
  assertEqual(fallback_appearance.appearanceVersion, nil)
  icon_available = true
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
  app.kill_result = false
  assertError(function()
    action.longPress(press_context)
  end, "failed to close application")
  assertEqual(app.kill_calls, 1)
  assertEqual(press_context.refreshes, 2, "failed close must not refresh")
  app.kill_result = true
  action.longPress(press_context)
  assertEqual(app.kill_calls, 2, "long press must close the tracked application")
  assertEqual(press_context.refreshes, 3)

  app.hide_result = false
  assertError(function()
    action.press(press_context)
  end, "failed to hide application")
  assertEqual(press_context.refreshes, 3, "failed hide must not refresh")
  app.hide_result = true

  local configured_context = context("configured", {
    bundleID = "com.example.Editor",
  })
  action.appear(configured_context)
  configured = app
  frontmost = app
  appearance = action.appearance(configured_context)
  assertEqual(appearance.title, "Editor")
  assertEqual(appearance.state, "inactive")
  assertEqual(appearance.icon.dataBase64, pngBySize[72],
    "configured applications must use the 72-pixel fallback icon")
  assertTrue(Protocol.validateAppearanceIcon(appearance.icon),
    "fallback application PNG must pass the protocol icon validator")
  assertEqual(get_calls, 1, "appearance must resolve configured applications")
  fallback_after_hide = other_app
  action.press(configured_context)
  assertTrue(app.hidden, "configured frontmost application must be hidden")
  assertEqual(app.hide_calls, 3)
  assertEqual(configured_context.refreshes, 1)
  assertEqual(other_app.activate_calls, 1, "hiding the target must refocus the fallback application")
  assertTrue(other_app.activate_all_windows)
  fallback_after_hide = nil
  frontmost = other_app
  action.press(configured_context)
  assertFalse(app.hidden, "configured application must unhide on the next click")
  assertEqual(launch_calls, 0, "a configured target must toggle even when it is not frontmost")
  assertEqual(app.unhide_calls, 2)
  assertEqual(configured_context.refreshes, 2)
  assertEqual(app.activate_calls, 0, "focus is opt-in")

  local focus_context = context("focus", {
    bundleID = "com.example.Editor",
    focusOnShow = true,
  })
  app.hidden = true
  frontmost = other_app
  action.press(focus_context)
  assertFalse(app.hidden)
  assertEqual(app.activate_calls, 1)
  assertTrue(app.activate_all_windows, "show focus must bring all application windows forward")
  assertEqual(other_app.activate_calls, 1, "show must not refocus the fallback before hiding")
  assertEqual(focus_context.refreshes, 1)
  frontmost = latest_app
  action.press(focus_context)
  assertTrue(app.hidden)
  assertEqual(other_app.activate_calls, 1, "hiding must not use a stale fallback")
  assertEqual(latest_app.activate_calls, 1, "hiding the shown app must refocus the current fallback")
  assertTrue(latest_app.activate_all_windows)
  assertEqual(focus_context.refreshes, 2)
  app.hidden = true
  frontmost = other_app
  app.activate_result = false
  assertError(function()
    action.press(focus_context)
  end, "failed to focus application")
  assertEqual(focus_context.refreshes, 2, "failed focus must not refresh")
  app.activate_result = true
  app.hidden = true
  activate_error = true
  assertError(function()
    action.press(focus_context)
  end, "failed to focus application")
  assertEqual(focus_context.refreshes, 2, "thrown focus API must not refresh")
  activate_error = false

  local frontmost_focus_context = context("frontmost-focus", {
    focusOnShow = true,
  })
  app.hidden = false
  frontmost = app
  action.press(frontmost_focus_context)
  frontmost = other_app
  action.press(frontmost_focus_context)
  assertEqual(app.activate_calls, 4, "frontmost tracking must preserve focus setting")
  assertTrue(app.activate_all_windows)

  configured = nil
  local missing_appearance = action.appearance(configured_context)
  assertEqual(missing_appearance.title, "No app")
  assertEqual(missing_appearance.icon.dataBase64, pngBySize[72],
    "configured applications can show a protocol-valid fallback icon before launch")
  action.press(configured_context)
  assertEqual(launch_calls, 1, "missing configured applications must be opened")
  assertEqual(configured_context.refreshes, 3, "opening a configured application must refresh")
  launch_result = false
  assertError(function()
    action.press(configured_context)
  end, "failed to open application")
  assertEqual(configured_context.refreshes, 3, "failed open must not refresh")
  launch_result = true
  configured = app
  app.hidden = false
  app.main_window = nil
  local configured_refreshes = configured_context.refreshes
  action.press(configured_context)
  assertEqual(launch_calls, 3, "running applications without a main window must be reopened")
  assertEqual(app.hide_calls, 5, "reopening a windowless application must not hide it")
  assertEqual(configured_context.refreshes, configured_refreshes + 1)
  app.main_window = {}

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
  local press_refreshes = press_context.refreshes
  local configured_refreshes_after_actions = configured_context.refreshes
  local bridge_refreshes = #streamdeck.refreshes
  for _, event in ipairs(relevant) do
    watcher_callback("Editor", event, app)
  end
  assertEqual(press_context.refreshes, press_refreshes + #relevant,
    "all relevant application events must refresh every visible instance")
  assertEqual(configured_context.refreshes, configured_refreshes_after_actions + #relevant,
    "all relevant application events must refresh every visible instance")
  watcher_callback("Editor", "replaced", app)
  assertEqual(press_context.refreshes, press_refreshes + #relevant,
    "irrelevant application events must not refresh")
  assertEqual(#streamdeck.refreshes, bridge_refreshes,
    "action watchers must refresh contexts without the bridge")

  action.disappear(press_context)
  assertFalse(watcher_stopped, "watcher must remain active while another instance is visible")
  action.disappear(configured_context)
  assertTrue(watcher_stopped, "watcher must stop after the last instance disappears")
end)


test("configurable timer counts down, flashes on completion, and cleans up timers", function()
  local now = 1000
  local completion_timer
  local refresh_timer
  local flash_timer
  local function timer(seconds, callback)
    local scheduled = {
      seconds = seconds,
      callback = callback,
      stop_calls = 0,
    }
    function scheduled:stop()
      self.stop_calls = self.stop_calls + 1
      return true
    end
    return scheduled
  end
  local fake_hs = {
    timer = {
      secondsSinceEpoch = function() return now end,
      doAfter = function(seconds, callback)
        completion_timer = timer(seconds, callback)
        return completion_timer
      end,
      doEvery = function(seconds, callback)
        local scheduled = timer(seconds, callback)
        if seconds == 1 then
          refresh_timer = scheduled
        else
          flash_timer = scheduled
        end
        return scheduled
      end,
    },
  }
  local function invoke_timer(callback)
    local previous_hs = _G.hs
    _G.hs = fake_hs
    local ok, err = xpcall(callback, debug.traceback)
    _G.hs = previous_hs
    if not ok then
      error(err, 0)
    end
  end
  local streamdeck = load_fixture("hammerspoon/streamdeck/actions/timer.lua", fake_hs)
  local action = streamdeck.registrations[1]
  local timer_context = context("timer", { durationMinutes = 10 })

  assertEqual(action.id, "com.brettinternet.hammerspoon.timer")
  assertEqual(action.name, "Timer")
  assertEqual(action.settingsSchemaVersion, 1)
  assertEqual(action.settingsSchema[1].key, "durationMinutes")
  assertEqual(action.appearance(timer_context).title, "Start")
  assertEqual(action.appearance(timer_context).state, "inactive")
  action.appear(timer_context)
  action.press(timer_context)
  assertEqual(completion_timer.seconds, 10 * 60, "timer must use the configured duration")
  assertEqual(refresh_timer.seconds, 1, "visible countdown must refresh once per second")
  assertEqual(timer_context.refreshes, 1, "starting a timer must refresh")
  local running = action.appearance(timer_context)
  assertEqual(running.title, "10:00")
  assertEqual(running.state, "active")
  assertEqual(running.progress, 0)
  assertEqual(running.backgroundColor, "#7F1D1D")

  now = now + 1
  refresh_timer.callback()
  running = action.appearance(timer_context)
  assertEqual(running.title, "09:59")
  assertEqual(running.progress, 1 - (599 / (10 * 60)))
  assertEqual(timer_context.refreshes, 2, "each tick must refresh the visible countdown")

  now = now + 2000
  running = action.appearance(timer_context)
  assertEqual(running.title, "00:00", "overdue appearances must remain valid before completion runs")
  assertEqual(running.progress, 1)

  invoke_timer(completion_timer.callback)
  assertEqual(timer_context.refreshes, 3, "timer completion must refresh")
  assertEqual(refresh_timer.stop_calls, 1, "completion must stop countdown refreshes")
  assertEqual(flash_timer.seconds, 0.5, "completion must schedule a background flash")
  local complete = action.appearance(timer_context)
  assertEqual(complete.title, "Done")
  assertEqual(complete.backgroundColor, "#FACC15")

  flash_timer.callback()
  assertEqual(timer_context.refreshes, 4, "each flash transition must refresh")
  assertEqual(action.appearance(timer_context).backgroundColor, "#111827",
    "completion flash must alternate with the idle background")
  flash_timer.callback()
  assertEqual(action.appearance(timer_context).backgroundColor, "#FACC15",
    "completion flash must return to its alert background")

  action.press(timer_context)
  assertEqual(flash_timer.stop_calls, 1, "starting a new timer must stop completion flashes")
  assertEqual(completion_timer.seconds, 10 * 60)
  local running_completion = completion_timer
  local running_refresh = refresh_timer
  action.press(timer_context)
  assertEqual(running_completion.stop_calls, 1, "cancelling a timer must stop completion")
  assertEqual(running_refresh.stop_calls, 1, "cancelling a timer must stop refreshes")
  assertEqual(action.appearance(timer_context).title, "Start")

  action.press(timer_context)
  local disappearing_completion = completion_timer
  local disappearing_refresh = refresh_timer
  action.disappear(timer_context)
  assertEqual(disappearing_completion.stop_calls, 1, "disappearing must stop completion")
  assertEqual(disappearing_refresh.stop_calls, 1, "disappearing must stop refreshes")
  action.appear(timer_context)
  assertEqual(action.appearance(timer_context).title, "Start", "reappearing must reset timer state")

  action.press(timer_context)
  invoke_timer(completion_timer.callback)
  local disappearing_flash = flash_timer
  action.disappear(timer_context)
  assertEqual(disappearing_flash.stop_calls, 1, "disappearing must stop completion flashes")

  local unavailable = load_fixture("hammerspoon/streamdeck/actions/timer.lua", {})
  local unavailable_context = context("unavailable")
  unavailable.registrations[1].appear(unavailable_context)
  assertError(function()
    unavailable.registrations[1].press(unavailable_context)
  end, "timer unavailable")
end)

test("system monitor samples visible metrics, summarizes configured windows, and colors thresholds", function()
  local scheduled = {}
  local timer_count = 0
  local calls = {
    cpu = 0,
    memory = 0,
    disk = 0,
    network = 0,
    internet = 0,
    wifi = 0,
    battery = 0,
    battery_power = 0,
    thermal = 0,
    idle = 0,
  }
  local absolute_time = 0
  local active_ticks = 0
  local idle_ticks = 0
  local active_delta = 10
  local idle_delta = 90
  local ram_active_pages = 2
  local vm_page_outs = 0
  local vm_swap_outs = 0
  local primary_ipv4 = "en0"
  local primary_ipv6 = false
  local internet_status = "-R------"
  local wifi_rssi = -50
  local battery_percentage = 75
  local battery_watts = -12.5
  local thermal = "Nominal"
  local user_idle = 0
  local fake_hs = {
    host = {
      cpuUsageTicks = function()
        calls.cpu = calls.cpu + 1
        active_ticks = active_ticks + active_delta
        idle_ticks = idle_ticks + idle_delta
        return {
          overall = {
            user = active_ticks,
            system = 0,
            nice = 0,
            idle = idle_ticks,
          },
        }
      end,
      vmStat = function()
        calls.memory = calls.memory + 1
        vm_page_outs = vm_page_outs + 2
        vm_swap_outs = vm_swap_outs + 1
        return {
          pagesActive = ram_active_pages,
          pagesWiredDown = 1,
          pagesUsedByVMCompressor = 1,
          pageSize = 10,
          memSize = 1000,
          pageOuts = vm_page_outs,
          swapOuts = vm_swap_outs,
        }
      end,
      volumeInformation = function()
        calls.disk = calls.disk + 1
        return {
          ["/"] = {
            NSURLVolumeTotalCapacityKey = 1000,
            NSURLVolumeAvailableCapacityKey = 750,
          },
        }
      end,
      thermalState = function()
        calls.thermal = calls.thermal + 1
        return thermal
      end,
      idleTime = function()
        calls.idle = calls.idle + 1
        return user_idle
      end,
    },
    network = {
      primaryInterfaces = function()
        calls.network = calls.network + 1
        return primary_ipv4, primary_ipv6
      end,
      reachability = {
        internet = function()
          calls.internet = calls.internet + 1
          return {
            statusString = function()
              return internet_status
            end,
          }
        end,
      },
    },
    wifi = {
      interfaceDetails = function()
        calls.wifi = calls.wifi + 1
        return { rssi = wifi_rssi }
      end,
    },
    battery = {
      percentage = function()
        calls.battery = calls.battery + 1
        return battery_percentage
      end,
      watts = function()
        calls.battery_power = calls.battery_power + 1
        return battery_watts
      end,
    },
    timer = {
      absoluteTime = function()
        return absolute_time
      end,
      doEvery = function(seconds, callback)
        timer_count = timer_count + 1
        local timer = {
          seconds = seconds,
          callback = callback,
          stop_calls = 0,
        }
        function timer:stop()
          self.stop_calls = self.stop_calls + 1
        end
        scheduled = timer
        return timer
      end,
    },
  }

  local helpers = require("streamdeck.helpers")
  local original_area_chart = helpers.areaChart
  local chart_lengths = {}
  local chart_options = {}
  local chart_values = {}
  helpers.areaChart = function(device_context, values, options)
    local values_copy = {}
    for index, value in ipairs(values) do
      values_copy[index] = value
    end
    chart_lengths[#chart_lengths + 1] = #values_copy
    chart_values[#chart_values + 1] = values_copy
    chart_options[#chart_options + 1] = options
    return original_area_chart(device_context, values, options)
  end

  local streamdeck = load_fixture("hammerspoon/streamdeck/actions/system-monitor.lua", fake_hs)
  local action = streamdeck.registrations[1]
  require("streamdeck.registry").new():register(action)
  assertEqual(type(action.press), "function")
  local first = context("system-first")
  local second = context("system-second")

  assertEqual(action.id, "com.brettinternet.hammerspoon.system-monitor")
  assertEqual(action.name, "System monitor")
  assertEqual(action.settingsSchemaVersion, 1)
  local metric_setting = action.settingsSchema[1]
  assertEqual(metric_setting.type, "select")
  assertEqual(metric_setting.key, "metric")
  assertEqual(metric_setting.default, "cpu")
  assertEqual(#metric_setting.options, 11)
  assertEqual(metric_setting.options[3].value, "memory_pressure")
  assertEqual(metric_setting.options[6].value, "internet")
  assertEqual(metric_setting.options[9].value, "battery_power")
  local window_setting = action.settingsSchema[2]
  assertEqual(window_setting.type, "number")
  assertEqual(window_setting.key, "windowSeconds")
  assertEqual(window_setting.default, 120)
  assertEqual(window_setting.min, 30)
  assertEqual(window_setting.max, 3600)
  action.appear(first)
  assertEqual(scheduled.seconds, 1, "system monitor must sample once per second")
  assertEqual(timer_count, 1, "first visible instance must start one timer")
  action.appear(second)
  assertEqual(timer_count, 1, "all visible instances must share one timer")

  local initial = action.appearance(first)
  assertEqual(initial.title, "CPU 0%", "CPU must remain informative before a valid delta")
  assertEqual(initial.icon.mediaType, "image/svg+xml")
  assertEqual(chart_lengths[#chart_lengths], 0, "the initial chart may be empty")
  local initial_colors = chart_options[#chart_options]
  assertEqual(initial_colors.backgroundColor, "#0D2818")
  assertEqual(initial_colors.fillColor, "#1B7F3A")
  assertEqual(initial_colors.strokeColor, "#34C759")

  local function tick()
    local previous_hs = _G.hs
    _G.hs = fake_hs
    absolute_time = absolute_time + 1000000000
    scheduled.callback()
    _G.hs = previous_hs
  end

  tick()
  assertEqual(calls.cpu, 1, "a CPU key must sample CPU")
  assertEqual(calls.memory, 0, "inactive memory keys must not call vmStat")
  assertEqual(calls.disk, 0, "inactive disk keys must not query volumes")
  assertEqual(calls.network, 0, "inactive network keys must not query interfaces")
  assertEqual(calls.internet, 0, "inactive internet keys must not create reachability probes")
  assertEqual(calls.wifi, 0, "inactive Wi-Fi keys must not query the interface")
  assertEqual(calls.battery, 0, "inactive battery keys must not query charge")
  assertEqual(calls.battery_power, 0, "inactive battery-power keys must not query watts")
  assertEqual(calls.thermal, 0, "inactive thermal keys must not query thermal state")
  assertEqual(calls.idle, 0, "inactive idle keys must not query idle time")
  assertEqual(first.refreshes, 1, "a valid CPU sample must refresh every visible key")
  assertEqual(second.refreshes, 1, "a valid CPU sample must refresh every visible key")
  tick()
  assertEqual(action.appearance(first).title, "CPU 10%", "CPU must use tick deltas")
  action.press(first)
  assertEqual(first.feedbacks[#first.feedbacks].message, "Configure\nmetric")
  assertEqual(action.appearance(first).title, "CPU 10%", "press must not change the selected metric")

  first.settings = { metric = "memory" }
  second.settings = { metric = "memory" }
  tick()
  assertEqual(calls.cpu, 2, "CPU sampling must stop when no CPU key is visible")
  assertEqual(calls.memory, 1, "a memory key must sample vmStat")
  assertEqual(action.appearance(first).title, "Memory 4%")
  ram_active_pages = 70
  tick()
  assertEqual(action.appearance(first).title, "Memory 72%")
  local memory_caution = chart_options[#chart_options]
  assertEqual(memory_caution.fillColor, "#8A6D13")
  assertEqual(memory_caution.backgroundColor, "#2B250B")
  assertEqual(memory_caution.strokeColor, "#FFD60A")
  ram_active_pages = 90
  tick()
  assertEqual(action.appearance(first).title, "Memory 92%")
  local memory_warning = chart_options[#chart_options]
  assertEqual(memory_warning.fillColor, "#A61B1B")
  assertEqual(memory_warning.backgroundColor, "#2B1114")
  assertEqual(memory_warning.strokeColor, "#FF453A")
  ram_active_pages = 2

  first.settings = { metric = "memory_pressure" }
  second.settings = { metric = "memory_pressure" }
  tick()
  tick()
  assertEqual(calls.memory, 5, "memory pressure must reuse vmStat rather than make a second query")
  assertEqual(action.appearance(first).title, "Pressure\n3.0/s")
  local pressure_caution = chart_options[#chart_options]
  assertEqual(pressure_caution.fillColor, "#8A6D13")

  first.settings = { metric = "disk" }
  second.settings = { metric = "disk" }
  tick()
  assertEqual(calls.disk, 1, "a disk key must query root-volume capacity")
  assertEqual(action.appearance(first).title, "Disk 25%")

  first.settings = { metric = "network" }
  second.settings = { metric = "network" }
  tick()
  assertEqual(calls.network, 1, "a network key must query primary interfaces")
  assertEqual(action.appearance(first).title, "Network\nUp")
  primary_ipv4 = false
  tick()
  assertEqual(action.appearance(first).title, "Network\nDown")
  local network_warning = chart_options[#chart_options]
  assertEqual(network_warning.fillColor, "#A61B1B")
  primary_ipv6 = "en1"
  tick()
  assertEqual(action.appearance(first).title, "Network\nUp", "an IPv6 primary interface must report network up")

  first.settings = { metric = "internet" }
  second.settings = { metric = "internet" }
  tick()
  assertEqual(calls.internet, 1, "an internet key must create one reachability probe")
  assertEqual(action.appearance(first).title, "Internet\nUp")
  internet_status = "--------"
  tick()
  assertEqual(action.appearance(first).title, "Internet\nDown")
  second.device = { imageSize = 2 }
  for index = 1, 120 do
    internet_status = index % 2 == 0 and "--------" or "-R------"
    tick()
  end
  action.appearance(second)
  local internet_chart_values = chart_values[#chart_values]
  assertEqual(#internet_chart_values, 2, "categorical histories must summarize to the key width")
  assertEqual(internet_chart_values[#internet_chart_values], 0,
    "categorical summaries must retain each bucket's latest value instead of averaging")
  second.device = nil

  first.settings = { metric = "wifi" }
  second.settings = { metric = "wifi" }
  wifi_rssi = -65
  tick()
  assertEqual(calls.wifi, 1, "a Wi-Fi key must query signal strength")
  assertEqual(action.appearance(first).title, "Wi-Fi\n-65 dBm")
  local wifi_caution = chart_options[#chart_options]
  assertEqual(wifi_caution.fillColor, "#8A6D13")

  first.settings = { metric = "battery" }
  second.settings = { metric = "battery" }
  battery_percentage = 15
  tick()
  assertEqual(calls.battery, 1, "a battery key must query charge")
  assertEqual(action.appearance(first).title, "Battery 15%")
  local battery_warning = chart_options[#chart_options]
  assertEqual(battery_warning.fillColor, "#A61B1B")

  first.settings = { metric = "battery_power" }
  second.settings = { metric = "battery_power" }
  tick()
  assertEqual(calls.battery_power, 1, "a battery-power key must query watts")
  assertEqual(action.appearance(first).title, "Battery\n-12.5 W")

  first.settings = { metric = "thermal" }
  second.settings = { metric = "thermal" }
  thermal = "Fair"
  tick()
  assertEqual(calls.thermal, 1, "a thermal key must query thermal state")
  assertEqual(action.appearance(first).title, "Thermal\nFair")
  local thermal_caution = chart_options[#chart_options]
  assertEqual(thermal_caution.fillColor, "#8A6D13")
  thermal = "Serious"
  tick()
  assertEqual(action.appearance(first).title, "Thermal\nSerious")
  local thermal_warning = chart_options[#chart_options]
  assertEqual(thermal_warning.fillColor, "#A61B1B")

  first.settings = { metric = "idle" }
  second.settings = { metric = "idle" }
  user_idle = 125
  tick()
  assertEqual(calls.idle, 1, "an idle key must query idle time")
  assertEqual(action.appearance(first).title, "Idle\n2m")
  local idle_options = chart_options[#chart_options]
  assertEqual(idle_options.max, 125, "idle charts must fit the observed duration")

  first.settings = { metric = "memory", windowSeconds = 30.5 }
  second.settings = { metric = "memory", windowSeconds = 120 }
  for index = 1, 120 do
    ram_active_pages = index % 2 == 0 and 2 or 12
    tick()
  end
  action.appearance(first)
  assertEqual(chart_lengths[#chart_lengths], 31,
    "each key must trim its shared raw history to its configured window")
  local rolled_over = action.appearance(second)
  assertEqual(chart_lengths[#chart_lengths], 72,
    "long windows must summarize raw samples to the key width")
  local summarized_values = chart_values[#chart_values]
  local has_bucket_mean = false
  for _, value in ipairs(summarized_values) do
    if value == 9 then
      has_bucket_mean = true
    end
  end
  assertTrue(has_bucket_mean, "numeric summaries must average samples within a bucket")
  assertEqual(rolled_over.title, "Memory 4%")
  first.settings = { metric = "cpu", windowSeconds = "invalid" }
  second.settings = { metric = "cpu", windowSeconds = 0 }
  tick()
  action.appearance(first)
  assertEqual(chart_lengths[#chart_lengths], 1,
    "malformed persisted windows must fall back without retaining stale CPU history")

  action.disappear(first)
  local old_callback = scheduled.callback
  assertEqual(scheduled.stop_calls, 0, "shared timer must remain for another visible key")
  local second_refreshes = second.refreshes
  action.disappear(second)
  assertEqual(scheduled.stop_calls, 1, "final disappearance must stop the shared timer")
  old_callback()
  assertEqual(second.refreshes, second_refreshes, "stale timer callbacks must not refresh removed keys")

  first.settings = {}
  action.appear(first)
  assertEqual(timer_count, 2, "a new visible period must start a fresh timer")
  assertEqual(action.appearance(first).title, "CPU 0%", "final cleanup must reset CPU baseline")
  local replacement = context("system-first", { metric = "disk" })
  action.appear(replacement)
  assertEqual(action.appearance(replacement).title, "Disk 0%")
  local replacement_refreshes = replacement.refreshes
  action.disappear(first)
  assertEqual(action.appearance(replacement).title, "Disk 0%",
    "a stale context must not remove its replacement")
  assertEqual(replacement.refreshes, replacement_refreshes,
    "a stale context must not refresh its replacement")
  action.disappear(replacement)
  helpers.areaChart = original_area_chart
end)

test("system monitor requires only timer support before sampling a selected metric", function()
  local streamdeck = load_fixture("hammerspoon/streamdeck/actions/system-monitor.lua", {
    timer = {
      doEvery = function()
        return {
          stop = function() end,
        }
      end,
    },
  })
  streamdeck.registrations[1].appear(context("system-no-host-api", { metric = "disk" }))

  local unavailable = load_fixture("hammerspoon/streamdeck/actions/system-monitor.lua", {})
  assertError(function()
    unavailable.registrations[1].appear(context("system-unavailable"))
  end, "hs.timer.doEvery")
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
  local streamdeck = load_fixture("hammerspoon/streamdeck/actions/window-maximize.lua", {
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

  local unavailable = load_fixture("hammerspoon/streamdeck/actions/window-maximize.lua", {})
  local unavailable_context = context("unavailable-window")
  assertError(function()
    unavailable.registrations[1].press(unavailable_context)
  end, "no focused window")
end)

test("clipboard clean example covers trim, refresh, write errors, and unavailable clipboard", function()
  local clipboard
  local set_result = true
  local set_calls = 0
  local streamdeck = load_fixture("hammerspoon/streamdeck/actions/clipboard-clean.lua", {
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

  local unavailable = load_fixture("hammerspoon/streamdeck/actions/clipboard-clean.lua", {})
  local unavailable_context = context("unavailable-clipboard")
  assertError(function()
    unavailable.registrations[1].appearance(unavailable_context)
  end, "clipboard unavailable")
end)

dofile("hammerspoon/tests/keyboard-layout-example.lua")(
  test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
dofile("hammerspoon/tests/url-launcher-example.lua")(
  test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
dofile("hammerspoon/tests/youtube-example.lua")(
  test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
dofile("hammerspoon/tests/window-snap-example.lua")(
  test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
dofile("hammerspoon/tests/keep-awake-example.lua")(
  test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
dofile("hammerspoon/tests/last-application-example.lua")(
  test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
dofile("hammerspoon/tests/app-launcher-example.lua")(
  test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
dofile("hammerspoon/tests/audio-input-router-example.lua")(
  test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
dofile("hammerspoon/tests/audio-output-router-example.lua")(
  test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
dofile("hammerspoon/tests/clipboard-stash-example.lua")(
  test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
dofile("hammerspoon/tests/desktop-space-cycler-example.lua")(
  test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
dofile("hammerspoon/tests/window-center-example.lua")(
  test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
dofile("hammerspoon/tests/window-next-screen-example.lua")(
  test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
dofile("hammerspoon/tests/microphone-example.lua")(
  test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
dofile("hammerspoon/tests/pomodoro-example.lua")(
  test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
dofile("hammerspoon/tests/lock-screen-example.lua")(
  test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
dofile("hammerspoon/tests/spotify-example.lua")(
  test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)

dofile("hammerspoon/tests/action-catalog.test.lua")(
  test, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)

return passed
