local protocol = {
  VERSION = 1,
  MAX_FRAME_BYTES = 65536,
}

local messageTypes = {
  hello = true,
  helloAck = true,
  listActions = true,
  actions = true,
  instanceAppeared = true,
  instanceDisappeared = true,
  keyDown = true,
  requestAppearance = true,
  appearance = true,
  error = true,
}

local errorMessages = {
  AUTH_REQUIRED = "Authentication is required.",
  AUTH_FAILED = "Authentication failed.",
  VERSION_MISMATCH = "Protocol version mismatch.",
  MALFORMED_MESSAGE = "Malformed protocol message.",
  UNKNOWN_TYPE = "Unknown protocol message type.",
  INVALID_FIELD = "Invalid protocol field.",
  INVALID_STATE = "Invalid protocol state.",
  UNKNOWN_ACTION = "Unknown action.",
  STALE_INSTANCE = "Stale instance.",
  CALLBACK_FAILED = "Action callback failed.",
  INTERNAL = "Internal server error.",
}

local errorCodes = {}
for code in pairs(errorMessages) do
  errorCodes[code] = true
end

local function isFiniteNumber(value)
  return type(value) == "number"
    and value == value
    and value ~= math.huge
    and value ~= -math.huge
end

local function isInteger(value)
  return isFiniteNumber(value) and math.floor(value) == value
end

local function isNonEmptyString(value)
  return type(value) == "string" and value ~= ""
end

local function isJsonValue(value, active)
  local valueType = type(value)
  if valueType == "string" or valueType == "boolean" then
    return true
  end
  if valueType == "number" then
    return isFiniteNumber(value)
  end
  if valueType ~= "table" then
    return false
  end

  active = active or {}
  if active[value] then
    return false
  end
  active[value] = true

  local hasStringKey = false
  local hasNumberKey = false
  local maxIndex = 0
  for key, item in next, value do
    if type(key) == "string" then
      hasStringKey = true
    elseif type(key) == "number" and isInteger(key) and key >= 1 then
      hasNumberKey = true
      maxIndex = math.max(maxIndex, key)
    else
      active[value] = nil
      return false
    end
    if not isJsonValue(item, active) then
      active[value] = nil
      return false
    end
  end

  if hasStringKey and hasNumberKey then
    active[value] = nil
    return false
  end
  if hasNumberKey then
    for index = 1, maxIndex do
      if rawget(value, index) == nil then
        active[value] = nil
        return false
      end
    end
  end

  active[value] = nil
  return true
end

local function isObject(value)
  if type(value) ~= "table" then
    return false
  end
  for key in next, value do
    if type(key) ~= "string" then
      return false
    end
  end
  return isJsonValue(value)
end

local function isArray(value)
  if type(value) ~= "table" then
    return false
  end
  local count = 0
  local maxIndex = 0
  for key in next, value do
    if type(key) ~= "number" or not isInteger(key) or key < 1 then
      return false
    end
    count = count + 1
    maxIndex = math.max(maxIndex, key)
  end
  if count ~= maxIndex then
    return false
  end
  return isJsonValue(value)
end

local function required(message, field, predicate)
  local value = rawget(message, field)
  if value == nil or not predicate(value) then
    return false, "INVALID_FIELD"
  end
  return true
end

local MAX_SETTINGS_FIELDS = 32
local MAX_SETTINGS_KEY_LENGTH = 64
local MAX_SETTINGS_LABEL_LENGTH = 128
local MAX_SETTINGS_TEXT_LENGTH = 4096
local MAX_SETTINGS_NUMBER = 1000000000000
local MAX_SETTINGS_OPTIONS = 64
local MAX_SETTINGS_OPTION_VALUE_LENGTH = 256

local function boundedString(value, maximum)
  if not isNonEmptyString(value) then
    return false
  end
  local length = utf8.len(value)
  return length ~= nil and length <= maximum
end

local function validateSettingsField(field, seenKeys)
  if not isObject(field) or not boundedString(rawget(field, "key"), MAX_SETTINGS_KEY_LENGTH) then
    return false
  end
  local kind = rawget(field, "type")
  local allowed = { type = true, key = true, label = true, required = true, default = true }
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
    return false
  end
  for key in next, field do
    if not allowed[key] then return false end
  end
  if rawget(field, "label") ~= nil and not boundedString(rawget(field, "label"), MAX_SETTINGS_LABEL_LENGTH) then return false end
  if rawget(field, "required") ~= nil and type(rawget(field, "required")) ~= "boolean" then return false end
  local fieldKey = rawget(field, "key")
  if seenKeys[fieldKey] then return false end
  seenKeys[fieldKey] = true
  if kind == "text" then
    local minimum, maximum, default = rawget(field, "minLength"), rawget(field, "maxLength"), rawget(field, "default")
    if minimum ~= nil and (not isInteger(minimum) or minimum < 0 or minimum > MAX_SETTINGS_TEXT_LENGTH) then return false end
    if maximum ~= nil and (not isInteger(maximum) or maximum < 0 or maximum > MAX_SETTINGS_TEXT_LENGTH) then return false end
    if minimum ~= nil and maximum ~= nil and minimum > maximum then return false end
    if default ~= nil then
      local length = type(default) == "string" and utf8.len(default) or nil
      if length == nil or (minimum ~= nil and length < minimum) or (maximum ~= nil and length > maximum) then return false end
    end
  elseif kind == "number" then
    local minimum, maximum, step, default = rawget(field, "min"), rawget(field, "max"), rawget(field, "step"), rawget(field, "default")
    if minimum ~= nil and (not isFiniteNumber(minimum) or minimum < -MAX_SETTINGS_NUMBER or minimum > MAX_SETTINGS_NUMBER) then return false end
    if maximum ~= nil and (not isFiniteNumber(maximum) or maximum < -MAX_SETTINGS_NUMBER or maximum > MAX_SETTINGS_NUMBER) then return false end
    if minimum ~= nil and maximum ~= nil and minimum > maximum then return false end
    if step ~= nil and (not isFiniteNumber(step) or step <= 0 or step > MAX_SETTINGS_NUMBER) then return false end
    if default ~= nil and (not isFiniteNumber(default) or (minimum ~= nil and default < minimum) or (maximum ~= nil and default > maximum)) then return false end
  elseif kind == "boolean" then
    if rawget(field, "default") ~= nil and type(rawget(field, "default")) ~= "boolean" then return false end
  elseif kind == "select" then
    local options = rawget(field, "options")
    if not isArray(options) then return false end
    local optionCount, values = 0, {}
    for _, option in ipairs(options) do
      if not isObject(option) then return false end
      for key in next, option do
        if key ~= "value" and key ~= "label" then return false end
      end
      local value, label = rawget(option, "value"), rawget(option, "label")
      if not boundedString(value, MAX_SETTINGS_OPTION_VALUE_LENGTH) or not boundedString(label, MAX_SETTINGS_LABEL_LENGTH) or values[value] then return false end
      values[value] = true
      optionCount = optionCount + 1
    end
    if optionCount < 1 or optionCount > MAX_SETTINGS_OPTIONS then return false end
    local default = rawget(field, "default")
    if default ~= nil and (not boundedString(default, MAX_SETTINGS_OPTION_VALUE_LENGTH) or not values[default]) then return false end
  end
  return true
end

local function validateSettingsSchema(settingsSchema, version)
  if not isArray(settingsSchema) or #settingsSchema > MAX_SETTINGS_FIELDS then return false end
  if version == 1 then
    local seenKeys = {}
    for _, field in ipairs(settingsSchema) do
      if not validateSettingsField(field, seenKeys) then return false end
    end
  end
  return true
end

local function validateActions(actions)
  if not isArray(actions) then
    return false, "INVALID_FIELD"
  end
  local seen = {}
  for _, action in next, actions do
    if not isObject(action)
        or not isNonEmptyString(rawget(action, "actionId"))
        or not isNonEmptyString(rawget(action, "name"))
        or seen[rawget(action, "actionId")] then
      return false, "INVALID_FIELD"
    end
    local settingsSchema = rawget(action, "settingsSchema")
    local settingsSchemaVersion = rawget(action, "settingsSchemaVersion")
    if settingsSchemaVersion ~= nil
        and (not isInteger(settingsSchemaVersion) or settingsSchemaVersion < 1 or settingsSchemaVersion > 16) then
      return false, "INVALID_FIELD"
    end
    if settingsSchemaVersion ~= nil and settingsSchema == nil then
      return false, "INVALID_FIELD"
    end
    if settingsSchema ~= nil and not validateSettingsSchema(settingsSchema, settingsSchemaVersion) then
      return false, "INVALID_FIELD"
    end
    seen[rawget(action, "actionId")] = true
  end
  return true
end

function protocol.validate(message)
  if not isObject(message) then
    return false, "MALFORMED_MESSAGE"
  end
  local protocolVersion = rawget(message, "protocolVersion")
  if protocolVersion == nil then
    return false, "MALFORMED_MESSAGE"
  end
  if not isInteger(protocolVersion) or protocolVersion ~= protocol.VERSION then
    return false, "VERSION_MISMATCH"
  end
  local messageType = rawget(message, "type")
  if not isNonEmptyString(messageType) then
    return false, "MALFORMED_MESSAGE"
  end
  if not messageTypes[messageType] then
    return false, "UNKNOWN_TYPE"
  end

  local ok, code
  if messageType == "hello" then
    ok, code = required(message, "token", isNonEmptyString)
    if ok then ok, code = required(message, "pluginVersion", isNonEmptyString) end
  elseif messageType == "helloAck" then
    ok, code = required(message, "sessionId", isNonEmptyString)
  elseif messageType == "listActions" then
    ok, code = required(message, "sessionId", isNonEmptyString)
    if ok then ok, code = required(message, "requestId", isNonEmptyString) end
  elseif messageType == "actions" then
    ok, code = required(message, "requestId", isNonEmptyString)
    if ok then ok, code = validateActions(rawget(message, "actions")) end
  elseif messageType == "instanceAppeared" then
    ok, code = required(message, "sessionId", isNonEmptyString)
    if ok then ok, code = required(message, "instanceId", isNonEmptyString) end
    if ok then ok, code = required(message, "actionId", isNonEmptyString) end
    if ok then ok, code = required(message, "settings", isObject) end
  elseif messageType == "instanceDisappeared"
      or messageType == "keyDown"
      or messageType == "requestAppearance" then
    ok, code = required(message, "sessionId", isNonEmptyString)
    if ok then ok, code = required(message, "instanceId", isNonEmptyString) end
    if ok then ok, code = required(message, "actionId", isNonEmptyString) end
  elseif messageType == "appearance" then
    ok, code = required(message, "instanceId", isNonEmptyString)
    if ok then ok, code = required(message, "actionId", isNonEmptyString) end
    if ok then ok, code = required(message, "title", function(value) return type(value) == "string" end) end
    if ok then ok, code = required(message, "state", function(value) return isInteger(value) and (value == 0 or value == 1) end) end
  elseif messageType == "error" then
    ok, code = required(message, "code", function(value) return type(value) == "string" and errorCodes[value] end)
    if ok then ok, code = required(message, "message", isNonEmptyString) end
    if ok and rawget(message, "requestId") ~= nil then ok, code = required(message, "requestId", isNonEmptyString) end
    if ok and rawget(message, "instanceId") ~= nil then ok, code = required(message, "instanceId", isNonEmptyString) end
  end

  if not ok then
    return false, code or "INVALID_FIELD"
  end
  return true
end

function protocol.decode(raw)
  if type(raw) ~= "string" or #raw > protocol.MAX_FRAME_BYTES then
    return nil, "MALFORMED_MESSAGE"
  end
  local hsapi = rawget(_G, "hs")
  if not hsapi or not hsapi.json or type(hsapi.json.decode) ~= "function" then
    return nil, "INTERNAL"
  end

  local ok, value = pcall(hsapi.json.decode, raw)
  if not ok or value == nil then
    return nil, "MALFORMED_MESSAGE"
  end
  local valid, code = protocol.validate(value)
  if not valid then
    return nil, code
  end
  return value
end

function protocol.encode(message)
  local valid, code = protocol.validate(message)
  if not valid then
    return nil, code
  end
  local hsapi = rawget(_G, "hs")
  if not hsapi or not hsapi.json or type(hsapi.json.encode) ~= "function" then
    return nil, "INTERNAL"
  end
  local ok, value = pcall(hsapi.json.encode, message)
  if not ok or type(value) ~= "string" then
    return nil, "INTERNAL"
  end
  if #value > protocol.MAX_FRAME_BYTES then
    return nil, "MALFORMED_MESSAGE"
  end
  return value
end

function protocol.error(code, requestId, instanceId)
  if not errorCodes[code] then
    code = "INTERNAL"
  end
  local message = {
    protocolVersion = protocol.VERSION,
    type = "error",
    code = code,
    message = errorMessages[code],
  }
  if isNonEmptyString(requestId) then
    message.requestId = requestId
  end
  if isNonEmptyString(instanceId) then
    message.instanceId = instanceId
  end
  return message
end

return protocol
