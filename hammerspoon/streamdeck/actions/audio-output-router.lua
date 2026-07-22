-- Stream Deck action: route keys cycle outputs; dials select an output and confirm on press.

local action_id = "com.brettinternet.hammerspoon.audio-output-router"
local NOT_CONFIGURED = "__not_configured__"
local NOT_CONFIGURED_LABEL = "Not configured"
local helpers = require("streamdeck.helpers")
local pending_uid_by_instance = {}

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

local function discover_outputs()
  local options = {
    { value = NOT_CONFIGURED, label = NOT_CONFIGURED_LABEL },
  }
  local records = {}
  local by_uid = {}
  local uid_by_name = {}
  local default_uid
  local query_error
  if type(hs) ~= "table"
    or type(hs.audiodevice) ~= "table"
    or type(hs.audiodevice.allOutputDevices) ~= "function" then
    return options, nil, nil, by_uid, uid_by_name
  end

  local ok, devices = pcall(hs.audiodevice.allOutputDevices)
  if not ok then
    return options, nil, "failed to list audio output devices: " .. tostring(devices), by_uid, uid_by_name
  end
  if type(devices) ~= "table" then
    return options, nil, "failed to list audio output devices: expected a table", by_uid, uid_by_name
  end

  for _, device in ipairs(devices) do
    local metadata_ok, uid, name = pcall(function()
      return output_uid(device), output_name(device)
    end)
    if metadata_ok and by_uid[uid] == nil then
      local record = { uid = uid, name = name, device = device }
      by_uid[uid] = record
      if uid_by_name[name] == nil then uid_by_name[name] = uid end
      records[#records + 1] = record
    elseif not metadata_ok and query_error == nil then
      query_error = tostring(uid)
    end
  end

  local default_ok, default_device = pcall(hs.audiodevice.defaultOutputDevice)
  if default_ok and default_device ~= nil then
    local metadata_ok, uid = pcall(output_uid, default_device)
    if metadata_ok and by_uid[uid] ~= nil then default_uid = uid end
  elseif not default_ok then
    query_error = "failed to find default output device: " .. tostring(default_device)
  end

  table.sort(records, function(left, right)
    if left.name == right.name then return left.uid < right.uid end
    return left.name < right.name
  end)
  for index = 1, math.min(#records, 63) do
    options[#options + 1] = { value = records[index].uid, label = records[index].name }
  end
  return options, default_uid, query_error, by_uid, uid_by_name
end

local function settings_schema()
  local options, default_uid = discover_outputs()
  local fields = {}
  for index = 1, 4 do
    fields[index] = {
      type = "select",
      key = "output" .. index,
      label = "Output " .. index,
      description = index == 1 and "Primary output used by the router." or "Optional additional output.",
      options = options,
      default = index == 1 and (default_uid or NOT_CONFIGURED) or NOT_CONFIGURED,
      refreshable = true,
      section = index > 2 and "More outputs" or nil,
    }
  end
  return fields
end

local function configured_outputs(context)
  local _, default_uid, query_error, by_uid, uid_by_name = discover_outputs()
  local settings = settings_for(context)
  local configured = {}
  local seen = {}
  for index = 1, 4 do
    local value = type(settings) == "table" and settings["output" .. index] or nil
    local uid
    if value == nil or value == "" then
      uid = index == 1 and default_uid or nil
    elseif value ~= NOT_CONFIGURED and type(value) == "string" then
      uid = by_uid[value] and value or uid_by_name[value]
    end
    if uid ~= nil and not seen[uid] then
      seen[uid] = true
      configured[#configured + 1] = by_uid[uid]
    end
  end
  if #configured == 0 and query_error ~= nil then error(query_error) end
  return configured
end

local function current_output_index(current, outputs)
  if current == nil then return nil end
  local current_uid = output_uid(current)
  for index, output in ipairs(outputs) do
    if output.uid == current_uid then return index end
  end
  return nil
end

local function output_icon(name)
  local normalized = name:lower()
  if normalized:find("head", 1, true) or normalized:find("airpod", 1, true) then
    return helpers.icon("headphones", { foregroundColor = helpers.colors.accent })
  end
  if normalized:find("display", 1, true)
      or normalized:find("hdmi", 1, true)
      or normalized:find("monitor", 1, true) then
    return helpers.icon("display", { foregroundColor = helpers.colors.accent })
  end
  return helpers.icon("speaker", { foregroundColor = helpers.colors.accent })
end

local function output_badge(name)
  local badge = ""
  for word in name:gmatch("[%w]+") do
    badge = badge .. word:sub(1, 1):upper()
    if #badge >= 4 then break end
  end
  return badge ~= "" and badge or "OUT"
end

local function set_default_output(record)
  if record == nil
      or (type(record.device) ~= "table" and type(record.device) ~= "userdata")
      or type(record.device.setDefaultOutputDevice) ~= "function" then
    error("audio output device API unavailable")
  end
  local ok, result = pcall(record.device.setDefaultOutputDevice, record.device)
  if not ok or result ~= true then error("failed to set default output device") end
end

local function appearance_for(context)
  local audio = audio_api()
  local outputs = configured_outputs(context)
  local current = default_output_device(audio)
  local current_index = current_output_index(current, outputs)
  local current_name = current and output_name(current) or "No output"
  local device = type(context.getDevice) == "function" and context:getDevice() or nil
  local encoder = type(device) == "table" and device.controllerType == "encoder"

  if encoder then
    local pending_uid = pending_uid_by_instance[context.instanceId]
    local selected_index = current_index or 1
    if pending_uid ~= nil then
      for index, output in ipairs(outputs) do
        if output.uid == pending_uid then selected_index = index break end
      end
    end
    local selected = outputs[selected_index]
    local selected_name = selected and selected.name or current_name
    return {
      title = selected_name == current_name and current_name or (current_name .. " → " .. selected_name),
      state = selected_name == current_name and "inactive" or "active",
      appearanceVersion = 1,
      value = selected_name == current_name and "Rotate to select" or "Press to confirm",
      indicator = #outputs > 1 and ((selected_index - 1) / (#outputs - 1) * 100) or 0,
      icon = output_icon(selected_name),
    }
  end

  local next_output = outputs[((current_index or 0) % math.max(1, #outputs)) + 1]
  return {
    title = current_name .. (next_output and ("\n→ " .. next_output.name) or ""),
    state = current_index ~= nil and current_index > 1 and "active" or "inactive",
    appearanceVersion = 1,
    presentationState = current_index and current_index - 1 or 0,
    badge = output_badge(current_name),
    backgroundColor = helpers.colors.background,
    foregroundColor = helpers.colors.foreground,
    icon = output_icon(current_name),
  }
end

return {
  id = action_id,
  name = "Audio output router",
  description = "Cycle outputs on a key, or select with a dial and press to confirm.",
  category = "Audio",
  gesture = "Key press: next output · Dial: rotate to select, press to confirm",
  settingsSchemaVersion = 1,
  settingsSchemaProvider = settings_schema,

  appear = function(context)
    pending_uid_by_instance[context.instanceId] = nil
  end,

  disappear = function(context)
    pending_uid_by_instance[context.instanceId] = nil
  end,

  appearance = appearance_for,

  press = function(context)
    local audio = audio_api()
    local outputs = configured_outputs(context)
    if #outputs == 0 then error("no configured audio output device available") end
    local current = default_output_device(audio)
    local target = outputs[((current_output_index(current, outputs) or 0) % #outputs) + 1]
    set_default_output(target)
    context:success("Using " .. target.name, 1100)
  end,

  rotate = function(context, ticks)
    if type(ticks) ~= "number" or ticks == 0 then return end
    local audio = audio_api()
    local outputs = configured_outputs(context)
    if #outputs == 0 then error("no configured audio output device available") end
    local selected_index = current_output_index(default_output_device(audio), outputs) or 1
    local pending_uid = pending_uid_by_instance[context.instanceId]
    for index, output in ipairs(outputs) do
      if output.uid == pending_uid then selected_index = index break end
    end
    selected_index = ((selected_index - 1 + ticks) % #outputs) + 1
    pending_uid_by_instance[context.instanceId] = outputs[selected_index].uid
  end,

  push = function(context)
    local audio = audio_api()
    local outputs = configured_outputs(context)
    if #outputs == 0 then error("no configured audio output device available") end
    local pending_uid = pending_uid_by_instance[context.instanceId]
    local target
    for _, output in ipairs(outputs) do
      if output.uid == pending_uid then target = output break end
    end
    if target == nil then
      target = outputs[current_output_index(default_output_device(audio), outputs) or 1]
    end
    set_default_output(target)
    pending_uid_by_instance[context.instanceId] = nil
    context:success("Using " .. target.name, 1100)
  end,
}
