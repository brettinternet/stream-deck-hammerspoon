-- Register the complete optional action library with one bridge instance.
local streamdeck = require("streamdeck")
local actions = require("streamdeck.actions")

actions.registerAll(streamdeck)
streamdeck.start()
