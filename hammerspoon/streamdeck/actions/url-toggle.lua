-- Stream Deck action: open the configured URL in Chromium or close its existing tab, using its favicon when available.

local DEFAULT_LABEL = "Toggle URL"
local DEFAULT_URL = "https://www.hammerspoon.org/"
local helpers = require("streamdeck.helpers")
local context_by_instance = {}
local favicon_image_by_origin = {}
local pending_origin = {}
local COMPARABLE_URL_JAVASCRIPT = [[
    function comparableUrl(url) {
      var nativeUrl = $.NSURL.URLWithString(url);
      if (!nativeUrl.isNil()) {
        url = nativeUrl.absoluteString.js;
      }
      var rootUrl = /^([a-z][a-z0-9+.-]*):\/\/([^\/?#]+)\/?$/i.exec(url);
      if (!rootUrl) return url;
      var scheme = rootUrl[1].toLowerCase();
      var authority = rootUrl[2].toLowerCase();
      var port = /:(\d+)$/.exec(authority);
      if (port && ((scheme === "http" && Number(port[1]) === 80)
        || (scheme === "https" && Number(port[1]) === 443))) {
        authority = authority.slice(0, -port[0].length);
      }
      return scheme + "://" + authority + "/";
    }
]]
local indicator_colors = {
  open = { red = 52 / 255, green = 199 / 255, blue = 89 / 255, alpha = 1 },
  closed = { red = 1, green = 59 / 255, blue = 48 / 255, alpha = 1 },
}

local function settings_for(context)
  local settings = type(context.getSettings) == "function" and context:getSettings() or context.settings
  if type(settings) ~= "table" then return DEFAULT_LABEL, DEFAULT_URL, true end
  local label = type(settings.label) == "string" and settings.label ~= "" and settings.label or DEFAULT_LABEL
  local url = (settings.url == nil or settings.url == "") and DEFAULT_URL or settings.url
  local open_in_new_window = true
  if type(settings.openInNewWindow) == "boolean" then open_in_new_window = settings.openInNewWindow end
  return label, url, open_in_new_window
end

local function valid_url(url)
  return type(url) == "string"
    and url ~= ""
    and url:match("^[%a][%w+.-]*://%S+$") ~= nil
end

local function favicon_origin(url)
  if type(url) ~= "string" then return nil end
  local scheme, authority = url:match("^([hH][tT][tT][pP][sS]?)://([^/%?#]+)")
  if scheme == nil then return nil end
  return scheme:lower() .. "://" .. authority
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

local function favicon_with_indicator(context, image, is_open)
  if type(hs) ~= "table" or type(hs.canvas) ~= "table" or type(hs.canvas.new) ~= "function" then
    return helpers.png(context, image)
  end

  local size = helpers.imageSize(context)
  local diameter = math.max(8, math.floor(size * 0.2))
  local inset = math.max(2, math.floor(size * 0.05))
  local origin = size - diameter - inset
  local created, canvas = pcall(hs.canvas.new, { x = 0, y = 0, w = size, h = size })
  if not created or not canvas then
    return helpers.png(context, image)
  end

  local composited, composited_image = pcall(function()
    canvas[1] = {
      type = "image",
      image = image,
      frame = { x = 0, y = 0, w = size, h = size },
    }
    canvas[2] = {
      type = "oval",
      action = "strokeAndFill",
      frame = { x = origin, y = origin, w = diameter, h = diameter },
      fillColor = indicator_colors[is_open and "open" or "closed"],
      strokeColor = { white = 1, alpha = 1 },
      strokeWidth = 2,
    }
    return canvas:imageFromCanvas()
  end)
  if type(canvas.delete) == "function" then pcall(canvas.delete, canvas) end
  if not composited then return helpers.png(context, image) end
  return helpers.png(context, composited_image) or helpers.png(context, image)
end

local function favicon_icon(context, url, is_open)
  local origin = favicon_origin(url)
  request_favicon(origin)
  local image = origin and favicon_image_by_origin[origin] or nil
  if image and image ~= false then
    local icon = favicon_with_indicator(context, image, is_open)
    if icon ~= nil then return icon end
  end
  return helpers.icon("link", {
    foregroundColor = is_open and helpers.colors.active or helpers.colors.error,
  })
end

local function run_javascript(script)
  if type(hs) ~= "table"
    or type(hs.osascript) ~= "table"
    or type(hs.osascript.javascript) ~= "function" then
    error("URL toggle unavailable")
  end
  local call_ok, success, result = pcall(hs.osascript.javascript, script)
  if not call_ok then
    error("failed to toggle URL: " .. tostring(success))
  end
  if success ~= true then error("failed to toggle URL") end
  return result
end

local function url_is_open(url)
  if not valid_url(url) then return false end
  local script = ([[(function() {
    ObjC.import("Foundation");
    var browser = Application("org.chromium.Chromium");
    if (!browser.running()) return "closed";
    var targetUrl = %q;
%s
    var comparableTargetUrl = comparableUrl(targetUrl);
    for (var win of browser.windows()) {
      for (var tab of win.tabs()) {
        if (comparableUrl(String(tab.url() || "")) === comparableTargetUrl) {
          return "open";
        }
      }
    }
    return "closed";
  })();
  ]]):format(url, COMPARABLE_URL_JAVASCRIPT)
  local ok, result = pcall(run_javascript, script)
  return ok and result == "open"
end

local function toggle_url(url, open_in_new_window)
  local script = ([[(function() {
    ObjC.import("Foundation");
    var browser = Application("org.chromium.Chromium");
    var targetUrl = %q;
    var openInNewWindow = %s;

%s

    var comparableTargetUrl = comparableUrl(targetUrl);

    for (var win of browser.windows()) {
      var tabs = win.tabs();
      for (var index = 0; index < tabs.length; index++) {
        if (comparableUrl(String(tabs[index].url() || "")) !== comparableTargetUrl) {
          continue;
        }
        tabs[index].close();
        return "closed";
      }
    }
    if (!openInNewWindow && browser.windows().length > 0) {
      var existingWindow = browser.windows()[0];
      existingWindow.tabs.push(browser.Tab({ url: targetUrl }));
      existingWindow.activeTabIndex = existingWindow.tabs().length;
      existingWindow.index = 1;
      return "opened";
    }

    var window = browser.Window().make();
    window.tabs[0].url = targetUrl;
    window.index = 1;
    return "opened";
  })();
  ]]):format(url, tostring(open_in_new_window), COMPARABLE_URL_JAVASCRIPT)
  local result = run_javascript(script)
  if result ~= "opened" and result ~= "closed" then
    error("failed to toggle URL")
  end
  return result
end

return {
  id = "com.brettinternet.hammerspoon.url-toggle",
  name = "URL toggle",
  description = "Open the configured URL in a new or existing Chromium window, or close its tab when it is already open, using its favicon when available.",
  category = "Applications",
  gesture = "Press: open or close the configured URL",
  settingsSchemaVersion = 1,
  settingsSchema = {
    { type = "text", key = "label", maxLength = 32, description = "Text shown on the Stream Deck key; defaults to Toggle URL." },
    { type = "text", key = "url", maxLength = 1024, description = "URL to open or close; defaults to https://www.hammerspoon.org/." },
    { type = "boolean", key = "openInNewWindow", label = "Open in new window", default = true, description = "When off, open a new tab in Chromium's frontmost window; defaults to on." },
  },

  appear = function(context)
    context_by_instance[context.instanceId] = context
  end,

  disappear = function(context)
    context_by_instance[context.instanceId] = nil
  end,

  appearance = function(context)
    local label, url = settings_for(context)
    local is_open = url_is_open(url)
    return {
      title = label,
      state = is_open and "active" or "inactive",
      appearanceVersion = 1,
      icon = favicon_icon(context, url, is_open),
    }
  end,

  press = function(context)
    local _, url, open_in_new_window = settings_for(context)
    if not valid_url(url) then error("invalid URL") end
    local result = toggle_url(url, open_in_new_window)
    context:success(result == "opened" and "URL opened" or "URL closed", 850)
  end,
}
