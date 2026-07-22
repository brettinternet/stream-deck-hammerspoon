local crypto = {}

crypto.LABEL = "streamdeck-lan-v1"
crypto.KEY_BYTES = 32
crypto.NONCE_BYTES = 32
local COMPARISON_KEY = "streamdeck-lan-double-hmac-v1"

local function uint32be(value)
  if type(value) ~= "number" or value < 0 or value > 0xffffffff or math.floor(value) ~= value then
    error("LAN field is too large", 3)
  end
  local b4 = value & 0xff
  local b3 = (value >> 8) & 0xff
  local b2 = (value >> 16) & 0xff
  local b1 = (value >> 24) & 0xff
  return string.char(b1, b2, b3, b4)
end

function crypto.u64be(value)
  if type(value) ~= "number" or value < 0 or value > 9007199254740991 or math.floor(value) ~= value then
    error("LAN sequence is invalid", 2)
  end
  local low = value % 4294967296
  local high = math.floor(value / 4294967296)
  return uint32be(high) .. uint32be(low)
end

function crypto.encodeFields(fields)
  local output = {}
  for _, field in ipairs(fields) do
    if type(field) ~= "string" then error("LAN field must be a string", 2) end
    output[#output + 1] = uint32be(#field)
    output[#output + 1] = field
  end
  return table.concat(output)
end

function crypto.hexEncode(value)
  local output = {}
  for index = 1, #value do
    output[index] = string.format("%02x", string.byte(value, index))
  end
  return table.concat(output)
end

function crypto.hexDecode(value, expectedBytes)
  if type(value) ~= "string" or #value == 0 or #value % 2 ~= 0 or value:match("^[0-9a-fA-F]+$") == nil then
    return nil
  end
  local output = {}
  for index = 1, #value, 2 do
    output[#output + 1] = string.char(tonumber(value:sub(index, index + 1), 16))
  end
  local result = table.concat(output)
  if expectedBytes ~= nil and #result ~= expectedBytes then return nil end
  return result
end

function crypto.hmac(hsapi, key, data)
  if type(hsapi) ~= "table" or type(hsapi.hash) ~= "table" or type(hsapi.hash.hmacSHA256) ~= "function" then
    return nil
  end
  local ok, result = pcall(hsapi.hash.hmacSHA256, key, data)
  if not ok or type(result) ~= "string" then return nil end
  if #result == 32 then return result end
  if #result == 64 and result:match("^[0-9a-fA-F]+$") ~= nil then
    return crypto.hexDecode(result, 32)
  end
  return nil
end

function crypto.doubleHmacEqual(hsapi, expected, actual)
  local expectedFirst = crypto.hmac(hsapi, COMPARISON_KEY, expected)
  local actualFirst = crypto.hmac(hsapi, COMPARISON_KEY, actual)
  if not expectedFirst or not actualFirst then return false end
  local expectedSecond = crypto.hmac(hsapi, COMPARISON_KEY, expectedFirst)
  local actualSecond = crypto.hmac(hsapi, COMPARISON_KEY, actualFirst)
  if not expectedSecond or not actualSecond or #expectedSecond ~= #actualSecond then return false end
  local different = 0
  for index = 1, #expectedSecond do
    different = different | (string.byte(expectedSecond, index) ~ string.byte(actualSecond, index))
  end
  return different == 0
end

function crypto.transcript(role, clientId, clientNonce, serverNonce)
  return crypto.encodeFields({ crypto.LABEL, role, clientId, clientNonce, serverNonce })
end

function crypto.proof(hsapi, key, role, clientId, clientNonce, serverNonce)
  return crypto.hmac(hsapi, key, crypto.transcript(role, clientId, clientNonce, serverNonce))
end

function crypto.kdfSalt(clientId, clientNonce, serverNonce)
  return crypto.encodeFields({ crypto.LABEL, "salt", clientId, clientNonce, serverNonce })
end

function crypto.frameInfo(direction)
  return crypto.encodeFields({ crypto.LABEL, "frame", direction })
end

function crypto.hkdf(hsapi, key, salt, info, length)
  local prk = crypto.hmac(hsapi, salt, key)
  if not prk or type(length) ~= "number" or length < 0 or length > 255 * 32 or math.floor(length) ~= length then return nil end
  local output, previous = {}, ""
  local blocks = math.ceil(length / 32)
  for index = 1, blocks do
    previous = crypto.hmac(hsapi, prk, previous .. info .. string.char(index))
    if not previous then return nil end
    output[#output + 1] = previous
  end
  return table.concat(output):sub(1, length)
end

function crypto.frameMac(hsapi, frameKey, direction, sequence, payload)
  return crypto.hmac(hsapi, frameKey, crypto.encodeFields({
    crypto.LABEL,
    "frame",
    direction,
    crypto.u64be(sequence),
    payload,
  }))
end

function crypto.randomBytes(length)
  local handle, openError = io.open("/dev/urandom", "rb")
  if not handle then return nil, openError or "random source unavailable" end
  local value, readError = handle:read(length)
  local closed, closeError = handle:close()
  if not closed or not value or #value ~= length then return nil, readError or closeError or "random source unavailable" end
  return value
end

function crypto.readKey(hsapi, path)
  if type(path) ~= "string" or path == "" then return nil, "key unavailable" end
  if not hsapi.fs or type(hsapi.fs.attributes) ~= "function" then return nil, "key permissions" end
  local attributes = hsapi.fs.attributes(path)
  if type(attributes) ~= "table" or attributes.permissions ~= "rw-------" then return nil, "key permissions" end
  local handle, openError = io.open(path, "rb")
  if not handle then return nil, openError or "key unavailable" end
  local value, readError = handle:read("*a")
  local closed, closeError = handle:close()
  if not closed or not value or #value ~= crypto.KEY_BYTES then return nil, readError or closeError or "key unavailable" end
  return value
end

return crypto
