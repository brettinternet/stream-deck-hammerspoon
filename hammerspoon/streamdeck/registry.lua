local registry = {}

local allowedFields = {
  id = true,
  name = true,
  settingsSchema = true,
  appearance = true,
  press = true,
  appear = true,
  disappear = true,
}

local function nonEmptyString(value)
  return type(value) == "string" and value ~= ""
end

local function validateJsonValue(value, seen)
  local valueType = type(value)
  if valueType == "nil" or valueType == "boolean" or valueType == "string" then
    return
  end
  if valueType == "number" then
    if value ~= value or value == math.huge or value == -math.huge then
      error("Stream Deck action settingsSchema contains a non-finite number", 4)
    end
    return
  end
  if valueType ~= "table" then
    error("Stream Deck action settingsSchema must contain only JSON values", 4)
  end
  if seen[value] then
    error("Stream Deck action settingsSchema must not contain cycles", 4)
  end
  seen[value] = true

  local stringKeys = 0
  local numericKeys = 0
  local maximumIndex = 0
  for key, nested in pairs(value) do
    if type(key) == "string" then
      stringKeys = stringKeys + 1
    elseif type(key) == "number" and key >= 1 and key % 1 == 0 then
      numericKeys = numericKeys + 1
      maximumIndex = math.max(maximumIndex, key)
    else
      error("Stream Deck action settingsSchema contains an invalid JSON key", 4)
    end
    validateJsonValue(nested, seen)
  end
  if stringKeys > 0 and numericKeys > 0 then
    error("Stream Deck action settingsSchema must not mix object and array keys", 4)
  end
  if numericKeys > 0 and maximumIndex ~= numericKeys then
    error("Stream Deck action settingsSchema arrays must be dense", 4)
  end
  seen[value] = nil
end

local function validateSettingsSchema(settingsSchema)
  if type(settingsSchema) ~= "table" then
    error("Stream Deck action settingsSchema must be an array", 4)
  end
  local count = 0
  local maximumIndex = 0
  for key in pairs(settingsSchema) do
    if type(key) ~= "number" or key < 1 or key % 1 ~= 0 then
      error("Stream Deck action settingsSchema must be an array", 4)
    end
    count = count + 1
    maximumIndex = math.max(maximumIndex, key)
  end
  if maximumIndex ~= count then
    error("Stream Deck action settingsSchema arrays must be dense", 4)
  end
  validateJsonValue(settingsSchema, {})
end


local function validateDefinition(definition)
  if type(definition) ~= "table" then
    error("Stream Deck action definition must be a table", 3)
  end

  for field in pairs(definition) do
    if not allowedFields[field] then
      error("Stream Deck action definition has unknown field: " .. tostring(field), 3)
    end
  end

  if not nonEmptyString(definition.id) then
    error("Stream Deck action definition id must be a non-empty string", 3)
  end
  if not nonEmptyString(definition.name) then
    error("Stream Deck action definition name must be a non-empty string", 3)
  end
  if definition.settingsSchema ~= nil then
    validateSettingsSchema(definition.settingsSchema)
  end
  if type(definition.appearance) ~= "function" then
    error("Stream Deck action appearance must be a function", 3)
  end
  if type(definition.press) ~= "function" then
    error("Stream Deck action press must be a function", 3)
  end
  for _, field in ipairs({ "appear", "disappear" }) do
    if definition[field] ~= nil and type(definition[field]) ~= "function" then
      error("Stream Deck action " .. field .. " must be a function", 3)
    end
  end
end

function registry.new()
  local object = {
    definitions = {},
    order = {},
  }

  function object:register(definition)
    validateDefinition(definition)
    if self.definitions[definition.id] ~= nil then
      error("Duplicate Stream Deck action id: " .. definition.id, 2)
    end

    self.definitions[definition.id] = definition
    self.order[#self.order + 1] = definition.id
    return definition
  end

  function object:get(actionId)
    return self.definitions[actionId]
  end

  function object:has(actionId)
    return self.definitions[actionId] ~= nil
  end

  function object:list()
    local actions = {}
    for index, actionId in ipairs(self.order) do
      local definition = self.definitions[actionId]
      local action = {
        actionId = actionId,
        name = definition.name,
      }
      if definition.settingsSchema ~= nil then
        action.settingsSchema = definition.settingsSchema
      end
      actions[index] = action
    end
    return actions
  end

  return object
end

return registry
