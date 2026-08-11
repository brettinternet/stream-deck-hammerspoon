return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("URL toggle opens configured URLs and closes existing tabs", function()
    local javascript_calls = {}
    local javascript_results = { "opened", "closed" }
    local state_scripts = {}
    local favicon_urls = {}
    local favicon_callbacks = {}
    local favicon_png = "iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAAAK0lEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAujBRSAAB/UYCuQAAAABJRU5ErkJggg=="
    local favicon_image = {
      bitmapRepresentation = function(_, size)
        assertEqual(size.w, 72)
        assertEqual(size.h, 72)
        return {
          encodeAsURLString = function(_, scale, image_type)
            assertTrue(scale)
            assertEqual(image_type, "PNG")
            return "data:image/png;base64," .. favicon_png
          end,
        }
      end,
    }
    local page_open = false
    local canvases = {}
    local function assert_indicator(is_open)
      local canvas = canvases[#canvases]
      assertEqual(canvas.delete_calls, 1)
      assertEqual(canvas[1].type, "image")
      assertSame(canvas[1].image, favicon_image)
      assertEqual(canvas[2].type, "oval")
      assertEqual(canvas[2].action, "strokeAndFill")
      assertEqual(canvas[2].fillColor.green, is_open and 199 / 255 or 59 / 255)
      assertEqual(canvas[2].fillColor.red, is_open and 52 / 255 or 1)
      assertEqual(canvas[2].fillColor.alpha, 1)
      assertEqual(canvas[2].strokeColor.white, 1)
      assertEqual(canvas[2].strokeWidth, 2)
    end
    local fake_hs = {
      canvas = {
        new = function(frame)
          local canvas = { frame = frame }
          function canvas:imageFromCanvas()
            return favicon_image
          end
          function canvas:delete()
            self.delete_calls = (self.delete_calls or 0) + 1
          end
          canvases[#canvases + 1] = canvas
          return canvas
        end,
      },
      image = {
        imageFromURL = function(url, callback)
          favicon_urls[#favicon_urls + 1] = url
          favicon_callbacks[#favicon_callbacks + 1] = callback
        end,
      },
      osascript = {
        javascript = function(script)
          if string.find(script, 'return "open";', 1, true) ~= nil then
            state_scripts[#state_scripts + 1] = script
            return true, page_open and "open" or "closed"
          end
          javascript_calls[#javascript_calls + 1] = script
          local result = javascript_results[#javascript_calls]
          if result == "opened" then page_open = true end
          if result == "closed" then page_open = false end
          return true, result
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
    assertEqual(#action.settingsSchema, 3)
    assertEqual(action.settingsSchema[1].key, "label")
    assertEqual(action.settingsSchema[2].key, "url")
    assertEqual(action.settingsSchema[3].key, "openInNewWindow")

    local toggle_context = context("toggle", {
      label = "Project docs",
      url = "https://www.hammerspoon.org/docs/",
    })
    action.appear(toggle_context)
    local appearance = action.appearance(toggle_context)
    assertEqual(appearance.title, "Project docs")
    assertEqual(appearance.state, "inactive")
    assertEqual(appearance.appearanceVersion, 1)
    assertTrue(string.find(state_scripts[1], 'if (!browser.running()) return "closed";', 1, true) ~= nil,
      "appearance checks must not launch Chromium")
    assertEqual(appearance.icon.mediaType, "image/svg+xml",
      "the link icon must be used while the favicon loads")
    assertEqual(favicon_urls[1], "https://www.hammerspoon.org/favicon.ico")
    favicon_callbacks[1](favicon_image)
    assertEqual(toggle_context.refreshes, 1,
      "loading the favicon must refresh the visible key")
    appearance = action.appearance(toggle_context)
    assertEqual(appearance.icon.mediaType, "image/png")
    assertEqual(appearance.icon.dataBase64, favicon_png)
    assert_indicator(false)
    assertEqual(#favicon_urls, 1, "the favicon must be cached by origin")

    action.press(toggle_context)
    assertTrue(string.find(javascript_calls[1], "https://www.hammerspoon.org/docs/", 1, true) ~= nil,
      "the configured URL must be passed to Chromium")
    assertTrue(string.find(javascript_calls[1], "tabs[index].close()", 1, true) ~= nil,
      "an existing matching tab must be closed")
    assertEqual(toggle_context.feedbacks[#toggle_context.feedbacks].message, "URL opened")
    assertEqual(toggle_context.refreshes, 2)
    appearance = action.appearance(toggle_context)
    assertEqual(appearance.state, "active")
    assert_indicator(true)

    action.press(toggle_context)
    assertEqual(toggle_context.feedbacks[#toggle_context.feedbacks].message, "URL closed")
    assertEqual(toggle_context.refreshes, 3)
    appearance = action.appearance(toggle_context)
    assertEqual(appearance.state, "inactive")
    assert_indicator(false)

    local existing_window_context = context("existing-window", {
      url = "https://www.hammerspoon.org/docs/",
      openInNewWindow = false,
    })
    javascript_results[3] = "opened"
    action.press(existing_window_context)
    assertTrue(string.find(javascript_calls[3], "var openInNewWindow = false", 1, true) ~= nil,
      "the checkbox must disable new-window opening")
    assertTrue(string.find(javascript_calls[3], "existingWindow.tabs.push", 1, true) ~= nil,
      "opening in an existing window must create a tab")
    assertEqual(existing_window_context.refreshes, 1)

    local defaults_context = context("defaults", nil)
    appearance = action.appearance(defaults_context)
    assertEqual(appearance.title, "Toggle URL", "missing settings must use the default label")
    javascript_results[4] = "opened"
    action.press(defaults_context)
    assertTrue(string.find(javascript_calls[4], "https://www.hammerspoon.org/", 1, true) ~= nil,
      "missing URL must use the default URL")
    assertTrue(string.find(javascript_calls[4], "var openInNewWindow = true", 1, true) ~= nil,
      "missing checkbox settings must preserve new-window opening")
    assertEqual(defaults_context.refreshes, 1)

    local invalid_context = context("invalid", { url = "example.com" })
    assertError(function()
      action.press(invalid_context)
    end, "invalid URL")
    assertEqual(invalid_context.refreshes, 0)

    javascript_results[5] = "unexpected"
    assertError(function()
      action.press(toggle_context)
    end, "failed to toggle URL")
    assertEqual(toggle_context.refreshes, 3, "failed URL toggles must not refresh")
    local missing_favicon_context = context("missing-favicon", {
      url = "HTTP://example.com/docs/",
    })
    action.appear(missing_favicon_context)
    appearance = action.appearance(missing_favicon_context)
    assertEqual(appearance.icon.mediaType, "image/svg+xml")
    assertEqual(favicon_urls[2], "http://example.com/favicon.ico")
    favicon_callbacks[2](nil)
    assertEqual(missing_favicon_context.refreshes, 1)
    appearance = action.appearance(missing_favicon_context)
    assertEqual(appearance.icon.mediaType, "image/svg+xml",
      "a missing favicon must keep the link icon")
    assertEqual(#favicon_urls, 2, "a missing favicon must not be requested repeatedly")
    action.disappear(missing_favicon_context)

    local unavailable = load_fixture("hammerspoon/streamdeck/actions/url-toggle.lua", {})
    local unavailable_context = context("unavailable", { url = "https://example.com/" })
    local unavailable_appearance = unavailable.registrations[1].appearance(unavailable_context)
    assertEqual(unavailable_appearance.state, "inactive")
    assertEqual(unavailable_appearance.icon.mediaType, "image/svg+xml")
    assertError(function()
      unavailable.registrations[1].press(unavailable_context)
    end, "URL toggle unavailable")
    assertEqual(unavailable_context.refreshes, 0)
  end)
end
