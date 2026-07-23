-- Stream Deck action: a Stream Deck key that cycles through up to four user desktops.
-- Use Hammerspoon Multi-State to show the current desktop; full-screen and tiled spaces are skipped.

local action_id = "com.brettinternet.hammerspoon.desktop-space-cycler"
local maximum_desktops = 4
local refresh_delay = 0.5

local function spaces_api()
  if type(hs) ~= "table"
    or type(hs.spaces) ~= "table"
    or type(hs.screen) ~= "table"
    or type(hs.screen.mainScreen) ~= "function"
    or type(hs.spaces.spacesForScreen) ~= "function"
    or type(hs.spaces.spaceType) ~= "function"
    or type(hs.spaces.activeSpaceOnScreen) ~= "function"
    or type(hs.spaces.gotoSpace) ~= "function" then
    error("Spaces API unavailable")
  end
  return hs.spaces, hs.screen.mainScreen()
end

local function user_desktops(spaces, screen)
  local ok, space_ids = pcall(spaces.spacesForScreen, screen)
  if not ok or type(space_ids) ~= "table" then
    error("failed to list Spaces desktops")
  end

  local desktops = {}
  for _, space_id in ipairs(space_ids) do
    local type_ok, space_type = pcall(spaces.spaceType, space_id)
    if not type_ok then
      error("failed to read Spaces desktop type")
    end
    if space_type == "user" then
      table.insert(desktops, space_id)
      if #desktops == maximum_desktops then
        break
      end
    end
  end
  return desktops
end

local function active_desktop(spaces, screen)
  local ok, space_id = pcall(spaces.activeSpaceOnScreen, screen)
  if not ok then
    error("failed to read active Spaces desktop")
  end
  return space_id
end

local function desktop_index(desktops, active_space)
  for index, space_id in ipairs(desktops) do
    if space_id == active_space then
      return index
    end
  end
  return nil
end

local function appearance_for(desktops, active_space)
  local index = desktop_index(desktops, active_space)
  if not index then
    return {
      title = #desktops == 0 and "No desktop" or "Other\ndesktop",
      state = "inactive",
      appearanceVersion = 1,
      presentationState = 0,
    }
  end

  return {
    title = "Desktop " .. index,
    state = index == 1 and "inactive" or "active",
    appearanceVersion = 1,
    presentationState = index - 1,
  }
end

local function refresh_after_transition(context)
  if type(hs) == "table" and type(hs.timer) == "table" and type(hs.timer.doAfter) == "function" then
    local ok = pcall(hs.timer.doAfter, refresh_delay, function()
      context:refresh()
    end)
    if ok then
      return
    end
  end
  context:refresh()
end

return {
  id = action_id,
  name = "Desktop space cycler",
  description = "Switch to the next user desktop Space, skipping full-screen and tiled Spaces.",
  category = "Windows",
  gesture = "Press: move to the next desktop Space",

  appearance = function(_context)
    local spaces, screen = spaces_api()
    local desktops = user_desktops(spaces, screen)
    return appearance_for(desktops, active_desktop(spaces, screen))
  end,

  press = function(context)
    local spaces, screen = spaces_api()
    local desktops = user_desktops(spaces, screen)
    if #desktops == 0 then
      error("no user desktop available")
    end

    local current_index = desktop_index(desktops, active_desktop(spaces, screen))
    local next_index = current_index and (current_index % #desktops) + 1 or 1
    local ok, result = pcall(spaces.gotoSpace, desktops[next_index])
    if not ok or result ~= true then
      error("failed to switch Spaces desktop")
    end
    refresh_after_transition(context)
    context:success("Desktop " .. tostring(next_index), 850)
  end,
}

