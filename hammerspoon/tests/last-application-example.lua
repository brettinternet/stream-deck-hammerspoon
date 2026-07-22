return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("last-application example tracks activations and toggles between recent applications", function()
    local frontmost
    local watcher_callback
    local watcher_started = false

    local function application(name)
      local app = {
        app_name = name,
        running = true,
        activate_calls = 0,
        activate_result = true,
      }
      function app:name()
        return self.app_name
      end
      function app:isRunning()
        return self.running
      end
      function app:activate(all_windows)
        self.activate_calls = self.activate_calls + 1
        self.activate_all_windows = all_windows
        if self.activate_result then
          frontmost = self
        end
        return self.activate_result
      end
      return app
    end

    local first = application("First")
    local second = application("Second")
    frontmost = first
    local watcher_api = {
      activated = "activated",
      terminated = "terminated",
      new = function(callback)
        watcher_callback = callback
        return {
          start = function(self)
            watcher_started = true
            return self
          end,
        }
      end,
    }
    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/last-application.lua", {
      application = {
        frontmostApplication = function()
          return frontmost
        end,
        watcher = watcher_api,
      },
    })

    assertFalse(watcher_started, "application watcher must wait for a visible instance")
    assertEqual(#streamdeck.registrations, 1, "action module must return one action")
    assertEqual(streamdeck.starts, 0, "action modules must not start the bridge")
    local action = streamdeck.registrations[1]
    assertEqual(action.id, "com.brettinternet.hammerspoon.last-application")
    assertEqual(action.name, "Switch to last application")

    local action_context = context("last-app")
    action.appear(action_context)
    assertTrue(watcher_started, "application watcher must start for a visible instance")
    local appearance = action.appearance(action_context)
    assertEqual(appearance.title, "No previous")
    assertEqual(appearance.state, "inactive")

    frontmost = second
    watcher_callback("Second", watcher_api.activated, second)
    assertEqual(action_context.refreshes, 1)
    assertEqual(#streamdeck.refreshes, 0, "watcher must not depend on the bridge")
    appearance = action.appearance(action_context)
    assertEqual(appearance.title, "First")
    assertEqual(appearance.state, "active")

    watcher_callback("Second", watcher_api.activated, second)
    assertEqual(action_context.refreshes, 1, "duplicate activation must not refresh")

    action.press(action_context)
    assertEqual(first.activate_calls, 1)
    assertTrue(first.activate_all_windows, "activation must bring forward all application windows")
    assertSame(frontmost, first)
    assertEqual(action_context.refreshes, 2)
    appearance = action.appearance(action_context)
    assertEqual(appearance.title, "Second", "a second press must toggle back")

    second.activate_result = false
    assertError(function()
      action.press(action_context)
    end, "failed to activate previous application")
    assertEqual(second.activate_calls, 1)
    assertEqual(action_context.refreshes, 2, "failed activation must not refresh")
  end)

  test("last-application example clears terminated targets and requires watcher support", function()
    local frontmost
    local watcher_callback
    local function application(name)
      return {
        running = true,
        name = function(self)
          return name
        end,
        isRunning = function(self)
          return self.running
        end,
        activate = function(self)
          frontmost = self
          return true
        end,
      }
    end

    local first = application("First")
    local second = application("Second")
    frontmost = first
    local watcher_api = {
      activated = 1,
      terminated = 2,
      new = function(callback)
        watcher_callback = callback
        return {
          start = function(self)
            return self
          end,
        }
      end,
    }
    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/last-application.lua", {
      application = {
        frontmostApplication = function()
          return frontmost
        end,
        watcher = watcher_api,
      },
    })
    local action = streamdeck.registrations[1]
    local action_context = context("terminated")
    action.appear(action_context)

    frontmost = second
    watcher_callback("Second", watcher_api.activated, second)
    first.running = false
    watcher_callback(nil, watcher_api.terminated, first)
    assertEqual(action_context.refreshes, 2, "termination must refresh stale availability")
    local appearance = action.appearance(action_context)
    assertEqual(appearance.title, "No previous")
    assertEqual(appearance.state, "inactive")
    assertError(function()
      action.press(action_context)
    end, "no previous application")
    assertEqual(action_context.refreshes, 2)

    local unavailable = load_fixture("hammerspoon/streamdeck/actions/last-application.lua", {
      application = {
        frontmostApplication = function()
          return first
        end,
      },
    })
    assertError(function()
      unavailable.registrations[1].appear(context("unavailable"))
    end, "application watcher API unavailable")
  end)
end
