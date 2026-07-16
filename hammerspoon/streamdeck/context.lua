local context = {}

local function callbackTraceback(message)
  if debug and type(debug.traceback) == "function" then
    return debug.traceback(tostring(message), 2)
  end
  return tostring(message)
end

local function isAppearance(value)
  if type(value) ~= "table" then
    return false
  end
  if type(value.title) ~= "string" then
    return false
  end
  if value.state ~= "active" and value.state ~= "inactive" then
    return false
  end
  for key in pairs(value) do
    if key ~= "title" and key ~= "state" then
      return false
    end
  end
  return true
end

function context.new(options)
  if type(options) ~= "table" then
    error("Context options must be a table", 2)
  end
  if type(options.definition) ~= "table"
      or type(options.instanceId) ~= "string"
      or type(options.actionId) ~= "string"
      or type(options.emitAppearance) ~= "function"
      or type(options.emitError) ~= "function" then
    error("Invalid Stream Deck context options", 2)
  end

  local object = {
    definition = options.definition,
    instanceId = options.instanceId,
    actionId = options.actionId,
    settings = options.settings,
    emitAppearance = options.emitAppearance,
    emitError = options.emitError,
  }

  local function reportCallbackFailure()
    pcall(object.emitError, "CALLBACK_FAILED", object.instanceId)
  end

  function object:getSettings()
    return self.settings
  end

  function object:updateSettings(settings)
    self.settings = settings
  end

  function object:invoke(name)
    local callback = self.definition[name]
    if callback == nil then
      return true
    end
    local ok = xpcall(function()
      callback(self)
    end, callbackTraceback)
    if not ok then
      reportCallbackFailure()
      return false
    end
    return true
  end

  function object:refresh()
    local ok, appearance = xpcall(function()
      return self.definition.appearance(self)
    end, callbackTraceback)
    if not ok or not isAppearance(appearance) then
      reportCallbackFailure()
      return false
    end

    local state = appearance.state == "active" and 1 or 0
    local emitted = pcall(self.emitAppearance, self.instanceId, self.actionId, appearance.title, state)
    if not emitted then
      pcall(self.emitError, "INTERNAL", self.instanceId)
      return false
    end
    return true
  end

  return object
end

return context
