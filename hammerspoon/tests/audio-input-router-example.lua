return function(test, load_fixture, context, assertTrue, assertFalse, assertEqual, assertSame, assertError)
  test("audio input router cycles configured inputs and supports dial confirmation", function()
    local current_uid = "uid-macbook"
    local set_calls = {}
    local devices = {}
    local watchers = {}

    local function device(name, uid)
      local record = { muted = false }
      watchers[uid] = { starts = 0, stops = 0 }
      function record.name() return name end
      function record.uid() return uid end
      function record.inputMuted() return record.muted end
      function record.setDefaultInputDevice()
        current_uid = uid
        set_calls[#set_calls + 1] = uid
        return true
      end
      function record.watcherCallback(_, callback)
        watchers[uid].callback = callback
        return record
      end
      function record.watcherStart()
        watchers[uid].starts = watchers[uid].starts + 1
        return record
      end
      function record.watcherStop()
        watchers[uid].stops = watchers[uid].stops + 1
        return record
      end
      return record
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
    assertEqual(action.description,
      "Cycle inputs on a key, or select with a dial and press to confirm. Shows the current input mute state.")

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
    action.appear(router)
    assertEqual(watchers["uid-macbook"].starts, 1)
    local appearance = action.appearance(router)
    assertTrue(appearance.title:find("MacBook\nMicrophone", 1, true) == 1)
    assertEqual(appearance.badge, "MM")
    assertEqual(appearance.icon.kind, "custom")
    local live_icon = appearance.icon.dataBase64

    devices["uid-macbook"].muted = true
    watchers["uid-macbook"].callback("uid-macbook", "mute", "inpt", 0)
    assertEqual(router.refreshes, 1)
    appearance = action.appearance(router)
    assertTrue(appearance.title:find("MacBook\nMicrophone\nMuted", 1, true) == 1)
    assertFalse(appearance.icon.dataBase64 == live_icon)
    watchers["uid-macbook"].callback("uid-macbook", "mute", "outp", 0)
    assertEqual(router.refreshes, 1, "output mute events must not refresh an input")

    devices["uid-macbook"].muted = false
    watchers["uid-macbook"].callback("uid-macbook", "mute", "glob", 0)
    assertEqual(router.refreshes, 2)
    local refreshes_before_press = router.refreshes
    action.press(router)
    assertEqual(set_calls[1], "uid-interface")
    assertEqual(router.refreshes, refreshes_before_press + 1)
    assertTrue(action.appearance(router).title:find("USB\nInterface", 1, true) == 1)
    assertEqual(watchers["uid-macbook"].stops, 1)
    assertEqual(watchers["uid-interface"].starts, 1)

    current_uid = "uid-macbook"
    local dial = context("input-dial", router.settings, { controllerType = "encoder" })
    action.rotate(dial, 2)
    appearance = action.appearance(dial)
    assertEqual(appearance.title, "MacBook\nMicrophone\n→ Webcam\nMicrophone")
    assertEqual(appearance.value, "Press to confirm")
    action.push(dial)
    assertEqual(current_uid, "uid-webcam")
    assertEqual(action.appearance(dial).value, "Rotate to select")
    assertEqual(watchers["uid-interface"].stops, 1)
    assertEqual(watchers["uid-webcam"].starts, 1)
    action.disappear(router)
    assertEqual(watchers["uid-webcam"].stops, 1)
  end)

  test("audio input router skips disconnected devices and restores them after reconnect", function()
    local current_uid = "uid-usb"
    local usb_connected = true
    local timer_callback
    local timer_stops = 0
    local set_calls = {}
    local devices = {}

    local function device(name, uid)
      return {
        name = function() return name end,
        uid = function() return uid end,
        inputMuted = function() return false end,
        setDefaultInputDevice = function()
          current_uid = uid
          set_calls[#set_calls + 1] = uid
          return true
        end,
      }
    end

    devices["uid-macbook"] = device("MacBook Microphone", "uid-macbook")
    devices["uid-usb"] = device("USB Interface", "uid-usb")
    local fake_hs
    fake_hs = {
      audiodevice = {
        defaultInputDevice = function() return devices[current_uid] end,
        findDeviceByUID = function(uid)
          if uid == "uid-usb" and not usb_connected then return nil end
          return devices[uid]
        end,
        allInputDevices = function()
          if usb_connected then return { devices["uid-macbook"], devices["uid-usb"] } end
          return { devices["uid-macbook"] }
        end,
      },
      timer = {
        doEvery = function(interval, callback)
          assertEqual(interval, 1)
          timer_callback = function()
            local previous_hs = _G.hs
            _G.hs = fake_hs
            local ok, err = pcall(callback)
            _G.hs = previous_hs
            if not ok then error(err, 0) end
          end
          return {
            stop = function()
              timer_stops = timer_stops + 1
            end,
          }
        end,
      },
    }
    local streamdeck =
      load_fixture("hammerspoon/streamdeck/actions/audio-input-router.lua", fake_hs)
    local action = streamdeck.registrations[1]
    local router = context("reconnecting-input", {
      input1 = "uid-macbook",
      input2 = "uid-usb",
    })
    action.appear(router)

    usb_connected = false
    current_uid = "uid-macbook"
    timer_callback()
    assertEqual(router.refreshes, 1)
    assertFalse(action.appearance(router).title:find("USB", 1, true) ~= nil)
    action.press(router)
    assertEqual(set_calls[#set_calls], "uid-macbook")
    assertEqual(router.settings.input2, "uid-usb")

    usb_connected = true
    local refreshes_before_reconnect = router.refreshes
    timer_callback()
    assertEqual(router.refreshes, refreshes_before_reconnect + 1)
    assertTrue(action.appearance(router).title:find("USB\nInterface", 1, true) ~= nil)
    action.press(router)
    assertEqual(set_calls[#set_calls], "uid-usb")
    assertEqual(current_uid, "uid-usb")
    assertEqual(router.settings.input2, "uid-usb")

    action.disappear(router)
    assertEqual(timer_stops, 1)
  end)

  test("audio input router preserves devices without mute watcher support", function()
    local device = {
      name = function() return "Legacy Microphone" end,
      uid = function() return "uid-legacy" end,
      inputMuted = function() return nil end,
      setDefaultInputDevice = function() return true end,
    }
    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/audio-input-router.lua", {
      audiodevice = {
        defaultInputDevice = function() return device end,
        findDeviceByUID = function() return device end,
        allInputDevices = function() return { device } end,
      },
    })
    local action = streamdeck.registrations[1]
    local router = context("legacy-input")
    action.appear(router)
    local appearance = action.appearance(router)
    assertFalse(appearance.title:find("Muted", 1, true) ~= nil)
    assertEqual(appearance.icon.kind, "custom")
    action.disappear(router)
  end)

  test("audio input router reports unavailable input APIs", function()
    local unavailable = load_fixture("hammerspoon/streamdeck/actions/audio-input-router.lua", {})
    local action = unavailable.registrations[1]
    assertError(function()
      action.appearance(context("unavailable"))
    end, "audio input API unavailable")
  end)
end
