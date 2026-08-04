return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("URL toggle opens configured URLs and closes existing tabs", function()
    local javascript_calls = {}
    local javascript_results = { "opened", "closed" }
    local fake_hs = {
      osascript = {
        javascript = function(script)
          javascript_calls[#javascript_calls + 1] = script
          return true, javascript_results[#javascript_calls]
        end,
      },
    }

    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/url-toggle.lua", fake_hs)
    assertEqual(#streamdeck.registrations, 1, "URL toggle must register one action")
    assertEqual(streamdeck.starts, 0, "action modules must not start the bridge")
    local action = streamdeck.registrations[1]
    assertEqual(action.id, "com.brettinternet.hammerspoon.url-toggle")
    assertEqual(action.name, "URL toggle")
    assertEqual(action.settingsSchemaVersion, 1)
    assertEqual(#action.settingsSchema, 2)
    assertEqual(action.settingsSchema[1].key, "label")
    assertEqual(action.settingsSchema[2].key, "url")

    local toggle_context = context("toggle", {
      label = "Project docs",
      url = "https://www.hammerspoon.org/docs/",
    })
    local appearance = action.appearance(toggle_context)
    assertEqual(appearance.title, "Project docs")
    assertEqual(appearance.state, "inactive")

    action.press(toggle_context)
    assertTrue(string.find(javascript_calls[1], "https://www.hammerspoon.org/docs/", 1, true) ~= nil,
      "the configured URL must be passed to Chromium")
    assertTrue(string.find(javascript_calls[1], "tabs[index].close()", 1, true) ~= nil,
      "an existing matching tab must be closed")
    assertEqual(toggle_context.feedbacks[#toggle_context.feedbacks].message, "URL opened")
    assertEqual(toggle_context.refreshes, 1)

    action.press(toggle_context)
    assertEqual(toggle_context.feedbacks[#toggle_context.feedbacks].message, "URL closed")
    assertEqual(toggle_context.refreshes, 2)

    local defaults_context = context("defaults", nil)
    appearance = action.appearance(defaults_context)
    assertEqual(appearance.title, "Toggle URL", "missing settings must use the default label")
    javascript_results[3] = "opened"
    action.press(defaults_context)
    assertTrue(string.find(javascript_calls[3], "https://www.hammerspoon.org/", 1, true) ~= nil,
      "missing URL must use the default URL")
    assertEqual(defaults_context.refreshes, 1)

    local invalid_context = context("invalid", { url = "example.com" })
    assertError(function()
      action.press(invalid_context)
    end, "invalid URL")
    assertEqual(invalid_context.refreshes, 0)

    javascript_results[4] = "unexpected"
    assertError(function()
      action.press(toggle_context)
    end, "failed to toggle URL")
    assertEqual(toggle_context.refreshes, 2, "failed URL toggles must not refresh")

    local unavailable = load_fixture("hammerspoon/streamdeck/actions/url-toggle.lua", {})
    local unavailable_context = context("unavailable", { url = "https://example.com/" })
    assertError(function()
      unavailable.registrations[1].press(unavailable_context)
    end, "URL toggle unavailable")
    assertEqual(unavailable_context.refreshes, 0)
  end)
end
