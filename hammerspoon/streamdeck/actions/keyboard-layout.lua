-- Stream Deck action: a Stream Deck key that switches keyboard layouts.
-- Layout choices are populated from the enabled Hammerspoon keyboard layouts.

local NOT_CONFIGURED = "__not_configured__"
local NOT_CONFIGURED_LABEL = "Not configured"
local helpers = require("streamdeck.helpers")

local function keycodes_api()
  if type(hs) ~= "table"
    or type(hs.keycodes) ~= "table"
    or type(hs.keycodes.currentLayout) ~= "function"
    or type(hs.keycodes.layouts) ~= "function"
    or type(hs.keycodes.setLayout) ~= "function" then
    error("keyboard layout unavailable")
  end
  return hs.keycodes
end

local function discover_layout_options()
  local options = {
    { value = NOT_CONFIGURED, label = NOT_CONFIGURED_LABEL },
  }
  local records = {}
  local seen = {}
  local query_error
  local current

  if type(hs) ~= "table"
    or type(hs.keycodes) ~= "table"
    or type(hs.keycodes.layouts) ~= "function" then
    return options, nil, nil
  end

  local ok, layouts = pcall(hs.keycodes.layouts)
  if not ok then
    return options, nil, "failed to list keyboard layouts: " .. tostring(layouts)
  end
  if type(layouts) ~= "table" then
    return options, nil, "failed to list keyboard layouts: expected a table"
  end

  for _, layout in ipairs(layouts) do
    if type(layout) == "string" and layout ~= "" and not seen[layout] then
      seen[layout] = true
      records[#records + 1] = layout
    end
  end

  if type(hs.keycodes.currentLayout) == "function" then
    local current_ok, current_layout = pcall(hs.keycodes.currentLayout)
    if current_ok and type(current_layout) == "string" and current_layout ~= ""
      and seen[current_layout] then
      current = current_layout
    elseif not current_ok then
      query_error = "failed to read keyboard layout: " .. tostring(current_layout)
    end
  end

  table.sort(records)
  local selected = {}
  for index = 1, math.min(#records, 63) do
    selected[#selected + 1] = records[index]
  end
  if current ~= nil then
    local current_included = false
    for _, layout in ipairs(selected) do
      if layout == current then
        current_included = true
        break
      end
    end
    if not current_included then
      selected[#selected] = current
    end
  end
  table.sort(selected)
  for _, layout in ipairs(selected) do
    options[#options + 1] = { value = layout, label = layout }
  end
  if #records == 0 and query_error == nil then
    query_error = "no enabled keyboard layouts available"
  end
  return options, current, query_error
end

local function layout_defaults(options, current)
  local first = current
  if first == nil then
    for index = 2, #options do
      local value = options[index].value
      if value ~= NOT_CONFIGURED then
        first = value
        break
      end
    end
  end
  local second
  for index = 2, #options do
    local value = options[index].value
    if value ~= NOT_CONFIGURED and value ~= first then
      second = value
      break
    end
  end
  return first or NOT_CONFIGURED, second or NOT_CONFIGURED
end

local function settings_schema()
  local options, current = discover_layout_options()
  local first, second = layout_defaults(options, current)
  return {
    {
      type = "select",
      key = "firstLayout",
      label = "First layout",
      description = "Layout selected after the second layout.",
      options = options,
      default = first,
      refreshable = true,
    },
    {
      type = "select",
      key = "secondLayout",
      label = "Second layout",
      description = "Layout selected after the first layout.",
      options = options,
      default = second,
      refreshable = true,
    },
  }
end

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
  local options, current = discover_layout_options()
  local default_first, default_second = layout_defaults(options, current)

  local first_layout = settings.firstLayout
  if type(first_layout) ~= "string" or first_layout == "" then
    first_layout = default_first
  end

  local second_layout = settings.secondLayout
  if type(second_layout) ~= "string" or second_layout == "" then
    second_layout = default_second
  end

  return first_layout, second_layout
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
  description = "Switch between two enabled keyboard layouts.",
  category = "System",
  gesture = "Press: switch to the other configured layout",
  settingsSchemaVersion = 1,
  settingsSchemaProvider = settings_schema,

  appearance = function(context)
    local options, _, query_error = discover_layout_options()
    if query_error ~= nil and #options == 1 then
      error(query_error)
    end
    local first_layout, second_layout = settings_for(context)
    local layout = current_layout()
    if type(layout) ~= "string" or layout == "" then
      layout = first_layout
    end

    local badge = layout:match("[%w]+") or "KEY"
    badge = badge:sub(1, 4):upper()
    return {
      title = layout,
      state = layout == second_layout and "active" or "inactive",
      appearanceVersion = 1,
      badge = badge,
      backgroundColor = helpers.colors.background,
      foregroundColor = helpers.colors.foreground,
      icon = helpers.icon("keyboard", { foregroundColor = helpers.colors.accent }),
    }
  end,

  press = function(context)
    local options, _, query_error = discover_layout_options()
    if query_error ~= nil and #options == 1 then
      error(query_error)
    end
    local first_layout, second_layout = settings_for(context)
    local layout = current_layout()
    local target = layout == first_layout and second_layout or first_layout
    if target == NOT_CONFIGURED then
      error("no second keyboard layout configured")
    end
    local keycodes = keycodes_api()
    local ok, result = pcall(keycodes.setLayout, target)
    if not ok then
      error("failed to switch keyboard layout: " .. tostring(result))
    end
    if result ~= true then
      error("failed to switch keyboard layout")
    end
    context:success("Layout: " .. target, 1000)
  end,
}
