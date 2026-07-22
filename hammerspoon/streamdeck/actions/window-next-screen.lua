-- Stream Deck action: a Stream Deck key that moves the focused window to the next display.
-- The window keeps its relative position and size, and the destination frame is kept inside the display.

local action_id = "com.brettinternet.hammerspoon.window-next-screen"

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
  return window
end

local function next_screen_for(window)
  if type(window.screen) ~= "function" then
    error("window screen API unavailable")
  end

  local ok, screen = pcall(window.screen, window)
  if not ok then
    error("failed to get focused window screen: " .. tostring(screen))
  end
  if not screen then
    error("focused window has no screen")
  end
  if type(screen.next) ~= "function" then
    error("screen next API unavailable")
  end

  local next_ok, next_screen = pcall(screen.next, screen)
  if not next_ok then
    error("failed to get next screen: " .. tostring(next_screen))
  end
  if next_screen == screen then
    return nil
  end
  return next_screen
end

return {
  id = action_id,
  name = "Move window to next screen",
  description = "Move the focused window to the next screen.",

  appearance = function(_context)
    local window = focused_window()
    if not window then
      return {
        title = "No window",
        state = "inactive",
      }
    end

    if not next_screen_for(window) then
      return {
        title = "One display",
        state = "inactive",
      }
    end

    return {
      title = "Next display",
      state = "inactive",
    }
  end,

  press = function(context)
    local window = focused_window()
    if not window then
      error("no focused window")
    end

    local next_screen = next_screen_for(window)
    if not next_screen then
      error("no other screen")
    end
    if type(window.moveToScreen) ~= "function" then
      error("window moveToScreen API unavailable")
    end

    local ok, result = pcall(window.moveToScreen, window, next_screen, false, true)
    if not ok then
      error("failed to move focused window: " .. tostring(result))
    end
    if not result then
      error("failed to move focused window")
    end

  end,
}

