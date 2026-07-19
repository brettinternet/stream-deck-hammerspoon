-- Hammerspoon configuration example: a configurable Stream Deck key that opens a URL.
-- Set the label and URL in the action settings; pressing the key opens it with Hammerspoon's URL event API.
-- Copy this file into ~/.hammerspoon or adapt it in your existing init.lua.

local streamdeck = require("streamdeck")

local DEFAULT_LABEL = "Open URL"
local DEFAULT_URL = "https://www.hammerspoon.org/"

local function settings_for(context)
  local settings = nil
  if context and type(context.getSettings) == "function" then
    settings = context:getSettings()
  elseif context then
    settings = context.settings
  end

  if type(settings) ~= "table" then
    return DEFAULT_LABEL, DEFAULT_URL
  end

  local label = settings.label
  if type(label) ~= "string" or label == "" then
    label = DEFAULT_LABEL
  end

  local url = settings.url
  if url == nil or url == "" then
    url = DEFAULT_URL
  end

  return label, url
end

local function valid_url(url)
  return type(url) == "string"
    and url ~= ""
    and url:match("^[%a][%w+.-]*://%S+$") ~= nil
end

streamdeck.register({
  id = "com.brettinternet.hammerspoon.url-launcher",
  name = "URL launcher",
  settingsSchemaVersion = 1,
  settingsSchema = {
    { type = "text", key = "label", maxLength = 32 },
    { type = "text", key = "url", maxLength = 1024 },
  },

  appearance = function(context)
    local label = settings_for(context)
    return {
      title = label,
      state = "inactive",
    }
  end,

  press = function(context)
    local _, url = settings_for(context)
    if not valid_url(url) then
      error("invalid URL")
    end

    if type(hs) ~= "table"
      or type(hs.urlevent) ~= "table"
      or type(hs.urlevent.openURL) ~= "function" then
      error("URL launcher unavailable")
    end

    local ok, result = pcall(hs.urlevent.openURL, url)
    if not ok then
      error("failed to open URL: " .. tostring(result))
    end
    if result ~= true then
      error("failed to open URL")
    end

    context:refresh()
  end,
})

-- The bridge owns the local authenticated connection; do not use hs.streamdeck.
streamdeck.start()
