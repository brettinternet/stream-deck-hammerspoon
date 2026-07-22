-- Stream Deck action: a Stream Deck key that cycles focused-window layouts.
-- Press repeatedly for left half, right half, and full screen; layout state is independent per key.

local action_id = "com.brettinternet.hammerspoon.window-snap"
local layouts = {
  { title = "Left half", unit = { x = 0, y = 0, w = 0.5, h = 1 } },
  { title = "Right half", unit = { x = 0.5, y = 0, w = 0.5, h = 1 } },
  { title = "Full screen", unit = { x = 0, y = 0, w = 1, h = 1 } },
}
local layout_by_instance = {}

local function focused_window_api_available()
  return type(hs) == "table"
    and type(hs.window) == "table"
    and type(hs.window.focusedWindow) == "function"
end

return {
  id = action_id,
  name = "Snap focused window",

  appear = function(context)
    layout_by_instance[context.instanceId] = 0
  end,

  appearance = function(context)
    if not focused_window_api_available() then
      return {
        title = "Window unavailable",
        state = "inactive",
      }
    end

    if not hs.window.focusedWindow() then
      return {
        title = "No window",
        state = "inactive",
      }
    end

    local layout_index = layout_by_instance[context.instanceId] or 0
    if layout_index == 0 then
      return {
        title = "Snap window",
        state = "inactive",
      }
    end

    return {
      title = layouts[layout_index].title,
      state = "active",
    }
  end,

  press = function(context)
    if not focused_window_api_available() then
      error("focused window API unavailable")
    end

    local window = hs.window.focusedWindow()
    if not window then
      error("no focused window")
    end
    if type(window.moveToUnit) ~= "function" then
      error("window moveToUnit API unavailable")
    end

    local instance_id = context.instanceId
    local current_index = layout_by_instance[instance_id] or 0
    local next_index = current_index % #layouts + 1
    local ok, result = pcall(window.moveToUnit, window, layouts[next_index].unit)
    if not ok or not result then
      error("failed to move focused window")
    end

    layout_by_instance[instance_id] = next_index
  end,

  disappear = function(context)
    layout_by_instance[context.instanceId] = nil
  end,
}

