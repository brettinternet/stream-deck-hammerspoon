-- Hammerspoon configuration example: a Stream Deck key that toggles the focused window's zoom.
-- Pressing the key uses Hammerspoon's toggleZoom API and tracks the zoom state independently per key.
-- Copy this file into ~/.hammerspoon or adapt it in your existing init.lua.

local streamdeck = require("streamdeck")

local action_id = "com.brettinternet.hammerspoon.window-maximize"
local zoomed_by_instance = {}

local function focused_window()
  if not hs.window or type(hs.window.focusedWindow) ~= "function" then
    return nil
  end
  return hs.window.focusedWindow()
end

local function window_name(window)
  if type(window.application) ~= "function" then
    return "Window"
  end

  local application = window:application()
  if not application or type(application.name) ~= "function" then
    return "Window"
  end

  local name = application:name()
  if type(name) ~= "string" or name == "" then
    return "Window"
  end
  return name
end

streamdeck.register({
  id = action_id,
  name = "Zoom focused window",

  appear = function(context)
    zoomed_by_instance[context.instanceId] = false
  end,

  appearance = function(context)
    local window = focused_window()
    if not window then
      return {
        title = "No window",
        state = "inactive",
      }
    end

    return {
      title = window_name(window),
      state = zoomed_by_instance[context.instanceId] and "active" or "inactive",
    }
  end,

  press = function(context)
    local window = focused_window()
    if not window then
      error("no focused window")
    end
    if type(window.toggleZoom) ~= "function" then
      error("focused window zoom unavailable")
    end
    if not window:toggleZoom() then
      error("failed to toggle focused window zoom")
    end

    zoomed_by_instance[context.instanceId] = not zoomed_by_instance[context.instanceId]
    context:refresh()
  end,

  disappear = function(context)
    zoomed_by_instance[context.instanceId] = nil
  end,
})

-- The bridge owns the local authenticated connection; do not use hs.streamdeck.
streamdeck.start()

