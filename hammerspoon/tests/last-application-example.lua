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
    local streamdeck = load_fixture("hammerspoon/examples/last-application.lua", {
      application = {
        frontmostApplication = function()
          return frontmost
        end,
        watcher = watcher_api,
      },
    })

    assertTrue(watcher_started, "application watcher must start")
    assertEqual(#streamdeck.registrations, 1, "example must register one action")
    assertEqual(streamdeck.starts, 1, "example must start the bridge exactly once")
    local action = streamdeck.registrations[1]
    assertEqual(action.id, "com.brettinternet.hammerspoon.last-application")
    assertEqual(action.name, "Switch to last application")

    local action_context = context("last-app")
    local appearance = action.appearance(action_context)
    assertEqual(appearance.title, "No previous")
    assertEqual(appearance.state, "inactive")

    frontmost = second
    watcher_callback("Second", watcher_api.activated, second)
    assertEqual(#streamdeck.refreshes, 1)
    assertEqual(streamdeck.refreshes[1], action.id)
    appearance = action.appearance(action_context)
    assertEqual(appearance.title, "First")
    assertEqual(appearance.state, "active")

    watcher_callback("Second", watcher_api.activated, second)
    assertEqual(#streamdeck.refreshes, 1, "duplicate activation must not refresh")

    action.press(action_context)
    assertEqual(first.activate_calls, 1)
    assertTrue(first.activate_all_windows, "activation must bring forward all application windows")
    assertSame(frontmost, first)
    assertEqual(action_context.refreshes, 1)
    appearance = action.appearance(action_context)
    assertEqual(appearance.title, "Second", "a second press must toggle back")

    second.activate_result = false
    assertError(function()
      action.press(action_context)
    end, "failed to activate previous application")
    assertEqual(second.activate_calls, 1)
    assertEqual(action_context.refreshes, 1, "failed activation must not refresh")
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
    local streamdeck = load_fixture("hammerspoon/examples/last-application.lua", {
      application = {
        frontmostApplication = function()
          return frontmost
        end,
        watcher = watcher_api,
      },
    })
    local action = streamdeck.registrations[1]
    local action_context = context("terminated")

    frontmost = second
    watcher_callback("Second", watcher_api.activated, second)
    first.running = false
    watcher_callback(nil, watcher_api.terminated, first)
    assertEqual(#streamdeck.refreshes, 2, "termination must refresh stale availability")
    local appearance = action.appearance(action_context)
    assertEqual(appearance.title, "No previous")
    assertEqual(appearance.state, "inactive")
    assertError(function()
      action.press(action_context)
    end, "no previous application")
    assertEqual(action_context.refreshes, 0)

    assertError(function()
      load_fixture("hammerspoon/examples/last-application.lua", {
        application = {
          frontmostApplication = function()
            return first
          end,
        },
      })
    end, "application watcher API unavailable")
  end)
end
