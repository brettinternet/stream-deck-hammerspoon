-- Hammerspoon configuration example: a Stream Deck key with independent per-instance state.
-- Copy this file into ~/.hammerspoon or adapt it in your existing init.lua.

local streamdeck = require("streamdeck")

local state_by_instance = {}

streamdeck.register({
  id = "com.brettinternet.hammerspoon.per-instance-toggle",
  name = "Per-instance toggle",
  settingsSchema = {
    { type = "text", key = "label", maxLength = 32 },
  },

  appear = function(context)
    if state_by_instance[context.instanceId] == nil then
      state_by_instance[context.instanceId] = false
    end
  end,

  appearance = function(context)
    local settings = context:getSettings()
    local label = type(settings) == "table" and settings.label or nil
    if type(label) ~= "string" or label == "" then
      label = "Toggle"
    end

    return {
      title = label,
      state = state_by_instance[context.instanceId] and "active" or "inactive",
    }
  end,

  press = function(context)
    state_by_instance[context.instanceId] = not state_by_instance[context.instanceId]
    context:refresh()
  end,

  disappear = function(context)
    state_by_instance[context.instanceId] = nil
  end,
})

streamdeck.start()
