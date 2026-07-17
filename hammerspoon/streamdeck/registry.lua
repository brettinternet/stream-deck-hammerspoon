local registry = {}

local allowedFields = {
  id = true,
  name = true,
  settingsSchema = true,
  settingsSchemaVersion = true,
  appearance = true,
  press = true,
  release = true,
  push = true,
  rotate = true,
  touchTap = true,
  longPress = true,
  longPressThresholdMs = true,
  appear = true,
  disappear = true,
}

local function nonEmptyString(value)
  return type(value) == "string" and value ~= ""
end

local function isFiniteNumber(value)
  return type(value) == "number" and value == value and value ~= math.huge and value ~= -math.huge
end

local function validateJsonValue(value, seen)
  local valueType = type(value)
  if valueType == "nil" or valueType == "boolean" or valueType == "string" then
    return
  end
  if valueType == "number" then
    if value ~= value or value == math.huge or value == -math.huge then
      error("Stream Deck action settingsSchema contains a non-finite number", 4)
    end
    return
  end
  if valueType ~= "table" then
    error("Stream Deck action settingsSchema must contain only JSON values", 4)
  end
  if seen[value] then
    error("Stream Deck action settingsSchema must not contain cycles", 4)
  end
  seen[value] = true

  local stringKeys = 0
  local numericKeys = 0
  local maximumIndex = 0
  for key, nested in pairs(value) do
    if type(key) == "string" then
      stringKeys = stringKeys + 1
    elseif type(key) == "number" and key >= 1 and key % 1 == 0 then
      numericKeys = numericKeys + 1
      maximumIndex = math.max(maximumIndex, key)
    else
      error("Stream Deck action settingsSchema contains an invalid JSON key", 4)
    end
    validateJsonValue(nested, seen)
  end
  if stringKeys > 0 and numericKeys > 0 then
    error("Stream Deck action settingsSchema must not mix object and array keys", 4)
  end
  if numericKeys > 0 and maximumIndex ~= numericKeys then
    error("Stream Deck action settingsSchema arrays must be dense", 4)
  end
  seen[value] = nil
end

local MAX_SETTINGS_FIELDS = 32
local MAX_SETTINGS_KEY_LENGTH = 64
local MAX_SETTINGS_LABEL_LENGTH = 128
local MAX_SETTINGS_TEXT_LENGTH = 4096
local MAX_SETTINGS_NUMBER = 1000000000000
local MAX_SETTINGS_OPTIONS = 64
local MAX_SETTINGS_OPTION_VALUE_LENGTH = 256
local MIN_LONG_PRESS_THRESHOLD_MS = 100
local MAX_LONG_PRESS_THRESHOLD_MS = 10000

local function isInteger(value)
  return type(value) == "number" and value == math.floor(value)
end

local function isBoundedString(value, maximum)
  if not nonEmptyString(value) then
    return false
  end
  local length = utf8.len(value)
  return length ~= nil and length <= maximum
end

local function validateSettingsField(field, fieldIndex, seenKeys)
  if type(field) ~= "table" then
    error("Stream Deck action settingsSchema field " .. fieldIndex .. " must be an object", 4)
  end

  local kind = rawget(field, "type")
  local allowed = {
    type = true,
    key = true,
    label = true,
    required = true,
    default = true,
  }
  if kind == "text" then
    allowed.minLength = true
    allowed.maxLength = true
  elseif kind == "number" then
    allowed.min = true
    allowed.max = true
    allowed.step = true
  elseif kind == "select" then
    allowed.options = true
  elseif kind ~= "boolean" then
    error("Stream Deck action settingsSchema field " .. fieldIndex .. " has an invalid type", 4)
  end

  for key in pairs(field) do
    if not allowed[key] then
      error("Stream Deck action settingsSchema field " .. fieldIndex .. " has unknown key: " .. tostring(key), 4)
    end
  end
  if not isBoundedString(rawget(field, "key"), MAX_SETTINGS_KEY_LENGTH) then
    error("Stream Deck action settingsSchema field " .. fieldIndex .. " key must be non-empty and bounded", 4)
  end
  local fieldKey = rawget(field, "key")
  if seenKeys[fieldKey] then
    error("Stream Deck action settingsSchema has duplicate field key: " .. fieldKey, 4)
  end
  seenKeys[fieldKey] = true
  if rawget(field, "label") ~= nil and not isBoundedString(rawget(field, "label"), MAX_SETTINGS_LABEL_LENGTH) then
    error("Stream Deck action settingsSchema field " .. fieldIndex .. " label must be non-empty and bounded", 4)
  end
  if rawget(field, "required") ~= nil and type(rawget(field, "required")) ~= "boolean" then
    error("Stream Deck action settingsSchema field " .. fieldIndex .. " required must be boolean", 4)
  end

  if kind == "text" then
    local minimum = rawget(field, "minLength")
    local maximum = rawget(field, "maxLength")
    if minimum ~= nil and (not isInteger(minimum) or minimum < 0 or minimum > MAX_SETTINGS_TEXT_LENGTH) then
      error("Stream Deck action settingsSchema field " .. fieldIndex .. " minLength is out of range", 4)
    end
    if maximum ~= nil and (not isInteger(maximum) or maximum < 0 or maximum > MAX_SETTINGS_TEXT_LENGTH) then
      error("Stream Deck action settingsSchema field " .. fieldIndex .. " maxLength is out of range", 4)
    end
    if minimum ~= nil and maximum ~= nil and minimum > maximum then
      error("Stream Deck action settingsSchema field " .. fieldIndex .. " minLength must not exceed maxLength", 4)
    end
    local default = rawget(field, "default")
    if default ~= nil then
      local length = type(default) == "string" and utf8.len(default) or nil
      if length == nil or (minimum ~= nil and length < minimum) or (maximum ~= nil and length > maximum) then
        error("Stream Deck action settingsSchema field " .. fieldIndex .. " default is invalid", 4)
      end
    end
  elseif kind == "number" then
    local minimum = rawget(field, "min")
    local maximum = rawget(field, "max")
    local step = rawget(field, "step")
    if minimum ~= nil and (not isFiniteNumber(minimum) or minimum < -MAX_SETTINGS_NUMBER or minimum > MAX_SETTINGS_NUMBER) then
      error("Stream Deck action settingsSchema field " .. fieldIndex .. " min is out of range", 4)
    end
    if maximum ~= nil and (not isFiniteNumber(maximum) or maximum < -MAX_SETTINGS_NUMBER or maximum > MAX_SETTINGS_NUMBER) then
      error("Stream Deck action settingsSchema field " .. fieldIndex .. " max is out of range", 4)
    end
    if minimum ~= nil and maximum ~= nil and minimum > maximum then
      error("Stream Deck action settingsSchema field " .. fieldIndex .. " min must not exceed max", 4)
    end
    if step ~= nil and (not isFiniteNumber(step) or step <= 0 or step > MAX_SETTINGS_NUMBER) then
      error("Stream Deck action settingsSchema field " .. fieldIndex .. " step is out of range", 4)
    end
    local default = rawget(field, "default")
    if default ~= nil and (not isFiniteNumber(default) or (minimum ~= nil and default < minimum) or (maximum ~= nil and default > maximum)) then
      error("Stream Deck action settingsSchema field " .. fieldIndex .. " default is invalid", 4)
    end
  elseif kind == "boolean" then
    local default = rawget(field, "default")
    if default ~= nil and type(default) ~= "boolean" then
      error("Stream Deck action settingsSchema field " .. fieldIndex .. " default must be boolean", 4)
    end
  elseif kind == "select" then
    local options = rawget(field, "options")
    if type(options) ~= "table" then
      error("Stream Deck action settingsSchema field " .. fieldIndex .. " options must be an array", 4)
    end
    local optionCount = 0
    local maximumIndex = 0
    local optionValues = {}
    for index, option in pairs(options) do
      if type(index) ~= "number" or index < 1 or index % 1 ~= 0 then
        error("Stream Deck action settingsSchema field " .. fieldIndex .. " options must be a dense array", 4)
      end
      optionCount = optionCount + 1
      maximumIndex = math.max(maximumIndex, index)
      if type(option) ~= "table" then
        error("Stream Deck action settingsSchema field " .. fieldIndex .. " option must be an object", 4)
      end
      for key in pairs(option) do
        if key ~= "value" and key ~= "label" then
          error("Stream Deck action settingsSchema field " .. fieldIndex .. " option has unknown key: " .. tostring(key), 4)
        end
      end
      local value = rawget(option, "value")
      local label = rawget(option, "label")
      if not isBoundedString(value, MAX_SETTINGS_OPTION_VALUE_LENGTH) or not isBoundedString(label, MAX_SETTINGS_LABEL_LENGTH) then
        error("Stream Deck action settingsSchema field " .. fieldIndex .. " option is invalid", 4)
      end
      if optionValues[value] then
        error("Stream Deck action settingsSchema field " .. fieldIndex .. " has duplicate options", 4)
      end
      optionValues[value] = true
    end
    if optionCount < 1 or optionCount > MAX_SETTINGS_OPTIONS or maximumIndex ~= optionCount then
      error("Stream Deck action settingsSchema field " .. fieldIndex .. " options count is out of range", 4)
    end
    local default = rawget(field, "default")
    if default ~= nil and (not isBoundedString(default, MAX_SETTINGS_OPTION_VALUE_LENGTH) or not optionValues[default]) then
      error("Stream Deck action settingsSchema field " .. fieldIndex .. " default must match an option", 4)
    end
  end
end

local function validateSettingsSchema(settingsSchema, version)
  if type(settingsSchema) ~= "table" then
    error("Stream Deck action settingsSchema must be an array", 4)
  end
  local count = 0
  local maximumIndex = 0
  for key in pairs(settingsSchema) do
    if type(key) ~= "number" or key < 1 or key % 1 ~= 0 then
      error("Stream Deck action settingsSchema must be an array", 4)
    end
    count = count + 1
    maximumIndex = math.max(maximumIndex, key)
  end
  if maximumIndex ~= count or count > MAX_SETTINGS_FIELDS then
    error("Stream Deck action settingsSchema arrays must be dense and bounded", 4)
  end
  validateJsonValue(settingsSchema, {})
  if version == 1 then
    local seenKeys = {}
    for index, field in ipairs(settingsSchema) do
      validateSettingsField(field, index, seenKeys)
    end
  end
end


local function validateDefinition(definition)
  if type(definition) ~= "table" then
    error("Stream Deck action definition must be a table", 3)
  end

  for field in pairs(definition) do
    if not allowedFields[field] then
      error("Stream Deck action definition has unknown field: " .. tostring(field), 3)
    end
  end

  if not nonEmptyString(definition.id) then
    error("Stream Deck action definition id must be a non-empty string", 3)
  end
  if not nonEmptyString(definition.name) then
    error("Stream Deck action definition name must be a non-empty string", 3)
  end
  local version = definition.settingsSchemaVersion
  if version ~= nil and (not isInteger(version) or version < 1 or version > 16) then
    error("Stream Deck action settingsSchemaVersion must be a bounded positive integer", 3)
  end
  if definition.settingsSchema ~= nil then
    validateSettingsSchema(definition.settingsSchema, version)
  elseif version ~= nil then
    error("Stream Deck action settingsSchemaVersion requires settingsSchema", 3)
  end
  if type(definition.appearance) ~= "function" then
    error("Stream Deck action appearance must be a function", 3)
  end
  if type(definition.press) ~= "function" then
    error("Stream Deck action press must be a function", 3)
  end
  if definition.longPress ~= nil and type(definition.longPress) ~= "function" then
    error("Stream Deck action longPress must be a function", 3)
  end
  if definition.longPressThresholdMs ~= nil then
    if definition.longPress == nil then
      error("Stream Deck action longPressThresholdMs requires longPress", 3)
    end
    local threshold = definition.longPressThresholdMs
    if not isInteger(threshold)
        or threshold < MIN_LONG_PRESS_THRESHOLD_MS
        or threshold > MAX_LONG_PRESS_THRESHOLD_MS then
      error("Stream Deck action longPressThresholdMs must be an integer from 100 through 10000", 3)
    end
  end
  if definition.touchTap ~= nil and type(definition.touchTap) ~= "function" then
    error("Stream Deck action touchTap must be a function", 3)
  end
  for _, field in ipairs({ "appear", "disappear", "release", "push", "rotate" }) do
    if definition[field] ~= nil and type(definition[field]) ~= "function" then
      error("Stream Deck action " .. field .. " must be a function", 3)
    end
  end

end

function registry.new()
  local object = {
    definitions = {},
    order = {},
  }

  function object:register(definition)
    validateDefinition(definition)
    if self.definitions[definition.id] ~= nil then
      error("Duplicate Stream Deck action id: " .. definition.id, 2)
    end

    self.definitions[definition.id] = definition
    self.order[#self.order + 1] = definition.id
    return definition
  end

  function object:get(actionId)
    return self.definitions[actionId]
  end

  function object:has(actionId)
    return self.definitions[actionId] ~= nil
  end

  function object:list()
    local actions = {}
    for index, actionId in ipairs(self.order) do
      local definition = self.definitions[actionId]
      local action = {
        actionId = actionId,
        name = definition.name,
      }
      if definition.settingsSchema ~= nil then
        action.settingsSchema = definition.settingsSchema
      end
      if definition.settingsSchemaVersion ~= nil then
        action.settingsSchemaVersion = definition.settingsSchemaVersion
      end
      actions[index] = action
    end
    return actions
  end

  return object
end

return registry
