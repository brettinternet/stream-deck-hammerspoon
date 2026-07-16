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
    if settingsSchema ~= nil and not isArray(settingsSchema) then
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
    ok = true
  elseif messageType == "listActions" then
    ok, code = required(message, "requestId", isNonEmptyString)
  elseif messageType == "actions" then
    ok, code = required(message, "requestId", isNonEmptyString)
    if ok then ok, code = validateActions(rawget(message, "actions")) end
  elseif messageType == "instanceAppeared" then
    ok, code = required(message, "instanceId", isNonEmptyString)
    if ok then ok, code = required(message, "actionId", isNonEmptyString) end
    if ok then ok, code = required(message, "settings", isObject) end
  elseif messageType == "instanceDisappeared"
      or messageType == "keyDown"
      or messageType == "requestAppearance" then
    ok, code = required(message, "instanceId", isNonEmptyString)
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
