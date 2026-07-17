return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("window center example centers without changing size and refreshes after success", function()
    local focused
    local set_result = true
    local set_calls = {}
    local original_frame = { x = 100, y = 80, w = 400, h = 300, tagged = "preserved" }
    local work_area = { x = 20, y = 40, w = 1200, h = 800 }
    local screen = {
      frame = function(self)
        return work_area
      end,
    }
    local window = {
      screen = function(self)
        return screen
      end,
      frame = function(self)
        return original_frame
      end,
      setFrame = function(self, frame)
        set_calls[#set_calls + 1] = frame
        return set_result
      end,
    }
    local streamdeck = load_fixture("hammerspoon/examples/window-center.lua", {
      window = {
        focusedWindow = function()
          return focused
        end,
      },
    })

    assertEqual(#streamdeck.registrations, 1, "example must register one action")
    local action = streamdeck.registrations[1]
    assertSame(action, streamdeck.registrations[1])
    assertEqual(action.id, "com.brettinternet.hammerspoon.window-center")
    assertEqual(action.name, "Center window")
    assertEqual(streamdeck.starts, 1, "example must start the bridge exactly once")

    local action_context = context("center")
    local appearance = action.appearance(action_context)
    assertEqual(appearance.title, "No window")
    assertEqual(appearance.state, "inactive")
    assertError(function()
      action.press(action_context)
    end, "no focused window")
    assertEqual(action_context.refreshes, 0, "no-window press must not refresh")

    focused = window
    appearance = action.appearance(action_context)
    assertEqual(appearance.title, "Center")
    assertEqual(appearance.state, "active")

    action.press(action_context)
    assertEqual(action_context.refreshes, 1, "successful centering must refresh")
    assertEqual(#set_calls, 1)
    assertFalse(set_calls[1] == original_frame, "centering must pass a copied frame")
    assertEqual(set_calls[1].x, 420)
    assertEqual(set_calls[1].y, 290)
    assertEqual(set_calls[1].w, 400, "centering must preserve window width")
    assertEqual(set_calls[1].h, 300, "centering must preserve window height")
    assertEqual(set_calls[1].tagged, "preserved", "centering must preserve frame fields")
    assertEqual(original_frame.x, 100, "centering must not mutate the API-owned frame")
    assertEqual(original_frame.y, 80, "centering must not mutate the API-owned frame")
    assertEqual(original_frame.w, 400)
    assertEqual(original_frame.h, 300)

    set_result = false
    assertError(function()
      action.press(action_context)
    end, "failed to set focused window frame")
    assertEqual(action_context.refreshes, 1, "failed centering must not refresh")
    assertEqual(#set_calls, 2, "failed centering must still attempt setFrame")
  end)

  test("window center example reports missing window APIs and frame data", function()
    local focused
    local streamdeck = load_fixture("hammerspoon/examples/window-center.lua", {
      window = {
        focusedWindow = function()
          return focused
        end,
      },
    })
    local action = streamdeck.registrations[1]
    local action_context = context("missing")

    focused = { }
    assertError(function()
      action.press(action_context)
    end, "window screen API unavailable")
    assertEqual(action_context.refreshes, 0)

    focused = {
      screen = function(self)
        return nil
      end,
    }
    assertError(function()
      action.press(action_context)
    end, "focused window has no screen")
    assertEqual(action_context.refreshes, 0)

    focused = {
      screen = function(self)
        return { }
      end,
    }
    assertError(function()
      action.press(action_context)
    end, "screen frame API unavailable")
    assertEqual(action_context.refreshes, 0)

    focused = {
      screen = function(self)
        return {
          frame = function(self)
            return { x = 0, y = 0, w = 1000, h = 700 }
          end,
        }
      end,
    }
    assertError(function()
      action.press(action_context)
    end, "window frame API unavailable")
    assertEqual(action_context.refreshes, 0)

    focused = {
      screen = function(self)
        return {
          frame = function(self)
            return { x = 0, y = 0, w = 1000, h = 700 }
          end,
        }
      end,
      frame = function(self)
        return nil
      end,
    }
    assertError(function()
      action.press(action_context)
    end, "failed to read window frame")
    assertEqual(action_context.refreshes, 0)
 
    focused = {
      screen = function(self)
        return {
          frame = function(self)
            return { x = 0, y = 0, w = 1000, h = 700 }
          end,
        }
      end,
      frame = function(self)
        return { x = 100, y = 100, w = 400, h = 300 }
      end,
    }
    assertError(function()
      action.press(action_context)
    end, "window setFrame API unavailable")
    assertEqual(action_context.refreshes, 0)
  end)

  test("window center example protects failed Hammerspoon calls and unavailable focused-window APIs", function()
    local focused = {}
    local failure = "screen exploded"
    local streamdeck = load_fixture("hammerspoon/examples/window-center.lua", {
      window = {
        focusedWindow = function()
          error("focused window exploded")
        end,
      },
    })
    local action = streamdeck.registrations[1]
    local action_context = context("failed-call")

    assertError(function()
      action.appearance(action_context)
    end, "failed to get focused window")
    assertError(function()
      action.press(action_context)
    end, "failed to get focused window")
    assertEqual(action_context.refreshes, 0)

    streamdeck = load_fixture("hammerspoon/examples/window-center.lua", {
      window = {
        focusedWindow = function()
          return focused
        end,
      },
    })
    action = streamdeck.registrations[1]
    action_context = context("failed-screen")
    focused.screen = function(self)
      error(failure)
    end
    assertError(function()
      action.press(action_context)
    end, "failed to get focused window screen")
    assertEqual(action_context.refreshes, 0)

    focused.screen = function(self)
      return {
        frame = function(self)
          error("screen frame exploded")
        end,
      }
    end
    assertError(function()
      action.press(action_context)
    end, "failed to read screen frame")
    assertEqual(action_context.refreshes, 0)

    focused.screen = function(self)
      return {
        frame = function(self)
          return { x = 0, y = 0, w = 1000, h = 700 }
        end,
      }
    end
    focused.frame = function(self)
      error("window frame exploded")
    end
    assertError(function()
      action.press(action_context)
    end, "failed to read focused window frame")
    assertEqual(action_context.refreshes, 0)

    focused.frame = function(self)
      return { x = 100, y = 100, w = 400, h = 300 }
    end
    focused.setFrame = function(self, frame)
      error("setFrame exploded")
    end
    assertError(function()
      action.press(action_context)
    end, "failed to set focused window frame")
    assertEqual(action_context.refreshes, 0)

    local unavailable = load_fixture("hammerspoon/examples/window-center.lua", {})
    local unavailable_action = unavailable.registrations[1]
    local unavailable_context = context("unavailable-focused-window")
    assertError(function()
      unavailable_action.appearance(unavailable_context)
    end, "focused window API unavailable")
    assertError(function()
      unavailable_action.press(unavailable_context)
    end, "focused window API unavailable")
    assertEqual(unavailable_context.refreshes, 0, "unavailable API must not refresh")

    local no_hs = load_fixture("hammerspoon/examples/window-center.lua", nil)
    local no_hs_action = no_hs.registrations[1]
    local no_hs_context = context("no-hs")
    assertError(function()
      no_hs_action.press(no_hs_context)
    end, "focused window API unavailable")
    assertEqual(no_hs_context.refreshes, 0, "missing hs must not refresh")
  end)
end
