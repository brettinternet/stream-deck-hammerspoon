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
helpers.colors = {
  background = "#111827",
  active = "#22C55E",
  inactive = "#64748B",
  accent = "#38BDF8",
  warning = "#F59E0B",
  error = "#EF4444",
  foreground = "#F8FAFC",
}

local iconShapes = {
  speaker = [[<path d="M14 30h12l14-12v36L26 42H14z" fill="currentColor"/><path d="M47 27a14 14 0 0 1 0 18M53 20a24 24 0 0 1 0 32" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>]],
  headphones = [[<path d="M14 39v-7a22 22 0 0 1 44 0v7" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><rect x="10" y="36" width="14" height="24" rx="6" fill="currentColor"/><rect x="48" y="36" width="14" height="24" rx="6" fill="currentColor"/>]],
  display = [[<rect x="9" y="12" width="54" height="38" rx="5" fill="none" stroke="currentColor" stroke-width="5"/><path d="M27 61h18M36 50v11" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>]],
  keyboard = [[<rect x="7" y="18" width="58" height="38" rx="6" fill="none" stroke="currentColor" stroke-width="5"/><path d="M16 29h5m7 0h5m7 0h5m7 0h5M16 40h5m7 0h5m7 0h5m7 0h5M20 49h32" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>]],
  clipboard = [[<rect x="15" y="12" width="42" height="50" rx="6" fill="none" stroke="currentColor" stroke-width="5"/><rect x="26" y="7" width="20" height="12" rx="5" fill="currentColor"/><path d="M25 33h22M25 44h18" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>]],
  ["clipboard-check"] = [[<rect x="15" y="12" width="42" height="50" rx="6" fill="none" stroke="currentColor" stroke-width="5"/><rect x="26" y="7" width="20" height="12" rx="5" fill="currentColor"/><path d="m24 40 8 8 17-19" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>]],
  sun = [[<circle cx="36" cy="36" r="13" fill="currentColor"/><path d="M36 7v9m0 40v9M7 36h9m40 0h9M15 15l7 7m28 28 7 7M57 15l-7 7M22 50l-7 7" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>]],
  moon = [[<path d="M53 49A25 25 0 0 1 25 13a26 26 0 1 0 28 36z" fill="currentColor"/>]],
  rocket = [[<path d="M42 10c10 0 18 1 20 3 2 2 3 10 3 20L42 56 18 32z" fill="currentColor"/><circle cx="47" cy="27" r="7" fill="#111827"/><path d="m21 38-9 4-5 15 15-5 4-9M32 53l-2 12 12-8" fill="currentColor"/>]],
  link = [[<path d="M29 44l-5 5a12 12 0 0 1-17-17l10-10a12 12 0 0 1 17 0M43 28l5-5a12 12 0 1 1 17 17L55 50a12 12 0 0 1-17 0M24 36h24" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>]],
  spotify = [[<circle cx="36" cy="36" r="30" fill="currentColor"/><path d="M19 28c13-4 31-2 40 3M21 39c12-3 26-1 35 3M24 49c10-2 20-1 28 3" fill="none" stroke="#111827" stroke-width="5" stroke-linecap="round"/>]],
  center = [[<rect x="8" y="8" width="56" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="4"/><rect x="24" y="24" width="24" height="24" rx="3" fill="currentColor"/>]],
  maximize = [[<rect x="8" y="8" width="56" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="5"/><rect x="17" y="17" width="38" height="38" rx="3" fill="currentColor"/>]],
  ["next-screen"] = [[<rect x="5" y="15" width="28" height="38" rx="4" fill="none" stroke="currentColor" stroke-width="4"/><rect x="39" y="15" width="28" height="38" rx="4" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 34h26m-7-7 7 7-7 7" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>]],
  ["snap-left"] = [[<rect x="8" y="8" width="56" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="4"/><path d="M10 10h26v52H10z" fill="currentColor"/>]],
  ["snap-right"] = [[<rect x="8" y="8" width="56" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="4"/><path d="M36 10h26v52H36z" fill="currentColor"/>]],
  ["snap-top"] = [[<rect x="8" y="8" width="56" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="4"/><path d="M10 10h52v26H10z" fill="currentColor"/>]],
  ["snap-bottom"] = [[<rect x="8" y="8" width="56" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="4"/><path d="M10 36h52v26H10z" fill="currentColor"/>]],
}

function helpers.icon(name, options)
  local shape = iconShapes[name]
  if shape == nil then
    error("Unknown Stream Deck icon: " .. tostring(name), 2)
  end
  if options ~= nil and type(options) ~= "table" then
    error("Stream Deck icon options must be a table", 2)
  end
  local settings = options or {}
  for key in pairs(settings) do
    if key ~= "backgroundColor" and key ~= "foregroundColor" then
      error("Unknown Stream Deck icon option: " .. tostring(key), 2)
    end
  end
  local background = settings.backgroundColor or helpers.colors.background
  local foreground = settings.foregroundColor or helpers.colors.foreground
  if not isHexColor(background) or not isHexColor(foreground) then
    error("Stream Deck icon colors must be six-digit #RRGGBB values", 2)
  end
  shape = shape:gsub("currentColor", foreground)
  return helpers.svg(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72"><rect width="72" height="72" rx="12" fill="'
      .. background
      .. '"/>'
      .. shape
      .. "</svg>"
  )
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
