-- Stream Deck action: a Stream Deck key that stashes and restores clipboard text.
-- The first press stores text for that key instance; the next press restores it and clears the stash.

local action_id = "com.brettinternet.hammerspoon.clipboard-stash"
local state_by_instance = {}

local function pasteboard_api(method)
  if type(hs) ~= "table"
    or type(hs.pasteboard) ~= "table"
    or type(hs.pasteboard[method]) ~= "function" then
    error("clipboard unavailable")
  end
  return hs.pasteboard
end

local function capture_clipboard()
  local pasteboard = pasteboard_api("getContents")
  local ok, contents = pcall(pasteboard.getContents)
  if not ok then
    error("failed to read clipboard: " .. tostring(contents))
  end
  if type(contents) ~= "string" or contents == "" then
    error("no clipboard text")
  end
  return contents
end

return {
  id = action_id,
  name = "Clipboard stash",

  appear = function(context)
    state_by_instance[context.instanceId] = nil
  end,

  appearance = function(context)
    if state_by_instance[context.instanceId] ~= nil then
      return {
        title = "Stashed",
        state = "active",
      }
    end

    return {
      title = "Empty",
      state = "inactive",
    }
  end,
  press = function(context)
    local instance_id = context.instanceId
    local stashed = state_by_instance[instance_id]
    if stashed == nil then
      state_by_instance[instance_id] = capture_clipboard()
      return
    end

    local pasteboard = pasteboard_api("setContents")
    local ok, result = pcall(pasteboard.setContents, stashed)
    if not ok then
      error("failed to update clipboard: " .. tostring(result))
    end
    if not result then
      error("failed to update clipboard")
    end

    state_by_instance[instance_id] = nil
  end,

  disappear = function(context)
    state_by_instance[context.instanceId] = nil
  end,
}

