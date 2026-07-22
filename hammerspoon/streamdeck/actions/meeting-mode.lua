-- Stream Deck action: a Stream Deck key that toggles meeting mode.
-- Meeting mode mutes the default microphone and prevents display sleep; the key is active only when both are set.

local action_id = "com.brettinternet.hammerspoon.meeting-mode"
local idle_type = "displayIdle"

local function audio_api()
  if type(hs) ~= "table"
    or type(hs.audiodevice) ~= "table"
    or type(hs.audiodevice.defaultInputDevice) ~= "function" then
    error("audio input API unavailable")
  end
  return hs.audiodevice
end

local function default_microphone()
  local audio = audio_api()
  local ok, microphone = pcall(audio.defaultInputDevice)
  if not ok then
    error("failed to find default input device: " .. tostring(microphone))
  end
  if microphone == nil then
    return nil
  end
  if (type(microphone) ~= "table" and type(microphone) ~= "userdata")
    or type(microphone.inputMuted) ~= "function"
    or type(microphone.setInputMuted) ~= "function" then
    error("microphone mute API unavailable")
  end
  return microphone
end

local function read_microphone_state(microphone)
  local ok, muted = pcall(microphone.inputMuted, microphone)
  if not ok then
    error("failed to read microphone mute state: " .. tostring(muted))
  end
  if type(muted) ~= "boolean" then
    error("failed to read microphone mute state: expected boolean result")
  end
  return muted
end

local function caffeinate_api()
  if type(hs) ~= "table"
    or type(hs.caffeinate) ~= "table"
    or type(hs.caffeinate.get) ~= "function"
    or type(hs.caffeinate.toggle) ~= "function" then
    error("display idle caffeinate API unavailable")
  end
  return hs.caffeinate
end

local function read_display_idle_state()
  local caffeinate = caffeinate_api()
  local ok, enabled = pcall(caffeinate.get, idle_type)
  if not ok then
    error("failed to read display idle state: " .. tostring(enabled))
  end
  if type(enabled) ~= "boolean" then
    error("failed to read display idle state: expected boolean result")
  end
  return enabled
end

local function read_mode_state()
  local microphone = default_microphone()
  if not microphone then
    return nil
  end
  return read_microphone_state(microphone), read_display_idle_state()
end

local function set_microphone_state(microphone, desired)
  local ok, result = pcall(microphone.setInputMuted, microphone, desired)
  if not ok then
    error("failed to set microphone mute state: " .. tostring(result))
  end
  if result ~= true then
    error("failed to set microphone mute state: expected true result")
  end
end

local function set_display_idle_state(current, desired)
  if current == desired then
    return
  end

  local caffeinate = caffeinate_api()
  local ok, enabled = pcall(caffeinate.toggle, idle_type)
  if not ok then
    error("failed to toggle display idle prevention: " .. tostring(enabled))
  end
  if type(enabled) ~= "boolean" then
    error("failed to toggle display idle prevention: expected boolean result")
  end
  if enabled ~= desired then
    error("failed to toggle display idle prevention: unexpected state result")
  end
end

return {
  id = action_id,
  name = "Meeting mode",

  appearance = function(_context)
    local microphone_muted, display_idle = read_mode_state()
    if microphone_muted == nil then
      return {
        title = "No mic",
        state = "inactive",
      }
    end

    if microphone_muted and display_idle then
      return {
        title = "Meeting",
        state = "active",
      }
    end

    return {
      title = "Normal",
      state = "inactive",
    }
  end,

  press = function(context)
    local microphone = default_microphone()
    if not microphone then
      error("no default input device")
    end

    local microphone_muted = read_microphone_state(microphone)
    local display_idle = read_display_idle_state()
    local desired = not (microphone_muted and display_idle)

    set_microphone_state(microphone, desired)
    set_display_idle_state(display_idle, desired)
  end,
}

