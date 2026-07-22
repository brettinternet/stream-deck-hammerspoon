return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("URL launcher example opens configured URLs and reports failures", function()
    local opened_urls = {}
    local open_result = true
    local fake_hs = {
      urlevent = {
        openURL = function(url)
          opened_urls[#opened_urls + 1] = url
          return open_result
        end,
      },
    }

    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/url-launcher.lua", fake_hs)
    assertEqual(#streamdeck.registrations, 1, "URL launcher must register one action")
    assertEqual(streamdeck.starts, 0, "action modules must not start the bridge")
    local action = streamdeck.registrations[1]
    assertEqual(action.id, "com.brettinternet.hammerspoon.url-launcher")
    assertEqual(action.settingsSchemaVersion, 1)
    assertEqual(#action.settingsSchema, 2)
    assertEqual(action.settingsSchema[1].key, "label")
    assertEqual(action.settingsSchema[2].key, "url")

    local url_context = context("url", {
      label = "Project docs",
      url = "https://www.hammerspoon.org/docs/",
    })
    local appearance = action.appearance(url_context)
    assertEqual(appearance.title, "Project docs")
    assertEqual(appearance.state, "inactive")

    action.press(url_context)
    assertEqual(opened_urls[1], "https://www.hammerspoon.org/docs/")
    assertEqual(url_context.refreshes, 1, "successful URL launch must refresh")

    open_result = false
    assertError(function()
      action.press(url_context)
    end, "failed to open URL")
    assertEqual(opened_urls[2], "https://www.hammerspoon.org/docs/")
    assertEqual(url_context.refreshes, 1, "failed URL launch must not refresh")

    open_result = true
    local defaults_context = context("defaults", nil)
    appearance = action.appearance(defaults_context)
    assertEqual(appearance.title, "Open URL", "missing settings must use the default label")
    action.press(defaults_context)
    assertEqual(opened_urls[3], "https://www.hammerspoon.org/")
    assertEqual(defaults_context.refreshes, 1)

    local malformed_label_context = context("malformed-label", {
      label = 42,
      url = "https://example.com/",
    })
    assertEqual(action.appearance(malformed_label_context).title, "Open URL")

    local invalid_context = context("invalid", {
      label = "Invalid",
      url = "example.com",
    })
    assertError(function()
      action.press(invalid_context)
    end, "invalid URL")
    assertEqual(invalid_context.refreshes, 0)

    local missing_context = context("missing", {
      label = "Missing",
    })
    action.press(missing_context)
    assertEqual(opened_urls[4], "https://www.hammerspoon.org/",
      "missing URL must use the default URL")
    assertEqual(missing_context.refreshes, 1)

    local empty_url_context = context("empty-url", {
      label = "Empty",
      url = "",
    })
    action.press(empty_url_context)
    assertEqual(opened_urls[5], "https://www.hammerspoon.org/",
      "empty URL must use the default URL")
    assertEqual(empty_url_context.refreshes, 1)

    local unavailable = load_fixture("hammerspoon/streamdeck/actions/url-launcher.lua", {})
    local unavailable_context = context("unavailable", {
      url = "https://example.com/",
    })
    assertError(function()
      unavailable.registrations[1].press(unavailable_context)
    end, "URL launcher unavailable")
    assertEqual(unavailable_context.refreshes, 0)
  end)
end
