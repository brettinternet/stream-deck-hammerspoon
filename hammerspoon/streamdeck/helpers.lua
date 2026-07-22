local helpers = {}
local protocol = require("streamdeck.protocol")

local base64Characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

local function base64Encode(value)
  local encoded = {}
  for index = 1, #value, 3 do
    local first = value:byte(index)
    local second = value:byte(index + 1)
    local third = value:byte(index + 2)
    local combined = first * 65536 + (second or 0) * 256 + (third or 0)
    local firstDigit = math.floor(combined / 262144) % 64
    local secondDigit = math.floor(combined / 4096) % 64
    local thirdDigit = math.floor(combined / 64) % 64
    local fourthDigit = combined % 64

    encoded[#encoded + 1] = base64Characters:sub(firstDigit + 1, firstDigit + 1)
    encoded[#encoded + 1] = base64Characters:sub(secondDigit + 1, secondDigit + 1)
    encoded[#encoded + 1] = second and base64Characters:sub(thirdDigit + 1, thirdDigit + 1) or "="
    encoded[#encoded + 1] = third and base64Characters:sub(fourthDigit + 1, fourthDigit + 1) or "="
  end
  return table.concat(encoded)
end

function helpers.svg(svg)
  if type(svg) ~= "string" then
    error("Stream Deck SVG helper expects a string", 2)
  end
  return {
    kind = "custom",
    mediaType = "image/svg+xml",
    dataBase64 = base64Encode(svg),
  }
end
local DEFAULT_IMAGE_SIZE = 72
local MAX_IMAGE_SIZE = 144

local function validImageSize(value)
  return type(value) == "number"
    and value == value
    and value ~= math.huge
    and value ~= -math.huge
    and value % 1 == 0
    and value >= 1
    and value <= MAX_IMAGE_SIZE
end

function helpers.imageSize(context)
  if type(context) ~= "table" or type(context.getDevice) ~= "function" then
    return DEFAULT_IMAGE_SIZE
  end
  local ok, device = pcall(context.getDevice, context)
  if not ok or type(device) ~= "table" or not validImageSize(device.imageSize) then
    return DEFAULT_IMAGE_SIZE
  end
  return device.imageSize
end

function helpers.png(context, image)
  if image == nil or type(image.bitmapRepresentation) ~= "function" then
    return nil
  end

  local size = helpers.imageSize(context)
  local bitmapOk, bitmap = pcall(image.bitmapRepresentation, image, { w = size, h = size })
  if not bitmapOk or bitmap == nil or type(bitmap.encodeAsURLString) ~= "function" then
    return nil
  end

  local encodedOk, encoded = pcall(bitmap.encodeAsURLString, bitmap, true, "PNG")
  if not encodedOk or type(encoded) ~= "string" then
    return nil
  end
  encoded = encoded:gsub("%s+", "")
  encoded = encoded:gsub("^data:image/png;base64,", "")
  if encoded == "" or #encoded % 4 ~= 0 then
    return nil
  end

  local icon = {
    kind = "custom",
    mediaType = "image/png",
    dataBase64 = encoded,
  }
  local validOk, valid = pcall(protocol.validateAppearanceIcon, icon)
  if not validOk or not valid then
    return nil
  end
  return icon
end

local function areaChartError(message)
  error("Stream Deck area chart " .. message, 3)
end

local function isFiniteNumber(value)
  return type(value) == "number" and value == value and value ~= math.huge and value ~= -math.huge
end

local function isHexColor(value)
  return type(value) == "string"
    and value:match("^#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]$") ~= nil
end

local function formatChartNumber(value)
  local rounded = math.floor(value * 1000 + 0.5) / 1000
  if rounded == 0 then
    return "0"
  end
  local formatted = string.format("%.3f", rounded)
  formatted = formatted:gsub("0+$", ""):gsub("%.$", "")
  return formatted
end

local function chartValueRatio(value, minimum, maximum)
  local range = maximum - minimum
  local ratio
  if range == math.huge then
    local scale = math.max(math.abs(minimum), math.abs(maximum))
    ratio = (value / scale - minimum / scale) / (maximum / scale - minimum / scale)
  else
    ratio = (value - minimum) / range
  end
  if ratio < 0 then
    return 0
  elseif ratio > 1 then
    return 1
  end
  return ratio
end

local function validateChartValues(values)
  if type(values) ~= "table" then
    areaChartError("values must be a dense numeric array")
  end

  local count = rawlen(values)
  for key in next, values do
    if type(key) ~= "number" or key < 1 or key > count or key % 1 ~= 0 then
      areaChartError("values must be a dense numeric array")
    end
  end
  for index = 1, count do
    local value = rawget(values, index)
    if value == nil then
      areaChartError("values must be a dense numeric array")
    elseif not isFiniteNumber(value) then
      areaChartError("values[" .. index .. "] must be a finite number")
    end
  end
  return count
end

function helpers.areaChart(context, values, options)
  local count = validateChartValues(values)
  if options ~= nil and type(options) ~= "table" then
    areaChartError("options must be a table")
  end

  local settings = options or {}
  for key in next, settings do
    if key ~= "min" and key ~= "max"
        and key ~= "backgroundColor" and key ~= "fillColor"
        and key ~= "strokeColor" and key ~= "strokeWidth" then
      areaChartError("option '" .. tostring(key) .. "' is not supported")
    end
  end

  local size = helpers.imageSize(context)

  local minimum = rawget(settings, "min")
  if minimum == nil then
    minimum = 0
  elseif not isFiniteNumber(minimum) then
    areaChartError("min must be a finite number")
  end
  local maximum = rawget(settings, "max")
  if maximum == nil then
    maximum = 100
  elseif not isFiniteNumber(maximum) then
    areaChartError("max must be a finite number")
  end
  if maximum <= minimum then
    areaChartError("max must be greater than min")
  end

  local backgroundColor = rawget(settings, "backgroundColor")
  if backgroundColor == nil then
    backgroundColor = "#000000"
  elseif not isHexColor(backgroundColor) then
    areaChartError("backgroundColor must be a six-digit #RRGGBB color")
  end
  local fillColor = rawget(settings, "fillColor")
  if fillColor == nil then
    fillColor = "#FFFFFF"
  elseif not isHexColor(fillColor) then
    areaChartError("fillColor must be a six-digit #RRGGBB color")
  end

  local strokeColor = rawget(settings, "strokeColor")
  if strokeColor ~= nil and not isHexColor(strokeColor) then
    areaChartError("strokeColor must be a six-digit #RRGGBB color")
  end
  local strokeWidth = rawget(settings, "strokeWidth")
  if strokeWidth == nil then
    strokeWidth = 2
  elseif not isFiniteNumber(strokeWidth) or strokeWidth < 0.001 or strokeWidth > size then
    areaChartError("strokeWidth must be a finite number from 0.001 through size")
  end

  local sampleCount = math.min(count, size)
  local areaPath = { "M0 ", tostring(size) }
  local tracePath = {}
  local width = size - 1
  for sampleIndex = 1, sampleCount do
    local sourceIndex
    if sampleCount == 1 then
      sourceIndex = 1
    else
      sourceIndex = math.floor((sampleIndex - 1) * (count - 1) / (sampleCount - 1)) + 1
    end
    local value = rawget(values, sourceIndex)
    if value < minimum then
      value = minimum
    elseif value > maximum then
      value = maximum
    end
    local x = sampleCount == 1 and 0
      or math.floor((sampleIndex - 1) * width / (sampleCount - 1) + 0.5)
    local y = size - chartValueRatio(value, minimum, maximum) * size
    local point = formatChartNumber(x) .. " " .. formatChartNumber(y)
    areaPath[#areaPath + 1] = " L" .. point
    tracePath[#tracePath + 1] = (sampleIndex == 1 and "M" or " L") .. point
  end
  if sampleCount > 0 then
    local lastX = sampleCount == 1 and 0 or width
    areaPath[#areaPath + 1] = " L" .. formatChartNumber(lastX) .. " " .. tostring(size)
  end
  areaPath[#areaPath + 1] = " Z"

  local svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '
    .. tostring(size) .. " " .. tostring(size) .. '"><rect width="'
    .. tostring(size) .. '" height="' .. tostring(size) .. '" fill="'
    .. backgroundColor .. '"/><path fill="' .. fillColor .. '" d="'
    .. table.concat(areaPath) .. '"/>'
  if strokeColor ~= nil and sampleCount > 0 then
    svg = svg .. '<path fill="none" stroke="' .. strokeColor
      .. '" stroke-width="' .. formatChartNumber(strokeWidth)
      .. '" stroke-linecap="round" stroke-linejoin="round" d="'
      .. table.concat(tracePath) .. '"/>'
  end
  return helpers.svg(svg .. "</svg>")
end




local function validateContext(context)
  if type(context) ~= "table" or type(context.instanceId) ~= "string" or context.instanceId == "" then
    error("Stream Deck helper context must have a non-empty instanceId", 3)
  end
  return context.instanceId
end

function helpers.perInstanceState(initializer)
  if type(initializer) ~= "function" then
    error("Stream Deck per-instance state initializer must be a function", 2)
  end

  local entries = {}
  local component = {}
  local function methodContext(first, second)
    if first == component then
      return second
    end
    return first
  end

  local function methodArguments(first, second, third)
    if first == component then
      return second, third
    end
    return first, second
  end

  function component.appear(first, second)
    local context = methodContext(first, second)
    local instanceId = validateContext(context)
    if entries[instanceId] == nil then
      entries[instanceId] = {
        context = context,
        value = initializer(context),
      }
    end
  end

  function component.disappear(first, second)
    local context = methodContext(first, second)
    local instanceId = validateContext(context)
    local entry = entries[instanceId]
    if entry ~= nil and entry.context == context then
      entries[instanceId] = nil
    end
  end

  function component.get(first, second)
    local context = methodContext(first, second)
    local instanceId = validateContext(context)
    local entry = entries[instanceId]
    if entry == nil or entry.context ~= context then
      return nil
    end
    return entry.value
  end

  function component.set(first, second, third)
    local context, value = methodArguments(first, second, third)
    local instanceId = validateContext(context)
    local entry = entries[instanceId]
    if entry == nil or entry.context ~= context then
      error("Stream Deck per-instance state is not initialized", 2)
    end
    entry.value = value
    return value
  end

  return component
end

function helpers.refreshAfter(callback)
  if type(callback) ~= "function" then
    error("Stream Deck refresh-after callback must be a function", 2)
  end

  return function(context, ...)
    local results = table.pack(callback(context, ...))
    context:refresh()
    return table.unpack(results, 1, results.n)
  end
end

return helpers
