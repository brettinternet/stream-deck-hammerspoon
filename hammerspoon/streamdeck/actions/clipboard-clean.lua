-- Stream Deck action: a Stream Deck key that trims text in the clipboard.
-- Press the key to remove leading and trailing whitespace from the current clipboard text.

local action_id = "com.brettinternet.hammerspoon.clipboard-clean"
local helpers = require("streamdeck.helpers")

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
  description = "Trim leading and trailing whitespace from the clipboard text.",
  category = "Productivity",
  gesture = "Press: trim whitespace from clipboard text",

  appearance = function(_context)
    local contents = clipboard_contents()
    if not contents then
      return {
        title = "No text",
        state = "inactive",
        appearanceVersion = 1,
        icon = helpers.icon("clipboard", { foregroundColor = helpers.colors.inactive }),
      }
    end
    local needs_trim = trim(contents) ~= contents
    return {
      title = needs_trim and "Trim" or "Clean",
      state = needs_trim and "active" or "inactive",
      appearanceVersion = 1,
      badge = needs_trim and "TRIM" or "OK",
      icon = helpers.icon(
        needs_trim and "clipboard" or "clipboard-check",
        { foregroundColor = needs_trim and helpers.colors.warning or helpers.colors.active }
      ),
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
    context:success("Clipboard\ncleaned", 850)
  end,
}

