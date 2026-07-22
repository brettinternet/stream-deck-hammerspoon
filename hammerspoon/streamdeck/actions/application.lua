-- Stream Deck action: a Stream Deck key that toggles an application's hidden state and uses its system icon.
-- Set an application bundle ID in the action settings, or omit it to track the frontmost application. Active means hidden; hold to close. Enable focusing when showing if the app should also come to the front; hiding it restores the previous frontmost application.

local action_id = "com.brettinternet.hammerspoon.application-toggle"
local target_by_instance = {}
local fallback_by_instance = {}
local relevant_events = {
  [hs.application.watcher.activated] = true,
  [hs.application.watcher.deactivated] = true,
  [hs.application.watcher.hidden] = true,
  [hs.application.watcher.unhidden] = true,
  [hs.application.watcher.launched] = true,
  [hs.application.watcher.terminated] = true,
}
local visible_contexts = {}
local application_watcher

local function refresh_visible_contexts()
  for _, context in pairs(visible_contexts) do
    context:refresh()
  end
end

local function start_application_watcher()
  if application_watcher then
    return
  end

  local watcher = hs.application.watcher.new(function(_name, event, _application)
    if relevant_events[event] then
      refresh_visible_contexts()
    end
  end)
  watcher:start()
  application_watcher = watcher
end

local function stop_application_watcher_if_unused()
  if application_watcher and next(visible_contexts) == nil then
    application_watcher:stop()
    application_watcher = nil
  end
end


local function settings_for(context)
  local settings = nil
  if context and type(context.getSettings) == "function" then
    settings = context:getSettings()
  elseif context then
    settings = context.settings
  end

  local focus_on_show = false
  if type(settings) == "table" and type(settings.focusOnShow) == "boolean" then
    focus_on_show = settings.focusOnShow
  end

  if type(settings) ~= "table" then
    return nil, focus_on_show
  end

  local bundle_id = settings.bundleID
  if type(bundle_id) ~= "string" or bundle_id == "" or #bundle_id > 128 then
    return nil, focus_on_show
  end
  return bundle_id, focus_on_show
end

local function target_key(context)
  return context and context.instanceId or "default"
end

local function require_application_api(method_name)
  if type(hs) ~= "table"
    or type(hs.application) ~= "table"
    or type(hs.application[method_name]) ~= "function" then
    error("application unavailable")
  end
end

local function frontmost_application()
  require_application_api("frontmostApplication")

  local ok, application = pcall(hs.application.frontmostApplication)
  if not ok then
    error("failed to inspect frontmost application: " .. tostring(application))
  end
  return application
end

local MAX_ICON_BYTES = 32768

local function application_bundle_id(application)
  if not application or type(application.bundleID) ~= "function" then
    return nil
  end

  local ok, bundle_id = pcall(application.bundleID, application)
  if not ok or type(bundle_id) ~= "string" or bundle_id == "" then
    return nil
  end
  return bundle_id
end

local function application_icon(application, configured_bundle_id)
  local bundle_id = configured_bundle_id or application_bundle_id(application)
  if not bundle_id
    or type(hs) ~= "table"
    or type(hs.image) ~= "table"
    or type(hs.image.imageFromAppBundle) ~= "function" then
    return nil
  end

  local ok, image = pcall(hs.image.imageFromAppBundle, bundle_id)
  if not ok or not image or type(image.bitmapRepresentation) ~= "function" then
    return nil
  end

  local bitmap_ok, bitmap = pcall(image.bitmapRepresentation, image, { w = 72, h = 72 })
  if not bitmap_ok or not bitmap or type(bitmap.encodeAsURLString) ~= "function" then
    return nil
  end

  local encoded_ok, data_url = pcall(bitmap.encodeAsURLString, bitmap, true, "PNG")
  if not encoded_ok or type(data_url) ~= "string" then
    return nil
  end

  local data_base64 = data_url:match("^data:image/png;base64,(.+)")
  if not data_base64 then
    return nil
  end
  data_base64 = data_base64:gsub("%s+", "")
  local base64_payload = data_base64:match("^[A-Za-z0-9+/]+=?=?")
  if #data_base64 == 0
    or #data_base64 % 4 ~= 0
    or base64_payload ~= data_base64 then
    return nil
  end

  local padding = data_base64:sub(-2) == "==" and 2 or data_base64:sub(-1) == "=" and 1 or 0
  local byte_count = (#data_base64 / 4) * 3 - padding
  if byte_count <= 0 or byte_count > MAX_ICON_BYTES then
    return nil
  end

  return {
    kind = "custom",
    mediaType = "image/png",
    dataBase64 = data_base64,
  }
end

local function configured_application(bundle_id)
  require_application_api("get")

  local ok, application = pcall(hs.application.get, bundle_id)
  if not ok then
    error("failed to find application " .. bundle_id .. ": " .. tostring(application))
  end
  return application
end

local function launch_or_focus_application(bundle_id)
  require_application_api("launchOrFocusByBundleID")

  local ok, result = pcall(hs.application.launchOrFocusByBundleID, bundle_id)
  if not ok then
    error("failed to open application: " .. tostring(result))
  end
  if result ~= true then
    error("failed to open application")
  end
end

local function application_for(context)
  local bundle_id, focus_on_show = settings_for(context)
  if bundle_id ~= nil then
    return configured_application(bundle_id), bundle_id, focus_on_show
  end

  return target_by_instance[target_key(context)] or frontmost_application(), nil, focus_on_show
end

local function application_is_hidden(application)
  local ok, hidden = pcall(application.isHidden, application)
  if not ok then
    error("failed to inspect application visibility: " .. tostring(hidden))
  end
  if type(hidden) ~= "boolean" then
    error("failed to inspect application visibility")
  end
  return hidden
end

local function application_name(application)
  local ok, name = pcall(application.name, application)
  if not ok or type(name) ~= "string" or name == "" then
    return "Unknown app"
  end
  return name
end

local function application_has_main_window(application)
  if type(application.mainWindow) ~= "function" then
    error("application cannot inspect its main window")
  end

  local ok, window = pcall(application.mainWindow, application)
  if not ok then
    error("failed to inspect application window: " .. tostring(window))
  end
  return window ~= nil
end

local function focus_application(application)
  if type(application.activate) ~= "function" then
    error("application cannot focus")
  end

  local ok, result = pcall(application.activate, application, true)
  if not ok then
    error("failed to focus application: " .. tostring(result))
  end
  if result ~= true then
    error("failed to focus application")
  end
end

local function focus_application_with_fallback(context, application, fallback)
  focus_application(application)
  if fallback and fallback ~= application then
    fallback_by_instance[target_key(context)] = fallback
  end
end

local function launch_or_focus_with_fallback(context, application, bundle_id)
  if not bundle_id then
    error("application cannot reopen without a bundle ID")
  end
  local fallback = frontmost_application()
  launch_or_focus_application(bundle_id)
  if fallback and fallback ~= application then
    fallback_by_instance[target_key(context)] = fallback
  end
end

local function restore_fallback_application(context, application)
  local key = target_key(context)
  local stored_fallback = fallback_by_instance[key]
  local current_frontmost = frontmost_application()
  local fallback = current_frontmost
  if not fallback or fallback == application then
    fallback = stored_fallback
  end
  if not fallback then
    return
  end
  if fallback == application then
    fallback_by_instance[key] = nil
    return
  end

  focus_application(fallback)
  fallback_by_instance[key] = nil
end

local function toggle_application(application)
  local hidden = application_is_hidden(application)
  local method_name = hidden and "unhide" or "hide"
  local operation = hidden and "show" or "hide"
  local method = application[method_name]
  if type(method) ~= "function" then
    error("application cannot " .. operation)
  end

  local ok, result = pcall(method, application)
  if not ok then
    error("failed to " .. operation .. " application: " .. tostring(result))
  end
  if result ~= true then
    error("failed to " .. operation .. " application")
  end
  return hidden
end

local function close_application(application)
  if type(application.kill) ~= "function" then
    error("application cannot close")
  end

  local ok, result = pcall(application.kill, application)
  if not ok then
    error("failed to close application: " .. tostring(result))
  end
  if result ~= true then
    error("failed to close application")
  end
end

return {
  id = action_id,
  name = "Hide/show application",
  settingsSchemaVersion = 1,
  settingsSchema = {
    { type = "text", key = "bundleID", label = "Application bundle ID", maxLength = 128 },
    { type = "boolean", key = "focusOnShow", label = "Focus app when showing", default = false },
  },

  appear = function(context)
    visible_contexts[context.instanceId] = context
    start_application_watcher()
  end,
  disappear = function(context)
    visible_contexts[context.instanceId] = nil
    target_by_instance[context.instanceId] = nil
    fallback_by_instance[context.instanceId] = nil
    stop_application_watcher_if_unused()
  end,

  appearance = function(context)
    local application, bundle_id = application_for(context)
    local appearance
    if application then
      appearance = {
        title = application_name(application),
        state = application_is_hidden(application) and "active" or "inactive",
      }
    else
      appearance = {
        title = "No app",
        state = "inactive",
      }
    end

    local icon = application_icon(application, bundle_id)
    if icon then
      appearance.appearanceVersion = 1
      appearance.icon = icon
    end
    return appearance
  end,

  press = function(context)
    local application, bundle_id, focus_on_show = application_for(context)
    if not application then
      if bundle_id ~= nil then
        launch_or_focus_with_fallback(context, nil, bundle_id)
      else
        error("no frontmost application")
      end
    elseif not application_has_main_window(application) then
      launch_or_focus_with_fallback(context, application, bundle_id or application_bundle_id(application))
    else
      local was_hidden = application_is_hidden(application)
      if was_hidden and focus_on_show then
        local fallback = frontmost_application()
        toggle_application(application)
        focus_application_with_fallback(context, application, fallback)
      else
        was_hidden = toggle_application(application)
      end
      if bundle_id == nil then
        local key = target_key(context)
        target_by_instance[key] = was_hidden and nil or application
      end
      if not was_hidden then
        restore_fallback_application(context, application)
      end
    end
  end,
  longPress = function(context)
    local application, bundle_id = application_for(context)
    if not application then
      if bundle_id ~= nil then
        error("application not running: " .. bundle_id)
      end
      error("no frontmost application")
    end

    close_application(application)
    local key = target_key(context)
    fallback_by_instance[key] = nil
    if bundle_id == nil then
      target_by_instance[key] = nil
    end
  end,
}


