return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("keep awake example toggles display idle prevention globally and reports failures", function()
    local display_idle = false
    local failure = nil
    local toggle_calls = {}
    local fake_hs = {
      caffeinate = {
        get = function(idle_type)
          assertEqual(idle_type, "displayIdle")
          if failure == "get" then
            error("get exploded")
          end
          if failure == "get-nonboolean" then
            return "unknown"
          end
          return display_idle
        end,
        toggle = function(idle_type)
          assertEqual(idle_type, "displayIdle")
          toggle_calls[#toggle_calls + 1] = idle_type
          if failure == "toggle" then
            error("toggle exploded")
          end
          if failure == "toggle-nonboolean" then
            return "unknown"
          end
          display_idle = not display_idle
          return display_idle
        end,
      },
    }

    local streamdeck = load_fixture("hammerspoon/examples/keep-awake.lua", fake_hs)
    assertEqual(#streamdeck.registrations, 1, "keep awake must register one action")
    assertEqual(streamdeck.starts, 1, "keep awake must start the bridge")
    local action = streamdeck.registrations[1]
    local action_id = "com.brettinternet.hammerspoon.keep-awake"
    assertEqual(action.id, action_id)
    assertEqual(action.name, "Keep awake")
    local first_context = context("first")
    local second_context = context("second")
    local appearance = action.appearance(first_context)
    assertEqual(appearance.title, "Allow sleep")
    assertEqual(appearance.state, "inactive")
    assertEqual(appearance.icon, nil, "Stream Deck must own the toggle state icons")
    assertEqual(appearance.appearanceVersion, nil)
    action.press(first_context)
    assertEqual(toggle_calls[1], "displayIdle")
    assertTrue(display_idle, "first toggle must prevent display idle sleep")
    assertEqual(#streamdeck.refreshes, 1, "successful toggle must refresh globally")
    assertSame(streamdeck.refreshes[1], action_id)
    assertEqual(first_context.refreshes, 0, "global refresh must not refresh only the pressed context")
    assertEqual(second_context.refreshes, 0, "global refresh must not refresh only the pressed context")

    appearance = action.appearance(first_context)
    assertEqual(appearance.title, "Awake")
    assertEqual(appearance.state, "active")
    assertEqual(appearance.icon, nil, "Stream Deck must own the toggle state icons")


    action.press(second_context)
    assertEqual(toggle_calls[2], "displayIdle")
    assertFalse(display_idle, "second toggle must allow display idle sleep")
    assertEqual(#streamdeck.refreshes, 2, "both successful toggles must refresh globally")
    assertSame(streamdeck.refreshes[2], action_id)
    assertEqual(first_context.refreshes, 0)
    assertEqual(second_context.refreshes, 0)
    appearance = action.appearance(first_context)
    assertEqual(appearance.title, "Allow sleep")
    assertEqual(appearance.state, "inactive")

    failure = "get"
    assertError(function()
      action.appearance(first_context)
    end, "failed to read display idle state")
    assertEqual(#streamdeck.refreshes, 2, "failed state reads must not refresh")

    failure = "get-nonboolean"
    assertError(function()
      action.appearance(first_context)
    end, "expected boolean result")
    assertEqual(#streamdeck.refreshes, 2, "invalid state reads must not refresh")

    failure = "toggle"
    assertError(function()
      action.press(first_context)
    end, "failed to toggle display idle prevention")
    assertEqual(#streamdeck.refreshes, 2, "thrown toggle calls must not refresh")

    failure = "toggle-nonboolean"
    assertError(function()
      action.press(second_context)
    end, "expected boolean result")
    assertEqual(#streamdeck.refreshes, 2, "invalid toggle results must not refresh")

    local unavailable = load_fixture("hammerspoon/examples/keep-awake.lua", {})
    local unavailable_context = context("unavailable")
    assertError(function()
      unavailable.registrations[1].appearance(unavailable_context)
    end, "display idle caffeinate API unavailable")
    assertError(function()
      unavailable.registrations[1].press(unavailable_context)
    end, "display idle caffeinate API unavailable")
    assertEqual(#unavailable.refreshes, 0, "unavailable API must not refresh")
    assertEqual(unavailable_context.refreshes, 0, "unavailable API must not refresh context")
  end)
end
