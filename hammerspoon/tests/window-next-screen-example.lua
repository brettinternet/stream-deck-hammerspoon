return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("window next-screen example moves to the next display and handles single-display setups", function()
    local focused
    local destination
    local move_result = true
    local move_calls = {}
    local primary = {}
    local secondary = {}

    function primary:next()
      return destination
    end

    local window = {
      screen = function(self)
        return primary
      end,
      moveToScreen = function(self, screen, no_resize, ensure_in_bounds)
        move_calls[#move_calls + 1] = {
          screen = screen,
          noResize = no_resize,
          ensureInBounds = ensure_in_bounds,
        }
        return move_result
      end,
    }

    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/window-next-screen.lua", {
      window = {
        focusedWindow = function()
          return focused
        end,
      },
    })
    assertEqual(#streamdeck.registrations, 1, "example must register one action")
    assertEqual(streamdeck.starts, 0, "action modules must not start the bridge")
    local action = streamdeck.registrations[1]
    assertEqual(action.id, "com.brettinternet.hammerspoon.window-next-screen")
    assertEqual(action.name, "Move window to next screen")

    local action_context = context("next-screen")
    local appearance = action.appearance(action_context)
    assertEqual(appearance.title, "No window")
    assertEqual(appearance.state, "inactive")
    assertError(function()
      action.press(action_context)
    end, "no focused window")
    assertEqual(action_context.refreshes, 0)

    focused = window
    destination = primary
    appearance = action.appearance(action_context)
    assertEqual(appearance.title, "One\ndisplay")
    assertError(function()
      action.press(action_context)
    end, "no other screen")
    assertEqual(action_context.refreshes, 0)

    destination = secondary
    appearance = action.appearance(action_context)
    assertEqual(appearance.title, "Next\ndisplay")
    assertEqual(appearance.state, "inactive")

    action.press(action_context)
    assertEqual(#move_calls, 1)
    assertSame(move_calls[1].screen, secondary)
    assertFalse(move_calls[1].noResize, "move must preserve relative rather than absolute size")
    assertTrue(move_calls[1].ensureInBounds, "move must keep the window inside the destination display")
    assertEqual(action_context.refreshes, 1)

    move_result = false
    assertError(function()
      action.press(action_context)
    end, "failed to move focused window")
    assertEqual(action_context.refreshes, 1, "failed moves must not refresh")
  end)

  test("window next-screen example reports unavailable and failed Hammerspoon APIs", function()
    local unavailable = load_fixture("hammerspoon/streamdeck/actions/window-next-screen.lua", {})
    local action = unavailable.registrations[1]
    local action_context = context("unavailable")
    assertError(function()
      action.appearance(action_context)
    end, "focused window API unavailable")
    assertError(function()
      action.press(action_context)
    end, "focused window API unavailable")

    local focused = {
      screen = function(self)
        error("screen exploded")
      end,
    }
    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/window-next-screen.lua", {
      window = {
        focusedWindow = function()
          return focused
        end,
      },
    })
    action = streamdeck.registrations[1]
    assertError(function()
      action.press(action_context)
    end, "failed to get focused window screen")

    focused.screen = function(self)
      return {
        next = function()
          error("next exploded")
        end,
      }
    end
    assertError(function()
      action.press(action_context)
    end, "failed to get next screen")

    local destination = {}
    focused.screen = function(self)
      return {
        next = function()
          return destination
        end,
      }
    end
    assertError(function()
      action.press(action_context)
    end, "window moveToScreen API unavailable")
    assertEqual(action_context.refreshes, 0)
  end)
end
