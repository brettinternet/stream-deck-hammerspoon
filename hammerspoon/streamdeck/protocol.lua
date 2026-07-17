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
  if type(value) ~= "string" or #value == 0 or #value % 4 ~= 0 or #value > MAX_ICON_BASE64_LENGTH then return nil end
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
    local cPadding, dPadding = c == 61, d == 61
    local dc, dd = cPadding and 0 or digit(c), dPadding and 0 or digit(d)
    local last = index + 3 == #value
    if not da or not db or not dc or not dd
        or (cPadding and not dPadding)
        or ((cPadding or dPadding) and not last)
        or (cPadding and db % 16 ~= 0)
        or (dPadding and not cPadding and dc % 4 ~= 0) then
      return nil
    end
    out[#out + 1] = string.char(da * 4 + math.floor(db / 16))
    if not cPadding then out[#out + 1] = string.char((db % 16) * 16 + math.floor(dc / 4)) end
    if not dPadding then out[#out + 1] = string.char((dc % 4) * 64 + dd) end
  end
  return table.concat(out)
end

local function isValidPng(bytes)
  if #bytes < 33 or bytes:sub(1, 8) ~= string.char(137,80,78,71,13,10,26,10) then return false end
  local offset, hasHeader, hasData = 9, false, false
  while offset <= #bytes do
    if offset + 11 > #bytes then return false end
    local length = string.unpack(">I4", bytes, offset)
    local chunkEnd = offset + 11 + length
    if chunkEnd > #bytes then return false end
    local chunkType = bytes:sub(offset + 4, offset + 7)
    if not chunkType:match("^[A-Za-z][A-Za-z][A-Za-z][A-Za-z]$") then return false end
    if not hasHeader then
      if chunkType ~= "IHDR" or length ~= 13 then return false end
      local width = string.unpack(">I4", bytes, offset + 8)
      local height = string.unpack(">I4", bytes, offset + 12)
      if width ~= height or (width ~= 72 and width ~= 144) then return false end
      hasHeader = true
    end
    if chunkType == "acTL" then return false end
    if chunkType == "IDAT" then hasData = true end
    if chunkType == "IEND" then
      return hasHeader and hasData and length == 0 and chunkEnd == #bytes
    end
    offset = chunkEnd + 1
  end
  return false
end

local SVG_ATTRIBUTES = {
 xmlns = true,
 viewbox = true,
 width = true,
 height = true,
 fill = true,
 stroke = true,
 ["stroke-width"] = true,
 opacity = true,
 ["fill-opacity"] = true,
 ["stroke-opacity"] = true,
 ["stroke-linecap"] = true,
 ["stroke-linejoin"] = true,
 ["stroke-miterlimit"] = true,
 ["fill-rule"] = true,
 ["clip-rule"] = true,
 d = true,
 points = true,
 x = true,
 y = true,
 x1 = true,
 y1 = true,
 x2 = true,
 y2 = true,
 cx = true,
 cy = true,
 r = true,
 rx = true,
 ry = true,
}
local SVG_NUMERIC_ATTRIBUTES = {
 ["stroke-width"] = true,
 opacity = true,
 ["fill-opacity"] = true,
 ["stroke-opacity"] = true,
 ["stroke-miterlimit"] = true,
 x = true,
 y = true,
 x1 = true,
 y1 = true,
 x2 = true,
 y2 = true,
 cx = true,
 cy = true,
 r = true,
 rx = true,
 ry = true,
 width = true,
 height = true,
}
local function isSafeSvgAttribute(name, value, rootSize)
 if #value > 4096 or value:find("[<&%z\1-\31\127-\159]") then return false end
 if name == "xmlns" then return value == "http://www.w3.org/2000/svg" end
 if name == "viewbox" then return rootSize == nil and (value == "0 0 72 72" or value == "0 0 144 144")
   or (rootSize ~= nil and value == "0 0 " .. tostring(rootSize) .. " " .. tostring(rootSize)) end
 if name == "width" or name == "height" then return rootSize == nil and (value == "72" or value == "144")
   or (rootSize ~= nil and value == tostring(rootSize)) end
 if name == "fill" or name == "stroke" then return value == "none" or value:match("^#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]$") ~= nil end
 if name == "stroke-linecap" then return value == "butt" or value == "round" or value == "square" end
 if name == "stroke-linejoin" then return value == "miter" or value == "round" or value == "bevel" end
 if name == "fill-rule" or name == "clip-rule" then return value == "nonzero" or value == "evenodd" end
 if SVG_NUMERIC_ATTRIBUTES[name] then
  local number = tonumber(value)
  return number ~= nil and number == number and number ~= math.huge and number ~= -math.huge
    and number >= 0 and math.abs(number) <= 1000000
    and value:match("^%d+%.?%d*$") ~= nil
 end
 if name == "d" or name == "points" then return value:match("^[A-Za-z0-9.,+%- \t\r\n]+$") ~= nil end
 return SVG_ATTRIBUTES[name] == true
end
local function parseSvgAttributes(body, tag, rootSize)
 local attributes = {}
 local rest = body:sub(#tag + 1)
 local selfClosing = rest:match("/%s*$") ~= nil
 if selfClosing then rest = rest:gsub("/%s*$", "") end
 local position = 1
 while true do
  local remaining = rest:sub(position)
  local leading = remaining:match("^%s*") or ""
  position = position + #leading
  if position > #rest then break end
  remaining = rest:sub(position)
  local name = remaining:match("^([A-Za-z][A-Za-z0-9-]*)")
  if not name then return nil end
  local normalizedName = name:lower()
  if not SVG_ATTRIBUTES[normalizedName] or attributes[normalizedName] ~= nil then return nil end
  position = position + #name
  local equals = rest:sub(position):match("^%s*=%s*")
  if not equals then return nil end
  position = position + #equals
  local quote = rest:sub(position, position)
  if quote ~= "\"" and quote ~= "'" then return nil end
  local valueEnd = rest:find(quote, position + 1, true)
  if not valueEnd then return nil end
  local value = rest:sub(position + 1, valueEnd - 1)
  if not isSafeSvgAttribute(normalizedName, value, rootSize) then return nil end
  attributes[normalizedName] = value
  position = valueEnd + 1
 end
 return attributes, selfClosing
end
local function isAppearanceIcon(value)
 if not isObject(value) then return false end
 local kind = rawget(value, "kind")
 if kind == "bundled" then
  local name = rawget(value, "name")
  if type(name) ~= "string" or #name < 1 or #name > 32 or not name:match("^[a-z][a-z0-9-]*$") then return false end
  for key in pairs(value) do if key ~= "kind" and key ~= "name" then return false end end
  return true
 end
 if kind ~= "custom" then return false end
 local mediaType, encoded = rawget(value, "mediaType"), rawget(value, "dataBase64")
 if (mediaType ~= "image/png" and mediaType ~= "image/svg+xml") or type(encoded) ~= "string"
     or #encoded < 4 or #encoded > MAX_ICON_BASE64_LENGTH
     or not encoded:match("^[A-Za-z0-9+/=]+$") then return false end
 for key in pairs(value) do
  if key ~= "kind" and key ~= "mediaType" and key ~= "dataBase64" then return false end
 end
 local bytes = decodeBase64(encoded)
 if not bytes or #bytes == 0 or #bytes > MAX_ICON_BYTES then return false end
 if mediaType == "image/png" then return isValidPng(bytes) end
 if utf8.len(bytes) == nil or #bytes > 16384 then return false end
 local svg = bytes
 if svg:find("[\0\1-\8\11\12\14-\31\127-\159]") ~= nil
     or svg:find("<!", 1, true)
     or svg:find("<?", 1, true)
     or svg:match(">([^<]*[^%s<])") then return false end
 local allowed = { svg = true, g = true, path = true, rect = true, circle = true, ellipse = true, line = true, polyline = true, polygon = true }
 local stack = {}
 local rootSeen = false
 local rootSize
 local elementCount = 0
 for rawBody in svg:gmatch("<([^<>]*)>") do
  local body = rawBody:match("^%s*(.-)%s*$")
  local closing = body:match("^/%s*([a-z][a-z0-9-]*)%s*$")
  if closing then
   if stack[#stack] ~= closing then return false end
   stack[#stack] = nil
  else
   local tag = body:match("^([a-z][a-z0-9-]*)")
   if not tag or not allowed[tag] or (tag == "svg" and rootSeen) then return false end
   if not rootSeen and tag ~= "svg" then return false end
   local attributes, selfClosing = parseSvgAttributes(body, tag, rootSize)
   if not attributes then return false end
   if tag == "svg" then
    local viewBox = attributes.viewbox
    if attributes.xmlns ~= "http://www.w3.org/2000/svg" then return false end
    if viewBox == "0 0 72 72" then rootSize = 72
    elseif viewBox == "0 0 144 144" then rootSize = 144
    else return false end
    if (attributes.width ~= nil and attributes.width ~= tostring(rootSize))
        or (attributes.height ~= nil and attributes.height ~= tostring(rootSize)) then return false end
    rootSeen = true
   end
   for name, value in pairs(attributes) do
    if not isSafeSvgAttribute(name, value, rootSize) then return false end
   end
   elementCount = elementCount + 1
   if elementCount > 128 or #stack >= 16 then return false end
   if not selfClosing then stack[#stack + 1] = tag end
  end
 end
 return rootSeen and #stack == 0
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
