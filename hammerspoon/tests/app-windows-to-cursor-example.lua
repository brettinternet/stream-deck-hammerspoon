return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("app windows-to-cursor moves every frontmost-app window to the cursor display", function()
    local frontmost
    local cursor_screen = {}
    local first_moves = {}
    local second_moves = {}
    local move_result = true

    local first_window = {
      moveToScreen = function(_, screen, no_resize, ensure_in_bounds)
        first_moves[#first_moves + 1] = {
          screen = screen,
          noResize = no_resize,
          ensureInBounds = ensure_in_bounds,
        }
        return move_result
      end,
    }
    local second_window = {
      moveToScreen = function(_, screen, no_resize, ensure_in_bounds)
        second_moves[#second_moves + 1] = {
          screen = screen,
          noResize = no_resize,
          ensureInBounds = ensure_in_bounds,
        }
        return move_result
      end,
    }
    local application = {
      allWindows = function()
        return { first_window, second_window }
      end,
    }

    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/app-windows-to-cursor.lua", {
      application = {
        frontmostApplication = function()
          return frontmost
        end,
      },
      mouse = {
        getCurrentScreen = function()
          return cursor_screen
        end,
      },
    })
    assertEqual(#streamdeck.registrations, 1, "example must register one action")
    assertEqual(streamdeck.starts, 0, "action modules must not start the bridge")
    local action = streamdeck.registrations[1]
    assertEqual(action.id, "com.brettinternet.hammerspoon.app-windows-to-cursor")
    assertEqual(action.name, "Move app windows to cursor")

    local action_context = context("app-windows-to-cursor")
    local appearance = action.appearance(action_context)
    assertEqual(appearance.title, "No app")
    assertEqual(appearance.state, "inactive")
    assertError(function()
      action.press(action_context)
    end, "no frontmost application")
    assertEqual(action_context.refreshes, 0)

    frontmost = application
    appearance = action.appearance(action_context)
    assertEqual(appearance.title, "Move app\nto cursor")
    assertEqual(appearance.state, "active")

    action.press(action_context)
    assertEqual(#first_moves, 1)
    assertEqual(#second_moves, 1)
    assertSame(first_moves[1].screen, cursor_screen)
    assertSame(second_moves[1].screen, cursor_screen)
    assertFalse(first_moves[1].noResize, "moves must preserve relative rather than absolute size")
    assertTrue(first_moves[1].ensureInBounds, "moves must keep windows inside the destination display")
    assertEqual(action_context.refreshes, 1)

    move_result = false
    assertError(function()
      action.press(action_context)
    end, "failed to move app window")
    assertEqual(action_context.refreshes, 1, "failed moves must not refresh")
  end)

  test("app windows-to-cursor reports unavailable and failed Hammerspoon APIs", function()
    local unavailable = load_fixture("hammerspoon/streamdeck/actions/app-windows-to-cursor.lua", {})
    local unavailable_context = context("unavailable-app-windows")
    assertError(function()
      unavailable.registrations[1].appearance(unavailable_context)
    end, "frontmost application API unavailable")

    local missing_windows = load_fixture("hammerspoon/streamdeck/actions/app-windows-to-cursor.lua", {
      application = {
        frontmostApplication = function()
          return {}
        end,
      },
      mouse = {
        getCurrentScreen = function()
          return {}
        end,
      },
    })
    assertError(function()
      missing_windows.registrations[1].press(context("missing-windows"))
    end, "application windows API unavailable")

    local no_windows = load_fixture("hammerspoon/streamdeck/actions/app-windows-to-cursor.lua", {
      application = {
        frontmostApplication = function()
          return {
            allWindows = function()
              return {}
            end,
          }
        end,
      },
      mouse = {
        getCurrentScreen = function()
          return {}
        end,
      },
    })
    assertError(function()
      no_windows.registrations[1].press(context("no-windows"))
    end, "frontmost application has no windows")

    local missing_cursor = load_fixture("hammerspoon/streamdeck/actions/app-windows-to-cursor.lua", {
      application = {
        frontmostApplication = function()
          return {
            allWindows = function()
              return { {} }
            end,
          }
        end,
      },
    })
    assertError(function()
      missing_cursor.registrations[1].press(context("missing-cursor"))
    end, "cursor screen API unavailable")
  end)
end
