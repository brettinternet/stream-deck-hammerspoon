-- Stream Deck action: open a configured URL and show its favicon when available.

local DEFAULT_LABEL = "Open URL"
local DEFAULT_URL = "https://www.hammerspoon.org/"
local helpers = require("streamdeck.helpers")
local context_by_instance = {}
local favicon_image_by_origin = {}
local pending_origin = {}

local function settings_for(context)
  local settings = type(context.getSettings) == "function" and context:getSettings() or context.settings
  if type(settings) ~= "table" then return DEFAULT_LABEL, DEFAULT_URL end
  local label = type(settings.label) == "string" and settings.label ~= "" and settings.label or DEFAULT_LABEL
  local url = (settings.url == nil or settings.url == "") and DEFAULT_URL or settings.url
  return label, url
end

local function valid_url(url)
  return type(url) == "string"
    and url ~= ""
    and url:match("^[%a][%w+.-]*://%S+$") ~= nil
end

local function favicon_origin(url)
  if type(url) ~= "string" then return nil end
  return url:match("^(https?://[^/%?#]+)")
end

local function request_favicon(origin)
  if origin == nil or pending_origin[origin] or favicon_image_by_origin[origin] ~= nil then return end
  if type(hs) ~= "table"
      or type(hs.image) ~= "table"
      or type(hs.image.imageFromURL) ~= "function" then return end
  pending_origin[origin] = true
  hs.image.imageFromURL(origin .. "/favicon.ico", function(image)
    pending_origin[origin] = nil
    favicon_image_by_origin[origin] = image or false
    for _, context in pairs(context_by_instance) do context:refresh() end
  end)
end

local function favicon_icon(context, url)
  local origin = favicon_origin(url)
  request_favicon(origin)
  local image = origin and favicon_image_by_origin[origin] or nil
  if image and image ~= false then
    local icon = helpers.png(context, image)
    if icon ~= nil then return icon end
  end
  return helpers.icon("link", { foregroundColor = helpers.colors.accent })
end

return {
  id = "com.brettinternet.hammerspoon.url-launcher",
  name = "URL launcher",
  description = "Open the configured URL, using its favicon when available.",
  category = "Applications",
  gesture = "Press: open the configured URL",
  settingsSchemaVersion = 1,
  settingsSchema = {
    { type = "text", key = "label", maxLength = 32, description = "Text shown on the Stream Deck key; defaults to Open URL." },
    { type = "text", key = "url", maxLength = 1024, description = "URL to open; defaults to https://www.hammerspoon.org/." },
  },

  appear = function(context)
    context_by_instance[context.instanceId] = context
  end,

  disappear = function(context)
    context_by_instance[context.instanceId] = nil
  end,

  appearance = function(context)
    local label, url = settings_for(context)
    return {
      title = label,
      state = "inactive",
      appearanceVersion = 1,
      icon = favicon_icon(context, url),
    }
  end,

  press = function(context)
    local _, url = settings_for(context)
    if not valid_url(url) then error("invalid URL") end
    if type(hs) ~= "table"
      or type(hs.urlevent) ~= "table"
      or type(hs.urlevent.openURL) ~= "function" then
      error("URL launcher unavailable")
    end
    local ok, result = pcall(hs.urlevent.openURL, url)
    if not ok then error("failed to open URL: " .. tostring(result)) end
    if result ~= true then error("failed to open URL") end
    context:success("URL opened", 850)
  end,
}
