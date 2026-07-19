-- Hammerspoon configuration example: a Stream Deck key with independent state per key instance.
-- Each physical key toggles its own value and label, demonstrating helpers.perInstanceState.
-- Copy this file into ~/.hammerspoon or adapt it in your existing init.lua.

local streamdeck = require("streamdeck")
local helpers = require("streamdeck.helpers")

local state = helpers.perInstanceState(function()
  return false
end)
local refreshAfterToggle = helpers.refreshAfter(function(context)
  state:set(context, not state:get(context))
end)

streamdeck.register({
  id = "com.brettinternet.hammerspoon.per-instance-toggle",
  name = "Per-instance toggle",
  settingsSchemaVersion = 1,
  settingsSchema = {
    { type = "text", key = "label", maxLength = 32 },
  },

  appear = state.appear,

  appearance = function(context)
    local settings = context:getSettings()
    local label = type(settings) == "table" and settings.label or nil
    if type(label) ~= "string" or label == "" then
      label = "Toggle"
    end

    return {
      title = label,
      state = state:get(context) and "active" or "inactive",
    }
  end,

  press = refreshAfterToggle,

  disappear = state.disappear,

})

streamdeck.start()
