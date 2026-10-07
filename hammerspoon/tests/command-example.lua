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
    assertEqual(#action.settingsSchema, 5)
    assertEqual(action.settingsSchema[4].key, "longPressCommand")
    assertEqual(action.settingsSchema[4].default, "")
    assertEqual(action.settingsSchema[5].key, "longPressArgumentString")
    assertEqual(action.settingsSchema[5].default, "")
    assertEqual(action.settingsSchema[1].default, "Run command")
    assertEqual(action.settingsSchema[2].default, "")
    assertEqual(action.settingsSchema[3].default, "")

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
    assertEqual(action.appearance(defaults_context).title, "Run command")
    assertEqual(appearance.icon.dataBase64, require("streamdeck.helpers").icon("terminal", {
      foregroundColor = require("streamdeck.helpers").colors.accent,
    }).dataBase64)
    assertError(function() action.press(defaults_context) end, "absolute executable path")
    assertEqual(#created, 2, "unconfigured commands must not create a task")
    action.press(context("no-arguments", { command = "/bin/echo" }))
    assertEqual(#created[3].arguments, 0)
    created[3].callback(0, "", "")

    local empty_context = context("empty", { command = "/bin/echo", argumentString = "" })
    action.press(empty_context)
    assertEqual(#created[4].arguments, 0, "an empty string must run without arguments")
    created[4].callback(0, "", "")

    assertError(function()
      action.press(context("relative", { command = "echo", argumentString = "hello" }))
    end, "absolute executable path")
    assertError(function()
      action.press(context("unterminated", { command = "/bin/echo", argumentString = [["missing]] }))
    end, "unterminated quote")
    assertError(function()
      action.press(context("incomplete-escape", { command = "/bin/echo", argumentString = "missing\\" }))
    end, "incomplete escape")
    assertEqual(#created, 4, "invalid argument strings must not create a task")

    local hold_context = context("hold", {
      command = "/bin/echo",
      argumentString = "normal",
      longPressCommand = "/usr/bin/printf",
      longPressArgumentString = [['held command' ""]],
    })
    action.press(hold_context)
    assertEqual(created[5].command, "/bin/echo")
    assertEqual(created[5].arguments[1], "normal")
    assertError(function() action.longPress(hold_context) end, "already running")
    created[5].callback(0)
    action.longPress(hold_context)
    assertEqual(#created, 6, "a hold must create only the alternate task")
    assertEqual(created[6].command, "/usr/bin/printf")
    assertEqual(#created[6].arguments, 2)
    assertEqual(created[6].arguments[1], "held command")
    assertEqual(created[6].arguments[2], "")
    assertError(function() action.press(hold_context) end, "already running")
    created[6].callback(0)
    assertEqual(action.appearance(hold_context).state, "inactive")

    for _, settings in ipairs({
      { command = "/bin/echo", argumentString = "normal" },
      { command = "/bin/echo", argumentString = "normal", longPressCommand = "", longPressArgumentString = "ignored" },
    }) do
      local before = #created
      action.longPress(context("fallback", settings))
      assertEqual(#created, before + 1, "an unconfigured hold must run the normal command once")
      assertEqual(created[#created].command, "/bin/echo")
      assertEqual(created[#created].arguments[1], "normal")
      created[#created].callback(0)
    end

    action.longPress(context("hold-no-arguments", {
      command = "/bin/echo", argumentString = "not inherited", longPressCommand = "/usr/bin/printf",
    }))
    assertEqual(#created[#created].arguments, 0)
    created[#created].callback(0)
    local before_invalid = #created
    assertError(function()
      action.longPress(context("invalid-hold", { command = "/bin/echo", longPressCommand = "printf" }))
    end, "absolute executable path")
    assertError(function()
      action.longPress(context("invalid-hold-arguments", {
        longPressCommand = "/bin/echo", longPressArgumentString = [["missing]],
      }))
    end, "unterminated quote")
    assertEqual(#created, before_invalid, "invalid hold settings must not launch or fall back")

    start_result = false
    assertError(function()
      action.press(context("start-failure", { command = "/bin/echo", argumentString = "hello" }))
    end, "failed to start command")

    local unavailable = load_fixture("hammerspoon/streamdeck/actions/command.lua", {})
    assertError(function()
      unavailable.registrations[1].press(context("unavailable", { command = "/bin/echo" }))
    end, "runner unavailable")
  end)
end
