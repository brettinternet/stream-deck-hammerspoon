local actions = {}

local names = {
  "application",
  "app-windows-to-cursor",
  "audio-input-router",
  "audio-output-router",
  "clipboard-clean",
  "clipboard-stash",
  "desktop-space-cycler",
  "timer",
  "keep-awake",
  "keyboard-layout",
  "last-application",
  "lock-screen",
  "microphone",
  "pomodoro",
  "spotify",
  "system-monitor",
  "url-launcher",
  "url-toggle",
  "window-center",
  "window-maximize",
  "window-next-screen",
  "window-snap",
  "youtube",
}

local modules = {
  -- Arbitrary command execution must be selected explicitly; registerAll omits it.
  command = "streamdeck.actions.command",
}
for _, name in ipairs(names) do
  modules[name] = "streamdeck.actions." .. name
end

local callback_fields = {
  "press",
  "longPress",
  "release",
  "push",
  "rotate",
  "touchTap",
}

local function copy_definition(definition)
  local copy = {}
  for field, value in pairs(definition) do
    copy[field] = value
  end
  return copy
end

local function validate_streamdeck(streamdeck)
  if type(streamdeck) ~= "table"
    or type(streamdeck.register) ~= "function"
    or type(streamdeck.refresh) ~= "function" then
    error("Stream Deck actions require a bridge with register and refresh functions", 3)
  end
end

local function selected_modules(selected)
  if type(selected) ~= "table" then
    error("Stream Deck action names must be a table", 3)
  end

  local selected_names = {}
  local seen = {}
  for index, name in ipairs(selected) do
    if type(name) ~= "string" or modules[name] == nil then
      error("Unknown Stream Deck action: " .. tostring(name), 3)
    end
    if seen[name] then
      error("Duplicate Stream Deck action: " .. name, 3)
    end
    seen[name] = true
    selected_names[index] = name
  end
  return selected_names
end

function actions.register(streamdeck, selected)
  validate_streamdeck(streamdeck)
  local selected_names = selected_modules(selected)
  local definitions = {}

  for index, name in ipairs(selected_names) do
    definitions[index] = copy_definition(require(modules[name]))
  end

  local refresh_generation = 0
  local function refresh_action(action_id)
    refresh_generation = refresh_generation + 1
    streamdeck.refresh(action_id)
  end

  for _, definition in ipairs(definitions) do
    local action_id = definition.id
    for _, field in ipairs(callback_fields) do
      local callback = definition[field]
      if callback then
        definition[field] = function(context, ...)
          local generation = refresh_generation
          local results = table.pack(callback(context, ...))
          if generation == refresh_generation then
            refresh_action(action_id)
          end
          return table.unpack(results, 1, results.n)
        end
      end
    end
    streamdeck.register(definition)
  end

  return definitions
end

function actions.registerAll(streamdeck)
  return actions.register(streamdeck, names)
end

return actions
