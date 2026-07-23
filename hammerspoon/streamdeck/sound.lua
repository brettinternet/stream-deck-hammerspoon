local sound = {}

local ON = function() end
local OFF = function() end
setmetatable(sound, {
  __index = function(_, key)
    if key == "ON" then return ON end
    if key == "OFF" then return OFF end
    return nil
  end,
  __newindex = function(self, key, value)
    if key == "ON" or key == "OFF" then
      error("Stream Deck sound sentinels are immutable", 2)
    end
    rawset(self, key, value)
  end,
})

local function fail(message, level)
  error("Stream Deck sound " .. message, (level or 1) + 1)
end

local function finite(value)
  return type(value) == "number" and value == value
    and value ~= math.huge and value ~= -math.huge
end

local function validateOptions(options, label)
  if options ~= nil and type(options) ~= "table" then
    fail(label .. " options must be a table", 3)
  end
  return options or {}
end

local function validateSoundOptions(options, label)
  options = validateOptions(options, label)
  for key in pairs(options) do
    if key ~= "volume" and key ~= "loop" and key ~= "stopOnReload" then
      fail(label .. " options have unknown field: " .. tostring(key), 3)
    end
  end
  if options.volume ~= nil and (not finite(options.volume) or options.volume < 0 or options.volume > 1) then
    fail(label .. " volume must be a finite number from 0 through 1", 3)
  end
  if options.loop ~= nil and type(options.loop) ~= "boolean" then
    fail(label .. " loop must be a boolean", 3)
  end
  if options.stopOnReload ~= nil and type(options.stopOnReload) ~= "boolean" then
    fail(label .. " stopOnReload must be a boolean", 3)
  end
  return options
end

local function immutable(value)
  return setmetatable(value, {
    __newindex = function()
      error("Stream Deck sound values are immutable", 2)
    end,
    __metatable = false,
  })
end

local function validateSpec(spec, level)
  if type(spec) ~= "table" or (spec.kind ~= "system" and spec.kind ~= "file") then
    fail("spec must be sound.system(...) or sound.file(...)", (level or 1) + 1)
  end
  if type(spec.value) ~= "string" or spec.value == "" then
    fail("spec value must be a non-empty string", (level or 1) + 1)
  end
  if spec.volume ~= nil and (not finite(spec.volume) or spec.volume < 0 or spec.volume > 1) then
    fail("spec volume must be a finite number from 0 through 1", (level or 1) + 1)
  end
  if spec.loop ~= nil and type(spec.loop) ~= "boolean" then
    fail("spec loop must be a boolean", (level or 1) + 1)
  end
  if spec.stopOnReload ~= nil and type(spec.stopOnReload) ~= "boolean" then
    fail("spec stopOnReload must be a boolean", (level or 1) + 1)
  end
  return true
end

local function isSpec(spec)
  return type(spec) == "table"
    and (spec.kind == "system" or spec.kind == "file")
    and type(spec.value) == "string"
    and spec.value ~= ""
end

function sound.system(name, options)
  if type(name) ~= "string" or name == "" then
    fail("system name must be a non-empty string", 2)
  end
  options = validateSoundOptions(options, "system")
  return immutable({
    kind = "system",
    value = name,
    volume = options.volume,
    loop = options.loop,
    stopOnReload = options.stopOnReload,
  })
end

function sound.file(path, options)
  if type(path) ~= "string" or path == "" then
    fail("file path must be a non-empty string", 2)
  end
  options = validateSoundOptions(options, "file")
  return immutable({
    kind = "file",
    value = path,
    volume = options.volume,
    loop = options.loop,
    stopOnReload = options.stopOnReload,
  })
end

local defaults = {
  press = sound.system("Tink"),
  on = sound.system("Glass"),
  off = sound.system("Basso"),
}
local provider
local stopOnReload = true
local cache = {
  system = {},
  file = {},
}

local function copyDefaults()
  return {
    press = defaults.press,
    on = defaults.on,
    off = defaults.off,
  }
end

local function validatePolicy(policy, level)
  if type(policy) ~= "table" or (policy.kind ~= "press" and policy.kind ~= "toggle") then
    fail("policy must be sound.press(...) or sound.toggle(...)", (level or 1) + 1)
  end
  if policy.kind == "press" then
    if policy.spec ~= nil then validateSpec(policy.spec, (level or 1) + 1) end
  else
    if policy.on ~= nil then validateSpec(policy.on, (level or 1) + 1) end
    if policy.off ~= nil then validateSpec(policy.off, (level or 1) + 1) end
  end
  return true
end

function sound.press(spec)
  if spec ~= nil then validateSpec(spec, 2) end
  return immutable({ kind = "press", spec = spec })
end

function sound.toggle(options)
  options = validateOptions(options, "toggle")
  for key in pairs(options) do
    if key ~= "on" and key ~= "off" then
      fail("toggle options have unknown field: " .. tostring(key), 2)
    end
  end
  if options.on ~= nil then validateSpec(options.on, 2) end
  if options.off ~= nil then validateSpec(options.off, 2) end
  return immutable({ kind = "toggle", on = options.on, off = options.off })
end

function sound.validateSpec(spec)
  return validateSpec(spec, 2)
end

function sound.validatePolicy(policy)
  return validatePolicy(policy, 2)
end

function sound.configure(options)
  options = validateOptions(options, "configuration")
  for key in pairs(options) do
    if key ~= "provider" and key ~= "defaults" and key ~= "stopOnReload" then
      fail("configuration has unknown field: " .. tostring(key), 2)
    end
  end
  if options.provider ~= nil and options.provider ~= false and type(options.provider) ~= "function" then
    fail("configuration provider must be a function or false", 2)
  end
  if options.stopOnReload ~= nil and type(options.stopOnReload) ~= "boolean" then
    fail("configuration stopOnReload must be a boolean", 2)
  end
  if options.defaults ~= nil then
    if type(options.defaults) ~= "table" then fail("configuration defaults must be a table", 2) end
    for key in pairs(options.defaults) do
      if key ~= "press" and key ~= "on" and key ~= "off" then
        fail("configuration defaults have unknown field: " .. tostring(key), 2)
      end
      if options.defaults[key] ~= nil then validateSpec(options.defaults[key], 2) end
    end
  end

  if options.provider ~= nil then
    provider = options.provider ~= false and options.provider or nil
  end
  if options.stopOnReload ~= nil then stopOnReload = options.stopOnReload end
  if options.defaults ~= nil then
    for _, key in ipairs({ "press", "on", "off" }) do
      if options.defaults[key] ~= nil then defaults[key] = options.defaults[key] end
    end
  end
  return sound
end

function sound.stopOnReload(value)
  if type(value) ~= "boolean" then
    fail("stopOnReload must be a boolean", 2)
  end
  stopOnReload = value
  return sound
end

local function safeMethod(object, name)
  local ok, method = pcall(function() return object[name] end)
  if not ok or type(method) ~= "function" then return nil end
  return method
end

local function defaultProvider(spec)
  local hsapi = rawget(_G, "hs")
  if type(hsapi) ~= "table" or type(hsapi.sound) ~= "table" then return false end
  local constructorOk, constructor = pcall(function()
    return spec.kind == "system" and hsapi.sound.getByName or hsapi.sound.getByFile
  end)
  if not constructorOk or type(constructor) ~= "function" then return false end

  local objects = cache[spec.kind]
  local object = objects[spec.value]
  if object == nil then
    local ok, result = pcall(constructor, spec.value)
    if not ok or (type(result) ~= "table" and type(result) ~= "userdata") then return false end
    object = result
    objects[spec.value] = object
    -- Loop state is configured on every replay below so cached sounds can switch.
  end
  local loopSound = safeMethod(object, "loopSound")
  if loopSound ~= nil then pcall(loopSound, object, spec.loop == true) end
  local volume = safeMethod(object, "volume")
  if volume ~= nil then
    local ok = pcall(volume, object, spec.volume or 1)
    if not ok then return false end
  elseif spec.volume ~= nil then
    return false
  end
  local stopSetting = spec.stopOnReload
  if stopSetting == nil then stopSetting = stopOnReload end
  if stopSetting ~= nil then
    local stopOnReloadMethod = safeMethod(object, "stopOnReload")
    if stopOnReloadMethod ~= nil then pcall(stopOnReloadMethod, object, stopSetting) end
  end
  local shouldStop = spec.loop == true
  if not shouldStop then
    local isPlaying = safeMethod(object, "isPlaying")
    if isPlaying ~= nil then
      local ok, playing = pcall(isPlaying, object)
      shouldStop = ok and playing == true
    end
  end
  if shouldStop then
    local stop = safeMethod(object, "stop")
    if stop ~= nil then pcall(stop, object) end
  end
  local play = safeMethod(object, "play")
  if play == nil then return false end
  local ok, result = pcall(play, object)
  return ok and result ~= false
end

function sound.play(spec, context)
  if not isSpec(spec) then return false end
  local activeProvider = provider
  if activeProvider ~= nil then
    local ok, result = pcall(activeProvider, spec, context)
    return ok and result ~= nil and result ~= false
  end
  return defaultProvider(spec)
end

function sound.playPolicy(policy, callbackReturns, context)
  if type(policy) ~= "table" then return true end
  if not (policy.kind == "press" or policy.kind == "toggle") then return true end
  local spec
  if policy.kind == "press" then
    spec = policy.spec or defaults.press
  elseif callbackReturns == ON then
    spec = policy.on or defaults.on
  elseif callbackReturns == OFF then
    spec = policy.off or defaults.off
  else
    return true
  end
  sound.play(spec, context)
  return true
end

function sound._resetForTests()
  provider = nil
  stopOnReload = true
  defaults = {
    press = sound.system("Tink"),
    on = sound.system("Glass"),
    off = sound.system("Basso"),
  }
  cache = { system = {}, file = {} }
end

return sound
