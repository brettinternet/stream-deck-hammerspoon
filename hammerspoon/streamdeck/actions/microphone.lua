-- Stream Deck action: control a selected microphone without changing app-level mute.

local helpers = require("streamdeck.helpers")
local sound = require("streamdeck.sound")

local action_id = "com.brettinternet.hammerspoon.microphone-toggle"
local default_value = "default"
local microphone_sound = sound.toggle({
  on = sound.system("Glass", { volume = 0.65 }),
  off = sound.system("Basso", { volume = 0.65 }),
})
local ptt_state_by_instance = {}
local combined_state_by_instance = {}
local visible_contexts = {}
local watched_inputs_by_uid = {}
local record_watched_input_state

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

local function settings_schema()
  return {
    {
      type = "select",
      key = "inputDevice",
      label = "Input device",
      description = "Choose the current default input or a specific connected microphone.",
      options = discover_input_device_options(),
      refreshable = true,
    },
    {
      type = "select",
      key = "mode",
      label = "Control mode",
      description = "Toggle on press, stay live while held, or combine tap-to-toggle with hold-to-talk.",
      options = {
        { value = "toggle", label = "Toggle mute" },
        { value = "pushToTalk", label = "Push to talk" },
        { value = "toggleAndPushToTalk", label = "Toggle mute + push to talk" },
      },
      default = "toggle",
    },
  }
end

local function settings_for(context)
  local settings
  if context and type(context.getSettings) == "function" then
    settings = context:getSettings()
  elseif context then
    settings = context.settings
  end
  if type(settings) ~= "table" then settings = {} end
  local selected = settings.inputDevice
  if type(selected) ~= "string" or selected == "" then selected = default_value end
  local mode = settings.mode
  if mode ~= "pushToTalk" and mode ~= "toggleAndPushToTalk" then mode = "toggle" end
  -- Legacy meeting-app settings are intentionally ignored: toggle shortcuts cannot
  -- safely synchronize independent app mute states.
  return selected, mode
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

local function microphone_badge(name)
  local badge = ""
  for word in name:gmatch("[%w]+") do
    badge = badge .. word:sub(1, 1):upper()
    if #badge >= 4 then break end
  end
  return badge ~= "" and badge or "MIC"
end

local function restore_push_to_talk(context)
  local instance_id = context.instanceId
  local state = ptt_state_by_instance[instance_id]
  if state == nil then return end
  ptt_state_by_instance[instance_id] = nil
  if not state.restoreMuted then return end
  set_microphone_muted(state.device, true)
  record_watched_input_state(state.device, true)
end

local function stop_combined_hold(state)
  local timer = state.timer
  state.timer = nil
  if timer and type(timer.stop) == "function" then
    pcall(timer.stop, timer)
  end
end

local function cancel_combined_hold(context)
  local instance_id = context.instanceId
  local state = combined_state_by_instance[instance_id]
  if state == nil then return end
  combined_state_by_instance[instance_id] = nil
  stop_combined_hold(state)
  if state.pttActive then restore_push_to_talk(context) end
end

local function refresh_visible_contexts()
  for _, context in pairs(visible_contexts) do
    context:refresh()
  end
end

local function stop_input_watcher(record)
  pcall(function()
    local device = record.device
    local watcher_stop = device.watcherStop
    if type(watcher_stop) == "function" then watcher_stop(device) end
    local watcher_callback = device.watcherCallback
    if type(watcher_callback) == "function" then watcher_callback(device, nil) end
  end)
end

local function watch_input(device)
  local uid = device_uid(device)
  if watched_inputs_by_uid[uid] ~= nil then return end
  local methods_ok, watcher_callback, watcher_start = pcall(function()
    return device.watcherCallback, device.watcherStart
  end)
  if not methods_ok
    or type(watcher_callback) ~= "function"
    or type(watcher_start) ~= "function" then
    return
  end

  local muted_ok, muted = pcall(microphone_muted, device)
  local record = {
    device = device,
    muted = nil,
  }
  if muted_ok then record.muted = muted end
  watched_inputs_by_uid[uid] = record

  local setup_ok, result = pcall(function()
    watcher_callback(device, function(_uid, event, scope)
      if watched_inputs_by_uid[uid] ~= record
        or event ~= "mute"
        or (scope ~= "inpt" and scope ~= "glob") then
        return
      end
      local current_ok, current = pcall(microphone_muted, record.device)
      if current_ok and current ~= record.muted then
        record.muted = current
        refresh_visible_contexts()
      end
    end)
    return watcher_start(device)
  end)
  if not setup_ok or result == nil then
    watched_inputs_by_uid[uid] = nil
    stop_input_watcher(record)
  end
end

record_watched_input_state = function(device, muted)
  local uid_ok, uid = pcall(device_uid, device)
  if not uid_ok then return end
  local record = watched_inputs_by_uid[uid]
  if record ~= nil then record.muted = muted end
end

local function reconcile_input_watchers()
  local desired_inputs = {}
  for _, context in pairs(visible_contexts) do
    local selected = settings_for(context)
    local device_ok, device = pcall(resolve_input_device, selected)
    if device_ok and device ~= nil then
      local uid_ok, uid = pcall(device_uid, device)
      if uid_ok then desired_inputs[uid] = device end
    end
  end

  for uid, record in pairs(watched_inputs_by_uid) do
    if desired_inputs[uid] == nil then
      watched_inputs_by_uid[uid] = nil
      stop_input_watcher(record)
    end
  end
  for _, device in pairs(desired_inputs) do
    watch_input(device)
  end
end

local function synchronize_input_watchers()
  pcall(reconcile_input_watchers)
end


local function appearance_for(context)
  if visible_contexts[context.instanceId] ~= nil then
    visible_contexts[context.instanceId] = context
    synchronize_input_watchers()
  end
  local selected, mode = settings_for(context)
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
  record_watched_input_state(device, muted)
  local svg = muted and muted_svg or live_svg
  local status
  if mode == "pushToTalk" then
    status = muted and "Hold\nto talk" or "Live"
  elseif mode == "toggleAndPushToTalk" then
    status = muted and "Muted\nHold\nto talk" or "Live\nHold\nto talk"
  else
    status = muted and "Muted" or "Live"
  end
  return {
    title = name:gsub("%s+", "\n") .. "\n" .. status,
    state = muted and "active" or "inactive",
    appearanceVersion = 1,
    badge = microphone_badge(name),
    icon = helpers.svg(svg),
  }
end

local function start_push_to_talk(context, device)
  if device == nil then
    local selected = settings_for(context)
    device = resolve_input_device(selected)
  end
  if not device then error("no input device available") end
  local muted = microphone_muted(device)
  ptt_state_by_instance[context.instanceId] = {
    device = device,
    restoreMuted = muted,
  }
  if muted then
    set_microphone_muted(device, false)
    record_watched_input_state(device, false)
  end
  context:success("Microphone\nlive", 800)
end

local function toggle_microphone(context, device)
  if device == nil then
    local selected = settings_for(context)
    device = resolve_input_device(selected)
  end
  if not device then error("no input device available") end
  local muted = microphone_muted(device)
  set_microphone_muted(device, not muted)
  record_watched_input_state(device, not muted)
  context:success(not muted and "Microphone\nmuted" or "Microphone\nlive", 900)
  return not muted and sound.OFF or sound.ON
end

local function begin_combined_hold(context)
  if type(hs) ~= "table"
    or type(hs.timer) ~= "table"
    or type(hs.timer.doAfter) ~= "function" then
    error("timer unavailable")
  end

  local selected = settings_for(context)
  local device = resolve_input_device(selected)
  if not device then error("no input device available") end
  local instance_id = context.instanceId
  cancel_combined_hold(context)
  local state = {
    device = device,
    pttActive = false,
  }
  combined_state_by_instance[instance_id] = state
  local ok, timer_or_error = pcall(hs.timer.doAfter, 0.5, function()
    if combined_state_by_instance[instance_id] ~= state then return end
    state.timer = nil
    state.pttActive = true
    start_push_to_talk(context, state.device)
  end)
  if not ok or timer_or_error == nil then
    combined_state_by_instance[instance_id] = nil
    error("failed to start push-to-talk hold: " .. tostring(timer_or_error))
  end
  state.timer = timer_or_error
end

local function release_combined_hold(context)
  local instance_id = context.instanceId
  local state = combined_state_by_instance[instance_id]
  if state == nil then return false end
  combined_state_by_instance[instance_id] = nil
  stop_combined_hold(state)
  if state.pttActive then
    restore_push_to_talk(context)
  else
    local cue = toggle_microphone(context, state.device)
    local spec = cue == sound.ON and microphone_sound.on or microphone_sound.off
    if type(context.playSound) == "function" then context:playSound(spec) end
  end
  return true
end

local function apply_press(context)
  local _, mode = settings_for(context)
  if mode == "pushToTalk" then
    return start_push_to_talk(context)
  end
  if mode == "toggleAndPushToTalk" then
    return begin_combined_hold(context)
  end
  return toggle_microphone(context)
end

local function apply_push(context)
  local _, mode = settings_for(context)
  if mode == "toggle" then
    return toggle_microphone(context)
  end
  return start_push_to_talk(context)
end

return {
  id = action_id,
  name = "Microphone mute",
  description = "Control a selected microphone with toggle or push-to-talk. App mute states are left unchanged.",
  category = "Audio",
  gesture = "Toggle: press to mute · Push-to-talk: hold to speak · Combined: tap to toggle, hold to speak",
  sound = microphone_sound,
  settingsSchemaVersion = 1,
  settingsSchemaProvider = settings_schema,
  appear = function(context)
    cancel_combined_hold(context)
    ptt_state_by_instance[context.instanceId] = nil
    visible_contexts[context.instanceId] = context
    synchronize_input_watchers()
  end,
  disappear = function(context)
    cancel_combined_hold(context)
    restore_push_to_talk(context)
    visible_contexts[context.instanceId] = nil
    synchronize_input_watchers()
  end,
  appearance = appearance_for,
  push = apply_push,
  press = apply_press,
  release = function(context)
    if not release_combined_hold(context) then
      restore_push_to_talk(context)
    end
  end,
}

