-- Hammerspoon configuration example: a Stream Deck key that keeps the display awake.
-- Copy this file into ~/.hammerspoon or adapt it in your existing init.lua.

local streamdeck = require("streamdeck")

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

streamdeck.register({
  id = action_id,
  name = "Keep awake",

  appearance = function(_context)
    if display_idle_state() then
      return {
        title = "Awake",
        state = "active",
      }
    end

    return {
      title = "Allow sleep",
      state = "inactive",
    }
  end,

  press = function(_context)
    local caffeinate = caffeinate_api()
    local ok, enabled = pcall(caffeinate.toggle, idle_type)
    if not ok then
      error("failed to toggle display idle prevention: " .. tostring(enabled))
    end
    if type(enabled) ~= "boolean" then
      error("failed to toggle display idle prevention: expected boolean result")
    end

    streamdeck.refresh(action_id)
  end,
})

-- The bridge owns the local authenticated connection; do not use hs.streamdeck.
streamdeck.start()
