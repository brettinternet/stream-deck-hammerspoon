-- Stream Deck action: a Stream Deck key that switches keyboard layouts.
-- It toggles between U.S. and Dvorak by default; set both layout names in the action settings.

local DEFAULT_FIRST_LAYOUT = "U.S."
local DEFAULT_SECOND_LAYOUT = "Dvorak"

local function settings_for(context)
  local settings = nil
  if context and type(context.getSettings) == "function" then
    settings = context:getSettings()
  elseif context then
    settings = context.settings
  end

  if type(settings) ~= "table" then
    settings = {}
  end

  local first_layout = settings.firstLayout
  if type(first_layout) ~= "string" or first_layout == "" then
    first_layout = DEFAULT_FIRST_LAYOUT
  end

  local second_layout = settings.secondLayout
  if type(second_layout) ~= "string" or second_layout == "" then
    second_layout = DEFAULT_SECOND_LAYOUT
  end

  return first_layout, second_layout
end

local function keycodes_api()
  if type(hs) ~= "table"
    or type(hs.keycodes) ~= "table"
    or type(hs.keycodes.currentLayout) ~= "function"
    or type(hs.keycodes.setLayout) ~= "function" then
    error("keyboard layout unavailable")
  end
  return hs.keycodes
end

local function current_layout()
  local keycodes = keycodes_api()
  local ok, layout = pcall(keycodes.currentLayout)
  if not ok then
    error("failed to read keyboard layout: " .. tostring(layout))
  end
  return layout
end

return {
  id = "com.brettinternet.hammerspoon.keyboard-layout",
  name = "Keyboard layout",
  settingsSchemaVersion = 1,
  settingsSchema = {
    { type = "text", key = "firstLayout", maxLength = 64 },
    { type = "text", key = "secondLayout", maxLength = 64 },
  },

  appearance = function(context)
    local first_layout, second_layout = settings_for(context)
    local layout = current_layout()
    if type(layout) ~= "string" or layout == "" then
      layout = first_layout
    end

    return {
      title = layout,
      state = layout == second_layout and "active" or "inactive",
    }
  end,

  press = function(context)
    local first_layout, second_layout = settings_for(context)
    local layout = current_layout()
    local target = layout == first_layout and second_layout or first_layout
    local keycodes = keycodes_api()
    local ok, result = pcall(keycodes.setLayout, target)
    if not ok then
      error("failed to switch keyboard layout: " .. tostring(result))
    end
    if result ~= true then
      error("failed to switch keyboard layout")
    end

  end,
}

