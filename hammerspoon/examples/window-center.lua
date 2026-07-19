-- Hammerspoon configuration example: a Stream Deck key that centers the focused window on its screen.
-- Press the key to keep the window's size while moving it to the center of the screen it occupies.
-- Copy this file into ~/.hammerspoon or adapt it in your existing init.lua.

local streamdeck = require("streamdeck")

local action_id = "com.brettinternet.hammerspoon.window-center"

local function focused_window()
  if type(hs) ~= "table"
    or type(hs.window) ~= "table"
    or type(hs.window.focusedWindow) ~= "function" then
    error("focused window API unavailable")
  end

  local ok, window = pcall(hs.window.focusedWindow)
  if not ok then
    error("failed to get focused window: " .. tostring(window))
  end
  if window ~= nil and type(window) ~= "table" and type(window) ~= "userdata" then
    error("focused window API returned invalid window")
  end
  return window
end

local function read_frame(value, description)
  if type(value) ~= "table" then
    error("failed to read " .. description .. " frame: expected table")
  end
  for _, field in ipairs({ "x", "y", "w", "h" }) do
    if type(value[field]) ~= "number" then
      error("failed to read " .. description .. " frame: expected numeric " .. field)
    end
  end
  return value
end

local function window_screen(window)
  if type(window.screen) ~= "function" then
    error("window screen API unavailable")
  end

  local ok, screen = pcall(window.screen, window)
  if not ok then
    error("failed to get focused window screen: " .. tostring(screen))
  end
  if screen == nil then
    error("focused window has no screen")
  end
  if type(screen) ~= "table" and type(screen) ~= "userdata" then
    error("focused window screen unavailable")
  end
  return screen
end

local function screen_frame(screen)
  if type(screen.frame) ~= "function" then
    error("screen frame API unavailable")
  end

  local ok, frame = pcall(screen.frame, screen)
  if not ok then
    error("failed to read screen frame: " .. tostring(frame))
  end
  return read_frame(frame, "screen")
end

local function window_frame(window)
  if type(window.frame) ~= "function" then
    error("window frame API unavailable")
  end

  local ok, frame = pcall(window.frame, window)
  if not ok then
    error("failed to read focused window frame: " .. tostring(frame))
  end
  return read_frame(frame, "window")
end

streamdeck.register({
  id = action_id,
  name = "Center window",

  appearance = function(_context)
    if focused_window() == nil then
      return {
        title = "No window",
        state = "inactive",
      }
    end

    return {
      title = "Center",
      state = "active",
    }
  end,

  press = function(context)
    local window = focused_window()
    if window == nil then
      error("no focused window")
    end

    local screen = window_screen(window)
    local available = screen_frame(screen)
    local current = window_frame(window)

    local centered = {}
    for key, value in pairs(current) do
      centered[key] = value
    end
    centered.x = available.x + (available.w - current.w) / 2
    centered.y = available.y + (available.h - current.h) / 2
    centered.w = current.w
    centered.h = current.h

    if type(window.setFrame) ~= "function" then
      error("window setFrame API unavailable")
    end
    local ok, result = pcall(window.setFrame, window, centered)
    if not ok then
      error("failed to set focused window frame: " .. tostring(result))
    end
    if not result then
      error("failed to set focused window frame: expected successful result")
    end

    context:refresh()
  end,
})

-- The bridge owns the local authenticated connection; do not use hs.streamdeck.
streamdeck.start()
