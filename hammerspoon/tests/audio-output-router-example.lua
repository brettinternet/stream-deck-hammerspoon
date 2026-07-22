return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("audio output router cycles configured outputs through four presentation states", function()
    local current_name = "MacBook Pro Speakers"
    local set_calls = {}
    local devices = {}

    local function device(name)
      return {
        name = function()
          return name
        end,
        setDefaultOutputDevice = function()
          current_name = name
          set_calls[#set_calls + 1] = name
          return true
        end,
      }
    end

    for _, name in ipairs({ "MacBook Pro Speakers", "Headphones", "Studio Display", "AirPods" }) do
      devices[name] = device(name)
    end
    devices.Other = device("Other")

    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/audio-output-router.lua", {
      audiodevice = {
        defaultOutputDevice = function()
          return devices[current_name]
        end,
        findOutputByName = function(name)
          return devices[name]
        end,
        allOutputDevices = function()
          local outputs = {}
          for _, output in pairs(devices) do
            outputs[#outputs + 1] = output
          end
          return outputs
        end,
      },
    })
    assertEqual(#streamdeck.registrations, 1)
    assertEqual(streamdeck.starts, 0)
    local action = streamdeck.registrations[1]
    local router = context("router", {
      output1 = "MacBook Pro Speakers",
      output2 = "Headphones",
      output3 = "Studio Display",
      output4 = "AirPods",
    })

    assertEqual(action.id, "com.brettinternet.hammerspoon.audio-output-router")
    assertEqual(action.name, "Audio output router")
    assertEqual(action.settingsSchemaVersion, 1)
    assertEqual(#action.settingsSchema, 4)
    local appearance = action.appearance(router)
    assertEqual(appearance.title, "MacBook Pro Speakers")
    assertEqual(appearance.state, "inactive")
    assertEqual(appearance.appearanceVersion, 1)
    assertEqual(appearance.presentationState, 0)

    for presentation_state, name in ipairs({ "Headphones", "Studio Display", "AirPods" }) do
      action.press(router)
      assertEqual(set_calls[presentation_state], name)
      assertEqual(router.refreshes, presentation_state)
      appearance = action.appearance(router)
      assertEqual(appearance.title, name)
      assertEqual(appearance.state, "active")
      assertEqual(appearance.appearanceVersion, 1)
      assertEqual(appearance.presentationState, presentation_state)
    end

    action.press(router)
    appearance = action.appearance(router)
    assertEqual(set_calls[4], "MacBook Pro Speakers")
    assertEqual(appearance.presentationState, 0)
    assertEqual(appearance.state, "inactive")

    current_name = "Other"
    appearance = action.appearance(router)
    assertEqual(appearance.title, "Other")
    assertEqual(appearance.state, "inactive")
    assertEqual(appearance.appearanceVersion, 1)
    assertEqual(appearance.presentationState, 0)

    for name in pairs(devices) do
      if name ~= "Other" then
        devices[name] = nil
      end
    end
    assertError(function()
      action.press(router)
    end, "no audio output device available")
    assertEqual(router.refreshes, 4, "failed routing must not refresh")
  end)

  test("audio output router discovers connected outputs without configuration", function()
    local current_name = "Speakers"
    local devices = {}
    local function device(name)
      return {
        name = function()
          return name
        end,
        setDefaultOutputDevice = function()
          current_name = name
          return true
        end,
      }
    end
    devices.Headphones = device("Headphones")
    devices.Speakers = device("Speakers")

    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/audio-output-router.lua", {
      audiodevice = {
        defaultOutputDevice = function()
          return devices[current_name]
        end,
        findOutputByName = function(name)
          return devices[name]
        end,
        allOutputDevices = function()
          return { devices.Speakers, devices.Headphones }
        end,
      },
    })
    local action = streamdeck.registrations[1]
    local router = context("automatic")

    assertEqual(action.appearance(router).title, "Speakers")
    action.press(router)
    assertEqual(current_name, "Headphones")
    assertEqual(router.refreshes, 1)
  end)

  test("audio output router reports unavailable APIs", function()
    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/audio-output-router.lua", {})
    local action = streamdeck.registrations[1]
    local router = context("unavailable")

    assertError(function()
      action.appearance(router)
    end, "audio output API unavailable")
    assertError(function()
      action.press(router)
    end, "audio output API unavailable")
    assertEqual(#streamdeck.refreshes, 0)
  end)
end
