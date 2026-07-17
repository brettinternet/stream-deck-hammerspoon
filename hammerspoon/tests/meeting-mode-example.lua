return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("meeting mode keeps microphone and display idle prevention coherent globally", function()
    local microphone_muted = false
    local display_idle = false
    local failure = nil
    local set_calls = {}
    local toggle_calls = {}

    local microphone = {}
    function microphone:muted()
      if failure == "muted-throws" then
        error("muted exploded")
      end
      if failure == "muted-invalid" then
        return "unknown"
      end
      return microphone_muted
    end
    function microphone:setMuted(desired)
      set_calls[#set_calls + 1] = desired
      if failure == "set-throws" then
        error("setMuted exploded")
      end
      if failure == "set-invalid" then
        return false
      end
      if failure == "set-nonboolean" then
        return "unknown"
      end
      microphone_muted = desired
      return true
    end

    local fake_hs = {
      audiodevice = {
        defaultInputDevice = function()
          return microphone
        end,
      },
      caffeinate = {
        get = function(idle_type)
          assertEqual(idle_type, "displayIdle")
          if failure == "get-throws" then
            error("get exploded")
          end
          if failure == "get-invalid" then
            return "unknown"
          end
          return display_idle
        end,
        toggle = function(idle_type)
          assertEqual(idle_type, "displayIdle")
          toggle_calls[#toggle_calls + 1] = idle_type
          if failure == "toggle-throws" then
            error("toggle exploded")
          end
          if failure == "toggle-invalid" then
            return "unknown"
          end
          if failure == "toggle-wrong-state" then
            display_idle = not display_idle
            return not display_idle
          end
          display_idle = not display_idle
          return display_idle
        end,
      },
    }

    local streamdeck = load_fixture("hammerspoon/examples/meeting-mode.lua", fake_hs)
    assertEqual(#streamdeck.registrations, 1, "meeting mode must register one action")
    assertEqual(streamdeck.starts, 1, "meeting mode must start the bridge once")
    local action = streamdeck.registrations[1]
    local action_id = "com.brettinternet.hammerspoon.meeting-mode"
    assertEqual(action.id, action_id)
    assertEqual(action.name, "Meeting mode")

    local first_context = context("first")
    local second_context = context("second")
    local appearance = action.appearance(first_context)
    assertEqual(appearance.title, "Normal")
    assertEqual(appearance.state, "inactive")
    appearance = action.appearance(second_context)
    assertEqual(appearance.title, "Normal")
    assertEqual(appearance.state, "inactive")

    action.press(first_context)
    assertTrue(microphone_muted, "meeting mode must mute the microphone")
    assertTrue(display_idle, "meeting mode must prevent display idle sleep")
    assertEqual(set_calls[1], true)
    assertEqual(toggle_calls[1], "displayIdle")
    assertEqual(#streamdeck.refreshes, 1, "successful mode changes refresh globally")
    assertSame(streamdeck.refreshes[1], action_id)
    assertEqual(first_context.refreshes, 0, "global refresh must not refresh only the pressed context")
    assertEqual(second_context.refreshes, 0, "global refresh must reach all visible instances")

    appearance = action.appearance(first_context)
    assertEqual(appearance.title, "Meeting")
    assertEqual(appearance.state, "active")
    appearance = action.appearance(second_context)
    assertEqual(appearance.title, "Meeting")
    assertEqual(appearance.state, "active")

    action.press(second_context)
    assertFalse(microphone_muted, "second press must unmute the microphone")
    assertFalse(display_idle, "second press must allow display idle sleep")
    assertEqual(set_calls[2], false)
    assertEqual(toggle_calls[2], "displayIdle")
    assertEqual(#streamdeck.refreshes, 2)
    assertSame(streamdeck.refreshes[2], action_id)
    appearance = action.appearance(first_context)
    assertEqual(appearance.title, "Normal")
    assertEqual(appearance.state, "inactive")

    -- A partially changed pair must converge on one desired global mode, rather
    -- than independently inverting both APIs into another mismatch.
    microphone_muted = false
    display_idle = true
    local toggles_before_reconcile = #toggle_calls
    action.press(first_context)
    assertTrue(microphone_muted, "reconciliation must request the desired mute state")
    assertTrue(display_idle, "reconciliation must preserve an already desired idle state")
    assertEqual(#toggle_calls, toggles_before_reconcile, "reconciliation must not toggle an already desired state")
    assertEqual(#streamdeck.refreshes, 3)
    appearance = action.appearance(second_context)
    assertEqual(appearance.title, "Meeting")
    assertEqual(appearance.state, "active")

    microphone_muted = true
    display_idle = false
    toggles_before_reconcile = #toggle_calls
    action.press(second_context)
    assertTrue(microphone_muted)
    assertTrue(display_idle, "reconciliation must enable display idle prevention")
    assertEqual(#toggle_calls, toggles_before_reconcile + 1)
    assertEqual(#streamdeck.refreshes, 4)
    assertEqual(streamdeck.refreshes[4], action_id)

    failure = "muted-throws"
    assertError(function()
      action.appearance(first_context)
    end, "failed to read microphone mute state")
    assertEqual(#streamdeck.refreshes, 4)

    failure = "muted-invalid"
    assertError(function()
      action.appearance(first_context)
    end, "expected boolean result")
    assertEqual(#streamdeck.refreshes, 4)

    failure = "get-throws"
    assertError(function()
      action.appearance(first_context)
    end, "failed to read display idle state")
    assertEqual(#streamdeck.refreshes, 4)

    failure = "get-invalid"
    assertError(function()
      action.appearance(first_context)
    end, "expected boolean result")
    assertEqual(#streamdeck.refreshes, 4)

    failure = "set-throws"
    assertError(function()
      action.press(first_context)
    end, "failed to set microphone mute state")
    assertEqual(#streamdeck.refreshes, 4)

    failure = "set-invalid"
    assertError(function()
      action.press(first_context)
    end, "failed to set microphone mute state")
    assertEqual(#streamdeck.refreshes, 4)

    failure = "set-nonboolean"
    assertError(function()
      action.press(first_context)
    end, "expected true result")
    assertEqual(#streamdeck.refreshes, 4)

    microphone_muted = true
    display_idle = true
    failure = "toggle-throws"
    assertError(function()
      action.press(first_context)
    end, "failed to toggle display idle prevention")
    assertEqual(#streamdeck.refreshes, 4)

    microphone_muted = true
    display_idle = true
    failure = "toggle-invalid"
    assertError(function()
      action.press(first_context)
    end, "expected boolean result")
    assertEqual(#streamdeck.refreshes, 4)

    microphone_muted = true
    display_idle = true
    failure = "toggle-wrong-state"
    assertError(function()
      action.press(first_context)
    end, "unexpected state result")
    assertEqual(#streamdeck.refreshes, 4)

    local no_device = load_fixture("hammerspoon/examples/meeting-mode.lua", {
      audiodevice = {
        defaultInputDevice = function()
          return nil
        end,
      },
      caffeinate = fake_hs.caffeinate,
    })
    local no_device_context = context("no-device")
    appearance = no_device.registrations[1].appearance(no_device_context)
    assertEqual(appearance.title, "No mic")
    assertEqual(appearance.state, "inactive")
    assertError(function()
      no_device.registrations[1].press(no_device_context)
    end, "no default input device")
    assertEqual(#no_device.refreshes, 0, "no device must not refresh")

    local unavailable_audio = load_fixture("hammerspoon/examples/meeting-mode.lua", {})
    local unavailable_context = context("unavailable")
    assertError(function()
      unavailable_audio.registrations[1].appearance(unavailable_context)
    end, "audio input API unavailable")
    assertError(function()
      unavailable_audio.registrations[1].press(unavailable_context)
    end, "audio input API unavailable")
    assertEqual(#unavailable_audio.refreshes, 0)

    local unavailable_display = load_fixture("hammerspoon/examples/meeting-mode.lua", {
      audiodevice = {
        defaultInputDevice = function()
          return microphone
        end,
      },
    })
    assertError(function()
      unavailable_display.registrations[1].appearance(unavailable_context)
    end, "display idle caffeinate API unavailable")
    assertError(function()
      unavailable_display.registrations[1].press(unavailable_context)
    end, "display idle caffeinate API unavailable")
    assertEqual(#unavailable_display.refreshes, 0)
  end)
end
