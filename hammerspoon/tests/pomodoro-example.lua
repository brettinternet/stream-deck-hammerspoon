return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("pomodoro example counts down configured phases and isolates lifecycle", function()
    local now = 1000
    local scheduled
    local fake_hs = {
      timer = {
        secondsSinceEpoch = function()
          return now
        end,
        doEvery = function(seconds, callback)
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
    local pomodoro = context("pomodoro", {
      focusMinutes = 2,
      shortBreakMinutes = 1,
      longBreakMinutes = 3,
      cycles = 2,
      completionSound = true,
    })

    assertEqual(action.id, "com.brettinternet.hammerspoon.pomodoro")
    assertEqual(action.settingsSchemaVersion, 1)
    assertEqual(#action.settingsSchema, 5)
    assertEqual(action.settingsSchema[1].key, "focusMinutes")
    assertEqual(action.settingsSchema[1].default, 25)
    assertTrue(action.settingsSchema[1].description ~= "")
    assertEqual(action.settingsSchema[2].key, "shortBreakMinutes")
    assertEqual(action.settingsSchema[2].default, 5)
    assertTrue(action.settingsSchema[2].description ~= "")
    assertEqual(action.settingsSchema[2].section, "Schedule")
    assertEqual(action.settingsSchema[3].key, "longBreakMinutes")
    assertEqual(action.settingsSchema[3].default, 15)
    assertTrue(action.settingsSchema[3].description ~= "")
    assertEqual(action.settingsSchema[3].section, "Schedule")
    assertEqual(action.settingsSchema[4].key, "cycles")
    assertEqual(action.settingsSchema[4].default, 4)
    assertTrue(action.settingsSchema[4].description ~= "")
    assertEqual(action.settingsSchema[4].section, "Schedule")
    assertEqual(action.settingsSchema[5].key, "completionSound")
    assertFalse(action.settingsSchema[5].default)
    assertEqual(action.settingsSchema[5].section, "Schedule")

    local ready = action.appearance(pomodoro)
    assertEqual(ready.title, "Start")
    assertEqual(ready.state, "inactive")
    assertEqual(ready.progress, 0)
    assertEqual(ready.icon.kind, "custom")
    assertEqual(ready.icon.mediaType, "image/svg+xml")

    action.appear(pomodoro)
    action.press(pomodoro)
    assertEqual(scheduled.seconds, 1, "the visible refresh timer must run once per second")
    assertEqual(pomodoro.refreshes, 1, "starting must refresh immediately")

    local focus = action.appearance(pomodoro)
    assertEqual(focus.title, "02:00", "custom focus duration must be displayed")
    assertEqual(focus.badge, "F1")
    assertEqual(focus.progress, 0)
    assertEqual(focus.backgroundColor, "#D94B4B")
    assertEqual(focus.icon.kind, "custom")

    now = now + 1
    run_timer()
    focus = action.appearance(pomodoro)
    assertEqual(focus.title, "01:59", "countdown must update from the Hammerspoon clock")
    assertEqual(focus.progress, 1 / 120, "progress must represent elapsed phase time")
    assertEqual(pomodoro.refreshes, 2, "each timer tick must refresh visible output")

    now = now + 119
    run_timer()
    local short_break = action.appearance(pomodoro)
    assertEqual(short_break.title, "01:00", "focus completion must enter the configured short break")
    assertEqual(short_break.badge, "B1")
    assertEqual(short_break.progress, 0)
    assertEqual(short_break.backgroundColor, "#3F9B66", "breaks must use a distinct color")

    now = now + 60
    run_timer()
    local second_focus = action.appearance(pomodoro)
    assertEqual(second_focus.title, "02:00")
    assertEqual(second_focus.badge, "F2")
    assertEqual(second_focus.progress, 0)

    now = now + 120
    run_timer()
    local long_break = action.appearance(pomodoro)
    assertEqual(long_break.title, "03:00")
    assertEqual(long_break.badge, "L2")
    assertEqual(long_break.progress, 0)

    now = now + 180
    local completed_timer = scheduled
    run_timer()
    local complete = action.appearance(pomodoro)
    assertEqual(complete.title, "Done")
    assertEqual(complete.state, "inactive")
    assertEqual(complete.progress, 1)
    assertEqual(completed_timer.stop_calls, 1, "completion must stop the refresh timer")
    assertEqual(#pomodoro.sounds, 4, "enabled completion sound must play after each phase")

    action.press(pomodoro)
    local reset_timer = scheduled
    assertEqual(action.appearance(pomodoro).title, "02:00")
    action.press(pomodoro)
    assertEqual(reset_timer.stop_calls, 1, "pressing a running session must pause its timer")
    assertEqual(pomodoro.refreshes, 8, "pause must refresh immediately")
    assertTrue(action.appearance(pomodoro).title:find("Paused", 1, true) ~= nil)
    local refreshes_after_pause = pomodoro.refreshes
    reset_timer.callback()
    assertEqual(pomodoro.refreshes, refreshes_after_pause, "stale paused callbacks must be ignored")

    action.press(pomodoro)
    local resumed_timer = scheduled
    assertEqual(action.appearance(pomodoro).title, "02:00")
    action.longPress(pomodoro)
    assertEqual(resumed_timer.stop_calls, 1, "long press must stop and reset the session")
    assertEqual(action.appearance(pomodoro).title, "Start")

    action.press(pomodoro)
    local disappearing_timer = scheduled
    action.disappear(pomodoro)
    assertEqual(disappearing_timer.stop_calls, 1, "disappearing must stop the active timer")
    local refreshes_after_disappear = pomodoro.refreshes
    disappearing_timer.callback()
    assertEqual(pomodoro.refreshes, refreshes_after_disappear, "stale disappear callbacks must be ignored")
    action.appear(pomodoro)
    assertEqual(action.appearance(pomodoro).title, "Start", "reappearing must reset the session")
  end)

  test("pomodoro example catches up elapsed phases from phase deadlines", function()
    local now = 1000
    local scheduled
    local fake_hs = {
      timer = {
        secondsSinceEpoch = function()
          return now
        end,
        doEvery = function(seconds, callback)
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
    local pomodoro = context("catch-up", {
      focusMinutes = 1,
      shortBreakMinutes = 1,
      longBreakMinutes = 1,
      cycles = 3,
    })

    action.appear(pomodoro)
    action.press(pomodoro)

    now = now + 245
    run_timer()
    local focus = action.appearance(pomodoro)
    assertEqual(focus.title, "00:55", "late ticks must preserve wall-clock countdown")
    assertEqual(focus.badge, "F3", "late ticks must catch up every elapsed phase")
    assertEqual(focus.progress, 5 / 60, "progress must use the elapsed active phase time")
    assertEqual(pomodoro.refreshes, 2, "catch-up must refresh once")

    now = now + 115
    local completed_timer = scheduled
    run_timer()
    local complete = action.appearance(pomodoro)
    assertEqual(complete.title, "Done")
    assertEqual(complete.progress, 1)
    assertEqual(completed_timer.stop_calls, 1, "elapsed completion must stop the refresh timer")
    assertEqual(pomodoro.refreshes, 3, "completion catch-up must refresh once")
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
