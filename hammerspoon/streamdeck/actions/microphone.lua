-- Stream Deck action: a Stream Deck key that toggles the default microphone mute state.
-- The key shows Muted or Live and reports No mic when Hammerspoon has no default input device.

local function default_microphone()
  return hs.audiodevice.defaultInputDevice()
end
local function microphone_muted(microphone)
  local muted = microphone:inputMuted()
  if type(muted) ~= "boolean" then
    error("microphone input mute state unavailable")
  end
  return muted
end


return {
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

    if microphone_muted(microphone) then
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

    local muted = microphone_muted(microphone)
    if microphone:setInputMuted(not muted) ~= true then
      error("failed to set microphone mute state")
    end
  end,
}

