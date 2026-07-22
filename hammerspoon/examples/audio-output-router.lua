-- Hammerspoon configuration example: a Stream Deck key that cycles through four audio output devices.
-- Configure the device names below, then use Hammerspoon Multi-State to show the selected output.
-- Copy this file into ~/.hammerspoon or adapt it in your existing init.lua.

local streamdeck = require("streamdeck")

local action_id = "com.brettinternet.hammerspoon.audio-output-router"
local output_device_names = {
  "MacBook Pro Speakers",
  "Headphones",
  "Studio Display",
  "AirPods",
}

local function audio_api()
  if type(hs) ~= "table"
    or type(hs.audiodevice) ~= "table"
    or type(hs.audiodevice.defaultOutputDevice) ~= "function"
    or type(hs.audiodevice.findOutputByName) ~= "function" then
    error("audio output API unavailable")
  end
  return hs.audiodevice
end

local function output_name(device)
  if (type(device) ~= "table" and type(device) ~= "userdata")
    or type(device.name) ~= "function" then
    error("audio output device API unavailable")
  end

  local ok, name = pcall(device.name, device)
  if not ok or type(name) ~= "string" then
    error("failed to read audio output device name")
  end
  return name
end

local function default_output_device(audio)
  local ok, device = pcall(audio.defaultOutputDevice)
  if not ok then
    error("failed to find default output device: " .. tostring(device))
  end
  return device
end

local function presentation_for_output(device)
  if not device then
    return nil
  end

  local name = output_name(device)
  for presentation_state, configured_name in ipairs(output_device_names) do
    if name == configured_name then
      return presentation_state - 1, configured_name
    end
  end
  return nil
end

local function appearance_for_output(device)
  local presentation_state, name = presentation_for_output(device)
  if presentation_state == nil then
    return {
      title = "Other output",
      state = "inactive",
      appearanceVersion = 1,
      presentationState = 0,
    }
  end

  return {
    title = name,
    state = presentation_state == 0 and "inactive" or "active",
    appearanceVersion = 1,
    presentationState = presentation_state,
  }
end

local function find_next_output(audio, current_output)
  local current_state = presentation_for_output(current_output)
  local first_state = current_state and current_state + 1 or 0

  for offset = 1, #output_device_names do
    local presentation_state = (first_state + offset - 1) % #output_device_names
    local configured_name = output_device_names[presentation_state + 1]
    local ok, device = pcall(audio.findOutputByName, configured_name)
    if ok and device ~= nil then
      return device
    end
  end
  return nil
end

streamdeck.register({
  id = action_id,
  name = "Audio output router",

  appearance = function(_context)
    local audio = audio_api()
    return appearance_for_output(default_output_device(audio))
  end,

  press = function(_context)
    local audio = audio_api()
    local target = find_next_output(audio, default_output_device(audio))
    if not target then
      error("no configured output device available")
    end
    if (type(target) ~= "table" and type(target) ~= "userdata")
      or type(target.setDefaultOutputDevice) ~= "function" then
      error("audio output device API unavailable")
    end

    local ok, result = pcall(target.setDefaultOutputDevice, target)
    if not ok or result ~= true then
      error("failed to set default output device")
    end
    streamdeck.refresh(action_id)
  end,
})

-- The bridge owns the local authenticated connection; do not use hs.streamdeck.
streamdeck.start()
