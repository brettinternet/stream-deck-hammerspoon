-- Stream Deck action: a Stream Deck key that moves every window of the frontmost app to the display under the cursor.
-- Windows preserve their relative placement and are kept inside the destination display.

local action_id = "com.brettinternet.hammerspoon.app-windows-to-cursor"
local helpers = require("streamdeck.helpers")

local function frontmost_application()
  if type(hs) ~= "table"
    or type(hs.application) ~= "table"
    or type(hs.application.frontmostApplication) ~= "function" then
    error("frontmost application API unavailable")
  end

  local ok, application = pcall(hs.application.frontmostApplication)
  if not ok then
    error("failed to get frontmost application: " .. tostring(application))
  end
  if application ~= nil and type(application) ~= "table" and type(application) ~= "userdata" then
    error("frontmost application API returned invalid application")
  end
  return application
end

local function application_windows(application)
  if type(application.allWindows) ~= "function" then
    error("application windows API unavailable")
  end

  local ok, windows = pcall(application.allWindows, application)
  if not ok then
    error("failed to get frontmost application windows: " .. tostring(windows))
  end
  if type(windows) ~= "table" then
    error("frontmost application windows unavailable")
  end
  return windows
end

local function cursor_screen()
  if type(hs) ~= "table"
    or type(hs.mouse) ~= "table"
    or type(hs.mouse.getCurrentScreen) ~= "function" then
    error("cursor screen API unavailable")
  end

  local ok, screen = pcall(hs.mouse.getCurrentScreen)
  if not ok then
    error("failed to get cursor screen: " .. tostring(screen))
  end
  if screen == nil then
    error("cursor is not on a screen")
  end
  if type(screen) ~= "table" and type(screen) ~= "userdata" then
    error("cursor screen unavailable")
  end
  return screen
end

local function move_window_to_screen(window, screen)
  if (type(window) ~= "table" and type(window) ~= "userdata")
    or type(window.moveToScreen) ~= "function" then
    error("window moveToScreen API unavailable")
  end

  local ok, result = pcall(window.moveToScreen, window, screen, false, true)
  if not ok then
    error("failed to move app window: " .. tostring(result))
  end
  if not result then
    error("failed to move app window")
  end
end

return {
  id = action_id,
  name = "Move app windows to cursor",
  description = "Move every window of the frontmost app to the display under the cursor.",
  category = "Windows",
  gesture = "Press: move every frontmost-app window to the cursor display",

  appearance = function(_context)
    local available = frontmost_application() ~= nil
    return {
      title = available and "Move app\nto cursor" or "No app",
      state = available and "active" or "inactive",
      appearanceVersion = 1,
      icon = helpers.icon("next-screen", {
        foregroundColor = available and helpers.colors.accent or helpers.colors.inactive,
      }),
    }
  end,

  press = function(context)
    local application = frontmost_application()
    if application == nil then
      error("no frontmost application")
    end

    local windows = application_windows(application)
    if #windows == 0 then
      error("frontmost application has no windows")
    end

    local screen = cursor_screen()
    for _, window in ipairs(windows) do
      move_window_to_screen(window, screen)
    end

    context:success("App windows\nmoved", 850)
  end,
}
