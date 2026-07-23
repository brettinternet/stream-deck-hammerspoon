return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("audio output router exposes deterministic UID choices and cycles configured outputs", function()
    local current_uid = "uid-speakers"
    local set_calls = {}
    local devices = {}

    local function device(name, uid)
      return {
        name = function()
          return name
        end,
        uid = function()
          return uid
        end,
        setDefaultOutputDevice = function()
          current_uid = uid
          set_calls[#set_calls + 1] = uid
          return true
        end,
      }
    end

    devices["uid-speakers"] = device("MacBook Pro Speakers", "uid-speakers")
    devices["uid-headphones"] = device("Headphones", "uid-headphones")
    devices["uid-display"] = device("Studio Display", "uid-display")
    devices["uid-airpods"] = device("AirPods", "uid-airpods")
    devices["uid-other"] = device("Other", "uid-other")

    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/audio-output-router.lua", {
      audiodevice = {
        defaultOutputDevice = function()
          return devices[current_uid]
        end,
        findDeviceByUID = function(uid)
          return devices[uid]
        end,
        allOutputDevices = function()
          return {
            devices["uid-display"],
            devices["uid-speakers"],
            devices["uid-headphones"],
            devices["uid-speakers"],
            devices["uid-airpods"],
          }
        end,
      },
    })
    local action = streamdeck.registrations[1]
    assertEqual(action.description, "Cycle outputs on a key, or select with a dial and press to confirm.")
    local schema = action.settingsSchemaProvider()
    assertEqual(#schema, 4)
    for index, field in ipairs(schema) do
      assertEqual(field.type, "select")
      assertEqual(field.key, "output" .. index)
      assertTrue(type(field.description) == "string" and field.description ~= "")
      assertEqual(field.options[1].value, "__not_configured__")
      assertEqual(field.options[1].label, "Not configured")
      assertTrue(field.refreshable)
      assertEqual(field.section, index > 2 and "More outputs" or nil)
    end
    local options = schema[1].options
    assertEqual(#options, 5, "duplicate UIDs must be removed")
    assertEqual(options[2].label, "AirPods")
    assertEqual(options[2].value, "uid-airpods")
    assertEqual(options[3].label, "Headphones")
    assertEqual(options[4].label, "MacBook Pro Speakers")
    assertEqual(options[5].label, "Studio Display")
    assertEqual(schema[1].default, "uid-speakers")
    assertEqual(schema[2].default, "__not_configured__")

    local router = context("router", {
      output1 = "uid-speakers",
      output2 = "uid-headphones",
      output3 = "uid-display",
      output4 = "uid-airpods",
    })
    local appearance = action.appearance(router)
    assertTrue(appearance.title:find("MacBook\nPro\nSpeakers", 1, true) == 1)
    assertEqual(appearance.state, "inactive")
    assertEqual(appearance.appearanceVersion, 1)
    assertEqual(appearance.presentationState, 0)
    assertEqual(appearance.badge, "MPS")
    assertEqual(appearance.icon.kind, "custom")
    local speaker_icon = appearance.icon.dataBase64

    for presentation_state, uid in ipairs({ "uid-headphones", "uid-display", "uid-airpods" }) do
      action.press(router)
      assertEqual(set_calls[presentation_state], uid)
      assertEqual(router.refreshes, presentation_state)
      appearance = action.appearance(router)
      assertTrue(appearance.title:find(devices[uid].name():gsub("%s+", "\n"), 1, true) == 1)
      assertEqual(appearance.state, "active")
      assertEqual(appearance.presentationState, presentation_state)
      if presentation_state == 1 then
        assertFalse(appearance.icon.dataBase64 == speaker_icon,
          "headphone outputs must retain their distinct icon")
      end
    end

    action.press(router)
    assertEqual(set_calls[4], "uid-speakers")
    assertEqual(action.appearance(router).presentationState, 0)

    current_uid = "uid-other"
    appearance = action.appearance(router)
    assertTrue(appearance.title:find("Other", 1, true) == 1)
    assertEqual(appearance.state, "inactive")
    assertEqual(appearance.presentationState, 0)
    current_uid = "uid-headphones"
    local explicit_unconfigured_router = context("explicitly unconfigured", {
      output1 = "__not_configured__",
      output2 = "uid-headphones",
    })
    action.press(explicit_unconfigured_router)
    assertEqual(set_calls[5], "uid-headphones")

    current_uid = "uid-speakers"
    local dial = context("dial", router.settings, { controllerType = "encoder" })
    appearance = action.appearance(dial)
    assertEqual(appearance.value, "Rotate to select")
    action.rotate(dial, 1)
    appearance = action.appearance(dial)
    assertEqual(appearance.title, "MacBook\nPro\nSpeakers\n→ Headphones")
    assertEqual(appearance.value, "Press to confirm")
    action.push(dial)
    assertEqual(current_uid, "uid-headphones")
    assertEqual(action.appearance(dial).value, "Rotate to select")
  end)


  test("audio output router resolves legacy saved names", function()
    local current_uid = "uid-speakers"
    local set_calls = {}
    local devices = {}

    local function device(name, uid)
      return {
        name = function()
          return name
        end,
        uid = function()
          return uid
        end,
        setDefaultOutputDevice = function()
          current_uid = uid
          set_calls[#set_calls + 1] = uid
          return true
        end,
      }
    end

    devices["uid-speakers"] = device("MacBook Pro Speakers", "uid-speakers")
    devices["uid-headphones"] = device("Headphones", "uid-headphones")
    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/audio-output-router.lua", {
      audiodevice = {
        defaultOutputDevice = function()
          return devices[current_uid]
        end,
        findDeviceByUID = function(uid)
          return devices[uid]
        end,
        allOutputDevices = function()
          return {
            devices["uid-speakers"],
            devices["uid-headphones"],
          }
        end,
      },
    })
    local action = streamdeck.registrations[1]
    local router = context("legacy names", {
      output1 = "MacBook Pro Speakers",
      output2 = "Headphones",
    })

    action.press(router)
    assertEqual(set_calls[1], "uid-headphones")
    assertEqual(current_uid, "uid-headphones")
    action.press(router)
    assertEqual(set_calls[2], "uid-speakers")
    assertEqual(current_uid, "uid-speakers")
  end)

  test("audio output router skips disconnected UID choices", function()
    local current_uid = "uid-speakers"
    local devices = {
      ["uid-speakers"] = {
        name = function() return "MacBook Pro Speakers" end,
        uid = function() return "uid-speakers" end,
        setDefaultOutputDevice = function()
          current_uid = "uid-speakers"
          return true
        end,
      },
      ["uid-display"] = {
        name = function() return "Studio Display" end,
        uid = function() return "uid-display" end,
        setDefaultOutputDevice = function()
          current_uid = "uid-display"
          return true
        end,
      },
    }
    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/audio-output-router.lua", {
      audiodevice = {
        defaultOutputDevice = function()
          return devices[current_uid]
        end,
        findDeviceByUID = function(uid)
          return devices[uid]
        end,
        allOutputDevices = function()
          return { devices["uid-display"], devices["uid-speakers"] }
        end,
      },
    })
    local action = streamdeck.registrations[1]
    local router = context("disconnected", {
      output1 = "uid-missing",
      output2 = "uid-display",
    })
    current_uid = "uid-display"
    action.press(router)
    assertEqual(current_uid, "uid-display")
    assertEqual(router.refreshes, 1)

    devices["uid-display"] = nil
    assertError(function()
      action.press(router)
    end, "no configured audio output device available")
    assertEqual(router.refreshes, 1)
  end)

  test("audio output router handles empty queries and unavailable APIs safely", function()
    local empty = load_fixture("hammerspoon/streamdeck/actions/audio-output-router.lua", {
      audiodevice = {
        defaultOutputDevice = function()
          return nil
        end,
        findDeviceByUID = function()
          return nil
        end,
        allOutputDevices = function()
          return {}
        end,
      },
    })
    local empty_action = empty.registrations[1]
    local empty_schema = empty_action.settingsSchemaProvider()
    assertEqual(#empty_schema[1].options, 1)
    assertEqual(empty_schema[1].default, "__not_configured__")
    assertEqual(empty_action.appearance(context("empty")).title, "No\noutput")
    assertError(function()
      empty_action.press(context("empty"))
    end, "no configured audio output device available")

    local unavailable = load_fixture("hammerspoon/streamdeck/actions/audio-output-router.lua", {})
    assertError(function()
      unavailable.registrations[1].appearance(context("unavailable"))
    end, "audio output API unavailable")
    assertError(function()
      unavailable.registrations[1].press(context("unavailable"))
    end, "audio output API unavailable")
  end)
end
