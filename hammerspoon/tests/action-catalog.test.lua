return function(test, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("action catalog registers selected actions and refreshes them together", function()
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
    assertEqual(#refreshes, 2, "a successful action must refresh every registered library action")
    assertEqual(refreshes[1], registrations[1].id)
    assertEqual(refreshes[2], registrations[2].id)

    toggle_error = true
    assertError(function()
      registrations[1].press(action_context)
    end, "toggle failed")
    assertEqual(#refreshes, 2, "failed callbacks must not refresh the catalog")

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
    assertEqual(#definitions, 20, "the pedagogical per-instance demo must not ship as an action")

    local ids = {}
    for _, definition in ipairs(definitions) do
      assertFalse(ids[definition.id], "catalog action IDs must be unique")
      ids[definition.id] = true
    end

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
