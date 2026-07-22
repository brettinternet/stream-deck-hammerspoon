return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("lock screen example exposes a one-shot lock action and protects failures", function()
    local failure = nil
    local calls = 0
    local return_value = nil
    local fake_hs = {
      caffeinate = {
        lockScreen = function()
          calls = calls + 1
          if failure == "throws" then
            error("lock exploded")
          end
          if failure == "false" then
            return false
          end
          if failure == "invalid" then
            return "unknown"
          end
          return return_value
        end,
      },
    }

    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/lock-screen.lua", fake_hs)
    assertEqual(#streamdeck.registrations, 1, "lock screen must register one action")
    assertEqual(streamdeck.starts, 0, "action modules must not start the bridge")
    local action = streamdeck.registrations[1]
    local action_id = "com.brettinternet.hammerspoon.lock-screen"
    assertEqual(action.id, action_id)
    assertEqual(action.name, "Lock screen")

    local key_context = context("lock")
    local appearance = action.appearance(key_context)
    assertEqual(appearance.title, "Lock")
    assertEqual(appearance.state, "inactive")
    assertEqual(calls, 0, "appearance must not lock the screen")

    action.press(key_context)
    assertEqual(calls, 1, "press must invoke lockScreen")
    assertEqual(#streamdeck.refreshes, 1, "catalog must refresh after a successful action")
    assertEqual(key_context.refreshes, 1)

    return_value = true
    action.press(key_context)
    assertEqual(calls, 2, "true is an accepted successful return")
    assertEqual(#streamdeck.refreshes, 2)

    failure = "throws"
    assertError(function()
      action.press(key_context)
    end, "failed to lock screen")
    assertEqual(calls, 3)
    assertEqual(#streamdeck.refreshes, 2, "thrown lock calls must not refresh")

    failure = "false"
    assertError(function()
      action.press(key_context)
    end, "failed to lock screen")
    assertEqual(calls, 4)
    assertEqual(#streamdeck.refreshes, 2, "false lock results must not refresh")

    failure = "invalid"
    assertError(function()
      action.press(key_context)
    end, "expected true or nil result")
    assertEqual(calls, 5)
    assertEqual(#streamdeck.refreshes, 2, "invalid lock results must not refresh")

    local unavailable = load_fixture("hammerspoon/streamdeck/actions/lock-screen.lua", {})
    local unavailable_context = context("unavailable")
    assertError(function()
      unavailable.registrations[1].appearance(unavailable_context)
    end, "lock screen API unavailable")
    assertError(function()
      unavailable.registrations[1].press(unavailable_context)
    end, "lock screen API unavailable")
    assertEqual(#unavailable.refreshes, 0, "unavailable lock API must not refresh")
    assertEqual(unavailable_context.refreshes, 0)
  end)
end
