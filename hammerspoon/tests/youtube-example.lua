return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("YouTube example toggles the first video tab and opens its configured URL", function()
    local javascript_calls = {}
    local javascript_results = {}
    local key_strokes = {}
    local browser_activations = 0
    local frontmost_activations = 0
    local browser = {
      running = true,
      isRunning = function(self)
        return self.running
      end,
      activate = function(self)
        browser_activations = browser_activations + 1
        return true
      end,
    }
    local frontmost = {
      activate = function(self)
        frontmost_activations = frontmost_activations + 1
        return true
      end,
    }

    local fake_hs = {
      application = {
        get = function(bundle_id)
          assertEqual(bundle_id, "org.chromium.Chromium", "YouTube must target Chromium")
          return browser
        end,
        frontmostApplication = function()
          return frontmost
        end,
      },
      osascript = {
        javascript = function(script)
          javascript_calls[#javascript_calls + 1] = script
          return true, table.remove(javascript_results, 1)
        end,
      },
      eventtap = {
        keyStroke = function(modifiers, key, delay, target)
          key_strokes[#key_strokes + 1] = {
            modifiers = modifiers,
            key = key,
            delay = delay,
            target = target,
          }
          return true
        end,
      },
      timer = {
        doAfter = function(delay, callback)
          callback()
          return { delay = delay }
        end,
      },
    }

    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/youtube.lua", fake_hs)
    assertEqual(#streamdeck.registrations, 1, "YouTube must register one action")
    local action = streamdeck.registrations[1]
    assertEqual(action.id, "com.brettinternet.hammerspoon.youtube")
    assertEqual(action.name, "YouTube play/pause")
    assertEqual(action.settingsSchemaVersion, 1)
    assertEqual(#action.settingsSchema, 1)
    assertEqual(action.settingsSchema[1].key, "url")
    assertEqual(action.settingsSchema[1].maxLength, 1024)
    assertEqual(streamdeck.starts, 0, "action modules must not start the bridge")

    local playback_context = context("youtube", {
      url = "https://www.youtube.com/watch?v=example",
    })
    local appearance = action.appearance(playback_context)
    assertEqual(appearance.title, "YouTube")
    assertEqual(appearance.state, "inactive")

    javascript_results[1] = "17|2"
    action.press(playback_context)
    assertEqual(#javascript_calls, 1, "an open video tab should be inspected")
    assertEqual(browser_activations, 1, "the video tab's browser must be activated")
    assertEqual(#key_strokes, 1, "the first video tab must receive one shortcut")
    assertEqual(key_strokes[1].key, "k", "YouTube's play/pause shortcut must be used")
    assertSame(key_strokes[1].target, browser)
    assertEqual(frontmost_activations, 1, "the previous application must be restored")
    assertEqual(playback_context.refreshes, 1)

    browser.running = false
    javascript_results[1] = "42"
    local open_context = context("open", {
      url = "https://youtu.be/example",
    })
    action.press(open_context)
    assertEqual(#javascript_calls, 2, "a missing video tab should open the configured URL")
    assertTrue(string.find(javascript_calls[2], "https://youtu.be/example", 1, true) ~= nil,
      "the configured URL must be passed to Chromium")
    assertEqual(#key_strokes, 1, "opening a URL must not send a playback shortcut")
    assertEqual(open_context.refreshes, 1)

    local invalid_context = context("invalid", {
      url = "not a URL",
    })
    assertError(function()
      action.press(invalid_context)
    end, "invalid YouTube URL")
    assertEqual(invalid_context.refreshes, 0)
  end)

  test("YouTube example rejects malformed tab results", function()
    local browser = {
      isRunning = function()
        return true
      end,
      activate = function()
        return true
      end,
    }
    local fake_hs = {
      application = {
        get = function()
          return browser
        end,
        frontmostApplication = function()
          return nil
        end,
      },
      osascript = {
        javascript = function()
          return true, "not-a-tab"
        end,
      },
    }

    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/youtube.lua", fake_hs)
    local action = streamdeck.registrations[1]
    assertError(function()
      action.press(context("malformed"))
    end, "failed to identify the first YouTube video tab")
  end)
end
