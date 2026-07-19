-- Hammerspoon configuration example: a Stream Deck key that hides or shows an application.
-- Set an application bundle ID in the action settings, or omit it to track the frontmost application.
-- Copy this file into ~/.hammerspoon or adapt it in your existing init.lua.

local streamdeck = require("streamdeck")

local action_id = "com.brettinternet.hammerspoon.application-toggle"
local target_by_instance = {}
local relevant_events = {
  [hs.application.watcher.activated] = true,
  [hs.application.watcher.deactivated] = true,
  [hs.application.watcher.hidden] = true,
  [hs.application.watcher.unhidden] = true,
  [hs.application.watcher.launched] = true,
  [hs.application.watcher.terminated] = true,
}

local function settings_for(context)
  local settings = nil
  if context and type(context.getSettings) == "function" then
    settings = context:getSettings()
  elseif context then
    settings = context.settings
  end

  if type(settings) ~= "table" then
    return nil
  end

  local bundle_id = settings.bundleID
  if type(bundle_id) ~= "string" or bundle_id == "" or #bundle_id > 128 then
    return nil
  end
  return bundle_id
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

local function configured_application(bundle_id)
  require_application_api("get")

  local ok, application = pcall(hs.application.get, bundle_id)
  if not ok then
    error("failed to find application " .. bundle_id .. ": " .. tostring(application))
  end
  return application
end

local function application_for(context)
  local bundle_id = settings_for(context)
  if bundle_id ~= nil then
    return configured_application(bundle_id), bundle_id
  end

  return target_by_instance[target_key(context)] or frontmost_application(), nil
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

streamdeck.register({
  id = action_id,
  name = "Hide/show application",
  settingsSchemaVersion = 1,
  settingsSchema = {
    { type = "text", key = "bundleID", label = "Application bundle ID", maxLength = 128 },
  },

  appearance = function(context)
    local application = application_for(context)
    if not application then
      return {
        title = "No app",
        state = "inactive",
      }
    end

    return {
      title = application_name(application),
      state = application_is_hidden(application) and "active" or "inactive",
    }
  end,

  press = function(context)
    local application, bundle_id = application_for(context)
    if not application then
      if bundle_id ~= nil then
        error("application not running: " .. bundle_id)
      end
      error("no frontmost application")
    end

    local was_hidden = toggle_application(application)
    if bundle_id == nil then
      local key = target_key(context)
      target_by_instance[key] = was_hidden and nil or application
    end

    context:refresh()
  end,
})

local application_watcher = hs.application.watcher.new(function(_name, event, _application)
  if relevant_events[event] then
    streamdeck.refresh(action_id)
  end
end)
application_watcher:start()

-- The bridge owns the local authenticated connection; do not use hs.streamdeck.
streamdeck.start()
