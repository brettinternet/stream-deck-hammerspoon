local actions = {}

local modules = {
  ["app-launcher"] = "streamdeck.actions.app-launcher",
  application = "streamdeck.actions.application",
  ["audio-output-router"] = "streamdeck.actions.audio-output-router",
  ["clipboard-clean"] = "streamdeck.actions.clipboard-clean",
  ["clipboard-stash"] = "streamdeck.actions.clipboard-stash",
  ["desktop-space-cycler"] = "streamdeck.actions.desktop-space-cycler",
  ["focus-timer"] = "streamdeck.actions.focus-timer",
  ["keep-awake"] = "streamdeck.actions.keep-awake",
  ["keyboard-layout"] = "streamdeck.actions.keyboard-layout",
  ["last-application"] = "streamdeck.actions.last-application",
  ["lock-screen"] = "streamdeck.actions.lock-screen",
  ["meeting-mode"] = "streamdeck.actions.meeting-mode",
  microphone = "streamdeck.actions.microphone",
  pomodoro = "streamdeck.actions.pomodoro",
  ["url-launcher"] = "streamdeck.actions.url-launcher",
  ["window-center"] = "streamdeck.actions.window-center",
  ["window-maximize"] = "streamdeck.actions.window-maximize",
  ["window-next-screen"] = "streamdeck.actions.window-next-screen",
  ["window-snap"] = "streamdeck.actions.window-snap",
  youtube = "streamdeck.actions.youtube",
}

local names = {
  "app-launcher",
  "application",
  "audio-output-router",
  "clipboard-clean",
  "clipboard-stash",
  "desktop-space-cycler",
  "focus-timer",
  "keep-awake",
  "keyboard-layout",
  "last-application",
  "lock-screen",
  "meeting-mode",
  "microphone",
  "pomodoro",
  "url-launcher",
  "window-center",
  "window-maximize",
  "window-next-screen",
  "window-snap",
  "youtube",
}

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
  local function refresh_all()
    refresh_generation = refresh_generation + 1
    for _, definition in ipairs(definitions) do
      streamdeck.refresh(definition.id)
    end
  end

  for _, definition in ipairs(definitions) do
    for _, field in ipairs(callback_fields) do
      local callback = definition[field]
      if callback then
        definition[field] = function(context, ...)
          local generation = refresh_generation
          local results = table.pack(callback(context, ...))
          if generation == refresh_generation then
            refresh_all()
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
