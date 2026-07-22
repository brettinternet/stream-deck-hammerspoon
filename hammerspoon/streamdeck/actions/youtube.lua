-- Stream Deck action: a Stream Deck key for YouTube playback.
-- Press the key to play/pause the first YouTube video tab in Chromium, or open the configured URL when no video tab exists.

local action_id = "com.brettinternet.hammerspoon.youtube"
local browser_bundle_id = "org.chromium.Chromium"
local default_url = "https://www.youtube.com"

local function settings_for(context)
  local settings = nil
  if context and type(context.getSettings) == "function" then
    settings = context:getSettings()
  elseif context then
    settings = context.settings
  end

  local url = type(settings) == "table" and settings.url or nil
  if type(url) ~= "string" or url == "" or #url > 1024 then
    url = default_url
  end
  return url
end

local function valid_url(url)
  return type(url) == "string"
    and url ~= ""
    and url:match("^https://%S+$") ~= nil
end

local function require_hammerspoon_api(namespace, method_name)
  if type(hs) ~= "table"
    or type(hs[namespace]) ~= "table"
    or type(hs[namespace][method_name]) ~= "function" then
    error(namespace .. "." .. method_name .. " unavailable")
  end
end

local function browser_application()
  require_hammerspoon_api("application", "get")
  local ok, application = pcall(hs.application.get, browser_bundle_id)
  if not ok then
    error("failed to find Chromium: " .. tostring(application))
  end
  if not application or type(application.isRunning) ~= "function" then
    return nil
  end

  local running_ok, running = pcall(application.isRunning, application)
  if not running_ok then
    error("failed to inspect Chromium: " .. tostring(running))
  end
  return running and application or nil
end

local function run_javascript(script, description)
  require_hammerspoon_api("osascript", "javascript")
  local call_ok, success, result = pcall(hs.osascript.javascript, script)
  if not call_ok then
    error("failed to " .. description .. ": " .. tostring(success))
  end
  if success ~= true then
    error("failed to " .. description)
  end
  return result
end

local function first_youtube_tab_script()
  return ([[(function() {
    var browser = Application(%q);

    function isYoutubeVideoUrl(url) {
      return /^https?:\/\/([^\/]+\.)?youtube\.com\/watch\b/i.test(url)
        || /^https?:\/\/([^\/]+\.)?youtube\.com\/shorts\//i.test(url)
        || /^https?:\/\/youtu\.be\//i.test(url);
    }

    for (var win of browser.windows()) {
      var tabs = win.tabs();
      for (var index = 0; index < tabs.length; index++) {
        if (!isYoutubeVideoUrl(String(tabs[index].url() || ""))) {
          continue;
        }

        win.activeTabIndex = index + 1;
        win.index = 1;
        return String(win.id()) + "|" + String(index + 1);
      }
    }

    return "";
  })();
  ]]):format(browser_bundle_id)
end

local function focus_first_youtube_tab()
  local result = run_javascript(first_youtube_tab_script(), "focus the first YouTube video tab")
  if result == nil or result == "" then
    return nil
  end

  local window_id, tab_index = tostring(result):match("^(%d+)|(%d+)$")
  if not window_id or not tab_index then
    error("failed to identify the first YouTube video tab")
  end
  return window_id, tab_index
end

local function open_youtube_url(url)
  local script = ([[(function() {
    var browser = Application(%q);
    var window = browser.Window().make();
    window.tabs[0].url = %q;
    window.index = 1;
    return window.id();
  })();
  ]]):format(browser_bundle_id, url)
  run_javascript(script, "open the YouTube URL")
end

local function frontmost_application()
  require_hammerspoon_api("application", "frontmostApplication")
  local ok, application = pcall(hs.application.frontmostApplication)
  if not ok then
    error("failed to inspect the frontmost application: " .. tostring(application))
  end
  return application
end

local function play_pause_first_youtube_tab(browser)
  local window_id, tab_index = focus_first_youtube_tab()
  if not window_id then
    return false
  end

  local current_application = frontmost_application()
  if type(browser.activate) == "function" then
    local ok, result = pcall(browser.activate, browser)
    if not ok or result ~= true then
      error("failed to activate Chromium")
    end
  end

  require_hammerspoon_api("eventtap", "keyStroke")
  local function send_shortcut()
    local ok, result = pcall(hs.eventtap.keyStroke, {}, "k", 0, browser)
    if not ok or result ~= true then
      error("failed to send the YouTube play/pause shortcut")
    end
    if current_application and type(current_application.activate) == "function" then
      current_application:activate()
    end
  end

  if type(hs.timer) == "table" and type(hs.timer.doAfter) == "function" then
    local ok, result = pcall(hs.timer.doAfter, 0.2, send_shortcut)
    if not ok then
      error("failed to schedule the YouTube play/pause shortcut: " .. tostring(result))
    end
  else
    send_shortcut()
  end

  return true
end

return {
  id = action_id,
  name = "YouTube play/pause",
  description = "Play or pause the first YouTube video tab in Chromium, or open the configured URL.",
  category = "Media",
  gesture = "Press: play or pause YouTube",
  settingsSchemaVersion = 1,
  settingsSchema = {
    { type = "text", key = "url", label = "YouTube URL", maxLength = 1024, description = "HTTPS YouTube URL to open when no video tab is found; defaults to https://www.youtube.com." },
  },

  appearance = function(_context)
    return {
      title = "YouTube",
      state = "inactive",
    }
  end,

  press = function(context)
    local url = settings_for(context)
    if not valid_url(url) then
      error("invalid YouTube URL")
    end

    local browser = browser_application()
    if browser and play_pause_first_youtube_tab(browser) then
      context:success("YouTube playback toggled", 850)
      return
    end

    open_youtube_url(url)
    context:success("YouTube opened", 900)
  end,
}

