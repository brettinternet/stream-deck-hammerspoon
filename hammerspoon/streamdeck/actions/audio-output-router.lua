-- Stream Deck action: cycles through up to four configured or connected audio outputs.
-- Use Hammerspoon Multi-State to show the selected output.

local action_id = "com.brettinternet.hammerspoon.audio-output-router"
local NOT_CONFIGURED = "__not_configured__"
local NOT_CONFIGURED_LABEL = "Not configured"

local function audio_api()
  if type(hs) ~= "table"
    or type(hs.audiodevice) ~= "table"
    or type(hs.audiodevice.defaultOutputDevice) ~= "function"
    or type(hs.audiodevice.findDeviceByUID) ~= "function"
    or type(hs.audiodevice.allOutputDevices) ~= "function" then
    error("audio output API unavailable")
  end
  return hs.audiodevice
end

local function device_value(device, method, description)
  if (type(device) ~= "table" and type(device) ~= "userdata")
    or type(device[method]) ~= "function" then
    error("audio output device " .. description .. " API unavailable")
  end

  local ok, value = pcall(device[method], device)
  if not ok or type(value) ~= "string" or value == "" then
    error("failed to read audio output device " .. description)
  end
  return value
end

local function output_uid(device)
  return device_value(device, "uid", "UID")
end

local function output_name(device)
  return device_value(device, "name", "name")
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

local function discover_output_options()
  local options = {
    { value = NOT_CONFIGURED, label = NOT_CONFIGURED_LABEL },
  }
  local records = {}
  local uid_by_uid = {}
  local uid_by_name = {}
  local seen = {}
  local default_candidate
  local query_error

  if type(hs) ~= "table"
    or type(hs.audiodevice) ~= "table"
    or type(hs.audiodevice.allOutputDevices) ~= "function" then
    return options, nil, nil, uid_by_uid, uid_by_name
  end

  local ok, devices = pcall(hs.audiodevice.allOutputDevices)
  if not ok then
    return options, nil, "failed to list audio output devices: " .. tostring(devices), uid_by_uid, uid_by_name
  end
  if type(devices) ~= "table" then
    return options, nil, "failed to list audio output devices: expected a table", uid_by_uid, uid_by_name
  end

  local function add_device(device)
    local metadata_ok, uid, name = pcall(function()
      return output_uid(device), output_name(device)
    end)
    if not metadata_ok then
      query_error = tostring(uid)
      return
    end
    if not seen[uid] then
      seen[uid] = true
      uid_by_uid[uid] = uid
      records[#records + 1] = { value = uid, label = name }
      if uid_by_name[name] == nil then
        uid_by_name[name] = uid
      end
    end
  end

  for _, device in ipairs(devices) do
    add_device(device)
  end

  if type(hs.audiodevice.defaultOutputDevice) == "function" then
    local default_ok, default_device = pcall(hs.audiodevice.defaultOutputDevice)
    if default_ok and default_device ~= nil then
      local metadata_ok, uid = pcall(output_uid, default_device)
      if metadata_ok then
        default_candidate = uid
      elseif query_error == nil then
        query_error = tostring(uid)
      end
    elseif not default_ok then
      query_error = "failed to find default output device: " .. tostring(default_device)
    end
  end

  table.sort(records, function(left, right)
    if left.label == right.label then
      return left.value < right.value
    end
    return left.label < right.label
  end)
  for index = 1, math.min(#records, 63) do
    options[#options + 1] = records[index]
  end
  if default_candidate ~= nil then
    local default_included = false
    for index = 2, #options do
      if options[index].value == default_candidate then
        default_included = true
        break
      end
    end
    if not default_included then
      default_candidate = nil
    end
  end
  return options, default_candidate, query_error, uid_by_uid, uid_by_name
end

local OUTPUT_OPTIONS, DEFAULT_OUTPUT_UID, OUTPUT_QUERY_ERROR, OUTPUT_UID_BY_UID, OUTPUT_UID_BY_NAME =
  discover_output_options()

local function configured_output_uids(context)
  local settings = settings_for(context)
  local configured = {}
  local seen = {}
  local function resolve_configured_uid(value)
    return OUTPUT_UID_BY_UID[value] or OUTPUT_UID_BY_NAME[value]
  end

  for index = 1, 4 do
    local configured_value = type(settings) == "table" and settings["output" .. index] or nil
    local uid
    if configured_value == nil or configured_value == "" then
      uid = index == 1 and DEFAULT_OUTPUT_UID or nil
    elseif configured_value ~= NOT_CONFIGURED and type(configured_value) == "string" then
      uid = resolve_configured_uid(configured_value)
    end
    if uid ~= nil and uid ~= NOT_CONFIGURED and not seen[uid] then
      seen[uid] = true
      configured[#configured + 1] = uid
    end
  end
  return configured
end

local function presentation_for_output(device, configured_uids)
  if not device then
    return nil, nil
  end

  local uid = output_uid(device)
  local name = output_name(device)
  for presentation_state, configured_uid in ipairs(configured_uids) do
    if uid == configured_uid then
      return presentation_state - 1, name
    end
  end
  return nil, name
end

local function appearance_for_output(device, configured_uids)
  local presentation_state, name = presentation_for_output(device, configured_uids)
  if presentation_state == nil then
    return {
      title = name or "No output",
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

local function find_next_output(audio, current_output, configured_uids)
  if #configured_uids == 0 then
    return nil
  end

  local current_state
  if current_output ~= nil then
    local current_uid = output_uid(current_output)
    for presentation_state, configured_uid in ipairs(configured_uids) do
      if current_uid == configured_uid then
        current_state = presentation_state - 1
        break
      end
    end
  end

  local first_state = current_state and current_state + 1 or 0
  for offset = 1, #configured_uids do
    local configured_uid = configured_uids[(first_state + offset - 1) % #configured_uids + 1]
    local ok, device = pcall(audio.findDeviceByUID, configured_uid)
    if ok and device ~= nil then
      return device
    end
  end
  return nil
end

return {
  id = action_id,
  name = "Audio output router",
  description = "Cycle through configured audio output devices.",
  settingsSchemaVersion = 1,
  settingsSchema = {
    {
      type = "select",
      key = "output1",
      label = "Output 1",
      description = "Primary output used by the router.",
      options = OUTPUT_OPTIONS,
      default = DEFAULT_OUTPUT_UID or NOT_CONFIGURED,
    },
    {
      type = "select",
      key = "output2",
      label = "Output 2",
      description = "Optional second output.",
      options = OUTPUT_OPTIONS,
      default = NOT_CONFIGURED,
    },
    {
      type = "select",
      key = "output3",
      label = "Output 3",
      description = "Optional third output.",
      options = OUTPUT_OPTIONS,
      default = NOT_CONFIGURED,
    },
    {
      type = "select",
      key = "output4",
      label = "Output 4",
      description = "Optional fourth output.",
      options = OUTPUT_OPTIONS,
      default = NOT_CONFIGURED,
    },
  },
  appearance = function(context)
    local audio = audio_api()
    if OUTPUT_QUERY_ERROR ~= nil and #OUTPUT_OPTIONS == 1 then
      error(OUTPUT_QUERY_ERROR)
    end
    local configured_uids = configured_output_uids(context)
    return appearance_for_output(default_output_device(audio), configured_uids)
  end,

  press = function(context)
    local audio = audio_api()
    if OUTPUT_QUERY_ERROR ~= nil and #OUTPUT_OPTIONS == 1 then
      error(OUTPUT_QUERY_ERROR)
    end
    local configured_uids = configured_output_uids(context)
    local target = find_next_output(audio, default_output_device(audio), configured_uids)
    if not target then
      error("no configured audio output device available")
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

