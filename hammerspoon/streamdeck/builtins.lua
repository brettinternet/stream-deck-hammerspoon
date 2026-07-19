local builtins = {}

local RELOAD_ID = "com.brettinternet.hammerspoon.reload"
local CONSOLE_ID = "com.brettinternet.hammerspoon.console"

local function hammerspoon()
  local hsapi = rawget(_G, "hs")
  if type(hsapi) ~= "table" then
    error("Hammerspoon API is unavailable", 3)
  end
  return hsapi
end

local function reloadApi()
  local hsapi = hammerspoon()
  if type(hsapi.reload) ~= "function"
      or type(hsapi.timer) ~= "table"
      or type(hsapi.timer.doAfter) ~= "function" then
    error("Hammerspoon reload API is unavailable", 3)
  end
  return hsapi
end

local function reload()
  local hsapi = reloadApi()
  local ok, timer = pcall(hsapi.timer.doAfter, 0, function()
    hsapi.reload()
  end)
  if not ok or timer == nil then
    error("failed to schedule Hammerspoon reload", 3)
  end
end

local function consoleApi()
  local hsapi = hammerspoon()
  if type(hsapi.openConsole) ~= "function" then
    error("Hammerspoon console API is unavailable", 3)
  end
  return hsapi
end

local function openConsole()
  consoleApi().openConsole(true)
end

local definitions = {
  {
    id = RELOAD_ID,
    name = "Reload Hammerspoon",
    appearance = function()
      reloadApi()
      return { title = "Reload", state = "inactive" }
    end,
    press = reload,
  },
  {
    id = CONSOLE_ID,
    name = "Open Hammerspoon Console",
    appearance = function()
      consoleApi()
      return { title = "Console", state = "inactive" }
    end,
    press = openConsole,
  },
}

function builtins.register(registry)
  if type(registry) ~= "table"
      or type(registry.has) ~= "function"
      or type(registry.register) ~= "function" then
    error("Invalid Stream Deck action registry", 2)
  end

  for _, definition in ipairs(definitions) do
    if not registry:has(definition.id) then
      registry:register(definition)
    end
  end

  return registry
end

return builtins
