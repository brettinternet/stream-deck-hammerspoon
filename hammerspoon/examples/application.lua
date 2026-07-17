-- Hammerspoon configuration example: a generic Stream Deck application hide key.
-- Copy this file into ~/.hammerspoon or adapt it in your existing init.lua.

local streamdeck = require("streamdeck")

local action_id = "com.brettinternet.hammerspoon.application-toggle"
local relevant_events = {
  [hs.application.watcher.activated] = true,
  [hs.application.watcher.deactivated] = true,
  [hs.application.watcher.hidden] = true,
  [hs.application.watcher.unhidden] = true,
  [hs.application.watcher.launched] = true,
  [hs.application.watcher.terminated] = true,
}

streamdeck.register({
  id = action_id,
  name = "Hide application",

  appearance = function(_context)
    local application = hs.application.frontmostApplication()
    if not application then
      return {
        title = "No app",
        state = "inactive",
      }
    end

    return {
      title = application:name() or "Unknown app",
      state = "active",
    }
  end,

  press = function(context)
    local application = hs.application.frontmostApplication()
    if not application then
      error("no frontmost application")
    end

    if not application:hide() then
      error("failed to hide frontmost application")
    end

    context:refresh()
  end,
})

local application_watcher = hs.application.watcher.new(function(_name, event, _application)
  if relevant_events[event] then
    streamdeck.refresh(action_id)
  end
end)
application_watcher:start()

-- The bridge owns the local authenticated connection; do not use hs.streamdeck.
streamdeck.start()
