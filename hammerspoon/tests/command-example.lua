return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("command action runs configured executables directly and reports completion", function()
    local created = {}
    local start_result = true
    local fake_hs = {
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
    assertEqual(action.settingsSchema[3].default, "displaysleepnow")

    local command_context = context("command", {
      label = "Say hello",
      command = "/usr/bin/printf",
      argumentString = [[--message "hello world" --path 'two words' escaped\ value ""]],
    })
    local appearance = action.appearance(command_context)
    assertEqual(appearance.title, "Say hello")
    assertEqual(appearance.state, "inactive")

    action.press(command_context)
    assertEqual(#created, 1)
    assertEqual(created[1].command, "/usr/bin/printf")
    assertEqual(#created[1].arguments, 6)
    assertEqual(created[1].arguments[1], "--message")
    assertEqual(created[1].arguments[2], "hello world")
    assertEqual(created[1].arguments[3], "--path")
    assertEqual(created[1].arguments[4], "two words")
    assertEqual(created[1].arguments[5], "escaped value")
    assertEqual(created[1].arguments[6], "")
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

    local empty_context = context("empty", { command = "/bin/echo", argumentString = "" })
    action.press(empty_context)
    assertEqual(#created[4].arguments, 0, "an empty string must run without arguments")
    created[4].callback(0, "", "")

    assertError(function()
      action.press(context("relative", { command = "echo", argumentString = "displaysleepnow" }))
    end, "absolute executable path")
    assertError(function()
      action.press(context("unterminated", { command = "/bin/echo", argumentString = [["missing]] }))
    end, "unterminated quote")
    assertError(function()
      action.press(context("incomplete-escape", { command = "/bin/echo", argumentString = "missing\\" }))
    end, "incomplete escape")
    assertEqual(#created, 4, "invalid argument strings must not create a task")

    start_result = false
    assertError(function()
      action.press(context("start-failure", { command = "/bin/echo", argumentString = "displaysleepnow" }))
    end, "failed to start command")

    local unavailable = load_fixture("hammerspoon/streamdeck/actions/command.lua", {})
    assertError(function()
      unavailable.registrations[1].press(context("unavailable"))
    end, "runner unavailable")
  end)
end
