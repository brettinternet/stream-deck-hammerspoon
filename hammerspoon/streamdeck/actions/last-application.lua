-- Stream Deck action: a Stream Deck key that switches to the last active application.
-- Repeated presses toggle between the two most recently active applications, like a dedicated Command-Tab key.

local action_id = "com.brettinternet.hammerspoon.last-application"
local current_application = nil
local previous_application = nil
local application_watcher = nil
local visible_contexts = {}

local function refresh_visible_contexts()
  for _, context in pairs(visible_contexts) do
    context:refresh()
  end
end


local function require_application_api(method_name)
  if type(hs) ~= "table"
    or type(hs.application) ~= "table"
    or type(hs.application[method_name]) ~= "function" then
    error("application " .. method_name .. " API unavailable")
  end
end

local function frontmost_application()
  require_application_api("frontmostApplication")

  local ok, application = pcall(hs.application.frontmostApplication)
  if not ok then
    error("failed to inspect frontmost application: " .. tostring(application))
  end
  return application
end

local function application_is_running(application)
  if type(application.isRunning) ~= "function" then
    error("application running-state API unavailable")
  end

  local ok, running = pcall(application.isRunning, application)
  if not ok then
    error("failed to inspect application running state: " .. tostring(running))
  end
  return running == true
end

local function application_name(application)
  if type(application.name) ~= "function" then
    return "Previous app"
  end

  local ok, name = pcall(application.name, application)
  if not ok or type(name) ~= "string" or name == "" then
    return "Previous app"
  end
  return name
end

local function remember_activation(application)
  if not application or application == current_application then
    return false
  end

  previous_application = current_application
  current_application = application
  return true
end

local function sync_frontmost_application()
  remember_activation(frontmost_application())
end

local function available_previous_application()
  if not previous_application then
    return nil
  end
  if application_is_running(previous_application) then
    return previous_application
  end

  previous_application = nil
  return nil
end

local function start_application_watcher()
  require_application_api("frontmostApplication")
  local watcher_api = hs.application.watcher
  if type(watcher_api) ~= "table"
    or type(watcher_api.new) ~= "function"
    or watcher_api.activated == nil
    or watcher_api.terminated == nil then
    error("application watcher API unavailable")
  end

  current_application = frontmost_application()
  local ok, watcher = pcall(watcher_api.new, function(_name, event, application)
    if event == watcher_api.activated then
      if remember_activation(application) then
        refresh_visible_contexts()
      end
    elseif event == watcher_api.terminated then
      refresh_visible_contexts()
    end
  end)
  if not ok then
    error("failed to create application watcher: " .. tostring(watcher))
  end
  if not watcher or type(watcher.start) ~= "function" then
    error("failed to create application watcher")
  end

  local start_ok, result = pcall(watcher.start, watcher)
  if not start_ok then
    error("failed to start application watcher: " .. tostring(result))
  end
  if not result then
    error("failed to start application watcher")
  end
  application_watcher = watcher
end

local function stop_application_watcher_if_unused()
  if application_watcher and next(visible_contexts) == nil then
    application_watcher:stop()
    application_watcher = nil
    current_application = nil
    previous_application = nil
  end
end


return {
  id = action_id,
  name = "Switch to last application",
  description = "Switch to the previously active application.",
  category = "Applications",
  gesture = "Press: switch to the previously active application",

  appear = function(context)
    visible_contexts[context.instanceId] = context
    if not application_watcher then
      start_application_watcher()
    end
  end,
  disappear = function(context)
    visible_contexts[context.instanceId] = nil
    stop_application_watcher_if_unused()
  end,

  appearance = function(_context)
    if not application_watcher then
      error("application watcher unavailable")
    end
    sync_frontmost_application()
    local application = available_previous_application()
    if not application then
      return {
        title = "No previous",
        state = "inactive",
      }
    end

    return {
      title = application_name(application),
      state = "active",
    }
  end,

  press = function(context)
    sync_frontmost_application()
    local target = available_previous_application()
    if not target then
      error("no previous application")
    end
    if type(target.activate) ~= "function" then
      error("application activate API unavailable")
    end

    local old_current = current_application
    local old_previous = previous_application
    current_application = target
    previous_application = old_current

    local ok, result = pcall(target.activate, target, true)
    if not ok or result ~= true then
      current_application = old_current
      previous_application = old_previous
      if not ok then
        error("failed to activate previous application: " .. tostring(result))
      end
      error("failed to activate previous application")
    end

    context:success("Opened " .. application_name(target), 900)
  end,
}

