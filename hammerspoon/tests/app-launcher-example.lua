return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("app launcher example reports appearance, launches configured apps, and protects failures", function()
    local frontmost
    local launch_result = true
    local launched_apps = {}
    local launch_error = false
    local fake_hs = {
      application = {
        frontmostApplication = function()
          if launch_error then
            error("frontmost unavailable")
          end
          return frontmost
        end,
        launchOrFocus = function(app)
          launched_apps[#launched_apps + 1] = app
          if launch_error then
            error("launch unavailable")
          end
          return launch_result
        end,
      },
    }

    local function application(name)
      return {
        name = function()
          return name
        end,
      }
    end

    local streamdeck = load_fixture("hammerspoon/examples/app-launcher.lua", fake_hs)
    assertEqual(#streamdeck.registrations, 1, "app launcher must register one action")
    assertEqual(streamdeck.starts, 1, "app launcher must start the bridge")
    local action = streamdeck.registrations[1]
    assertEqual(action.id, "com.brettinternet.hammerspoon.app-launcher")
    assertEqual(action.name, "Launch or focus app")
    assertEqual(#action.settingsSchema, 2)
    assertEqual(action.settingsSchema[1].type, "text")
    assertEqual(action.settingsSchema[1].key, "app")
    assertEqual(action.settingsSchema[1].maxLength, 128)
    assertEqual(action.settingsSchema[2].type, "text")
    assertEqual(action.settingsSchema[2].key, "label")
    assertEqual(action.settingsSchema[2].maxLength, 32)

    local custom_context = context("custom", {
      app = "Safari",
      label = "Open Safari",
    })
    frontmost = application("Safari")
    local appearance = action.appearance(custom_context)
    assertEqual(appearance.title, "Open Safari")
    assertEqual(appearance.state, "active")

    frontmost = application("Finder")
    appearance = action.appearance(custom_context)
    assertEqual(appearance.title, "Open Safari")
    assertEqual(appearance.state, "inactive")

    frontmost = nil
    appearance = action.appearance(custom_context)
    assertEqual(appearance.title, "Open Safari")
    assertEqual(appearance.state, "inactive", "no frontmost app must be inactive")

    action.press(custom_context)
    assertEqual(launched_apps[1], "Safari")
    assertEqual(custom_context.refreshes, 1, "successful launch must refresh")

    local defaults_context = context("defaults")
    action.press(defaults_context)
    assertEqual(launched_apps[2], "Hammerspoon", "missing settings must use the default app")
    assertEqual(defaults_context.refreshes, 1)
    appearance = action.appearance(defaults_context)
    assertEqual(appearance.title, "Launch app", "missing settings must use the default label")

    local malformed_context = context("malformed", {
      app = false,
      label = {},
    })
    action.press(malformed_context)
    assertEqual(launched_apps[3], "Hammerspoon", "malformed settings must use the default app")
    assertEqual(malformed_context.refreshes, 1)
    assertEqual(action.appearance(malformed_context).title, "Launch app")

    local long_app = string.rep("a", 129)
    local long_label = string.rep("b", 33)
    local oversized_context = context("oversized", {
      app = long_app,
      label = long_label,
    })
    action.press(oversized_context)
    assertEqual(launched_apps[4], "Hammerspoon", "oversized settings must use the default app")
    assertEqual(oversized_context.refreshes, 1)
    assertEqual(action.appearance(oversized_context).title, "Launch app")

    launch_result = false
    assertError(function()
      action.press(custom_context)
    end, "failed to launch or focus app")
    assertEqual(custom_context.refreshes, 1, "false launch result must not refresh")

    launch_result = "yes"
    assertError(function()
      action.press(custom_context)
    end, "failed to launch or focus app")
    assertEqual(custom_context.refreshes, 1, "invalid launch result must not refresh")

    launch_result = true
    launch_error = true
    assertError(function()
      action.press(custom_context)
    end, "failed to launch or focus app")
    assertEqual(custom_context.refreshes, 1, "thrown launch API must not refresh")

    launch_error = false
    local unavailable = load_fixture("hammerspoon/examples/app-launcher.lua", {
      application = {},
    })
    local unavailable_context = context("unavailable", {
      app = "Safari",
      label = "Open Safari",
    })
    assertError(function()
      unavailable.registrations[1].appearance(unavailable_context)
    end, "app launcher unavailable")
    assertEqual(unavailable_context.refreshes, 0)
    assertError(function()
      unavailable.registrations[1].press(unavailable_context)
    end, "app launcher unavailable")
    assertEqual(unavailable_context.refreshes, 0)

    local throwing_frontmost = load_fixture("hammerspoon/examples/app-launcher.lua", {
      application = {
        frontmostApplication = function()
          error("frontmost unavailable")
        end,
        launchOrFocus = function()
          return true
        end,
      },
    })
    assertError(function()
      throwing_frontmost.registrations[1].appearance(context("throwing-frontmost"))
    end, "failed to inspect frontmost application")

    local invalid_frontmost = load_fixture("hammerspoon/examples/app-launcher.lua", {
      application = {
        frontmostApplication = function()
          return "Safari"
        end,
        launchOrFocus = function()
          return true
        end,
      },
    })
    assertError(function()
      invalid_frontmost.registrations[1].appearance(context("invalid-frontmost"))
    end, "invalid frontmost application")

    local invalid_name = load_fixture("hammerspoon/examples/app-launcher.lua", {
      application = {
        frontmostApplication = function()
          return { name = function() return 42 end }
        end,
        launchOrFocus = function()
          return true
        end,
      },
    })
    assertError(function()
      invalid_name.registrations[1].appearance(context("invalid-name"))
    end, "invalid frontmost application name")
  end)
end
