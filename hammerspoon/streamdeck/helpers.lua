local helpers = {}

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
        value = initializer(context),
      }
    end
  end

  function component.disappear(first, second)
    local context = methodContext(first, second)
    local instanceId = validateContext(context)
    entries[instanceId] = nil
  end

  function component.get(first, second)
    local context = methodContext(first, second)
    local instanceId = validateContext(context)
    local entry = entries[instanceId]
    if entry == nil then
      return nil
    end
    return entry.value
  end

  function component.set(first, second, third)
    local context, value = methodArguments(first, second, third)
    local instanceId = validateContext(context)
    local entry = entries[instanceId]
    if entry == nil then
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
