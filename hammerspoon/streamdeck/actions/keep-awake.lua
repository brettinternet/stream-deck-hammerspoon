-- Stream Deck action: a Stream Deck key that toggles display sleep prevention.
-- Add it as a Hammerspoon Toggle to choose separate Awake and Allow sleep icons in Stream Deck.

local sound = require("streamdeck.sound")
local helpers = require("streamdeck.helpers")

local action_id = "com.brettinternet.hammerspoon.keep-awake"
local idle_type = "displayIdle"

local function caffeinate_api()
  if type(hs) ~= "table"
    or type(hs.caffeinate) ~= "table"
    or type(hs.caffeinate.get) ~= "function"
    or type(hs.caffeinate.toggle) ~= "function" then
    error("display idle caffeinate API unavailable")
  end
  return hs.caffeinate
end

local function display_idle_state()
  local caffeinate = caffeinate_api()
  local ok, enabled = pcall(caffeinate.get, idle_type)
  if not ok then
    error("failed to read display idle state: " .. tostring(enabled))
  end
  if type(enabled) ~= "boolean" then
    error("failed to read display idle state: expected boolean result")
  end
  return enabled
end

return {
  id = action_id,
  name = "Keep awake",
  description = "Toggle display sleep prevention on or off.",
  category = "System",
  gesture = "Press: toggle display sleep prevention",
  sound = sound.toggle(),

  appearance = function(_context)
    local enabled = display_idle_state()
    return {
      title = enabled and "Awake" or "Allow\nsleep",
      state = enabled and "active" or "inactive",
      appearanceVersion = 1,
      badge = enabled and "ON" or nil,
      icon = helpers.icon(
        enabled and "sun" or "moon",
        { foregroundColor = enabled and helpers.colors.warning or helpers.colors.accent }
      ),
    }
  end,

  press = function(context)
    local caffeinate = caffeinate_api()
    local ok, enabled = pcall(caffeinate.toggle, idle_type)
    if not ok then
      error("failed to toggle display idle prevention: " .. tostring(enabled))
    end
    if type(enabled) ~= "boolean" then
      error("failed to toggle display idle prevention: expected boolean result")
    end
    context:success(enabled and "Keeping display awake" or "Display may sleep", 900)

    -- Report the boolean produced by hs.caffeinate.toggle; sound never infers it from appearance.
    return enabled and sound.ON or sound.OFF
  end,
}

