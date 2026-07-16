-- Hammerspoon configuration example: a generic Stream Deck microphone mute key.
-- Copy this file into ~/.hammerspoon or adapt it in your existing init.lua.

local streamdeck = require("streamdeck")

local function default_microphone()
  return hs.audiodevice.defaultInputDevice()
end

streamdeck.register({
  id = "com.brettinternet.hammerspoon.microphone-toggle",
  name = "Microphone mute",

  appearance = function(_context)
    local microphone = default_microphone()
    if not microphone then
      return {
        title = "No mic",
        state = "inactive",
      }
    end

    if microphone:muted() then
      return {
        title = "Muted",
        state = "active",
      }
    end

    return {
      title = "Live",
      state = "inactive",
    }
  end,

  press = function(context)
    local microphone = default_microphone()
    if not microphone then
      error("no default input device")
    end

    microphone:setMuted(not microphone:muted())
    context:refresh()
  end,
})

-- The bridge owns the local authenticated connection; do not use hs.streamdeck.
streamdeck.start()
