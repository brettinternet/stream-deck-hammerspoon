-- Stream Deck action: cycles through up to four configured or connected audio outputs.
-- Use Hammerspoon Multi-State to show the selected output.

local action_id = "com.brettinternet.hammerspoon.audio-output-router"

local function audio_api()
  if type(hs) ~= "table"
    or type(hs.audiodevice) ~= "table"
    or type(hs.audiodevice.defaultOutputDevice) ~= "function"
    or type(hs.audiodevice.findOutputByName) ~= "function"
    or type(hs.audiodevice.allOutputDevices) ~= "function" then
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

local function settings_for(context)
  if context and type(context.getSettings) == "function" then
    return context:getSettings()
  end
  return context and context.settings
end

local function output_device_names(context, audio)
  local names = {}
  local settings = settings_for(context)
  if type(settings) == "table" then
    for index = 1, 4 do
      local name = settings["output" .. index]
      if type(name) == "string" and name ~= "" then
        names[#names + 1] = name
      end
    end
  end
  if #names > 0 then
    return names
  end

  local ok, devices = pcall(audio.allOutputDevices)
  if not ok or type(devices) ~= "table" then
    error("failed to list audio output devices")
  end
  local seen = {}
  for _, device in ipairs(devices) do
    local name = output_name(device)
    if not seen[name] then
      seen[name] = true
      names[#names + 1] = name
    end
  end
  table.sort(names)
  while #names > 4 do
    names[#names] = nil
  end
  return names
end


local function presentation_for_output(device, names)
  if not device then
    return nil
  end

  local name = output_name(device)
  for presentation_state, configured_name in ipairs(names) do
    if name == configured_name then
      return presentation_state - 1, configured_name
    end
  end
  return nil
end

local function appearance_for_output(device, names)
  local presentation_state, name = presentation_for_output(device, names)
  if presentation_state == nil then
    return {
      title = device and output_name(device) or "No output",
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

local function find_next_output(audio, current_output, names)
  local current_state = presentation_for_output(current_output, names)
  local first_state = current_state and current_state + 1 or 0

  for offset = 1, #names do
    local presentation_state = (first_state + offset - 1) % #names
    local configured_name = names[presentation_state + 1]
    local ok, device = pcall(audio.findOutputByName, configured_name)
    if ok and device ~= nil then
      return device
    end
  end
  return nil
end

return {
  id = action_id,
  name = "Audio output router",
  settingsSchemaVersion = 1,
  settingsSchema = {
    { type = "text", key = "output1", label = "Output 1", maxLength = 128 },
    { type = "text", key = "output2", label = "Output 2", maxLength = 128 },
    { type = "text", key = "output3", label = "Output 3", maxLength = 128 },
    { type = "text", key = "output4", label = "Output 4", maxLength = 128 },
  },
  appearance = function(context)
    local audio = audio_api()
    local names = output_device_names(context, audio)
    return appearance_for_output(default_output_device(audio), names)
  end,

  press = function(context)
    local audio = audio_api()
    local names = output_device_names(context, audio)
    local target = find_next_output(audio, default_output_device(audio), names)
    if not target then
      error("no audio output device available")
    end
    if (type(target) ~= "table" and type(target) ~= "userdata")
      or type(target.setDefaultOutputDevice) ~= "function" then
      error("audio output device API unavailable")
    end

    local ok, result = pcall(target.setDefaultOutputDevice, target)
    if not ok or result ~= true then
      error("failed to set default output device")
    end
  end,
}

