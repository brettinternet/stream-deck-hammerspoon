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
  feedback = true,
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
local MAX_FEEDBACK_MESSAGE_LENGTH = 256
local MIN_FEEDBACK_DURATION_MS = 100
local MAX_FEEDBACK_DURATION_MS = 10000

local function isFeedbackMessage(value)
  if not isNonEmptyString(value) then
    return false
  end
  local ok, length = pcall(utf8.len, value)
  if not ok or length == nil or length > MAX_FEEDBACK_MESSAGE_LENGTH then
    return false
  end
  local valid = pcall(function()
    for _, codePoint in utf8.codes(value) do
      if (codePoint >= 0 and codePoint <= 0x1f) or (codePoint >= 0x7f and codePoint <= 0x9f) then
        error("control character")
      end
    end
  end)
  return valid
end

local function isFeedbackDuration(value)
  return isFiniteNumber(value) and value >= MIN_FEEDBACK_DURATION_MS and value <= MAX_FEEDBACK_DURATION_MS
end

local function boundedString(value, maximum)
  if not isNonEmptyString(value) then
    return false
  end
  local length = utf8.len(value)
  return length ~= nil and length <= maximum
end

local function isAppearanceColor(value)
  return type(value) == "string" and value:match("^#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]$") ~= nil
end

local function isAppearanceBadge(value)
  if type(value) ~= "string" then
    return false
  end
  if value:find("[%z\1-\8\11\12\14-\31]") ~= nil then
    return false
  end
  local length = utf8.len(value)
  return length ~= nil and length <= 4
end

local MAX_ICON_BYTES = 32768
local MAX_ICON_BASE64_LENGTH = 43692
local function decodeBase64(value)
  if #value == 0 or #value % 4 ~= 0 or value:find("[^A-Za-z0-9+/=]") or value:find("=.*[^=]") then return nil end
  local out = {}
  local function digit(byte)
    if byte >= 65 and byte <= 90 then return byte - 65
    elseif byte >= 97 and byte <= 122 then return byte - 71
    elseif byte >= 48 and byte <= 57 then return byte + 4
    elseif byte == 43 then return 62
    elseif byte == 47 then return 63
    end
  end
  for index = 1, #value, 4 do
    local a, b, c, d = value:byte(index, index + 3)
    local da, db = digit(a), digit(b)
    local dc, dd = c == 61 and 0 or digit(c), d == 61 and 0 or digit(d)
    if not da or not db or not dc or not dd or (c == 61 and d ~= 61) then return nil end
    out[#out + 1] = string.char(da * 4 + math.floor(db / 16))
    if c ~= 61 then out[#out + 1] = string.char((db % 16) * 16 + math.floor(dc / 4)) end
    if d ~= 61 then out[#out + 1] = string.char((dc % 4) * 64 + dd) end
  end
  return table.concat(out)
end

local function isAppearanceIcon(value)
  if not isObject(value) then return false end
  if rawget(value, "kind") == "bundled" then
    if rawget(value, "name") ~= "hammerspoon" then return false end
    for key in pairs(value) do if key ~= "kind" and key ~= "name" then return false end end
    return true
  end
  if rawget(value, "kind") ~= "custom" then return false end
  local mediaType, encoded = rawget(value, "mediaType"), rawget(value, "dataBase64")
  if (mediaType ~= "image/png" and mediaType ~= "image/svg+xml") or type(encoded) ~= "string"
      or #encoded < 4 or #encoded > MAX_ICON_BASE64_LENGTH
      or not encoded:match("^(%w%w%w%w)*([%w+/][%w+/][%w+/=][%w+/=])?$") then return false end
  local bytes = decodeBase64(encoded)
  if not bytes or #bytes == 0 or #bytes > MAX_ICON_BYTES then return false end
  if mediaType == "image/png" then
    if bytes:sub(1, 8) ~= string.char(137,80,78,71,13,10,26,10) or bytes:find("acTL", 1, true) then return false end
    local width = string.unpack(">I4", bytes, 17)
    local height = string.unpack(">I4", bytes, 21)
    return width == height and (width == 72 or width == 144)
  end
  local svg = bytes:lower()
  if #svg > 16384 or not svg:match("^%s*<svg[^>]*>") or not svg:match("</svg>%s*$")
      or (not svg:match('viewbox%s*=%s*["\']0%s+0%s+(72)%s+%1["\']')
        and not svg:match('viewbox%s*=%s*["\']0%s+0%s+(144)%s+%1["\']'))
      or svg:find("<!doctype", 1, true) or svg:find("<!entity", 1, true)
      or svg:find("<script", 1, true) or svg:find("<style", 1, true)
      or svg:find("<text", 1, true) or svg:find("<image", 1, true)
      or svg:find("<use", 1, true) or svg:find("<foreignobject", 1, true)
      or svg:match("%son[%a]+%s*=") or svg:find("url(", 1, true) or svg:match("%shref%s*=") then return false end
  return true
end
local function validateSettingsField(field, seenKeys)
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
    if ok then
      local appearanceVersion = rawget(message, "appearanceVersion")
      local foregroundColor = rawget(message, "foregroundColor")
      local backgroundColor = rawget(message, "backgroundColor")
      local progress = rawget(message, "progress")
      local badge = rawget(message, "badge")
      local icon = rawget(message, "icon")
      local hasExtendedFields = foregroundColor ~= nil or backgroundColor ~= nil or progress ~= nil or badge ~= nil or icon ~= nil
      ok = appearanceVersion == nil or (isInteger(appearanceVersion) and appearanceVersion == 1)
      if ok and hasExtendedFields then ok = appearanceVersion == 1 end
      if ok and foregroundColor ~= nil then ok = isAppearanceColor(foregroundColor) end
      if ok and backgroundColor ~= nil then ok = isAppearanceColor(backgroundColor) end
      if ok and progress ~= nil then ok = isFiniteNumber(progress) and progress >= 0 and progress <= 1 end
      if ok and badge ~= nil then ok = isAppearanceBadge(badge) end
      if ok and icon ~= nil then ok = isAppearanceIcon(icon) end
      if not ok then code = "INVALID_FIELD" end
    end
  elseif messageType == "error" then
    ok, code = required(message, "code", function(value) return type(value) == "string" and errorCodes[value] end)
    if ok then ok, code = required(message, "message", isNonEmptyString) end
    if ok and rawget(message, "requestId") ~= nil then ok, code = required(message, "requestId", isNonEmptyString) end
    if ok and rawget(message, "instanceId") ~= nil then ok, code = required(message, "instanceId", isNonEmptyString) end
  elseif messageType == "feedback" then
    ok, code = required(message, "instanceId", isNonEmptyString)
    if ok then ok, code = required(message, "actionId", isNonEmptyString) end
    if ok then ok, code = required(message, "kind", function(value) return value == "success" or value == "error" end) end
    if ok then ok, code = required(message, "message", isFeedbackMessage) end
    if ok then ok, code = required(message, "durationMs", isFeedbackDuration) end
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
