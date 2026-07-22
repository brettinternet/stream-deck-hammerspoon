return function(test, load_fixture, context, assertTrue, _, assertEqual)
  test("Spotify example controls playback, volume, tracks, and album artwork", function()
    local running = true
    local playing = false
    local volume = 50
    local next_calls = 0
    local previous_calls = 0
    local artwork_callback
    local scheduled

    local spotify = {
      isRunning = function() return running end,
      isPlaying = function() return playing end,
      getCurrentTrack = function() return "Test Track" end,
      getCurrentArtist = function() return "Test Artist" end,
      getCurrentTrackArtworkURL = function() return "artwork-token" end,
      getVolume = function() return volume end,
      setVolume = function(value) volume = value end,
      playpause = function() playing = not playing end,
      next = function() next_calls = next_calls + 1 end,
      previous = function() previous_calls = previous_calls + 1 end,
    }
    local artworkPngBySize = {
      [48] = "iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAAAHUlEQVR4nO3BAQEAAACCIP+vbkhAAQAAAAAAQLcGGzAAAesc2NAAAAAASUVORK5CYII=",
      [120] = "iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAIAAAC2BqGFAAAAQElEQVR4nO3BAQEAAACCIP+vbkhAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAnRipOAABp+xssgAAAABJRU5ErkJggg==",
    }
    local bitmapCalls = {}
    local fake_hs = {
      spotify = spotify,
      image = {
        imageFromURL = function(url, callback)
          assertEqual(url, "artwork-token")
          artwork_callback = callback
        end,
      },
      timer = {
        doEvery = function(seconds, callback)
          scheduled = {
            seconds = seconds,
            callback = callback,
            stop_calls = 0,
            stop = function(self) self.stop_calls = self.stop_calls + 1 end,
          }
          return scheduled
        end,
      },
    }

    local streamdeck = load_fixture("hammerspoon/streamdeck/actions/spotify.lua", fake_hs)
    local action = streamdeck.registrations[1]
    local button = context("spotify-button", nil, {
      controllerType = "keypad",
      imageSize = 120,
      device = { type = "stream-deck-plus", size = { columns = 4, rows = 2 } },
    })
    local volume_dial = context("spotify-volume", { dialControl = "volume" }, {
      controllerType = "encoder",
      imageSize = 48,
      device = { type = "stream-deck-plus", size = { columns = 4, rows = 2 } },
    })
    local track_dial = context("spotify-tracks", { dialControl = "tracks" }, {
      controllerType = "encoder",
      imageSize = 48,
      device = { type = "stream-deck-plus", size = { columns = 4, rows = 2 } },
    })

    assertEqual(action.id, "com.brettinternet.hammerspoon.spotify")
    assertEqual(action.settingsSchema[1].default, "volume")
    action.appear(button)
    action.appear(volume_dial)
    action.appear(track_dial)
    assertEqual(scheduled.seconds, 2)

    local initial_button = action.appearance(button)
    assertEqual(initial_button.title, "Test Track")
    assertEqual(initial_button.state, "inactive")
    assertEqual(initial_button.icon, nil, "artwork must not be emitted before it is fetched")

    local artwork_image = {
      bitmapRepresentation = function(_, size)
        bitmapCalls[size.w] = (bitmapCalls[size.w] or 0) + 1
        assertTrue(artworkPngBySize[size.w] ~= nil, "Spotify artwork must use the active context size")
        assertEqual(size.h, size.w)
        return {
          encodeAsURLString = function(_, scale, image_type)
            assertTrue(scale)
            assertEqual(image_type, "PNG")
            return "data:image/png;base64," .. artworkPngBySize[size.w] .. "\n"
          end,
        }
      end,
    }
    artwork_callback(artwork_image)

    local Protocol = require("streamdeck.protocol")
    local artwork = action.appearance(button).icon
    assertEqual(artwork.kind, "custom")
    assertEqual(artwork.dataBase64, artworkPngBySize[120],
      "keypad artwork must use canonical base64 at the active 120-pixel size")
    assertTrue(Protocol.validateAppearanceIcon(artwork),
      "keypad artwork must pass the protocol PNG validator")
    assertEqual(bitmapCalls[120], 1, "keypad artwork should be resized once")
    local valid, code = Protocol.validate({
      protocolVersion = 1,
      type = "appearance",
      actionId = action.id,
      instanceId = "spotify-button",
      title = "Test Track",
      state = 0,
      appearanceVersion = 1,
      icon = artwork,
    })
    assertTrue(valid, "album artwork must be a schema-valid PNG icon: " .. tostring(code))

    action.press(button)
    assertEqual(action.appearance(button).state, "active")

    action.rotate(volume_dial, 2, false)
    local volume_appearance = action.appearance(volume_dial)
    assertEqual(volume, 54)
    assertEqual(volume_appearance.value, "54%")
    assertEqual(volume_appearance.indicator, 54)
    assertEqual(volume_appearance.state, "active")
    assertEqual(volume_appearance.icon.dataBase64, artworkPngBySize[48],
      "encoder artwork must use canonical base64 at the 48-pixel icon size")
    assertTrue(Protocol.validateAppearanceIcon(volume_appearance.icon),
      "volume encoder artwork must pass the protocol PNG validator")
    assertEqual(bitmapCalls[48], 1, "encoder artwork should be resized once and cached")

    action.rotate(track_dial, 2, false)
    action.rotate(track_dial, -1, false)
    assertEqual(next_calls, 2)
    assertEqual(previous_calls, 1)
    local track_appearance = action.appearance(track_dial)
    assertEqual(track_appearance.value, "Previous / Next")
    assertEqual(track_appearance.indicator, 50)
    assertEqual(track_appearance.icon.dataBase64, artworkPngBySize[48])
    assertTrue(Protocol.validateAppearanceIcon(track_appearance.icon),
      "track encoder artwork must pass the protocol PNG validator")

    action.disappear(button)
    action.disappear(volume_dial)
    action.disappear(track_dial)
    assertEqual(scheduled.stop_calls, 1)
  end)
end
