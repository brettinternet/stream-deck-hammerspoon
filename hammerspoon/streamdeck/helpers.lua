local helpers = {}
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
