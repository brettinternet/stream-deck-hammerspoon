return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("window snap example covers layouts, lifecycle, and failures", function()
    local focused
    local move_result = true
    local move_calls = {}
    local window = {
      moveToUnit = function(self, unit)
        move_calls[#move_calls + 1] = {
          window = self,
          unit = unit,
        }
        return move_result
      end,
    }
    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/window-snap.lua", {
      window = {
        focusedWindow = function()
          return focused
        end,
      },
    })

    assertEqual(#streamdeck.registrations, 1, "example must register one action")
    local action = streamdeck.registrations[1]
    assertSame(action, streamdeck.registrations[1])
    assertEqual(action.id, "com.brettinternet.hammerspoon.window-snap")
    assertEqual(streamdeck.starts, 0, "action modules must not start the bridge")

    local first = context("first")
    local second = context("second")
    action.appear(first)
    action.appear(second)
    assertEqual(action.appearance(first).title, "No window")
    assertEqual(action.appearance(first).state, "inactive")

    assertError(function()
      action.press(first)
    end, "no focused window")
    assertEqual(first.refreshes, 0, "no-window press must not refresh")

    focused = window
    assertEqual(action.appearance(first).title, "Snap\nwindow")
    assertFalse(action.appearance(first).state == "active", "initial state must be inactive")
    action.press(first)
    assertEqual(first.refreshes, 1)
    assertEqual(#move_calls, 1)
    assertSame(move_calls[1].window, window)
    assertEqual(move_calls[1].unit.x, 0)
    assertEqual(move_calls[1].unit.y, 0)
    assertEqual(move_calls[1].unit.w, 0.5)
    assertEqual(move_calls[1].unit.h, 1)
    assertEqual(action.appearance(first).title, "Left half")
    assertEqual(action.appearance(first).state, "active")

    action.press(second)
    assertEqual(second.refreshes, 1, "second instance must refresh independently")
    assertEqual(#move_calls, 2)
    assertEqual(move_calls[2].unit.x, 0)
    assertEqual(move_calls[2].unit.w, 0.5)
    assertEqual(action.appearance(second).title, "Left half")
    assertEqual(action.appearance(first).title, "Left half", "instances must not share layout state")

    action.press(first)
    assertEqual(first.refreshes, 2)
    assertEqual(#move_calls, 3)
    assertEqual(move_calls[3].unit.x, 0.5)
    assertEqual(move_calls[3].unit.y, 0)
    assertEqual(move_calls[3].unit.w, 0.5)
    assertEqual(move_calls[3].unit.h, 1)
    assertEqual(action.appearance(first).title, "Right half")

    action.press(first)
    assertEqual(first.refreshes, 3)
    assertEqual(#move_calls, 4)
    assertEqual(move_calls[4].unit.x, 0)
    assertEqual(move_calls[4].unit.y, 0)
    assertEqual(move_calls[4].unit.w, 1)
    assertEqual(move_calls[4].unit.h, 1)
    assertEqual(action.appearance(first).title, "Full\nscreen")

    move_result = false
    assertError(function()
      action.press(first)
    end, "failed to move focused window")
    assertEqual(first.refreshes, 3, "failed move must not refresh")
    assertEqual(action.appearance(first).title, "Full\nscreen", "failed move must not advance state")
    assertEqual(#move_calls, 5, "failed move should still call moveToUnit")

    focused = {}
    assertError(function()
      action.press(first)
    end, "window moveToUnit API unavailable")
    assertEqual(first.refreshes, 3, "unavailable move API must not refresh")

    action.disappear(first)
    action.appear(first)
    focused = window
    assertEqual(action.appearance(first).title, "Snap\nwindow", "appear must reset layout state")
    assertEqual(action.appearance(first).state, "inactive")
    assertEqual(action.appearance(second).title, "Left half", "disappear must only reset its instance")
  end)

  test("window snap example reports unavailable focused-window API", function()
    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/window-snap.lua", {
      window = {},
    })
    local action = streamdeck.registrations[1]
    local action_context = context("unavailable-focused-window")

    assertEqual(action.appearance(action_context).title, "Window\nunavailable")
    assertEqual(action.appearance(action_context).state, "inactive")
    assertError(function()
      action.press(action_context)
    end, "focused window API unavailable")
    assertEqual(action_context.refreshes, 0, "unavailable focused-window API must not refresh")
    local no_hs = load_fixture("hammerspoon/streamdeck/actions/window-snap.lua", nil)
    local no_hs_context = context("no-hs")
    assertEqual(no_hs.registrations[1].appearance(no_hs_context).title, "Window\nunavailable")
    assertError(function()
      no_hs.registrations[1].press(no_hs_context)
    end, "focused window API unavailable")
    assertEqual(no_hs_context.refreshes, 0, "missing hs must not refresh")

  end)

end
