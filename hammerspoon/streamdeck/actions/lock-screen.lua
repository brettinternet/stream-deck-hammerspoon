-- Stream Deck action: a Stream Deck key that locks the screen.
-- Pressing the key calls Hammerspoon's screen-lock API; it has no persistent active state.

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

return {
  id = action_id,
  name = "Lock screen",
  description = "Lock the screen.",
  category = "System",
  gesture = "Press: lock the screen",
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

  press = function(context)
    local caffeinate = caffeinate_api()
    local ok, result = pcall(caffeinate.lockScreen)
    if not ok then
      error("failed to lock screen: " .. tostring(result))
    end
    if result ~= nil and result ~= true then
      error("failed to lock screen: expected true or nil result")
    end
    context:success("Screen\nlocked", 850)
  end,
}

