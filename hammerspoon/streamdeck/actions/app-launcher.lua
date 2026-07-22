-- Stream Deck action: a configurable Stream Deck key that launches or focuses an app.
-- Set the app name and key label in the action settings; the key is active while that app is frontmost.

local action_id = "com.brettinternet.hammerspoon.app-launcher"
local default_app = "Hammerspoon"
local default_label = "Launch app"
local helpers = require("streamdeck.helpers")

local function settings_for(context)
  local settings = nil
  if context and type(context.getSettings) == "function" then
    settings = context:getSettings()
  elseif context then
    settings = context.settings
  end

  if type(settings) ~= "table" then
    return default_app, default_label
  end

  local app = settings.app
  if type(app) ~= "string" or app == "" or #app > 128 then
    app = default_app
  end

  local label = settings.label
  if type(label) ~= "string" or label == "" or #label > 32 then
    label = default_label
  end

  return app, label
end

local function require_application_api(method_name)
  if type(hs) ~= "table"
    or type(hs.application) ~= "table"
    or type(hs.application[method_name]) ~= "function" then
    error("app launcher unavailable")
  end
end

local function frontmost_application()
  require_application_api("frontmostApplication")

  local ok, application = pcall(hs.application.frontmostApplication)
  if not ok then
    error("failed to inspect frontmost application: " .. tostring(application))
  end
  if application == nil then
    return nil
  end

  local application_type = type(application)
  if application_type ~= "table" and application_type ~= "userdata"
    or type(application.name) ~= "function" then
    error("invalid frontmost application")
  end

  local name_ok, name = pcall(application.name, application)
  if not name_ok then
    error("failed to read frontmost application name: " .. tostring(name))
  end
  if type(name) ~= "string" then
    error("invalid frontmost application name")
  end

  return name
end

local function application_icon(context, app_name)
  if type(hs) ~= "table"
      or type(hs.application) ~= "table"
      or type(hs.application.find) ~= "function"
      or type(hs.image) ~= "table"
      or type(hs.image.imageFromAppBundle) ~= "function" then
    return helpers.icon("rocket", { foregroundColor = helpers.colors.accent })
  end
  local ok, application = pcall(hs.application.find, app_name)
  if not ok or application == nil or type(application.bundleID) ~= "function" then
    return helpers.icon("rocket", { foregroundColor = helpers.colors.accent })
  end
  local bundle_ok, bundle_id = pcall(application.bundleID, application)
  if not bundle_ok or type(bundle_id) ~= "string" or bundle_id == "" then
    return helpers.icon("rocket", { foregroundColor = helpers.colors.accent })
  end
  local image_ok, image = pcall(hs.image.imageFromAppBundle, bundle_id)
  return image_ok and helpers.png(context, image)
    or helpers.icon("rocket", { foregroundColor = helpers.colors.accent })
end


return {
  id = action_id,
  name = "Launch or focus app",
  description = "Launch or focus the configured macOS application.",
  category = "Applications",
  gesture = "Press: launch or focus the configured application",
  settingsSchemaVersion = 1,
  settingsSchema = {
    { type = "text", key = "app", maxLength = 128, description = "macOS application name shown in Applications or the app's menu; defaults to Hammerspoon." },
    { type = "text", key = "label", maxLength = 32, description = "Text shown on the Stream Deck key; defaults to Launch app." },
  },

  appearance = function(context)
    local app, label = settings_for(context)
    local frontmost_name = frontmost_application()
    return {
      title = label,
      state = frontmost_name == app and "active" or "inactive",
      appearanceVersion = 1,
      icon = application_icon(context, app),
    }
  end,

  press = function(context)
    local app = settings_for(context)
    require_application_api("launchOrFocus")

    local ok, result = pcall(hs.application.launchOrFocus, app)
    if not ok then
      error("failed to launch or focus app: " .. tostring(result))
    end
    if result ~= true then
      error("failed to launch or focus app")
    end
    context:success("Opened " .. app, 900)

  end,
}

