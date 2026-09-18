return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("command action runs configured executables directly and reports completion", function()
    local created = {}
    local start_result = true
    local fake_hs = {
      json = {
        decode = function(value)
          if value == '["displaysleepnow"]' then return { "displaysleepnow" } end
          if value == '["hello world","--flag"]' then return { "hello world", "--flag" } end
          if value == "{}" then return {} end
          error("invalid JSON")
        end,
      },
      task = {
        new = function(command, callback, stream_callback, arguments)
          local task = {
            command = command,
            callback = callback,
            stream_callback = stream_callback,
            arguments = arguments,
          }
          function task:start()
            return start_result and self or false
          end
          created[#created + 1] = task
          return task
        end,
      },
    }

    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/command.lua", fake_hs)
    local action = streamdeck.registrations[1]
    assertEqual(action.id, "com.brettinternet.hammerspoon.command")
    assertEqual(action.settingsSchemaVersion, 1)
    assertEqual(#action.settingsSchema, 3)
    assertEqual(action.settingsSchema[2].default, "/usr/bin/pmset")
    assertEqual(action.settingsSchema[3].default, '["displaysleepnow"]')

    local command_context = context("command", {
      label = "Say hello",
      command = "/usr/bin/printf",
      arguments = '["hello world","--flag"]',
    })
    local appearance = action.appearance(command_context)
    assertEqual(appearance.title, "Say hello")
    assertEqual(appearance.state, "inactive")

    action.press(command_context)
    assertEqual(#created, 1)
    assertEqual(created[1].command, "/usr/bin/printf")
    assertEqual(created[1].arguments[1], "hello world")
    assertEqual(created[1].arguments[2], "--flag")
    assertTrue(created[1].stream_callback(), "output must be drained while the task runs")
    assertEqual(action.appearance(command_context).state, "active")
    assertError(function() action.press(command_context) end, "already running")

    created[1].callback(0, "", "")
    assertEqual(action.appearance(command_context).state, "inactive")
    assertEqual(command_context.feedbacks[1].kind, "success")
    assertEqual(command_context.refreshes, 2,
      "catalog launch refresh and asynchronous completion refresh must both run")

    action.press(command_context)
    created[2].callback(7, "", "")
    assertEqual(command_context.feedbacks[2].kind, "error")
    assertTrue(command_context.feedbacks[2].message:find("exit 7", 1, true) ~= nil)

    local defaults_context = context("defaults")
    action.press(defaults_context)
    assertEqual(created[3].command, "/usr/bin/pmset")
    assertEqual(created[3].arguments[1], "displaysleepnow")
    created[3].callback(0, "", "")

    assertError(function()
      action.press(context("relative", { command = "echo", arguments = '["displaysleepnow"]' }))
    end, "absolute executable path")
    assertError(function()
      action.press(context("bad-arguments", { command = "/bin/echo", arguments = "not JSON" }))
    end, "JSON array")
    assertError(function()
      action.press(context("object-arguments", { command = "/bin/echo", arguments = "{}" }))
    end, "JSON array")
    assertEqual(#created, 3, "invalid argument objects must not create a task")

    start_result = false
    assertError(function()
      action.press(context("start-failure", { command = "/bin/echo", arguments = '["displaysleepnow"]' }))
    end, "failed to start command")

    local unavailable = load_fixture("hammerspoon/streamdeck/actions/command.lua", {})
    assertError(function()
      unavailable.registrations[1].press(context("unavailable"))
    end, "arguments unavailable")
  end)
end
