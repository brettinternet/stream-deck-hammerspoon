return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("microphone selects devices, toggles mute, and delivers meeting shortcuts", function()
    local default_device
    local devices
    local failure
    local set_calls = {}
    local shortcut_calls = {}
    local application_calls = {}
    local applications = {}

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
          if failure == "application-get-throws" then
            error("application.get exploded")
          end
          return applications[bundle_id]
        end,
      },
      eventtap = {
        keyStroke = function(modifiers, key, delay, application)
          if failure == "shortcut-throws" then
            error("keyStroke exploded")
          end
          shortcut_calls[#shortcut_calls + 1] = {
            modifiers = modifiers,
            key = key,
            delay = delay,
            application = application,
          }
        end,
      },
    }

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

    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/microphone.lua", fake_hs)
    assertEqual(#streamdeck.registrations, 1, "microphone must register one action")
    assertEqual(streamdeck.starts, 0, "action modules must not start the bridge")
    local action = streamdeck.registrations[1]
    assertEqual(action.id, "com.brettinternet.hammerspoon.microphone-toggle")
    assertEqual(action.name, "Microphone mute")
    assertTrue(type(action.description) == "string" and action.description ~= "")
    assertEqual(action.settingsSchemaVersion, 1)
    assertEqual(action.settingsSchema[1].type, "select")
    assertEqual(action.settingsSchema[1].options[1].value, "default")
    assertEqual(action.settingsSchema[1].options[1].label, "Default input — MacBook Microphone")
    assertEqual(action.settingsSchema[1].options[2].value, "builtin-uid")
    assertEqual(action.settingsSchema[1].options[2].label, "MacBook Microphone")
    assertEqual(action.settingsSchema[1].options[3].value, "usb-uid")
    assertEqual(action.settingsSchema[1].options[3].label, "USB Microphone")
    assertTrue(type(action.settingsSchema[1].description) == "string")
    assertEqual(action.settingsSchema[2].type, "boolean")
    assertTrue(type(action.settingsSchema[2].description) == "string")

    local default_context = context("default", {})
    local appearance = action.appearance(default_context)
    assertTrue(string.find(appearance.title, "MacBook Microphone", 1, true) ~= nil)
    assertTrue(string.find(appearance.title, "Live", 1, true) ~= nil)
    assertEqual(appearance.state, "inactive")
    assertEqual(appearance.appearanceVersion, 1)
    assertEqual(appearance.icon.mediaType, "image/svg+xml")
    local live_icon = appearance.icon.dataBase64

    action.press(default_context)
    assertEqual(set_calls[1].device, built_in)
    assertTrue(set_calls[1].value)
    assertTrue(built_in.muted_state)
    assertFalse(usb.muted_state)
    appearance = action.appearance(default_context)
    assertTrue(string.find(appearance.title, "Muted", 1, true) ~= nil)
    assertEqual(appearance.state, "active")
    local muted_icon = appearance.icon.dataBase64
    assertTrue(live_icon ~= muted_icon, "live and muted artwork must differ")

    local specific_context = context("specific", { inputDevice = "usb-uid" })
    appearance = action.appearance(specific_context)
    assertTrue(string.find(appearance.title, "USB Microphone", 1, true) ~= nil)
    assertTrue(string.find(appearance.title, "Live", 1, true) ~= nil)
    action.press(specific_context)
    assertEqual(set_calls[2].device, usb)
    assertTrue(usb.muted_state)
    assertTrue(built_in.muted_state)
    appearance = action.appearance(specific_context)
    assertTrue(string.find(appearance.title, "Muted", 1, true) ~= nil)
    assertEqual(appearance.state, "active")

    local meeting_context = context("meeting", { muteMeetingApps = true })
    action.press(meeting_context)
    assertEqual(#shortcut_calls, 3, "one shortcut per running meeting app and no duplicate Teams delivery")
    assertEqual(shortcut_calls[1].key, "a")
    assertEqual(shortcut_calls[1].application, applications["us.zoom.xos"])
    assertEqual(shortcut_calls[2].key, "m")
    assertEqual(shortcut_calls[2].application, applications["com.microsoft.teams2"])
    assertEqual(shortcut_calls[3].key, "space")
    assertEqual(shortcut_calls[3].application, applications["com.tinyspeck.slackmacgap"])
    assertEqual(shortcut_calls[1].delay, 0)
    assertEqual(shortcut_calls[1].modifiers[1], "cmd")
    assertEqual(shortcut_calls[1].modifiers[2], "shift")
    assertEqual(applications["com.microsoft.teams"].bundle_id, "com.microsoft.teams")
    assertEqual(#application_calls, 3, "Zoom, new Teams, and Slack should be checked without focusing them")
    local legacy_teams_queried = false
    for _, bundle_id in ipairs(application_calls) do
      if bundle_id == "com.microsoft.teams" then
        legacy_teams_queried = true
        break
      end
    end
    assertFalse(legacy_teams_queried, "legacy Teams should not be queried when new Teams is available")

    applications["us.zoom.xos"].running = false
    applications["com.microsoft.teams2"].running = false
    applications["com.microsoft.teams"].running = false
    applications["com.tinyspeck.slackmacgap"].running = false
    local shortcut_count = #shortcut_calls
    action.press(meeting_context)
    assertEqual(#shortcut_calls, shortcut_count, "unavailable apps must not receive shortcuts")

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
    failure = "application-get-throws"
    assertError(function()
      action.press(meeting_context)
    end, "failed to find application")
    failure = "shortcut-throws"
    applications["us.zoom.xos"].running = true
    local ok, shortcut_error = pcall(function()
      action.press(meeting_context)
    end)
    assertFalse(ok)
    assertTrue(string.find(tostring(shortcut_error), "failed to send Zoom mute shortcut", 1, true) ~= nil)
    assertTrue(string.find(tostring(shortcut_error), "keyStroke exploded", 1, true) ~= nil)

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
    assertEqual(action.settingsSchema[1].options[1].label, "Default input — No input device")
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
      local options = action.settingsSchema[1].options
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
    local options = action.settingsSchema[1].options
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
