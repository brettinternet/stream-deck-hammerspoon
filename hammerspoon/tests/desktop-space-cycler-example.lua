return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("desktop space cycler maps user desktops to four presentation states", function()
    local active_space = 10
    local goto_calls = {}
    local goto_result = true
    local space_types = {
      [10] = "user",
      [11] = "fullscreen",
      [12] = "user",
      [13] = "user",
      [14] = "user",
      [15] = "user",
    }
    local fake_hs = {
      screen = {
        mainScreen = function()
          return "main"
        end,
      },
      spaces = {
        spacesForScreen = function(screen)
          assertEqual(screen, "main")
          return { 10, 11, 12, 13, 14, 15 }
        end,
        spaceType = function(space_id)
          return space_types[space_id]
        end,
        activeSpaceOnScreen = function(screen)
          assertEqual(screen, "main")
          return active_space
        end,
        gotoSpace = function(space_id)
          goto_calls[#goto_calls + 1] = space_id
          if goto_result == true then
            active_space = space_id
          end
          return goto_result
        end,
      },
      timer = {
        doAfter = function(_seconds, callback)
          callback()
          return {}
        end,
      },
    }

    local streamdeck = load_fixture("hammerspoon/examples/desktop-space-cycler.lua", fake_hs)
    assertEqual(#streamdeck.registrations, 1)
    assertEqual(streamdeck.starts, 1)
    local action = streamdeck.registrations[1]
    local cycler = context("spaces")

    assertEqual(action.id, "com.brettinternet.hammerspoon.desktop-space-cycler")
    assertEqual(action.name, "Desktop space cycler")
    local appearance = action.appearance(cycler)
    assertEqual(appearance.title, "Desktop 1")
    assertEqual(appearance.state, "inactive")
    assertEqual(appearance.appearanceVersion, 1)
    assertEqual(appearance.presentationState, 0)

    for presentation_state, space_id in ipairs({ 12, 13, 14 }) do
      action.press(cycler)
      assertEqual(goto_calls[presentation_state], space_id)
      assertEqual(cycler.refreshes, presentation_state)
      appearance = action.appearance(cycler)
      assertEqual(appearance.title, "Desktop " .. (presentation_state + 1))
      assertEqual(appearance.state, "active")
      assertEqual(appearance.appearanceVersion, 1)
      assertEqual(appearance.presentationState, presentation_state)
    end

    action.press(cycler)
    appearance = action.appearance(cycler)
    assertEqual(goto_calls[4], 10)
    assertEqual(appearance.presentationState, 0)
    assertEqual(appearance.state, "inactive")

    active_space = 99
    appearance = action.appearance(cycler)
    assertEqual(appearance.title, "Other desktop")
    assertEqual(appearance.state, "inactive")
    assertEqual(appearance.appearanceVersion, 1)
    assertEqual(appearance.presentationState, 0)
    action.press(cycler)
    assertEqual(goto_calls[5], 10, "an unmanaged desktop must return to Desktop 1")
    goto_result = nil
    local refreshes_before_failure = cycler.refreshes
    assertError(function()
      action.press(cycler)
    end, "failed to switch Spaces desktop")
    assertEqual(cycler.refreshes, refreshes_before_failure, "a failed switch must not refresh")
    goto_result = true

    space_types[10] = "fullscreen"
    space_types[12] = "fullscreen"
    space_types[13] = "fullscreen"
    space_types[14] = "fullscreen"
    space_types[15] = "fullscreen"
    appearance = action.appearance(cycler)
    assertEqual(appearance.title, "No desktop")
    assertEqual(appearance.state, "inactive")
    assertEqual(appearance.appearanceVersion, 1)
    assertEqual(appearance.presentationState, 0)
    assertError(function()
      action.press(cycler)
    end, "no user desktop available")
  end)

  test("desktop space cycler reports unavailable APIs", function()
    local streamdeck = load_fixture("hammerspoon/examples/desktop-space-cycler.lua", {})
    local action = streamdeck.registrations[1]
    local cycler = context("unavailable")

    assertError(function()
      action.appearance(cycler)
    end, "Spaces API unavailable")
    assertError(function()
      action.press(cycler)
    end, "Spaces API unavailable")
  end)
end
