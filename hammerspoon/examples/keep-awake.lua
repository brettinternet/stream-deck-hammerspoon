-- Hammerspoon configuration example: a Stream Deck key that keeps the display awake.
-- Copy this file into ~/.hammerspoon or adapt it in your existing init.lua.

local streamdeck = require("streamdeck")
local helpers = require("streamdeck.helpers")

local action_id = "com.brettinternet.hammerspoon.keep-awake"
local idle_type = "displayIdle"

local awake_icon = helpers.svg(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72"><rect x="5" y="7" width="62" height="46" rx="7" fill="#064E3B"/><rect x="11" y="13" width="50" height="34" rx="3" fill="#34D399"/><path d="M18 59h36M36 53v6" stroke="#A7F3D0" stroke-width="4" stroke-linecap="round"/><path d="M36 19v10M31 24h10" stroke="#064E3B" stroke-width="3" stroke-linecap="round"/></svg>'
)

local allow_sleep_icon = helpers.svg(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72"><circle cx="36" cy="36" r="25" fill="#1E293B"/><circle cx="43" cy="29" r="19" fill="#64748B"/><circle cx="48" cy="24" r="19" fill="#1E293B"/><circle cx="20" cy="21" r="2" fill="#F8FAFC"/><circle cx="54" cy="51" r="2" fill="#F8FAFC"/><path d="M19 50l5 5M24 50l-5 5" stroke="#CBD5E1" stroke-width="3" stroke-linecap="round"/></svg>'
)


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
    local enabled = display_idle_state()
    if enabled then
      return {
        title = "Awake",
        state = "active",
        appearanceVersion = 1,
        foregroundColor = "#D1FAE5",
        backgroundColor = "#064E3B",
        badge = "ON",
        icon = awake_icon,
      }
    end

    return {
      title = "Allow sleep",
      state = "inactive",
      appearanceVersion = 1,
      foregroundColor = "#E2E8F0",
      backgroundColor = "#1E293B",
      badge = "OFF",
      icon = allow_sleep_icon,
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
