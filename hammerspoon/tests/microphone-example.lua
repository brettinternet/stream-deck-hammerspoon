return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("microphone controls hardware without changing app mute states", function()
    local default_device
    local devices
    local failure
    local set_calls = {}
    local shortcut_calls = {}
    local application_calls = {}
    local applications = {}
    local scheduled_timers = {}

    local function make_device(name, uid, muted)
      local device = {
        device_name = name,
        device_uid = uid,
        muted_state = muted,
      }
      function device:name()
        if failure == "name-throws" then
          error("name exploded")
        end
        return self.device_name
      end
      function device:uid()
        if failure == "uid-throws" then
          error("uid exploded")
        end
        return self.device_uid
      end
      function device:inputMuted()
        if failure == "muted-throws" then
          error("inputMuted exploded")
        end
        if failure == "muted-invalid" then
          return "unknown"
        end
        return self.muted_state
      end
      function device:inUse()
        return self.in_use == true
      end
      function device:setInputMuted(desired)
        set_calls[#set_calls + 1] = {
          device = self,
          value = desired,
        }
        if failure == "set-throws" then
          error("setInputMuted exploded")
        end
        if failure == "set-invalid" then
          return false
        end
        self.muted_state = desired
        return true
      end
      function device:watcherCallback(callback)
        if failure == "watcher-callback-throws" then
          error("watcher callback exploded")
        end
        self.watcher_callback = callback
      end
      function device:watcherStart()
        self.watcher_starts = (self.watcher_starts or 0) + 1
        return self
      end
      function device:watcherStop()
        self.watcher_stops = (self.watcher_stops or 0) + 1
      end
      return device
    end

    local built_in = make_device("MacBook Microphone", "builtin-uid", false)
    local usb = make_device("USB Microphone", "usb-uid", false)
    default_device = built_in
    devices = { built_in, usb }

    local fake_hs = {
      audiodevice = {
        allInputDevices = function()
          if failure == "list-throws" then
            error("allInputDevices exploded")
          end
          return devices
        end,
        defaultInputDevice = function()
          if failure == "default-throws" then
            error("defaultInputDevice exploded")
          end
          return default_device
        end,
      },
      application = {
        get = function(bundle_id)
          application_calls[#application_calls + 1] = bundle_id
          return applications[bundle_id]
        end,
      },
      eventtap = {
        keyStroke = function(modifiers, key, delay, application)
          application.muted = not application.muted
          shortcut_calls[#shortcut_calls + 1] = {
            modifiers = modifiers,
            key = key,
            delay = delay,
            application = application,
          }
        end,
      },
      timer = {
        doAfter = function(seconds, callback)
          local timer = {
            seconds = seconds,
            callback = callback,
            stopped = false,
          }
          function timer:stop()
            self.stopped = true
          end
          scheduled_timers[#scheduled_timers + 1] = timer
          return timer
        end,
      },
    }

    local function run_with_fake_hs(callback)
      local previous_hs = _G.hs
      _G.hs = fake_hs
      local ok, cause = pcall(callback)
      _G.hs = previous_hs
      return ok, cause
    end

    local function make_application(bundle_id, running)
      local application = {
        bundle_id = bundle_id,
        running = running,
      }
      function application:isRunning()
        return self.running
      end
      return application
    end

    applications["us.zoom.xos"] = make_application("us.zoom.xos", true)
    applications["com.microsoft.teams2"] = make_application("com.microsoft.teams2", true)
    applications["com.microsoft.teams"] = make_application("com.microsoft.teams", true)
    applications["com.tinyspeck.slackmacgap"] = make_application("com.tinyspeck.slackmacgap", true)
    applications["com.hnc.Discord"] = make_application("com.hnc.Discord", true)

    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/microphone.lua", fake_hs)
    assertEqual(#streamdeck.registrations, 1, "microphone must register one action")
    assertEqual(streamdeck.starts, 0, "action modules must not start the bridge")
    local action = streamdeck.registrations[1]
    assertEqual(action.id, "com.brettinternet.hammerspoon.microphone-toggle")
    assertEqual(action.name, "Microphone mute")
    assertTrue(type(action.description) == "string" and action.description ~= "")
    assertEqual(action.sound.kind, "toggle")
    assertEqual(action.sound.on.volume, 0.65)
    assertEqual(action.sound.off.volume, 0.65)
    assertEqual(action.settingsSchemaVersion, 1)
    local schema = action.settingsSchemaProvider()
    assertEqual(schema[1].type, "select")
    assertEqual(schema[1].options[1].value, "default")
    assertEqual(schema[1].options[1].label, "Default input — MacBook Microphone")
    assertEqual(schema[1].options[2].value, "builtin-uid")
    assertEqual(schema[1].options[2].label, "MacBook Microphone")
    assertEqual(schema[1].options[3].value, "usb-uid")
    assertEqual(schema[1].options[3].label, "USB Microphone")
    assertTrue(type(schema[1].description) == "string")
    assertTrue(schema[1].refreshable)
    assertEqual(schema[2].key, "mode")
    assertEqual(schema[2].type, "select")
    assertEqual(schema[2].options[3].value, "toggleAndPushToTalk")
    assertFalse(type(action.longPress) == "function")

    local default_context = context("default", {})
    local appearance = action.appearance(default_context)
    assertEqual(appearance.title, "MacBook\nMicrophone\nLive")
    assertEqual(appearance.state, "inactive")
    assertEqual(appearance.appearanceVersion, 1)
    assertEqual(appearance.icon.mediaType, "image/svg+xml")
    local live_icon = appearance.icon.dataBase64

    local muted_sound = action.press(default_context)
    assertEqual(set_calls[1].device, built_in)
    assertTrue(set_calls[1].value)
    assertTrue(built_in.muted_state)
    assertFalse(usb.muted_state)
    appearance = action.appearance(default_context)
    assertEqual(appearance.title, "MacBook\nMicrophone\nMuted")
    assertEqual(appearance.state, "active")
    local muted_icon = appearance.icon.dataBase64
    assertTrue(live_icon ~= muted_icon, "live and muted artwork must differ")
    action.appear(default_context)
    assertEqual(built_in.watcher_starts, 1, "visible microphone actions must watch their selected input")
    local default_refreshes_before_external = default_context.refreshes
    built_in.muted_state = false
    built_in.watcher_callback("builtin-uid", "mute", "inpt")
    assertEqual(default_context.refreshes, default_refreshes_before_external + 1,
      "external input muting must refresh visible actions")
    appearance = action.appearance(default_context)
    assertEqual(appearance.title, "MacBook\nMicrophone\nLive")
    built_in.watcher_callback("builtin-uid", "mute", "inpt")
    built_in.watcher_callback("builtin-uid", "mute", "outp")
    assertEqual(default_context.refreshes, default_refreshes_before_external + 1,
      "unchanged and output mute events must not refresh an input")
    action.press(default_context)
    local default_refreshes_before_post_press_event = default_context.refreshes
    built_in.muted_state = false
    built_in.watcher_callback("builtin-uid", "mute", "inpt")
    assertEqual(default_context.refreshes, default_refreshes_before_post_press_event + 1,
      "button mute writes must not leave a stale watcher state")
    built_in.muted_state = true
    local live_sound = action.press(default_context)
    assertTrue(muted_sound ~= live_sound, "muting and unmuting must select different toggle sounds")



    local specific_context = context("specific", { inputDevice = "usb-uid" })
    appearance = action.appearance(specific_context)
    assertEqual(appearance.title, "USB\nMicrophone\nLive")
    action.press(specific_context)
    assertEqual(set_calls[4].device, usb)
    assertTrue(usb.muted_state)
    assertFalse(built_in.muted_state, "external mute changes must affect only the selected input")
    appearance = action.appearance(specific_context)
    assertEqual(appearance.title, "USB\nMicrophone\nMuted")
    assertEqual(appearance.state, "active")
    action.appear(specific_context)
    assertEqual(usb.watcher_starts, 1, "each selected visible input must be watched")
    local default_refreshes_before_usb_event = default_context.refreshes
    local specific_refreshes_before_usb_event = specific_context.refreshes
    usb.muted_state = false
    usb.watcher_callback("usb-uid", "mute", "inpt")
    assertEqual(default_context.refreshes, default_refreshes_before_usb_event + 1,
      "an input mute event must refresh every visible action")
    assertEqual(specific_context.refreshes, specific_refreshes_before_usb_event + 1)
    appearance = action.appearance(specific_context)
    assertEqual(appearance.title, "USB\nMicrophone\nLive")
    action.disappear(default_context)
    action.disappear(specific_context)
    assertEqual(built_in.watcher_stops, 1, "disappearing actions must release unused watchers")
    assertEqual(usb.watcher_stops, 1)
    failure = "uid-throws"
    action.appear(default_context)
    appearance = action.appearance(default_context)
    assertEqual(appearance.title, "MacBook\nMicrophone\nLive",
      "unavailable watcher details must not block the initial microphone appearance")
    action.disappear(default_context)
    failure = nil
    failure = "watcher-callback-throws"
    action.appear(default_context)
    appearance = action.appearance(default_context)
    assertEqual(appearance.title, "MacBook\nMicrophone\nLive",
      "failed watcher setup must not block the initial microphone appearance")
    action.disappear(default_context)
    failure = nil
    action.appear(default_context)
    assertEqual(built_in.watcher_starts, 2, "failed watcher setup must not retain a stale watcher record")
    action.disappear(default_context)


    -- Saved integration settings must not revive blind toggles. In particular,
    -- muting live hardware must not unmute an already-muted Discord.
    local legacy_settings = {
      muteMeetingApps = true,
      muteZoom = true,
      muteTeams = true,
      muteSlack = true,
      muteDiscord = true,
    }
    local meeting_context = context("meeting", legacy_settings)
    applications["com.hnc.Discord"].muted = true
    applications["com.tinyspeck.slackmacgap"].muted = true
    applications["us.zoom.xos"].muted = false
    applications["com.microsoft.teams2"].muted = false
    built_in.in_use = true
    local function assert_apps_unchanged()
      assertTrue(applications["com.hnc.Discord"].muted,
        "hardware changes must preserve an independent Discord mute")
      assertTrue(applications["com.tinyspeck.slackmacgap"].muted)
      assertFalse(applications["us.zoom.xos"].muted,
        "hardware muting must not toggle a live app either")
      assertFalse(applications["com.microsoft.teams2"].muted)
      assertEqual(#shortcut_calls, 0, "hardware control must never send app shortcuts")
      assertEqual(#application_calls, 0, "hardware control must not access apps")
    end
    local scheduled_timer_count = #scheduled_timers
    action.appear(meeting_context)
    local meeting_refreshes = meeting_context.refreshes
    for _, muted in ipairs({ true, false }) do
      built_in.muted_state = muted
      assertTrue(run_with_fake_hs(function()
        built_in.watcher_callback("builtin-uid", "mute", "inpt")
      end))
      meeting_refreshes = meeting_refreshes + 1
      assertEqual(meeting_context.refreshes, meeting_refreshes,
        "external changes must still refresh the visible hardware state")
      assertEqual(action.appearance(meeting_context).state, muted and "active" or "inactive")
      assert_apps_unchanged()
    end
    for _, muted in ipairs({ true, false }) do
      action.press(meeting_context)
      assertEqual(built_in.muted_state, muted)
      assert_apps_unchanged()
    end
    assertEqual(#scheduled_timers, scheduled_timer_count,
      "legacy integration settings must not schedule deferred app changes")
    action.disappear(meeting_context)

    local push_to_talk = context("push-to-talk", {
      inputDevice = "usb-uid",
      mode = "pushToTalk",
    })
    usb.muted_state = true
    local set_count = #set_calls
    assertTrue(usb.muted_state)
    action.press(push_to_talk)
    assertFalse(usb.muted_state, "push-to-talk must unmute while held")
    push_to_talk.settings.inputDevice = "default"
    action.release(push_to_talk)
    assertTrue(usb.muted_state, "push-to-talk must restore the exact held microphone")
    assertEqual(#set_calls, set_count + 2)
    push_to_talk.settings.inputDevice = "usb-uid"
    usb.muted_state = false
    set_count = #set_calls
    action.press(push_to_talk)
    action.release(push_to_talk)
    assertFalse(usb.muted_state, "push-to-talk must preserve an already-live microphone")
    assertEqual(#set_calls, set_count, "already-live push-to-talk must not write redundant mute state")
    usb.muted_state = true
    usb.in_use = true
    local legacy_push_to_talk = context("legacy-push-to-talk", {
      inputDevice = "usb-uid",
      mode = "pushToTalk",
      muteMeetingApps = true,
      muteZoom = true,
      muteTeams = true,
      muteSlack = true,
      muteDiscord = true,
    })
    action.press(legacy_push_to_talk)
    assertFalse(usb.muted_state, "push-to-talk must unmute hardware while held")
    assert_apps_unchanged()
    action.release(legacy_push_to_talk)
    assertTrue(usb.muted_state, "push-to-talk must restore hardware mute")
    assert_apps_unchanged()
    action.press(legacy_push_to_talk)
    set_count = #set_calls
    action.disappear(legacy_push_to_talk)
    assertTrue(usb.muted_state, "disappearance must restore a held microphone")
    assertEqual(#set_calls, set_count + 1)
    action.release(legacy_push_to_talk)
    assertEqual(#set_calls, set_count + 1, "release after disappearance must not restore twice")
    assert_apps_unchanged()
    assertEqual(#scheduled_timers, scheduled_timer_count,
      "push-to-talk must not defer app changes")

    local combined_mode = context("combined-mode", {
      inputDevice = "usb-uid",
      mode = "toggleAndPushToTalk",
      muteMeetingApps = true,
    })
    usb.muted_state = true
    set_count = #set_calls
    action.press(combined_mode)
    local tap_timer = scheduled_timers[#scheduled_timers]
    assertTrue(usb.muted_state, "combined mode must defer a tap until release")
    local sound_count = #combined_mode.sounds
    action.release(combined_mode)
    assertFalse(usb.muted_state, "combined mode must toggle on a short press")
    assertEqual(#combined_mode.sounds, sound_count + 1, "combined mode must play its toggle cue")
    assertSame(combined_mode.sounds[#combined_mode.sounds], action.sound.on)
    assertTrue(tap_timer.stopped, "combined mode must cancel a released hold timer")
    assertEqual(#set_calls, set_count + 1)
    usb.muted_state = true
    action.press(combined_mode)
    local hold_timer = scheduled_timers[#scheduled_timers]
    assertEqual(hold_timer.seconds, 0.5)
    assertTrue(run_with_fake_hs(hold_timer.callback))
    assertFalse(usb.muted_state, "combined mode must unmute while held")
    action.release(combined_mode)
    assertTrue(usb.muted_state, "combined mode must restore mute after a hold")
    action.push(combined_mode)
    assertFalse(usb.muted_state, "combined mode must support push-to-talk from a pedal or dial")
    action.release(combined_mode)
    assertTrue(usb.muted_state, "pedal or dial release must restore mute")
    assert_apps_unchanged()

    failure = "muted-throws"
    assertError(function()
      action.appearance(default_context)
    end, "failed to read microphone mute state")
    failure = "muted-invalid"
    assertError(function()
      action.appearance(default_context)
    end, "expected boolean result")
    failure = "set-throws"
    assertError(function()
      action.press(default_context)
    end, "failed to set microphone mute state")
    failure = "set-invalid"
    assertError(function()
      action.press(default_context)
    end, "expected true result")
    failure = nil
    local missing_context = context("missing", { inputDevice = "missing-uid" })
    assertError(function()
      action.appearance(missing_context)
    end, "selected input device unavailable")
  end)

  test("microphone reports no-device state and errors on press", function()
    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/microphone.lua", {
      audiodevice = {
        allInputDevices = function()
          return {}
        end,
        defaultInputDevice = function()
          return nil
        end,
      },
    })
    local action = streamdeck.registrations[1]
    local no_device_schema = action.settingsSchemaProvider()
    assertEqual(no_device_schema[1].options[1].label, "Default input — No input device")
    local no_device_context = context("no-device")
    local appearance = action.appearance(no_device_context)
    assertEqual(appearance.title, "No mic")
    assertEqual(appearance.state, "inactive")
    assertError(function()
      action.press(no_device_context)
    end, "no input device available")
    assertEqual(#streamdeck.refreshes, 0, "no device must not refresh")
  end)

  test("microphone keeps a bounded fallback schema when discovery fails", function()
    local function assert_unavailable(fake_hs, expected_appearance_error, expected_press_error)
      local streamdeck = load_fixture("hammerspoon/streamdeck/actions/microphone.lua", fake_hs)
      assertEqual(#streamdeck.registrations, 1, "microphone must register after discovery failure")
      local action = streamdeck.registrations[1]
      local options = action.settingsSchemaProvider()[1].options
      assertEqual(#options, 1, "discovery fallback must contain only the synthetic default")
      assertEqual(options[1].value, "default")
      assertEqual(options[1].label, "Default input — unavailable")
      local unavailable_context = context("unavailable")
      assertError(function()
        action.appearance(unavailable_context)
      end, expected_appearance_error)
      assertError(function()
        action.press(unavailable_context)
      end, expected_press_error)
    end

    assert_unavailable({}, "audio input API unavailable", "audio input API unavailable")

    assert_unavailable({
      audiodevice = {
        allInputDevices = function()
          error("allInputDevices exploded")
        end,
        defaultInputDevice = function()
          error("defaultInputDevice exploded")
        end,
      },
    }, "failed to find default input device", "failed to find default input device")

    local malformed_device = {
      name = function()
        return nil
      end,
      uid = function()
        return "malformed-uid"
      end,
    }
    assert_unavailable({
      audiodevice = {
        allInputDevices = function()
          return { malformed_device }
        end,
        defaultInputDevice = function()
          return malformed_device
        end,
      },
    }, "failed to read microphone device name", "microphone mute API unavailable")
  end)

  test("microphone sorts, deduplicates, and caps specific device choices", function()
    local devices = {}
    local function make_device(index)
      return {
        name = function()
          return string.format("Microphone %02d", index)
        end,
        uid = function()
          return string.format("uid-%02d", index)
        end,
      }
    end

    for index = 64, 1, -1 do
      devices[#devices + 1] = make_device(index)
    end
    devices[#devices + 1] = make_device(1)

    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/microphone.lua", {
      audiodevice = {
        allInputDevices = function()
          return devices
        end,
        defaultInputDevice = function()
          return devices[1]
        end,
      },
    })
    local action = streamdeck.registrations[1]
    local options = action.settingsSchemaProvider()[1].options
    assertEqual(#options, 64, "synthetic default plus specific choices must fit schema-v1 bounds")
    assertEqual(options[1].label, "Default input — Microphone 64")
    assertEqual(options[2].label, "Microphone 01")
    assertEqual(options[63].label, "Microphone 62")
    assertEqual(options[64].label, "Microphone 64")

    local default_count = 0
    local omitted_count = 0
    local duplicate_count = 0
    for index = 2, #options do
      if options[index].value == "uid-64" then
        default_count = default_count + 1
      elseif options[index].value == "uid-63" then
        omitted_count = omitted_count + 1
      elseif options[index].value == "uid-01" then
        duplicate_count = duplicate_count + 1
      end
    end
    assertEqual(default_count, 1, "current default device must remain selectable")
    assertEqual(omitted_count, 0, "the bounded list should omit only after retaining the default")
    assertEqual(duplicate_count, 1, "duplicate device UIDs must be removed")
  end)
end
