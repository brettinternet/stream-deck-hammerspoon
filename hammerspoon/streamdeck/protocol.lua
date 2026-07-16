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

local function isObject(value)
  if type(value) ~= "table" then
    return false
  end
  for key in pairs(value) do
    if type(key) ~= "string" then
      return false
    end
  end
  return true
end

local function isArray(value)
  if type(value) ~= "table" then
    return false
  end
  local count = 0
  for key in pairs(value) do
    if type(key) ~= "number" or key < 1 or math.floor(key) ~= key then
      return false
    end
    count = math.max(count, key)
  end
  for index = 1, count do
    if value[index] == nil then
      return false
    end
  end
  return true
end

local function required(message, field, predicate)
  if message[field] == nil or not predicate(message[field]) then
    return false, "INVALID_FIELD"
  end
  return true
end

local function validateActions(actions)
  if not isArray(actions) then
    return false, "INVALID_FIELD"
  end
  local seen = {}
  for _, action in ipairs(actions) do
    if not isObject(action) or not isNonEmptyString(action.actionId) or seen[action.actionId] then
      return false, "INVALID_FIELD"
    end
    seen[action.actionId] = true
  end
  return true
end

function protocol.validate(message)
  if not isObject(message) then
    return false, "MALFORMED_MESSAGE"
  end
  if message.protocolVersion == nil then
    return false, "MALFORMED_MESSAGE"
  end
  if not isInteger(message.protocolVersion) or message.protocolVersion ~= protocol.VERSION then
    return false, "VERSION_MISMATCH"
  end
  if not isNonEmptyString(message.type) then
    return false, "MALFORMED_MESSAGE"
  end
  if not messageTypes[message.type] then
    return false, "UNKNOWN_TYPE"
  end

  local ok, code
  if message.type == "hello" then
    ok, code = required(message, "token", isNonEmptyString)
    if ok then ok, code = required(message, "pluginVersion", isNonEmptyString) end
  elseif message.type == "helloAck" then
    ok = true
  elseif message.type == "listActions" then
    ok, code = required(message, "requestId", isNonEmptyString)
  elseif message.type == "actions" then
    ok, code = required(message, "requestId", isNonEmptyString)
    if ok then ok, code = validateActions(message.actions) end
  elseif message.type == "instanceAppeared" then
    ok, code = required(message, "instanceId", isNonEmptyString)
    if ok then ok, code = required(message, "actionId", isNonEmptyString) end
    if ok then ok, code = required(message, "settings", isObject) end
  elseif message.type == "instanceDisappeared"
      or message.type == "keyDown"
      or message.type == "requestAppearance" then
    ok, code = required(message, "instanceId", isNonEmptyString)
    if ok then ok, code = required(message, "actionId", isNonEmptyString) end
  elseif message.type == "appearance" then
    ok, code = required(message, "instanceId", isNonEmptyString)
    if ok then ok, code = required(message, "actionId", isNonEmptyString) end
    if ok then ok, code = required(message, "title", function(value) return type(value) == "string" end) end
    if ok then ok, code = required(message, "state", function(value) return isInteger(value) and (value == 0 or value == 1) end) end
  elseif message.type == "error" then
    ok, code = required(message, "code", function(value) return type(value) == "string" and errorCodes[value] end)
    if ok then ok, code = required(message, "message", isNonEmptyString) end
    if ok and message.requestId ~= nil then ok, code = required(message, "requestId", isNonEmptyString) end
    if ok and message.instanceId ~= nil then ok, code = required(message, "instanceId", isNonEmptyString) end
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
