local Sound = require("streamdeck.sound")
local context = {}

local function callbackTraceback(message)
  if debug and type(debug.traceback) == "function" then
    return debug.traceback(tostring(message), 2)
  end
  return tostring(message)
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

local function isAppearanceIcon(value)
  return require("streamdeck.protocol").validateAppearanceIcon(value)
end
local function copyDevice(device)
  if type(device) ~= "table" or not require("streamdeck.protocol").validateDeviceMetadata(device) then
    return nil
  end
  return {
    controllerType = device.controllerType,
    device = {
      type = device.device.type,
      size = { columns = device.device.size.columns, rows = device.device.size.rows },
    },
  }
end

local MAX_FEEDBACK_MESSAGE_LENGTH = 256
local MIN_FEEDBACK_DURATION_MS = 100
local MAX_FEEDBACK_DURATION_MS = 10000

local function isFeedbackMessage(value)
  if type(value) ~= "string" or value == "" then
    return false
  end
  local ok, length = pcall(utf8.len, value)
  if not ok or length == nil or length > MAX_FEEDBACK_MESSAGE_LENGTH then
    return false
  end
  return pcall(function()
    for _, codePoint in utf8.codes(value) do
      if (codePoint >= 0 and codePoint <= 0x1f) or (codePoint >= 0x7f and codePoint <= 0x9f) then
        error("control character")
      end
    end
  end)
end

local function isFeedbackDuration(value)
  return type(value) == "number"
    and value == value
    and value ~= math.huge
    and value ~= -math.huge
    and value >= MIN_FEEDBACK_DURATION_MS
    and value <= MAX_FEEDBACK_DURATION_MS
end

local function isAppearance(value)
  if type(value) ~= "table" or type(value.title) ~= "string" then
    return false
  end
  if value.state ~= "active" and value.state ~= "inactive" then
    return false
  end
  local hasExtendedFields = value.foregroundColor ~= nil
    or value.backgroundColor ~= nil
    or value.progress ~= nil
    or value.badge ~= nil
    or value.icon ~= nil
  if value.appearanceVersion ~= nil and value.appearanceVersion ~= 1 then
    return false
  end
  if hasExtendedFields and value.appearanceVersion ~= 1 then
    return false
  end
  if value.foregroundColor ~= nil and not isAppearanceColor(value.foregroundColor) then
    return false
  end
  if value.backgroundColor ~= nil and not isAppearanceColor(value.backgroundColor) then
    return false
  end
  if value.progress ~= nil and (type(value.progress) ~= "number" or value.progress ~= value.progress
      or value.progress == math.huge or value.progress == -math.huge
      or value.progress < 0 or value.progress > 1) then
    return false
  end
  if value.badge ~= nil and not isAppearanceBadge(value.badge) then
    return false
  end
  if value.icon ~= nil and not isAppearanceIcon(value.icon) then
    return false
  end
  for key in pairs(value) do
    if key ~= "title" and key ~= "state" and key ~= "appearanceVersion"
        and key ~= "foregroundColor" and key ~= "backgroundColor"
        and key ~= "progress" and key ~= "badge" and key ~= "icon" then
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
      or type(options.emitError) ~= "function"
      or (options.sound ~= nil and type(options.sound) ~= "table")
      or (options.sound ~= nil and type(options.sound.play) ~= "function") then
    error("Invalid Stream Deck context options", 2)
  end

  local object = {
    definition = options.definition,
    instanceId = options.instanceId,
    actionId = options.actionId,
    settings = options.settings,
    metadata = copyDevice(options.metadata),
    emitAppearance = options.emitAppearance,
    emitError = options.emitError,
    emitFeedback = options.emitFeedback,
    sound = options.sound or Sound,
  }

  local function reportCallbackFailure()
    pcall(object.emitError, "CALLBACK_FAILED", object.instanceId)
  end

  function object:getSettings()
    return self.settings
  end
  function object:getDevice()
    return copyDevice(self.metadata)
  end


  local function emitFeedback(kind, message, durationMs)
    if not isFeedbackMessage(message) or not isFeedbackDuration(durationMs)
        or type(object.emitFeedback) ~= "function" then
      return false
    end
    local ok, emitted = pcall(object.emitFeedback, object.instanceId, object.actionId, kind, message, durationMs)
    if not ok or emitted == false then
      pcall(object.emitError, "INTERNAL", object.instanceId)
      return false
    end
    return true
  end

  function object:updateSettings(settings)
    self.settings = settings
  end
  function object:updateMetadata(metadata)
    local copied = copyDevice(metadata)
    if copied ~= nil then
      self.metadata = copied
    end
  end

  function object:success(message, durationMs)
    return emitFeedback("success", message, durationMs)
  end

  function object:error(message, durationMs)
    return emitFeedback("error", message, durationMs)
  end
  function object:playSound(spec)
    local ok, result = pcall(self.sound.play, spec, self)
    return ok and result == true
  end

  function object:playSoundPolicy(policy, callbackReturn)
    if type(self.sound.playPolicy) ~= "function" then return true end
    local ok = pcall(self.sound.playPolicy, policy, callbackReturn, self)
    return ok
  end


  function object:invoke(name, ...)
    local callback = self.definition[name]
    if callback == nil then
      return true
    end
    local args = table.pack(...)
    local ok, callbackReturns = xpcall(function()
      return table.pack(callback(self, table.unpack(args, 1, args.n)))
    end, callbackTraceback)
    if not ok then
      reportCallbackFailure()
      return false
    end
    return true, table.unpack(callbackReturns, 1, callbackReturns.n)
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

    local emitted = pcall(self.emitAppearance, self.instanceId, self.actionId, appearance.title, state, appearance)
    if not emitted then
      pcall(self.emitError, "INTERNAL", self.instanceId)
      return false
    end
    return true
  end

  return object
end

return context
