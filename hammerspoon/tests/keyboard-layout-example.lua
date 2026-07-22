return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("keyboard layout exposes deterministic choices and toggles configured layouts", function()
    local current = "U.S."
    local set_result = true
    local set_calls = {}
    local enabled_layouts = {
      ["U.S."] = true,
      Dvorak = true,
      Colemak = true,
    }
    local layout_list = { "Dvorak", "U.S.", "Colemak", "Dvorak" }
    local fake_hs = {
      keycodes = {
        layouts = function()
          return layout_list
        end,
        currentLayout = function()
          return current
        end,
        setLayout = function(layout)
          set_calls[#set_calls + 1] = layout
          if set_result and enabled_layouts[layout] then
            current = layout
            return true
          end
          return false
        end,
      },
    }

    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/keyboard-layout.lua", fake_hs)
    assertEqual(#streamdeck.registrations, 1, "keyboard layout must register one action")
    assertEqual(streamdeck.starts, 0, "action modules must not start the bridge")
    local action = streamdeck.registrations[1]
    assertEqual(action.id, "com.brettinternet.hammerspoon.keyboard-layout")
    assertEqual(action.description, "Switch between two enabled keyboard layouts.")
    local schema = action.settingsSchemaProvider()
    assertEqual(#schema, 2)
    assertEqual(schema[1].key, "firstLayout")
    assertEqual(schema[2].key, "secondLayout")
    assertEqual(schema[1].type, "select")
    assertEqual(schema[2].type, "select")
    assertTrue(schema[1].description ~= "")
    assertTrue(schema[2].description ~= "")
    assertTrue(schema[1].refreshable)
    assertTrue(schema[2].refreshable)
    local options = schema[1].options
    assertEqual(#options, 4, "layout choices must be deduplicated")
    assertEqual(options[1].value, "__not_configured__")
    assertEqual(options[1].label, "Not configured")
    assertEqual(options[2].value, "Colemak")
    assertEqual(options[3].value, "Dvorak")
    assertEqual(options[4].value, "U.S.")
    assertEqual(schema[1].default, "U.S.")
    assertEqual(schema[2].default, "Colemak")

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
    assertEqual(set_calls[3], "Colemak", "malformed settings must use query defaults")
    assertEqual(malformed_context.refreshes, 1)
  end)

  test("keyboard layout keeps the current layout inside the capped choices", function()
    local current = "Zulu"
    local layout_list = {}
    for index = 1, 64 do
      layout_list[#layout_list + 1] = string.format("Layout %02d", index)
    end
    layout_list[#layout_list + 1] = current

    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/keyboard-layout.lua", {
      keycodes = {
        layouts = function()
          return layout_list
        end,
        currentLayout = function()
          return current
        end,
        setLayout = function(layout)
          current = layout
          return true
        end,
      },
    })
    local action = streamdeck.registrations[1]
    local capped_schema = action.settingsSchemaProvider()
    local first_field = capped_schema[1]
    local second_field = capped_schema[2]

    assertEqual(#first_field.options, 64)
    assertEqual(#second_field.options, 64)
    assertEqual(first_field.default, "Zulu")
    assertEqual(second_field.default, "Layout 01")
    for _, field in ipairs(capped_schema) do
      assertEqual(field.type, "select")
      assertTrue(#field.options <= 64)
      local default_advertised = false
      for _, option in ipairs(field.options) do
        if option.value == field.default then
          default_advertised = true
          break
        end
      end
      assertTrue(default_advertised)
    end
  end)

  test("keyboard layout reports disconnected choices and empty queries", function()
    local current = "U.S."
    local enabled = { ["U.S."] = true }
    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/keyboard-layout.lua", {
      keycodes = {
        layouts = function()
          return { "U.S.", "Dvorak" }
        end,
        currentLayout = function()
          return current
        end,
        setLayout = function(layout)
          if not enabled[layout] then
            return false
          end
          current = layout
          return true
        end,
      },
    })
    local action = streamdeck.registrations[1]
    assertError(function()
      action.press(context("disconnected", {
        firstLayout = "U.S.",
        secondLayout = "Dvorak",
      }))
    end, "failed to switch keyboard layout")

    local empty = load_fixture("hammerspoon/streamdeck/actions/keyboard-layout.lua", {
      keycodes = {
        layouts = function()
          return {}
        end,
        currentLayout = function()
          return nil
        end,
        setLayout = function()
          return false
        end,
      },
    })
    local empty_schema = empty.registrations[1].settingsSchemaProvider()
    assertEqual(#empty_schema[1].options, 1)
    assertEqual(empty_schema[1].default, "__not_configured__")
    assertError(function()
      empty.registrations[1].appearance(context("empty"))
    end, "no enabled keyboard layouts available")
  end)

  test("keyboard layout reports unavailable APIs", function()
    local unavailable = load_fixture("hammerspoon/streamdeck/actions/keyboard-layout.lua", {})
    local unavailable_context = context("unavailable")
    local unavailable_schema = unavailable.registrations[1].settingsSchemaProvider()
    assertEqual(#unavailable_schema[1].options, 1)
    assertError(function()
      unavailable.registrations[1].appearance(unavailable_context)
    end, "keyboard layout unavailable")
  end)
end
