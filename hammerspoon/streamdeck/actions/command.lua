-- Stream Deck action: run a configured executable directly, without invoking a shell.

local helpers = require("streamdeck.helpers")

local DEFAULT_LABEL = "Sleep displays"
local DEFAULT_COMMAND = "/usr/bin/pmset"
local DEFAULT_ARGUMENTS = "displaysleepnow"
local MAX_ARGUMENTS = 64
local running_by_instance = {}

local function settings_for(context)
  local settings = type(context.getSettings) == "function" and context:getSettings() or context.settings
  if type(settings) ~= "table" then
    return DEFAULT_LABEL, DEFAULT_COMMAND, DEFAULT_ARGUMENTS
  end

  local label = type(settings.label) == "string" and settings.label ~= "" and settings.label or DEFAULT_LABEL
  local command = type(settings.command) == "string" and settings.command ~= "" and settings.command or DEFAULT_COMMAND
  local argument_string = type(settings.argumentString) == "string"
    and settings.argumentString or DEFAULT_ARGUMENTS
  return label, command, argument_string
end

local function validate_command(command)
  if command:sub(1, 1) ~= "/" or #command > 1024 or command:find("%z") then
    error("command must be an absolute executable path")
  end
end

local function parse_arguments(input)
  if input:find("%z") then
    error("arguments must not contain null bytes")
  end

  local arguments = {}
  local current = {}
  local current_length = 0
  local token_started = false
  local quote
  local index = 1

  local function append(character)
    current_length = current_length + #character
    if current_length > 4096 then
      error("each argument must be at most 4096 bytes")
    end
    current[#current + 1] = character
    token_started = true
  end

  local function finish_argument()
    if not token_started then return end
    if #arguments >= MAX_ARGUMENTS then
      error("arguments must contain at most 64 values")
    end
    arguments[#arguments + 1] = table.concat(current)
    current = {}
    current_length = 0
    token_started = false
  end

  while index <= #input do
    local character = input:sub(index, index)
    if quote == "single" then
      if character == "'" then
        quote = nil
      else
        append(character)
      end
    elseif quote == "double" then
      if character == '"' then
        quote = nil
      elseif character == "\\" then
        index = index + 1
        if index > #input then error("arguments end with an incomplete escape") end
        append(input:sub(index, index))
      else
        append(character)
      end
    elseif character:match("%s") then
      finish_argument()
    elseif character == "'" then
      quote = "single"
      token_started = true
    elseif character == '"' then
      quote = "double"
      token_started = true
    elseif character == "\\" then
      index = index + 1
      if index > #input then error("arguments end with an incomplete escape") end
      append(input:sub(index, index))
    else
      append(character)
    end
    index = index + 1
  end

  if quote ~= nil then error("arguments contain an unterminated quote") end
  finish_argument()
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
    { type = "text", key = "argumentString", label = "Arguments", default = DEFAULT_ARGUMENTS, maxLength = 4096, description = "Space-separated arguments; use quotes or backslashes for spaces. No shell expansion is performed." },
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
    local _, command, argument_string = settings_for(context)
    validate_command(command)
    local arguments = parse_arguments(argument_string)
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
