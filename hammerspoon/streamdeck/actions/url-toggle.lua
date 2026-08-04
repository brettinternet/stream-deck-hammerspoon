-- Stream Deck action: open the configured URL in Chromium or close its existing tab.

local DEFAULT_LABEL = "Toggle URL"
local DEFAULT_URL = "https://www.hammerspoon.org/"

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

local function toggle_url(url, open_in_new_window)
  local script = ([[(function() {
    ObjC.import("Foundation");
    var browser = Application("org.chromium.Chromium");
    var targetUrl = %q;
    var openInNewWindow = %s;

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
  ]]):format(url, tostring(open_in_new_window))
  local result = run_javascript(script)
  if result ~= "opened" and result ~= "closed" then
    error("failed to toggle URL")
  end
  return result
end

return {
  id = "com.brettinternet.hammerspoon.url-toggle",
  name = "URL toggle",
  description = "Open the configured URL in a new or existing Chromium window, or close its tab when it is already open.",
  category = "Applications",
  gesture = "Press: open or close the configured URL",
  settingsSchemaVersion = 1,
  settingsSchema = {
    { type = "text", key = "label", maxLength = 32, description = "Text shown on the Stream Deck key; defaults to Toggle URL." },
    { type = "text", key = "url", maxLength = 1024, description = "URL to open or close; defaults to https://www.hammerspoon.org/." },
    { type = "boolean", key = "openInNewWindow", label = "Open in new window", default = true, description = "When off, open a new tab in Chromium's frontmost window; defaults to on." },
  },

  appearance = function(context)
    local label = settings_for(context)
    return {
      title = label,
      state = "inactive",
    }
  end,

  press = function(context)
    local _, url, open_in_new_window = settings_for(context)
    if not valid_url(url) then error("invalid URL") end
    local result = toggle_url(url, open_in_new_window)
    context:success(result == "opened" and "URL opened" or "URL closed", 850)
  end,
}
