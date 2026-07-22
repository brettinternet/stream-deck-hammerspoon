-- Stream Deck action: toggle a selected microphone and optionally mute meeting apps.

local helpers = require("streamdeck.helpers")

local action_id = "com.brettinternet.hammerspoon.microphone-toggle"
local default_value = "default"

local function require_audio_api(method_name)
  if type(hs) ~= "table"
    or type(hs.audiodevice) ~= "table"
    or type(hs.audiodevice[method_name]) ~= "function" then
    error("audio input API unavailable")
  end
  return hs.audiodevice
end

local function device_name(device)
  if (type(device) ~= "table" and type(device) ~= "userdata")
    or type(device.name) ~= "function" then
    error("microphone device name API unavailable")
  end
  local ok, name = pcall(device.name, device)
  if not ok or type(name) ~= "string" or name == "" then
    error("failed to read microphone device name")
  end
  return name
end

local function device_uid(device)
  if (type(device) ~= "table" and type(device) ~= "userdata")
    or type(device.uid) ~= "function" then
    error("microphone device UID API unavailable")
  end
  local ok, uid = pcall(device.uid, device)
  if not ok or type(uid) ~= "string" or uid == "" then
    error("failed to read microphone device UID")
  end
  return uid
end

local function all_input_devices()
  local audio = require_audio_api("allInputDevices")
  local ok, devices = pcall(audio.allInputDevices)
  if not ok then
    error("failed to list input devices: " .. tostring(devices))
  end
  if devices == nil then
    return {}
  end
  if type(devices) ~= "table" then
    error("failed to list input devices: expected table")
  end
  return devices
end

local function default_input_device()
  local audio = require_audio_api("defaultInputDevice")
  local ok, device = pcall(audio.defaultInputDevice)
  if not ok then
    error("failed to find default input device: " .. tostring(device))
  end
  return device
end

local function input_device_record_less(left, right)
  if left.label == right.label then
    return left.value < right.value
  end
  return left.label < right.label
end

local function input_device_options()
  local devices = all_input_devices()
  local default_device = default_input_device()
  local default_name = default_device and device_name(default_device) or "No input device"
  local default_uid = default_device and device_uid(default_device) or nil
  local options = {
    { value = default_value, label = "Default input — " .. default_name },
  }
  local records_by_uid = {}
  for _, device in ipairs(devices) do
    local uid = device_uid(device)
    local name = device_name(device)
    if uid ~= default_value then
      local record = {
        value = uid,
        label = name,
      }
      local existing = records_by_uid[uid]
      if existing == nil or input_device_record_less(record, existing) then
        records_by_uid[uid] = record
      end
    end
  end
  if default_uid ~= nil and default_uid ~= default_value and records_by_uid[default_uid] == nil then
    records_by_uid[default_uid] = {
      value = default_uid,
      label = default_name,
    }
  end

  local records = {}
  for _, record in pairs(records_by_uid) do
    records[#records + 1] = record
  end
  table.sort(records, input_device_record_less)

  local selected_records = {}
  local selected_uids = {}
  if default_uid ~= nil and default_uid ~= default_value then
    selected_records[#selected_records + 1] = records_by_uid[default_uid]
    selected_uids[default_uid] = true
  end
  for _, record in ipairs(records) do
    if #selected_records >= 63 then
      break
    end
    if not selected_uids[record.value] then
      selected_records[#selected_records + 1] = record
      selected_uids[record.value] = true
    end
  end
  table.sort(selected_records, input_device_record_less)
  for _, record in ipairs(selected_records) do
    options[#options + 1] = record
  end
  return options
end

local function discover_input_device_options()
  local ok, options = pcall(input_device_options)
  if ok then
    return options
  end
  return {
    { value = default_value, label = "Default input — unavailable" },
  }
end

-- Populate the editor choices when the action module is loaded, while runtime
-- resolution below still follows devices that are currently connected.
local input_device_options_at_load = discover_input_device_options()

local function settings_for(context)
  local settings
  if context and type(context.getSettings) == "function" then
    settings = context:getSettings()
  elseif context then
    settings = context.settings
  end
  if type(settings) ~= "table" then
    return default_value, false
  end
  local selected = settings.inputDevice
  if type(selected) ~= "string" or selected == "" then
    selected = default_value
  end
  return selected, settings.muteMeetingApps == true
end

local function resolve_input_device(selected)
  if selected == default_value then
    return default_input_device()
  end
  for _, device in ipairs(all_input_devices()) do
    if device_uid(device) == selected then
      return device
    end
  end
  error("selected input device unavailable: " .. tostring(selected))
end

local function microphone_muted(device)
  if (type(device) ~= "table" and type(device) ~= "userdata")
    or type(device.inputMuted) ~= "function" then
    error("microphone mute API unavailable")
  end
  local ok, muted = pcall(device.inputMuted, device)
  if not ok then
    error("failed to read microphone mute state: " .. tostring(muted))
  end
  if type(muted) ~= "boolean" then
    error("failed to read microphone mute state: expected boolean result")
  end
  return muted
end

local function set_microphone_muted(device, muted)
  if type(device.setInputMuted) ~= "function" then
    error("microphone mute API unavailable")
  end
  local ok, result = pcall(device.setInputMuted, device, muted)
  if not ok then
    error("failed to set microphone mute state: " .. tostring(result))
  end
  if result ~= true then
    error("failed to set microphone mute state: expected true result")
  end
end

local meeting_apps = {
  { name = "Zoom", bundle_id = "us.zoom.xos", key = "a" },
  { name = "Microsoft Teams", bundle_id = "com.microsoft.teams2", key = "m" },
  { name = "Microsoft Teams", bundle_id = "com.microsoft.teams", key = "m" },
  { name = "Slack", bundle_id = "com.tinyspeck.slackmacgap", key = "space" },
}

local function require_application_api(method_name)
  if type(hs) ~= "table"
    or type(hs.application) ~= "table"
    or type(hs.application[method_name]) ~= "function" then
    error("application." .. method_name .. " unavailable")
  end
end

local function running_application(bundle_id)
  require_application_api("get")
  local ok, application = pcall(hs.application.get, bundle_id)
  if not ok then
    error("failed to find application " .. bundle_id .. ": " .. tostring(application))
  end
  if application == nil or type(application.isRunning) ~= "function" then
    return nil
  end
  local running_ok, running = pcall(application.isRunning, application)
  if not running_ok then
    error("failed to inspect application " .. bundle_id .. ": " .. tostring(running))
  end
  if running ~= true then
    return nil
  end
  return application
end

local function send_meeting_shortcuts()
  require_application_api("get")
  if type(hs) ~= "table"
    or type(hs.eventtap) ~= "table"
    or type(hs.eventtap.keyStroke) ~= "function" then
    error("eventtap.keyStroke unavailable")
  end

  local teams_sent = false
  for _, app_info in ipairs(meeting_apps) do
    if app_info.name ~= "Microsoft Teams" or not teams_sent then
      local application = running_application(app_info.bundle_id)
      if application then
        local ok, cause = pcall(
          hs.eventtap.keyStroke,
          { "cmd", "shift" },
          app_info.key,
          0,
          application
        )
        if not ok then
          error(
            "failed to send "
              .. app_info.name
              .. " mute shortcut: "
              .. tostring(cause)
          )
        end
        if app_info.name == "Microsoft Teams" then
          teams_sent = true
        end
      end
    end
  end
end

local live_svg = [[
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">
<rect width="72" height="72" rx="12" fill="#102318"/>
<rect x="24" y="10" width="24" height="38" rx="12" fill="#22c55e"/>
<path d="M16 36a20 20 0 0 0 40 0M36 56v8M26 64h20" fill="none" stroke="#22c55e" stroke-width="6" stroke-linecap="round"/>
</svg>
]]

local muted_svg = [[
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">
<rect width="72" height="72" rx="12" fill="#281315"/>
<rect x="24" y="10" width="24" height="38" rx="12" fill="#ef4444"/>
<path d="M16 36a20 20 0 0 0 40 0M36 56v8M26 64h20M12 12l48 48" fill="none" stroke="#ef4444" stroke-width="6" stroke-linecap="round"/>
</svg>
]]

local function appearance_for(context)
  local selected = settings_for(context)
  local device = resolve_input_device(selected)
  if not device then
    return {
      title = "No mic",
      state = "inactive",
      appearanceVersion = 1,
      icon = helpers.svg(muted_svg),
    }
  end
  local name = device_name(device)
  local muted = microphone_muted(device)
  return {
    title = name .. " — " .. (muted and "Muted" or "Live"),
    state = muted and "active" or "inactive",
    appearanceVersion = 1,
    icon = helpers.svg(muted and muted_svg or live_svg),
  }
end

return {
  id = action_id,
  name = "Microphone mute",
  description = "Toggle the selected input microphone and optionally mute supported meeting apps.",
  settingsSchemaVersion = 1,
  settingsSchema = {
    {
      type = "select",
      key = "inputDevice",
      label = "Input device",
      description = "Choose the current default input or a specific connected microphone.",
      options = input_device_options_at_load,
    },
    {
      type = "boolean",
      key = "muteMeetingApps",
      label = "Mute meeting apps",
      description = "Also send mute shortcuts to running Zoom, Microsoft Teams, and Slack.",
      default = false,
    },
  },
  appearance = appearance_for,
  press = function(context)
    local selected, mute_apps = settings_for(context)
    local device = resolve_input_device(selected)
    if not device then
      error("no input device available")
    end
    local muted = microphone_muted(device)
    set_microphone_muted(device, not muted)
    if mute_apps then
      send_meeting_shortcuts()
    end
  end,
}

