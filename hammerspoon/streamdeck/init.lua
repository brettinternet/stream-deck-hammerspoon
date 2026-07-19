local Registry = require("streamdeck.registry")
local Protocol = require("streamdeck.protocol")
local Context = require("streamdeck.context")
local Server = require("streamdeck.server")
local Builtins = require("streamdeck.builtins")

local module = {}
local actions = Registry.new()
Builtins.register(actions)
local bridge = Server.new(actions, Protocol, Context)

function module.register(definition)
  return actions:register(definition)
end

function module.start(options)
  bridge:start(options)
  return module
end

function module.stop()
  bridge:stop()
  return module
end

function module.refresh(actionId)
  bridge:refresh(actionId)
  return module
end

return module
