return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("keyboard layout example toggles configured layouts and reports failures", function()
    local current = "U.S."
    local set_result = true
    local set_calls = {}
    local fake_hs = {
      keycodes = {
        currentLayout = function()
          return current
        end,
        setLayout = function(layout)
          set_calls[#set_calls + 1] = layout
          if set_result then
            current = layout
          end
          return set_result
        end,
      },
    }

    local streamdeck = load_fixture("hammerspoon/examples/keyboard-layout.lua", fake_hs)
    assertEqual(#streamdeck.registrations, 1, "keyboard layout must register one action")
    assertEqual(streamdeck.starts, 1, "keyboard layout must start the bridge")
    local action = streamdeck.registrations[1]
    assertEqual(action.id, "com.brettinternet.hammerspoon.keyboard-layout")
    assertEqual(#action.settingsSchema, 2)
    assertEqual(action.settingsSchema[1].key, "firstLayout")
    assertEqual(action.settingsSchema[2].key, "secondLayout")

    local layout_context = context("keyboard", {
      firstLayout = "U.S.",
      secondLayout = "Dvorak",
    })
    local appearance = action.appearance(layout_context)
    assertEqual(appearance.title, "U.S.")
    assertEqual(appearance.state, "inactive")

    action.press(layout_context)
    assertEqual(set_calls[1], "Dvorak")
    assertEqual(current, "Dvorak")
    assertEqual(layout_context.refreshes, 1, "successful layout switch must refresh")
    appearance = action.appearance(layout_context)
    assertEqual(appearance.title, "Dvorak")
    assertEqual(appearance.state, "active")

    set_result = false
    assertError(function()
      action.press(layout_context)
    end, "failed to switch keyboard layout")
    assertEqual(set_calls[2], "U.S.")
    assertEqual(layout_context.refreshes, 1, "failed layout switch must not refresh")

    set_result = true
    local malformed_context = context("malformed", {
      firstLayout = false,
      secondLayout = {},
    })
    current = "U.S."
    action.press(malformed_context)
    assertEqual(set_calls[3], "Dvorak", "malformed settings must use defaults")
    assertEqual(malformed_context.refreshes, 1)

    local unavailable = load_fixture("hammerspoon/examples/keyboard-layout.lua", {})
    local unavailable_context = context("unavailable")
    assertError(function()
      unavailable.registrations[1].appearance(unavailable_context)
    end, "keyboard layout unavailable")
  end)
end
