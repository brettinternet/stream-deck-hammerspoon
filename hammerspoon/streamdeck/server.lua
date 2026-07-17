local server = {}

local DEFAULT_PORT = 17321
local DEFAULT_TOKEN_SUFFIX = "/.hammerspoon/streamdeck-token"
local SOCKET_PATH = "/streamdeck"

local function isInteger(value)
  return type(value) == "number"
    and value == value
    and value ~= math.huge
    and value ~= -math.huge
    and math.floor(value) == value
end

local function shellQuote(value)
  return "'" .. tostring(value):gsub("'", "'\\''") .. "'"
end

local function chmod0600(path)
  local ok, result = pcall(os.execute, "/bin/chmod 600 " .. shellQuote(path))
  return ok and (result == true or result == 0)
end

local function permissionsAre0600(hsapi, path)
  if not hsapi.fs or type(hsapi.fs.attributes) ~= "function" then
    return false
  end
  local attributes = hsapi.fs.attributes(path)
  return type(attributes) == "table" and attributes.permissions == "rw-------"
end

local function ensureToken(hsapi, path)
  local attributes = hsapi.fs and hsapi.fs.attributes and hsapi.fs.attributes(path)
  if attributes == nil then
    if not hsapi.host or type(hsapi.host.uuid) ~= "function" then
      return nil, "token unavailable"
    end
    local handle, openError = io.open(path, "w")
    if not handle then
      return nil, openError or "token unavailable"
    end
    local token = hsapi.host.uuid() .. hsapi.host.uuid()
    local wrote, writeError = handle:write(token)
    local closed, closeError = handle:close()
    if not wrote or not closed then
      return nil, writeError or closeError or "token unavailable"
    end
  end

  if not chmod0600(path) or not permissionsAre0600(hsapi, path) then
    return nil, "token permissions"
  end

  local handle, openError = io.open(path, "r")
  if not handle then
    return nil, openError or "token unavailable"
  end
  local token, readError = handle:read("*a")
  local closed, closeError = handle:close()
  if not closed or not token or token == "" then
    return nil, readError or closeError or "token unavailable"
  end
  return token
end

local function validateOptions(options)
  if options ~= nil and type(options) ~= "table" then
    error("Stream Deck start options must be a table", 3)
  end
  options = options or {}
  for key in pairs(options) do
    if key ~= "port" and key ~= "tokenPath" then
      error("Unknown Stream Deck start option: " .. tostring(key), 3)
    end
  end

  local port = options.port or DEFAULT_PORT
  if not isInteger(port) or port < 1 or port > 65535 then
    error("Stream Deck port must be an integer from 1 to 65535", 3)
  end

  local home = os.getenv("HOME")
  local defaultTokenPath = home and (home .. DEFAULT_TOKEN_SUFFIX) or nil
  local tokenPath = options.tokenPath or defaultTokenPath
  if type(tokenPath) ~= "string" or tokenPath == "" then
    error("Stream Deck tokenPath must be a non-empty string", 3)
  end
  return port, tokenPath
end

function server.new(registry, protocol, contextFactory)
  if type(registry) ~= "table" or type(protocol) ~= "table" or type(contextFactory) ~= "table" then
    error("Invalid Stream Deck server dependencies", 2)
  end

  local object = {
    registry = registry,
    protocol = protocol,
    contextFactory = contextFactory,
    instances = {},
    http = nil,
    token = nil,
    sessionId = nil,
    sessionGeneration = 0,
    started = false,
    authenticated = false,
    dispatching = false,
    responseQueue = nil,
  }

  function object:_queue(message)
    local encoded = self.protocol.encode(message)
    if not encoded then
      return false
    end
    if self.responseQueue then
      self.responseQueue[#self.responseQueue + 1] = encoded
      return true
    end
    return self:_sendRaw(encoded)
  end

  function object:_queueError(code, requestId, instanceId)
    return self:_queue(self.protocol.error(code, requestId, instanceId))
  end

  function object:_sendRaw(encoded)
    if not self.started or not self.http or type(self.http.send) ~= "function" then
      return false
    end
    local ok = pcall(self.http.send, self.http, encoded)
    return ok
  end

  function object:_emitAppearance(instanceId, actionId, title, state, appearance)
    local message = {
      protocolVersion = self.protocol.VERSION,
      type = "appearance",
      instanceId = instanceId,
      actionId = actionId,
      title = title,
      state = state,
    }
    if appearance and appearance.appearanceVersion ~= nil then message.appearanceVersion = appearance.appearanceVersion end
    if appearance and appearance.foregroundColor ~= nil then message.foregroundColor = appearance.foregroundColor end
    if appearance and appearance.backgroundColor ~= nil then message.backgroundColor = appearance.backgroundColor end
    if appearance and appearance.progress ~= nil then message.progress = appearance.progress end
    if appearance and appearance.badge ~= nil then message.badge = appearance.badge end
    if appearance and appearance.icon ~= nil then message.icon = appearance.icon end
    return self:_queue(message)
  end

  function object:_emitFeedback(instanceId, actionId, kind, message, durationMs)
    return self:_queue({
      protocolVersion = self.protocol.VERSION,
      type = "feedback",
      instanceId = instanceId,
      actionId = actionId,
      kind = kind,
      message = message,
      durationMs = durationMs,
    })
  end

  function object:_emitError(code, instanceId)
    return self:_queueError(code, nil, instanceId)
  end

  function object:_context(instanceId, actionId, settings, definition, metadata)
    return self.contextFactory.new({
      instanceId = instanceId,
      actionId = actionId,
      settings = settings,
      metadata = metadata,
      definition = definition,
      emitAppearance = function(contextInstanceId, contextActionId, title, state, appearance)
        return self:_emitAppearance(contextInstanceId, contextActionId, title, state, appearance)
      end,
      emitError = function(code, contextInstanceId)
        return self:_emitError(code, contextInstanceId)
      end,
      emitFeedback = function(contextInstanceId, contextActionId, kind, message, durationMs)
        return self:_emitFeedback(contextInstanceId, contextActionId, kind, message, durationMs)
      end,
    })
  end

  local function cancelLongPress(instance)
    instance.longPressGeneration = (instance.longPressGeneration or 0) + 1
    if instance.longPressTimer ~= nil then
      local timer = instance.longPressTimer
      instance.longPressTimer = nil
      pcall(function()
        if type(timer.stop) == "function" then
          timer:stop()
        end
      end)
    end
    instance.pressed = false
    instance.longPressTriggered = false
  end

  function object:_beginPress(instance)
    cancelLongPress(instance)
    if instance.definition.longPress == nil then
      instance:invoke("press")
      return
    end

    instance.pressed = true
    local hsapi = rawget(_G, "hs")
    local timerApi = hsapi and hsapi.timer
    if not timerApi or type(timerApi.doAfter) ~= "function" then
      instance.pressed = false
      instance:invoke("press")
      return
    end

    local thresholdMs = instance.definition.longPressThresholdMs or 500
    local generation = instance.longPressGeneration
    local callback = function()
      if self.instances[instance.instanceId] ~= instance
          or not instance.pressed
          or instance.longPressGeneration ~= generation
          or instance.longPressTriggered then
        return
      end
      instance.longPressTimer = nil
      instance.longPressTriggered = true
      instance:invoke("longPress")
    end
    local ok, timer = pcall(timerApi.doAfter, thresholdMs / 1000, callback)
    if not ok or timer == nil then
      instance.pressed = false
      instance:invoke("press")
      return
    end
    instance.longPressTimer = timer
  end

  function object:_endPress(instance)
    if instance.definition.longPress == nil then
      instance:invoke("release")
      return
    end
    if not instance.pressed then
      return
    end
    local longPressTriggered = instance.longPressTriggered == true
    cancelLongPress(instance)
    if not longPressTriggered then
      instance:invoke("press")
    end
    instance:invoke("release")
  end

  function object:_cancelPress(instance)
    cancelLongPress(instance)
  end

  local function cancelInstancePress(instance)
    if instance then
      object:_cancelPress(instance)
    end
  end

  function object:_clearInstances()
    local instances = self.instances
    self.instances = {}
    for _, instance in pairs(instances) do
      cancelInstancePress(instance)
      instance:invoke("disappear")
    end
  end

  function object:_newSessionId()
    local hsapi = rawget(_G, "hs")
    if not hsapi or not hsapi.host or type(hsapi.host.uuid) ~= "function" then
      return nil
    end
    local ok, sessionId = pcall(hsapi.host.uuid)
    if not ok or type(sessionId) ~= "string" or sessionId == "" then
      return nil
    end
    self.sessionGeneration = self.sessionGeneration + 1
    if self.sessionGeneration > 1 then
      sessionId = sessionId .. "-" .. tostring(self.sessionGeneration)
    end
    return sessionId
  end


  function object:_handle(message)
    if message.type == "hello" then
      if message.token ~= self.token then
        self:_queueError("AUTH_FAILED")
        return
      end
      local sessionId = self:_newSessionId()
      if not sessionId then
        self:_queueError("INTERNAL")
        return
      end
      self:_clearInstances()
      self.responseQueue = {}
      self.sessionId = sessionId
      self.authenticated = true
      self:_queue({
        protocolVersion = self.protocol.VERSION,
        type = "helloAck",
        sessionId = sessionId,
      })
      return
    end

    if not self.authenticated then
      self:_queueError("AUTH_REQUIRED", message.requestId, message.instanceId)
      return
    end

    if message.sessionId ~= self.sessionId then
      self:_queueError("AUTH_REQUIRED", message.requestId, message.instanceId)
      return
    end

    if message.type == "listActions" then
      self:_queue({
        protocolVersion = self.protocol.VERSION,
        type = "actions",
        requestId = message.requestId,
        actions = self.registry:list(),
      })
      return
    end

    if message.type == "instanceAppeared" then
      local definition = self.registry:get(message.actionId)
      if not definition then
        self:_queueError("UNKNOWN_ACTION", nil, message.instanceId)
        return
      end
      local existing = self.instances[message.instanceId]
      if existing and existing.actionId ~= message.actionId then
        self:_queueError("INVALID_STATE", nil, message.instanceId)
        return
      end
      if existing then
        cancelInstancePress(existing)
        existing:updateSettings(message.settings)
        if message.metadata ~= nil then existing:updateMetadata(message.metadata) end
        existing:refresh()
      else
        local instance = self:_context(message.instanceId, message.actionId, message.settings, definition, message.metadata)
        self.instances[message.instanceId] = instance
        instance:invoke("appear")
        instance:refresh()
      end
      return
    end

    if message.type == "instanceDisappeared" then
      local definition = self.registry:get(message.actionId)
      if not definition then
        self:_queueError("UNKNOWN_ACTION", nil, message.instanceId)
        return
      end
      local instance = self.instances[message.instanceId]
      if not instance then
        return
      end
      if instance.actionId ~= message.actionId then
        self:_queueError("STALE_INSTANCE", nil, message.instanceId)
        return
      end
      self.instances[message.instanceId] = nil
      cancelInstancePress(instance)
      instance:invoke("disappear")
      return
    end

    if message.type == "keyDown"
        or message.type == "keyUp"
        or message.type == "dialDown"
        or message.type == "dialRotate"
        or message.type == "dialUp"
        or message.type == "touchTap"
        or message.type == "requestAppearance" then
      local definition = self.registry:get(message.actionId)
      if not definition then
        self:_queueError("UNKNOWN_ACTION", nil, message.instanceId)
        return
      end
      local instance = self.instances[message.instanceId]
      if not instance or instance.actionId ~= message.actionId then
        self:_queueError("STALE_INSTANCE", nil, message.instanceId)
        return
      end
      if message.type == "keyDown" then
        self:_beginPress(instance)
      elseif message.type == "keyUp" then
        self:_endPress(instance)
      elseif message.type == "dialDown" then
        instance:invoke(instance.definition.push == nil and "press" or "push")
      elseif message.type == "dialRotate" then
        instance:invoke("rotate", message.ticks, message.pressed)
      elseif message.type == "dialUp" then
        instance:invoke("release")
      elseif message.type == "touchTap" then
        instance:invoke("touchTap", message.hold, message.tapPos)
      else
        instance:refresh()
      end
      return
    end

    self:_queueError("INVALID_STATE")
  end

  function object:_onMessage(raw)
    self.responseQueue = {}
    self.dispatching = true
    local ok, codeOrNil = xpcall(function()
      local message, code = self.protocol.decode(raw)
      if not message then
        self:_queueError(code or "MALFORMED_MESSAGE")
        return
      end
      self:_handle(message)
    end, function()
      return "internal"
    end)
    if not ok then
      self.responseQueue = {}
      self:_queueError("INTERNAL")
    end
    self.dispatching = false

    local first = table.remove(self.responseQueue, 1)
    for _, encoded in ipairs(self.responseQueue) do
      self:_sendRaw(encoded)
    end
    self.responseQueue = nil
    return first or ""
  end

  function object:start(options)
    if self.started then
      error("Stream Deck server is already started", 2)
    end
    local port, tokenPath = validateOptions(options)
    local hsapi = rawget(_G, "hs")
    if not hsapi or not hsapi.httpserver then
      error("Hammerspoon HTTP server is unavailable", 2)
    end

    local token, tokenError = ensureToken(hsapi, tokenPath)
    if not token then
      error("Stream Deck token startup failed", 2)
    end

    local ok, httpOrError = pcall(hsapi.httpserver.new, false, false)
    if not ok or not httpOrError then
      error("Stream Deck server startup failed", 2)
    end
    local http = httpOrError
    local configured = pcall(http.setInterface, http, "localhost")
      and pcall(http.setPort, http, port)
      and pcall(http.websocket, http, SOCKET_PATH, function(raw)
        return self:_onMessage(raw)
      end)
    if type(http.maxBodySize) == "function" then
      pcall(http.maxBodySize, http, self.protocol.MAX_FRAME_BYTES)
    end
    if not configured then
      pcall(http.stop, http)
      error("Stream Deck server startup failed", 2)
    end

    local started = pcall(http.start, http)
    if not started then
      pcall(http.stop, http)
      error("Stream Deck server startup failed", 2)
    end
    self.http = http
    self.token = token
    self.authenticated = false
    self.sessionId = nil
    self.started = true
    return self
  end

  function object:stop()
    self.started = false
    self:_clearInstances()
    if self.http and type(self.http.stop) == "function" then
      pcall(self.http.stop, self.http)
    end
    self.http = nil
    self.token = nil
    self.sessionId = nil
    self.authenticated = false
    self.responseQueue = nil
    return self
  end

  function object:refresh(actionId)
    if not self.registry:has(actionId) then
      error("Unknown Stream Deck action id: " .. tostring(actionId), 2)
    end
    for _, instance in pairs(self.instances) do
      if instance.actionId == actionId then
        instance:refresh()
      end
    end
    return self
  end

  return object
end

return server
