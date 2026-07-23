local helpers = require("streamdeck.helpers")

local router = {}

local NOT_CONFIGURED = "__not_configured__"
local NOT_CONFIGURED_LABEL = "Not configured"

local modes = {
  input = {
    action_id = "com.brettinternet.hammerspoon.audio-input-router",
    name = "Audio input router",
    singular = "input",
    plural = "inputs",
    setting_prefix = "input",
    default_method = "defaultInputDevice",
    list_method = "allInputDevices",
    set_method = "setDefaultInputDevice",
    icon_for_name = function() return "microphone" end,
    badge = "IN",
  },
  output = {
    action_id = "com.brettinternet.hammerspoon.audio-output-router",
    name = "Audio output router",
    singular = "output",
    plural = "outputs",
    setting_prefix = "output",
    default_method = "defaultOutputDevice",
    list_method = "allOutputDevices",
    set_method = "setDefaultOutputDevice",
    icon_for_name = function(name)
      local normalized = name:lower()
      if normalized:find("head", 1, true) or normalized:find("airpod", 1, true) then
        return "headphones"
      end
      if normalized:find("display", 1, true)
          or normalized:find("hdmi", 1, true)
          or normalized:find("monitor", 1, true) then
        return "display"
      end
      return "speaker"
    end,
    badge = "OUT",
  },
}

local function audio_api(mode)
  if type(hs) ~= "table"
    or type(hs.audiodevice) ~= "table"
    or type(hs.audiodevice[mode.default_method]) ~= "function"
    or type(hs.audiodevice.findDeviceByUID) ~= "function"
    or type(hs.audiodevice[mode.list_method]) ~= "function" then
    error("audio " .. mode.singular .. " API unavailable")
  end
  return hs.audiodevice
end

local function device_value(mode, device, method, description)
  if (type(device) ~= "table" and type(device) ~= "userdata")
    or type(device[method]) ~= "function" then
    error("audio " .. mode.singular .. " device " .. description .. " API unavailable")
  end
  local ok, value = pcall(device[method], device)
  if not ok or type(value) ~= "string" or value == "" then
    error("failed to read audio " .. mode.singular .. " device " .. description)
  end
  return value
end

local function device_uid(mode, device)
  return device_value(mode, device, "uid", "UID")
end

local function device_name(mode, device)
  return device_value(mode, device, "name", "name")
end

local function default_device(mode, audio)
  local ok, device = pcall(audio[mode.default_method])
  if not ok then
    error("failed to find default " .. mode.singular .. " device: " .. tostring(device))
  end
  return device
end

local function settings_for(context)
  if context and type(context.getSettings) == "function" then
    return context:getSettings()
  end
  return context and context.settings
end

local function discover_devices(mode)
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
    or type(hs.audiodevice[mode.list_method]) ~= "function" then
    return options, nil, nil, by_uid, uid_by_name
  end

  local ok, devices = pcall(hs.audiodevice[mode.list_method])
  if not ok then
    return options, nil, "failed to list audio " .. mode.plural .. ": " .. tostring(devices), by_uid, uid_by_name
  end
  if type(devices) ~= "table" then
    return options, nil, "failed to list audio " .. mode.plural .. ": expected a table", by_uid, uid_by_name
  end

  for _, device in ipairs(devices) do
    local metadata_ok, uid, name = pcall(function()
      return device_uid(mode, device), device_name(mode, device)
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

  local default_ok, current = pcall(hs.audiodevice[mode.default_method])
  if default_ok and current ~= nil then
    local metadata_ok, uid = pcall(device_uid, mode, current)
    if metadata_ok and by_uid[uid] ~= nil then default_uid = uid end
  elseif not default_ok then
    query_error = "failed to find default " .. mode.singular .. " device: " .. tostring(current)
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

local function settings_schema(mode)
  local options, default_uid = discover_devices(mode)
  local fields = {}
  for index = 1, 4 do
    fields[index] = {
      type = "select",
      key = mode.setting_prefix .. index,
      label = mode.singular:gsub("^%l", string.upper) .. " " .. index,
      description = index == 1 and ("Primary " .. mode.singular .. " used by the router.")
        or ("Optional additional " .. mode.singular .. "."),
      options = options,
      default = index == 1 and (default_uid or NOT_CONFIGURED) or NOT_CONFIGURED,
      refreshable = true,
      section = index > 2 and ("More " .. mode.plural) or nil,
    }
  end
  return fields
end

local function configured_devices(mode, context)
  local _, default_uid, query_error, by_uid, uid_by_name = discover_devices(mode)
  local settings = settings_for(context)
  local configured = {}
  local seen = {}
  for index = 1, 4 do
    local value = type(settings) == "table" and settings[mode.setting_prefix .. index] or nil
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

local function current_device_index(mode, current, devices)
  if current == nil then return nil end
  local current_uid = device_uid(mode, current)
  for index, device in ipairs(devices) do
    if device.uid == current_uid then return index end
  end
  return nil
end

local function device_badge(mode, name)
  local badge = ""
  for word in name:gmatch("[%w]+") do
    badge = badge .. word:sub(1, 1):upper()
    if #badge >= 4 then break end
  end
  return badge ~= "" and badge or mode.badge
end

local function set_default_device(mode, record)
  if record == nil
    or (type(record.device) ~= "table" and type(record.device) ~= "userdata")
    or type(record.device[mode.set_method]) ~= "function" then
    error("audio " .. mode.singular .. " device API unavailable")
  end
  local ok, result = pcall(record.device[mode.set_method], record.device)
  if not ok or result ~= true then
    error("failed to set default " .. mode.singular .. " device")
  end
end

function router.new(kind)
  local mode = modes[kind]
  if mode == nil then error("unknown audio router kind: " .. tostring(kind)) end
  local pending_uid_by_instance = {}

  local function appearance_for(context)
    local audio = audio_api(mode)
    local devices = configured_devices(mode, context)
    local current = default_device(mode, audio)
    local current_index = current_device_index(mode, current, devices)
    local current_name = current and device_name(mode, current) or ("No " .. mode.singular)
    local device = type(context.getDevice) == "function" and context:getDevice() or nil
    local encoder = type(device) == "table" and device.controllerType == "encoder"

    if encoder then
      local pending_uid = pending_uid_by_instance[context.instanceId]
      local selected_index = current_index or 1
      if pending_uid ~= nil then
        for index, record in ipairs(devices) do
          if record.uid == pending_uid then selected_index = index break end
        end
      end
      local selected = devices[selected_index]
      local selected_name = selected and selected.name or current_name
      return {
        title = selected_name == current_name and current_name or (current_name .. " → " .. selected_name),
        state = selected_name == current_name and "inactive" or "active",
        appearanceVersion = 1,
        value = selected_name == current_name and "Rotate to select" or "Press to confirm",
        indicator = #devices > 1 and ((selected_index - 1) / (#devices - 1) * 100) or 0,
        icon = helpers.icon(mode.icon_for_name(selected_name), { foregroundColor = helpers.colors.accent }),
      }
    end

    local next_device = devices[((current_index or 0) % math.max(1, #devices)) + 1]
    return {
      title = current_name .. (next_device and ("\n→ " .. next_device.name) or ""),
      state = current_index ~= nil and current_index > 1 and "active" or "inactive",
      appearanceVersion = 1,
      presentationState = current_index and current_index - 1 or 0,
      badge = device_badge(mode, current_name),
      backgroundColor = helpers.colors.background,
      foregroundColor = helpers.colors.foreground,
      icon = helpers.icon(mode.icon_for_name(current_name), { foregroundColor = helpers.colors.accent }),
    }
  end

  return {
    id = mode.action_id,
    name = mode.name,
    description = "Cycle " .. mode.plural .. " on a key, or select with a dial and press to confirm.",
    category = "Audio",
    gesture = "Key press: next " .. mode.singular .. " · Dial: rotate to select, press to confirm",
    settingsSchemaVersion = 1,
    settingsSchemaProvider = function() return settings_schema(mode) end,

    appear = function(context)
      pending_uid_by_instance[context.instanceId] = nil
    end,

    disappear = function(context)
      pending_uid_by_instance[context.instanceId] = nil
    end,

    appearance = appearance_for,

    press = function(context)
      local audio = audio_api(mode)
      local devices = configured_devices(mode, context)
      if #devices == 0 then error("no configured audio " .. mode.singular .. " device available") end
      local current = default_device(mode, audio)
      local target = devices[((current_device_index(mode, current, devices) or 0) % #devices) + 1]
      set_default_device(mode, target)
      context:success("Using " .. target.name, 1100)
    end,

    rotate = function(context, ticks)
      if type(ticks) ~= "number" or ticks == 0 then return end
      local audio = audio_api(mode)
      local devices = configured_devices(mode, context)
      if #devices == 0 then error("no configured audio " .. mode.singular .. " device available") end
      local selected_index = current_device_index(mode, default_device(mode, audio), devices) or 1
      local pending_uid = pending_uid_by_instance[context.instanceId]
      for index, record in ipairs(devices) do
        if record.uid == pending_uid then selected_index = index break end
      end
      selected_index = ((selected_index - 1 + ticks) % #devices) + 1
      pending_uid_by_instance[context.instanceId] = devices[selected_index].uid
    end,

    push = function(context)
      local audio = audio_api(mode)
      local devices = configured_devices(mode, context)
      if #devices == 0 then error("no configured audio " .. mode.singular .. " device available") end
      local pending_uid = pending_uid_by_instance[context.instanceId]
      local target
      for _, record in ipairs(devices) do
        if record.uid == pending_uid then target = record break end
      end
      if target == nil then
        target = devices[current_device_index(mode, default_device(mode, audio), devices) or 1]
      end
      set_default_device(mode, target)
      pending_uid_by_instance[context.instanceId] = nil
      context:success("Using " .. target.name, 1100)
    end,
  }
end

return router
