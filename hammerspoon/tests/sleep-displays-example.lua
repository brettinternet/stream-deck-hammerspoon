return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("sleep displays runs a fixed command and reports task failures", function()
    local created = {}
    local failure
    local fake_hs = { task = { new = function(command, callback, stream_callback, arguments)
      if failure == "create" then return nil end
      if failure == "create-throws" then error("creation failed") end
      local task = { command = command, callback = callback, arguments = arguments }
      function task:start()
        if failure == "start" then return false end
        if failure == "start-throws" then error("start failed") end
        return self
      end
      assertTrue(stream_callback(), "task output must be drained")
      created[#created + 1] = task
      return task
    end } }
    local bridge = load_fixture("hammerspoon/streamdeck/actions/sleep-displays.lua", fake_hs)
    local action = bridge.registrations[1]
    assertEqual(action.id, "com.brettinternet.hammerspoon.sleep-displays")
    assertEqual(action.settingsSchema, nil)
    assertEqual(bridge.starts, 0)
    local key = context("sleep", { command = "/bin/echo", argumentString = "ignored" })
    local appearance = action.appearance(key)
    assertEqual(appearance.title, "Sleep\ndisplays")
    assertEqual(appearance.state, "inactive")
    assertEqual(appearance.icon.dataBase64, require("streamdeck.helpers").icon("display", {
      foregroundColor = require("streamdeck.helpers").colors.accent,
    }).dataBase64)
    assertEqual(#created, 0, "appearance must not sleep displays")
    action.press(key)
    assertEqual(created[1].command, "/usr/bin/pmset")
    assertEqual(#created[1].arguments, 1)
    assertEqual(created[1].arguments[1], "displaysleepnow")
    assertError(function() action.press(key) end, "already running")
    created[1].callback(0)
    assertEqual(key.feedbacks[1].kind, "success")
    assertEqual(key.refreshes, 2)

    action.press(key)
    created[2].callback(1)
    assertEqual(key.feedbacks[2].kind, "error")
    assertTrue(key.feedbacks[2].message:find("exit 1", 1, true) ~= nil)
    for _, mode in ipairs({ "create", "create-throws", "start", "start-throws" }) do
      failure = mode
      assertError(function() action.press(key) end, "display sleep task")
    end
    failure = nil
    action.press(key)
    created[#created].callback(0)
    assertEqual(key.feedbacks[3].kind, "success", "failed starts must allow retries")

    local unavailable = load_fixture("hammerspoon/streamdeck/actions/sleep-displays.lua", {})
    assertError(function() unavailable.registrations[1].press(key) end, "API unavailable")
  end)
end
