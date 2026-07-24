return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  local alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  local function decode_base64(encoded)
    local output = {}
    for index = 1, #encoded, 4 do
      local first = alphabet:find(encoded:sub(index, index), 1, true) - 1
      local second = alphabet:find(encoded:sub(index + 1, index + 1), 1, true) - 1
      local third_character = encoded:sub(index + 2, index + 2)
      local fourth_character = encoded:sub(index + 3, index + 3)
      local third = third_character == "=" and 0 or alphabet:find(third_character, 1, true) - 1
      local fourth = fourth_character == "=" and 0 or alphabet:find(fourth_character, 1, true) - 1
      local combined = first * 262144 + second * 4096 + third * 64 + fourth
      output[#output + 1] = string.char(math.floor(combined / 65536))
      if third_character ~= "=" then output[#output + 1] = string.char(math.floor(combined / 256) % 256) end
      if fourth_character ~= "=" then output[#output + 1] = string.char(combined % 256) end
    end
    return table.concat(output)
  end

  test("keep awake action toggles display idle prevention and reports failures", function()
    local display_idle = false
    local failure = nil
    local toggle_calls = {}
    local fake_hs = {
      caffeinate = {
        get = function(idle_type)
          assertEqual(idle_type, "displayIdle")
          if failure == "get" then
            error("get exploded")
          end
          if failure == "get-nonboolean" then
            return "unknown"
          end
          return display_idle
        end,
        toggle = function(idle_type)
          assertEqual(idle_type, "displayIdle")
          toggle_calls[#toggle_calls + 1] = idle_type
          if failure == "toggle" then
            error("toggle exploded")
          end
          if failure == "toggle-nonboolean" then
            return "unknown"
          end
          display_idle = not display_idle
          return display_idle
        end,
      },
    }

    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/keep-awake.lua", fake_hs)
    assertEqual(#streamdeck.registrations, 1, "keep awake must register one action")
    assertEqual(streamdeck.starts, 0, "action modules must not start the bridge")
    local action = streamdeck.registrations[1]
    local action_id = "com.brettinternet.hammerspoon.keep-awake"
    assertEqual(action.id, action_id)
    assertEqual(action.name, "Keep awake")
    local first_context = context("first")
    local second_context = context("second")
    local appearance = action.appearance(first_context)
    assertEqual(appearance.title, "")
    assertEqual(appearance.state, "inactive")
    assertEqual(appearance.icon.kind, "custom")
    assertEqual(appearance.badge, nil)
    assertEqual(appearance.appearanceVersion, 1)
    action.press(first_context)
    assertEqual(toggle_calls[1], "displayIdle")
    assertTrue(display_idle, "first toggle must prevent display idle sleep")
    assertEqual(#streamdeck.refreshes, 1, "catalog must refresh the registered action")
    assertEqual(first_context.refreshes, 1, "successful toggle must refresh its context")
    assertEqual(second_context.refreshes, 0)

    local inactive_icon = appearance.icon.dataBase64
    local inactive_svg = decode_base64(inactive_icon)
    assertTrue(inactive_svg:find("M16 27", 1, true) ~= nil, "inactive icon must be a coffee cup")
    assertFalse(inactive_svg:find("M27 21", 1, true) ~= nil, "inactive coffee cup must not steam")

    appearance = action.appearance(first_context)
    assertEqual(appearance.title, "")
    assertEqual(appearance.state, "active")
    assertEqual(appearance.icon.kind, "custom")
    assertEqual(appearance.badge, nil)
    assertFalse(appearance.icon.dataBase64 == inactive_icon, "active icon must differ from inactive icon")
    assertTrue(decode_base64(appearance.icon.dataBase64):find("M27 21", 1, true) ~= nil,
      "active coffee cup must steam")


    action.press(second_context)
    assertEqual(toggle_calls[2], "displayIdle")
    assertFalse(display_idle, "second toggle must allow display idle sleep")
    assertEqual(#streamdeck.refreshes, 2)
    assertEqual(first_context.refreshes, 1)
    assertEqual(second_context.refreshes, 1)
    appearance = action.appearance(first_context)
    assertEqual(appearance.title, "")
    assertEqual(appearance.state, "inactive")
    assertEqual(appearance.icon.dataBase64, inactive_icon)

    failure = "get"
    assertError(function()
      action.appearance(first_context)
    end, "failed to read display idle state")
    assertEqual(first_context.refreshes, 1, "failed state reads must not refresh")

    failure = "get-nonboolean"
    assertError(function()
      action.appearance(first_context)
    end, "expected boolean result")
    assertEqual(first_context.refreshes, 1, "invalid state reads must not refresh")

    failure = "toggle"
    assertError(function()
      action.press(first_context)
    end, "failed to toggle display idle prevention")
    assertEqual(first_context.refreshes, 1, "thrown toggle calls must not refresh")

    failure = "toggle-nonboolean"
    assertError(function()
      action.press(second_context)
    end, "expected boolean result")
    assertEqual(second_context.refreshes, 1, "invalid toggle results must not refresh")

    local unavailable = load_fixture("hammerspoon/streamdeck/actions/keep-awake.lua", {})
    local unavailable_context = context("unavailable")
    assertError(function()
      unavailable.registrations[1].appearance(unavailable_context)
    end, "display idle caffeinate API unavailable")
    assertError(function()
      unavailable.registrations[1].press(unavailable_context)
    end, "display idle caffeinate API unavailable")
    assertEqual(#unavailable.refreshes, 0, "unavailable API must not refresh")
    assertEqual(unavailable_context.refreshes, 0, "unavailable API must not refresh context")
  end)
end
