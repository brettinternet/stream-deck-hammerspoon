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

local CONSOLE_ICON = { kind = "bundled", name = "hammerspoon" }

local function consoleApi()
  local hsapi = hammerspoon()
  if type(hsapi.toggleConsole) ~= "function"
      or type(hsapi.console) ~= "table"
      or type(hsapi.console.hswindow) ~= "function" then
    error("Hammerspoon console API is unavailable", 3)
  end
  return hsapi
end

local function consoleIsVisible()
  local consoleWindow = consoleApi().console.hswindow()
  if consoleWindow == nil or type(consoleWindow.isVisible) ~= "function" then
    error("Hammerspoon console window API is unavailable", 3)
  end
  local ok, visible = pcall(function()
    return consoleWindow:isVisible()
  end)
  if not ok or type(visible) ~= "boolean" then
    error("Hammerspoon console visibility API is unavailable", 3)
  end
  return visible
end

local function toggleConsole(context)
  consoleApi().toggleConsole()
  context:refresh()
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
    name = "Toggle Hammerspoon Console",
    appearance = function()
      local visible = consoleIsVisible()
      return {
        title = "Console",
        state = visible and "active" or "inactive",
        appearanceVersion = 1,
        icon = CONSOLE_ICON,
      }
    end,
    press = toggleConsole,
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
