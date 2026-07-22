return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("clipboard stash example isolates stashes and protects clipboard failures", function()
    local clipboard
    local get_failure
    local set_failure
    local set_result = true
    local get_calls = 0
    local set_calls = 0

    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/clipboard-stash.lua", {
      pasteboard = {
        getContents = function()
          get_calls = get_calls + 1
          if get_failure then
            error(get_failure)
          end
          return clipboard
        end,
        setContents = function(value)
          set_calls = set_calls + 1
          if set_failure then
            error(set_failure)
          end
          if set_result then
            clipboard = value
          end
          return set_result
        end,
      },
    })

    assertEqual(#streamdeck.registrations, 1, "clipboard stash must register one action")
    assertEqual(streamdeck.starts, 0, "action modules must not start the bridge")
    local action = streamdeck.registrations[1]
    local action_id = "com.brettinternet.hammerspoon.clipboard-stash"
    assertEqual(action.id, action_id)
    assertEqual(action.name, "Clipboard stash")

    local first = context("first")
    local second = context("second")
    action.appear(first)
    action.appear(second)

    local appearance = action.appearance(first)
    assertEqual(appearance.title, "Empty")
    assertEqual(appearance.state, "inactive")
    appearance = action.appearance(second)
    assertEqual(appearance.title, "Empty")
    assertEqual(appearance.state, "inactive")

    clipboard = "first stash"
    action.press(first)
    assertEqual(get_calls, 1, "first press must read the clipboard")
    assertEqual(set_calls, 0, "capture must not write the clipboard")
    assertEqual(first.refreshes, 1, "successful capture must refresh once")
    appearance = action.appearance(first)
    assertEqual(appearance.title, "Stashed")
    assertEqual(appearance.state, "active")
    appearance = action.appearance(second)
    assertEqual(appearance.title, "Empty")
    assertEqual(appearance.state, "inactive", "first stash must not leak to second instance")

    clipboard = "outside value"
    action.press(first)
    assertEqual(clipboard, "first stash", "restore must write the stashed value")
    assertEqual(set_calls, 1)
    assertEqual(first.refreshes, 2, "successful restore must refresh once")
    appearance = action.appearance(first)
    assertEqual(appearance.title, "Empty")
    assertEqual(appearance.state, "inactive")

    clipboard = "first instance"
    action.press(first)
    clipboard = "second instance"
    action.press(second)
    assertEqual(first.refreshes, 3)
    assertEqual(second.refreshes, 1)
    assertEqual(action.appearance(first).title, "Stashed")
    assertEqual(action.appearance(second).title, "Stashed")

    clipboard = "outside value"
    action.press(first)
    assertEqual(clipboard, "first instance", "first instance must restore its own stash")
    assertEqual(action.appearance(first).title, "Empty")
    assertEqual(action.appearance(second).title, "Stashed", "second stash must survive first restore")
    action.press(second)
    assertEqual(clipboard, "second instance", "second instance must restore its own stash")
    assertEqual(action.appearance(second).title, "Empty")

    clipboard = "reset stash"
    action.press(first)
    assertEqual(action.appearance(first).title, "Stashed")
    action.disappear(first)
    action.appear(first)
    appearance = action.appearance(first)
    assertEqual(appearance.title, "Empty", "reappearing instance must start empty")
    assertEqual(appearance.state, "inactive")

    local refreshes_before_failed_capture = first.refreshes
    clipboard = nil
    assertError(function()
      action.press(first)
    end, "no clipboard text")
    assertEqual(first.refreshes, refreshes_before_failed_capture, "empty capture must not refresh")
    assertEqual(action.appearance(first).title, "Empty", "failed capture must not create a stash")
    clipboard = 42
    assertError(function()
      action.press(first)
    end, "no clipboard text")
    assertEqual(first.refreshes, refreshes_before_failed_capture, "non-string capture must not refresh")
    assertEqual(action.appearance(first).title, "Empty", "non-string capture must not create a stash")

    clipboard = ""
    assertError(function()
      action.press(first)
    end, "no clipboard text")
    assertEqual(first.refreshes, refreshes_before_failed_capture, "empty-string capture must not refresh")
    assertEqual(action.appearance(first).title, "Empty", "empty-string capture must not create a stash")

    get_failure = "pasteboard read failed"
    assertError(function()
      action.press(first)
    end, "failed to read clipboard")
    assertEqual(first.refreshes, refreshes_before_failed_capture, "thrown capture must not refresh")
    assertEqual(action.appearance(first).title, "Empty", "thrown capture must not create a stash")
    get_failure = nil

    clipboard = "write stash"
    action.press(first)
    local refreshes_before_failed_write = first.refreshes
    local clipboard_before_failed_write = clipboard
    set_failure = "pasteboard write failed"
    assertError(function()
      action.press(first)
    end, "failed to update clipboard")
    assertEqual(first.refreshes, refreshes_before_failed_write, "thrown write must not refresh")
    assertEqual(clipboard, clipboard_before_failed_write, "thrown write must not alter clipboard")
    assertEqual(action.appearance(first).title, "Stashed", "thrown write must preserve stash")
    set_failure = nil

    set_result = false
    assertError(function()
      action.press(first)
    end, "failed to update clipboard")
    assertEqual(first.refreshes, refreshes_before_failed_write, "false write must not refresh")
    assertEqual(action.appearance(first).title, "Stashed", "false write must preserve stash")
    set_result = true
    action.press(first)
    assertEqual(first.refreshes, refreshes_before_failed_write + 1)
    assertEqual(action.appearance(first).title, "Empty")

    local unavailable = load_fixture("hammerspoon/streamdeck/actions/clipboard-stash.lua", {})
    assertEqual(unavailable.starts, 0)
    local unavailable_action = unavailable.registrations[1]
    local unavailable_context = context("unavailable")
    unavailable_action.appear(unavailable_context)
    assertEqual(unavailable_action.appearance(unavailable_context).title, "Empty")
    assertError(function()
      unavailable_action.press(unavailable_context)
    end, "clipboard unavailable")
    assertEqual(unavailable_context.refreshes, 0, "unavailable clipboard must not refresh")
    assertEqual(#unavailable.refreshes, 0, "unavailable clipboard must not globally refresh")

    local invalid_set = load_fixture("hammerspoon/streamdeck/actions/clipboard-stash.lua", {
      pasteboard = {
        getContents = function()
          return "invalid set stash"
        end,
      },
    })
    local invalid_set_action = invalid_set.registrations[1]
    local invalid_set_context = context("invalid-set")
    invalid_set_action.appear(invalid_set_context)
    invalid_set_action.press(invalid_set_context)
    assertEqual(invalid_set_context.refreshes, 1)
    assertError(function()
      invalid_set_action.press(invalid_set_context)
    end, "clipboard unavailable")
    assertEqual(invalid_set_context.refreshes, 1, "missing write API must not refresh")
    assertEqual(invalid_set_action.appearance(invalid_set_context).title, "Stashed")
  end)
end
