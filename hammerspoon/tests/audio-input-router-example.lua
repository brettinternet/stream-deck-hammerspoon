return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("audio input router cycles configured inputs and supports dial confirmation", function()
    local current_uid = "uid-macbook"
    local set_calls = {}
    local devices = {}

    local function device(name, uid)
      return {
        name = function() return name end,
        uid = function() return uid end,
        setDefaultInputDevice = function()
          current_uid = uid
          set_calls[#set_calls + 1] = uid
          return true
        end,
      }
    end

    devices["uid-macbook"] = device("MacBook Microphone", "uid-macbook")
    devices["uid-interface"] = device("USB Interface", "uid-interface")
    devices["uid-webcam"] = device("Webcam Microphone", "uid-webcam")
    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/audio-input-router.lua", {
      audiodevice = {
        defaultInputDevice = function() return devices[current_uid] end,
        findDeviceByUID = function(uid) return devices[uid] end,
        allInputDevices = function()
          return { devices["uid-webcam"], devices["uid-macbook"], devices["uid-interface"] }
        end,
      },
    })
    local action = streamdeck.registrations[1]
    assertEqual(action.id, "com.brettinternet.hammerspoon.audio-input-router")
    assertEqual(action.name, "Audio input router")
    assertEqual(action.description, "Cycle inputs on a key, or select with a dial and press to confirm.")

    local schema = action.settingsSchemaProvider()
    assertEqual(#schema, 4)
    assertEqual(schema[1].key, "input1")
    assertEqual(schema[1].label, "Input 1")
    assertEqual(schema[1].default, "uid-macbook")
    assertEqual(schema[4].section, "More inputs")
    assertEqual(schema[1].options[2].label, "MacBook Microphone")

    local router = context("input-router", {
      input1 = "uid-macbook",
      input2 = "uid-interface",
      input3 = "uid-webcam",
    })
    local appearance = action.appearance(router)
    assertTrue(appearance.title:find("MacBook\nMicrophone", 1, true) == 1)
    assertEqual(appearance.badge, "MM")
    assertEqual(appearance.icon.kind, "custom")

    action.press(router)
    assertEqual(set_calls[1], "uid-interface")
    assertEqual(router.refreshes, 1)
    assertTrue(action.appearance(router).title:find("USB\nInterface", 1, true) == 1)

    current_uid = "uid-macbook"
    local dial = context("input-dial", router.settings, { controllerType = "encoder" })
    action.rotate(dial, 2)
    appearance = action.appearance(dial)
    assertEqual(appearance.title, "MacBook\nMicrophone\n→ Webcam\nMicrophone")
    assertEqual(appearance.value, "Press to confirm")
    action.push(dial)
    assertEqual(current_uid, "uid-webcam")
    assertEqual(action.appearance(dial).value, "Rotate to select")
  end)

  test("audio input router reports unavailable input APIs", function()
    local unavailable = load_fixture("hammerspoon/streamdeck/actions/audio-input-router.lua", {})
    local action = unavailable.registrations[1]
    assertError(function()
      action.appearance(context("unavailable"))
    end, "audio input API unavailable")
  end)
end
