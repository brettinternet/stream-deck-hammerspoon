-- Hammerspoon configuration example: a Stream Deck key that locks the screen.
-- Pressing the key calls Hammerspoon's screen-lock API; it has no persistent active state.
-- Copy this file into ~/.hammerspoon or adapt it in your existing init.lua.

local streamdeck = require("streamdeck")
local sound = require("streamdeck.sound")

local action_id = "com.brettinternet.hammerspoon.lock-screen"

local function caffeinate_api()
  if type(hs) ~= "table"
    or type(hs.caffeinate) ~= "table"
    or type(hs.caffeinate.lockScreen) ~= "function" then
    error("lock screen API unavailable")
  end
  return hs.caffeinate
end

streamdeck.register({
  id = action_id,
  name = "Lock screen",
  sound = sound.press(),
  -- The shared policy plays the default press cue only after this callback succeeds.

  -- hs.caffeinate.lockScreen has no documented return value, so a successful
  -- call (nil) and an explicit true are accepted; false and other values fail.
  appearance = function(_context)
    caffeinate_api()
    return {
      title = "Lock",
      state = "inactive",
    }
  end,

  press = function(_context)
    local caffeinate = caffeinate_api()
    local ok, result = pcall(caffeinate.lockScreen)
    if not ok then
      error("failed to lock screen: " .. tostring(result))
    end
    if result ~= nil and result ~= true then
      error("failed to lock screen: expected true or nil result")
    end
  end,
})

-- The bridge owns the local authenticated connection; do not use hs.streamdeck.
streamdeck.start()
