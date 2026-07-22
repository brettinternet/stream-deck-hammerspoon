return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("pomodoro example advances through a responsive session and isolates lifecycle", function()
    local scheduled
    local fake_hs = {
      timer = {
        doAfter = function(seconds, callback)
          local timer = {
            seconds = seconds,
            callback = callback,
            stop_calls = 0,
          }
          function timer:stop()
            self.stop_calls = self.stop_calls + 1
            return true
          end
          scheduled = timer
          return timer
        end,
      },
    }

    local function run_timer()
      local previous_hs = _G.hs
      _G.hs = fake_hs
      local ok, err = xpcall(scheduled.callback, debug.traceback)
      _G.hs = previous_hs
      if not ok then
        error(err, 0)
      end
    end
    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/pomodoro.lua", fake_hs)
    local action = streamdeck.registrations[1]
    local pomodoro = context("pomodoro")

    assertEqual(action.id, "com.brettinternet.hammerspoon.pomodoro")
    assertEqual(action.appearance(pomodoro).title, "Start")
    assertEqual(action.appearance(pomodoro).state, "inactive")

    action.appear(pomodoro)
    action.press(pomodoro)
    assertEqual(scheduled.seconds, 25 * 60, "focus phase must use a 25-minute duration")
    assertEqual(pomodoro.refreshes, 1, "starting must refresh immediately")
    assertEqual(action.appearance(pomodoro).title, "Focus 1/4")
    assertEqual(action.appearance(pomodoro).state, "active")

    run_timer()
    assertEqual(scheduled.seconds, 5 * 60, "short break must use a 5-minute duration")
    assertEqual(pomodoro.refreshes, 2, "focus completion must refresh")
    assertEqual(action.appearance(pomodoro).title, "Break 1/4")
    assertEqual(action.appearance(pomodoro).state, "active")

    run_timer()
    assertEqual(scheduled.seconds, 25 * 60, "the next focus phase must be scheduled")
    assertEqual(pomodoro.refreshes, 3, "break completion must refresh")
    assertEqual(action.appearance(pomodoro).title, "Focus 2/4")

    for cycle = 2, 3 do
      run_timer()
      assertEqual(action.appearance(pomodoro).title,
        string.format("Break %d/4", cycle),
        "each focus phase must enter its matching break")
      assertEqual(pomodoro.refreshes, cycle * 2, "focus transition must refresh")

      run_timer()
      assertEqual(action.appearance(pomodoro).title,
        string.format("Focus %d/4", cycle + 1),
        "each break must enter the next focus phase")
      assertEqual(pomodoro.refreshes, cycle * 2 + 1, "break transition must refresh")
    end

    run_timer()
    assertEqual(scheduled.seconds, 15 * 60, "the final cycle must enter a long break")
    assertEqual(pomodoro.refreshes, 8, "final focus transition must refresh")
    assertEqual(action.appearance(pomodoro).title, "Long break")
    assertEqual(action.appearance(pomodoro).state, "active")

    run_timer()
    assertEqual(pomodoro.refreshes, 9, "session completion must refresh")
    assertEqual(action.appearance(pomodoro).title, "Done")
    assertEqual(action.appearance(pomodoro).state, "inactive")

    action.press(pomodoro)
    assertEqual(scheduled.seconds, 25 * 60, "pressing Done must start a new session")
    assertEqual(pomodoro.refreshes, 10)
    action.press(pomodoro)
    assertEqual(scheduled.stop_calls, 1, "pressing a running session must stop its timer")
    assertEqual(pomodoro.refreshes, 11, "stopping must refresh immediately")
    assertEqual(action.appearance(pomodoro).title, "Start")
    assertEqual(action.appearance(pomodoro).state, "inactive")

    run_timer()
    assertEqual(pomodoro.refreshes, 11, "a canceled timer must not update the button")
    assertEqual(action.appearance(pomodoro).title, "Start")

    action.press(pomodoro)
    local disappearing_timer = scheduled
    action.disappear(pomodoro)
    assertEqual(disappearing_timer.stop_calls, 1, "disappearing must stop the active timer")
    action.appear(pomodoro)
    assertEqual(action.appearance(pomodoro).title, "Start", "reappearing must reset the session")
  end)

  test("pomodoro example reports unavailable timer without refreshing", function()
    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/pomodoro.lua", {})
    local action = streamdeck.registrations[1]
    local pomodoro = context("unavailable")

    action.appear(pomodoro)
    assertError(function()
      action.press(pomodoro)
    end, "pomodoro timer unavailable")
    assertEqual(pomodoro.refreshes, 0, "failed start must not refresh")
    assertEqual(action.appearance(pomodoro).title, "Start")
  end)
end
