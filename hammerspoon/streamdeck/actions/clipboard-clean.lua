-- Stream Deck action: a Stream Deck key that trims text in the clipboard.
-- Press the key to remove leading and trailing whitespace from the current clipboard text.

local action_id = "com.brettinternet.hammerspoon.clipboard-clean"

local function clipboard_contents()
  if not hs.pasteboard or type(hs.pasteboard.getContents) ~= "function" then
    error("clipboard unavailable")
  end

  local contents = hs.pasteboard.getContents()
  if type(contents) ~= "string" or contents == "" then
    return nil
  end
  return contents
end

local function trim(contents)
  return (contents:gsub("^%s+", ""):gsub("%s+$", ""))
end

return {
  id = action_id,
  name = "Clean clipboard",

  appearance = function(_context)
    local contents = clipboard_contents()
    if not contents then
      return {
        title = "No text",
        state = "inactive",
      }
    end

    if trim(contents) ~= contents then
      return {
        title = "Trim",
        state = "active",
      }
    end

    return {
      title = "Clean",
      state = "inactive",
    }
  end,

  press = function(context)
    local contents = clipboard_contents()
    if not contents then
      error("no clipboard text")
    end
    if not hs.pasteboard or type(hs.pasteboard.setContents) ~= "function" then
      error("clipboard unavailable")
    end

    if not hs.pasteboard.setContents(trim(contents)) then
      error("failed to update clipboard")
    end
  end,
}

