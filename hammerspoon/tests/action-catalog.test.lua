return function(test, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("action catalog refreshes only the invoked action", function()
    local previous_hs = _G.hs
    local display_idle = false
    local toggle_error = false
    _G.hs = {
      application = {
        watcher = {
          activated = 1,
          deactivated = 2,
          hidden = 3,
          unhidden = 4,
          launched = 5,
          terminated = 6,
        },
      },
      caffeinate = {
        get = function()
          return display_idle
        end,
        toggle = function()
          if toggle_error then
            error("toggle failed")
          end
          display_idle = not display_idle
          return display_idle
        end,
      },
    }

    local registrations = {}
    local refreshes = {}
    local bridge = {
      register = function(definition)
        registrations[#registrations + 1] = definition
      end,
      refresh = function(action_id)
        refreshes[#refreshes + 1] = action_id
      end,
    }
    local catalog = require("streamdeck.actions")
    local definitions = catalog.register(bridge, { "keep-awake", "lock-screen" })

    assertEqual(#definitions, 2)
    assertEqual(#registrations, 2)
    assertEqual(registrations[1].id, "com.brettinternet.hammerspoon.keep-awake")
    assertEqual(registrations[2].id, "com.brettinternet.hammerspoon.lock-screen")

    local action_context = context("catalog")
    local sound = require("streamdeck.sound")
    assertSame(registrations[1].press(action_context), sound.ON,
      "catalog wrappers must preserve action callback returns")
    assertEqual(action_context.refreshes, 0, "catalog refresh must be the only synchronous refresh path")
    assertEqual(#refreshes, 1, "a successful action must refresh only its own action type")
    assertEqual(refreshes[1], registrations[1].id)

    toggle_error = true
    assertError(function()
      registrations[1].press(action_context)
    end, "toggle failed")
    assertEqual(#refreshes, 1, "failed callbacks must not refresh the catalog")

    _G.hs = previous_hs
  end)

  test("action catalog validates selection and exposes every useful action", function()
    local previous_hs = _G.hs
    _G.hs = {
      application = {
        watcher = {
          activated = 1,
          deactivated = 2,
          hidden = 3,
          unhidden = 4,
          launched = 5,
          terminated = 6,
        },
      },
      audiodevice = {
        allInputDevices = function() return {} end,
        defaultInputDevice = function() return nil end,
      },
    }

    local function bridge()
      local registrations = {}
      return {
        registrations = registrations,
        register = function(definition)
          registrations[#registrations + 1] = definition
        end,
        refresh = function() end,
      }
    end

    local catalog = require("streamdeck.actions")
    local all_bridge = bridge()
    local definitions = catalog.registerAll(all_bridge)
    assertEqual(#definitions, 22, "meeting mode must not ship as an action")

    local ids = {}
    for _, definition in ipairs(definitions) do
      assertFalse(ids[definition.id], "catalog action IDs must be unique")
      ids[definition.id] = true
      assertTrue(type(definition.description) == "string" and definition.description ~= "",
        "every catalog action must have a non-empty description")
      assertTrue(utf8.len(definition.description) <= 512,
        "catalog action descriptions must be concise")
      if definition.settingsSchema ~= nil then
        for _, field in ipairs(definition.settingsSchema) do
          assertTrue(type(field.description) == "string" and field.description ~= "",
            "every catalog settings field must have a non-empty description")
          assertTrue(utf8.len(field.description) <= 512,
            "catalog settings field descriptions must be concise")
        end
      end
    end
    local system_monitor = nil
    for _, definition in ipairs(definitions) do
      if definition.id == "com.brettinternet.hammerspoon.system-monitor" then
        system_monitor = definition
        break
      end
    end
    assertTrue(system_monitor ~= nil, "system monitor must remain in the complete catalog")
    assertEqual(system_monitor.settingsSchemaVersion, 1,
      "the property inspector only supports version-one schemas")
    assertEqual(#system_monitor.settingsSchema, 2)
    assertEqual(system_monitor.settingsSchema[1].key, "metric")
    assertEqual(system_monitor.settingsSchema[2].key, "windowSeconds")
    assertFalse(ids["com.brettinternet.hammerspoon.meeting-mode"],
      "meeting mode must not be present in the complete catalog")

    local invalid_bridge = bridge()
    assertError(function()
      catalog.register(invalid_bridge, { "missing" })
    end, "Unknown Stream Deck action")
    assertEqual(#invalid_bridge.registrations, 0, "invalid selections must fail before registration")

    local duplicate_bridge = bridge()
    assertError(function()
      catalog.register(duplicate_bridge, { "microphone", "microphone" })
    end, "Duplicate Stream Deck action")
    assertEqual(#duplicate_bridge.registrations, 0, "duplicate selections must fail before registration")

    _G.hs = previous_hs
  end)

end
