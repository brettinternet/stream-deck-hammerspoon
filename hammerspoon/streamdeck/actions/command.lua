-- Stream Deck action: run a configured executable directly, without invoking a shell.

local helpers = require("streamdeck.helpers")

local DEFAULT_LABEL = "Sleep displays"
local DEFAULT_COMMAND = "/usr/bin/pmset"
local DEFAULT_ARGUMENTS = '["displaysleepnow"]'
local MAX_ARGUMENTS = 64
local running_by_instance = {}

local function settings_for(context)
  local settings = type(context.getSettings) == "function" and context:getSettings() or context.settings
  if type(settings) ~= "table" then
    return DEFAULT_LABEL, DEFAULT_COMMAND, DEFAULT_ARGUMENTS
  end

  local label = type(settings.label) == "string" and settings.label ~= "" and settings.label or DEFAULT_LABEL
  local command = type(settings.command) == "string" and settings.command ~= "" and settings.command or DEFAULT_COMMAND
  local arguments = type(settings.arguments) == "string" and settings.arguments ~= ""
    and settings.arguments or DEFAULT_ARGUMENTS
  return label, command, arguments
end

local function validate_command(command)
  if command:sub(1, 1) ~= "/" or #command > 1024 or command:find("%z") then
    error("command must be an absolute executable path")
  end
end

local function decode_arguments(encoded)
  if type(hs) ~= "table" or type(hs.json) ~= "table" or type(hs.json.decode) ~= "function" then
    error("command arguments unavailable")
  end
  if not encoded:match("^%s*%[") or not encoded:match("%]%s*$") then
    error("arguments must be a JSON array of strings")
  end

  local ok, arguments = pcall(hs.json.decode, encoded)
  if not ok or type(arguments) ~= "table" then
    error("arguments must be a JSON array of strings")
  end

  local count = 0
  for key, argument in pairs(arguments) do
    if type(key) ~= "number" or key < 1 or key % 1 ~= 0
      or type(argument) ~= "string" or #argument > 4096 or argument:find("%z") then
      error("arguments must be a JSON array of strings")
    end
    count = count + 1
  end
  if count > MAX_ARGUMENTS or count ~= #arguments then
    error("arguments must be a JSON array of at most 64 strings")
  end
  for index = 1, count do
    if rawget(arguments, index) == nil then
      error("arguments must be a dense JSON array")
    end
  end
  return arguments
end

local function task_api()
  if type(hs) ~= "table" or type(hs.task) ~= "table" or type(hs.task.new) ~= "function" then
    error("command runner unavailable")
  end
  return hs.task
end

return {
  id = "com.brettinternet.hammerspoon.command",
  name = "Run command",
  description = "Run a configured executable and arguments directly without a shell.",
  category = "System",
  gesture = "Press: run the configured command",
  settingsSchemaVersion = 1,
  settingsSchema = {
    { type = "text", key = "label", default = DEFAULT_LABEL, maxLength = 32, description = "Text shown on the key." },
    { type = "text", key = "command", default = DEFAULT_COMMAND, maxLength = 1024, description = "Absolute executable path; no shell expansion is performed." },
    { type = "text", key = "arguments", default = DEFAULT_ARGUMENTS, maxLength = 4096, description = "JSON array of arguments, for example [\"displaysleepnow\"]." },
  },

  appearance = function(context)
    local label = settings_for(context)
    local running = running_by_instance[context.instanceId] ~= nil
    return {
      title = label,
      state = running and "active" or "inactive",
      appearanceVersion = 1,
      icon = helpers.icon("display", {
        foregroundColor = running and helpers.colors.active or helpers.colors.accent,
      }),
    }
  end,

  press = function(context)
    local _, command, encoded_arguments = settings_for(context)
    validate_command(command)
    local arguments = decode_arguments(encoded_arguments)
    local tasks = task_api()
    local instance_id = context.instanceId
    if running_by_instance[instance_id] ~= nil then
      error("command is already running")
    end

    local created, task = pcall(tasks.new, command, function(exit_code)
      running_by_instance[instance_id] = nil
      if exit_code == 0 then
        context:success("Command\ncomplete", 850)
      else
        context:error("Command failed\n(exit " .. tostring(exit_code) .. ")", 1200)
      end
      context:refresh()
    end, function()
      return true
    end, arguments)
    if not created or task == nil then
      error("failed to create command task" .. (created and "" or ": " .. tostring(task)))
    end

    running_by_instance[instance_id] = task
    local started, result = pcall(task.start, task)
    if not started or result == false or result == nil then
      running_by_instance[instance_id] = nil
      error("failed to start command" .. (started and "" or ": " .. tostring(result)))
    end
  end,
}
