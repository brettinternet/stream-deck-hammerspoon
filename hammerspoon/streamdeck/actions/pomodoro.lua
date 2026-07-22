-- Stream Deck action: a per-key Pomodoro session with timed work and breaks.
-- Press to run the configured focus cycles; press again to reset the current phase.

local action_id = "com.brettinternet.hammerspoon.pomodoro"
local refresh_interval = 1
local state_by_instance = {}
local settings_defaults = {
  focusMinutes = 25,
  shortBreakMinutes = 5,
  longBreakMinutes = 15,
  cycles = 4,
}
local settings_bounds = {
  focusMinutes = { min = 1, max = 120 },
  shortBreakMinutes = { min = 1, max = 60 },
  longBreakMinutes = { min = 1, max = 120 },
  cycles = { min = 1, max = 12 },
}

local helpers = require("streamdeck.helpers")
local tomato_icon = helpers.svg([[
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72"><ellipse cx="36" cy="42" rx="24" ry="21" fill="#E84C3D"/><path fill="#2F8F46" d="M36 23 L36 13 L32 10 L40 10 L36 13 L45 17 L43 22 L36 19 L29 22 L27 17 Z"/><path fill="#FFFFFF" d="M28 35 C31 29 40 28 45 34 C42 31 34 31 28 35 Z" fill-opacity="0.55"/></svg>
]])

local function new_state()
  return {
    phase = "ready",
    cycle = 0,
    settings = nil,
    phase_started_at = nil,
    phase_end_at = nil,
    timer = nil,
    generation = 0,
  }
end

local function state_for(context)
  local instance_id = context.instanceId
  local state = state_by_instance[instance_id]
  if not state then
    state = new_state()
    state_by_instance[instance_id] = state
  end
  return state
end

local function stop_timer(state)
  if state.timer then
    state.timer:stop()
    state.timer = nil
  end
  state.generation = state.generation + 1
end

local function require_timer_api()
  if type(hs) ~= "table"
    or type(hs.timer) ~= "table"
    or type(hs.timer.doEvery) ~= "function" then
    error("pomodoro timer unavailable")
  end
end

local function clock_now()
  require_timer_api()
  if type(hs.timer.secondsSinceEpoch) ~= "function" then
    error("pomodoro clock unavailable")
  end
  local ok, value = pcall(hs.timer.secondsSinceEpoch)
  if not ok or type(value) ~= "number" or value ~= value
      or value == math.huge or value == -math.huge then
    error("pomodoro clock unavailable")
  end
  return value
end

local function finite_number(value)
  return type(value) == "number"
    and value == value
    and value ~= math.huge
    and value ~= -math.huge
end

local function session_settings(context)
  local configured = type(context.getSettings) == "function" and context:getSettings() or nil
  local settings = {}
  for key, default in pairs(settings_defaults) do
    local value = type(configured) == "table" and configured[key] or nil
    local bounds = settings_bounds[key]
    if not finite_number(value) or value ~= math.floor(value)
        or value < bounds.min or value > bounds.max then
      value = default
    end
    settings[key] = value
  end
  return settings
end

local function phase_duration(state)
  local key
  if state.phase == "focus" then
    key = "focusMinutes"
  elseif state.phase == "short-break" then
    key = "shortBreakMinutes"
  elseif state.phase == "long-break" then
    key = "longBreakMinutes"
  end
  return key and state.settings[key] * 60 or 0
end

local function set_phase(state, phase, cycle, at)
  state.phase = phase
  state.cycle = cycle
  state.phase_started_at = at
  state.phase_end_at = at + phase_duration(state)
end

local function refresh(context)
  context:refresh()
end

local function finish_phase(state, instance_id, at)
  if state.phase == "focus" then
    if state.cycle < state.settings.cycles then
      set_phase(state, "short-break", state.cycle, at)
    else
      set_phase(state, "long-break", state.cycle, at)
    end
    return
  end

  if state.phase == "short-break" then
    set_phase(state, "focus", state.cycle + 1, at)
    return
  end

  if state.phase == "long-break" then
    state.phase = "complete"
    state.phase_started_at = nil
    state.phase_end_at = nil
    stop_timer(state)
    return
  end

  if state_by_instance[instance_id] == state then
    stop_timer(state)
  end
end

local function start_refresh_timer(context, state)
  require_timer_api()
  local instance_id = context.instanceId
  state.generation = state.generation + 1
  local generation = state.generation
  local ok, timer_or_error = pcall(hs.timer.doEvery, refresh_interval, function()
    if state_by_instance[instance_id] ~= state
        or state.generation ~= generation
        or state.timer == nil then
      return
    end

    local at = clock_now()
    if state.phase_end_at and at >= state.phase_end_at then
      while state.phase_end_at and at >= state.phase_end_at do
        local phase_end_at = state.phase_end_at
        finish_phase(state, instance_id, phase_end_at)
        if state.phase == "complete" then
          break
        end
      end
    end
    refresh(context)
  end)
  if not ok then
    error("failed to schedule pomodoro timer: " .. tostring(timer_or_error))
  end
  if timer_or_error == nil or type(timer_or_error.stop) ~= "function" then
    error("failed to schedule pomodoro timer")
  end
  state.timer = timer_or_error
end

local function start_session(context, state)
  local at = clock_now()
  local settings = session_settings(context)
  state.settings = settings
  set_phase(state, "focus", 1, at)

  local ok, err = pcall(function()
    start_refresh_timer(context, state)
  end)
  if not ok then
    stop_timer(state)
    state.phase = "ready"
    state.cycle = 0
    state.settings = nil
    state.phase_started_at = nil
    state.phase_end_at = nil
    error(err, 0)
  end
end

local function reset_session(context, state)
  stop_timer(state)
  state.phase = "ready"
  state.cycle = 0
  state.settings = nil
  state.phase_started_at = nil
  state.phase_end_at = nil
end

local function format_remaining(seconds)
  local remaining = math.max(0, math.ceil(seconds))
  local minutes = math.floor(remaining / 60)
  local rest = remaining % 60
  return string.format("%02d:%02d", minutes, rest)
end

local function appearance_for(context, state)
  local appearance = {
    appearanceVersion = 1,
    icon = tomato_icon,
    progress = 0,
  }

  if state.phase == "focus" or state.phase == "short-break" or state.phase == "long-break" then
    local at = clock_now()
    local duration = phase_duration(state)
    local elapsed = math.max(0, math.min(duration, at - state.phase_started_at))
    local progress = duration > 0 and elapsed / duration or 0
    local focus = state.phase == "focus"
    local badge = focus and ("F" .. tostring(state.cycle))
      or (state.phase == "short-break" and ("B" .. tostring(state.cycle)) or ("L" .. tostring(state.cycle)))
    appearance.title = format_remaining(state.phase_end_at - at)
    appearance.state = "active"
    appearance.badge = badge
    appearance.progress = progress
    appearance.backgroundColor = focus and "#D94B4B" or "#3F9B66"
    appearance.foregroundColor = "#FFFFFF"
    return appearance
  end

  if state.phase == "complete" then
    appearance.title = "Done"
    appearance.state = "inactive"
    appearance.progress = 1
    appearance.backgroundColor = "#6B7280"
    appearance.foregroundColor = "#FFFFFF"
    return appearance
  end

  appearance.title = "Start"
  appearance.state = "inactive"
  appearance.backgroundColor = "#6B7280"
  appearance.foregroundColor = "#FFFFFF"
  return appearance
end

return {
  id = action_id,
  name = "Pomodoro session",
  description = "Run focus cycles with timed breaks.",
  settingsSchemaVersion = 1,
  settingsSchema = {
    {
      type = "number",
      key = "focusMinutes",
      label = "Focus minutes",
      description = "Minutes in each focus phase.",
      default = 25,
      min = 1,
      max = 120,
      step = 1,
    },
    {
      type = "number",
      key = "shortBreakMinutes",
      label = "Short-break minutes",
      description = "Minutes in each short break.",
      default = 5,
      min = 1,
      max = 60,
      step = 1,
    },
    {
      type = "number",
      key = "longBreakMinutes",
      label = "Long-break minutes",
      description = "Minutes in the final long break.",
      default = 15,
      min = 1,
      max = 120,
      step = 1,
    },
    {
      type = "number",
      key = "cycles",
      label = "Focus cycles",
      description = "Number of focus cycles per session.",
      default = 4,
      min = 1,
      max = 12,
      step = 1,
    },
  },

  appear = function(context)
    local state = state_for(context)
    stop_timer(state)
    state.phase = "ready"
    state.cycle = 0
    state.settings = nil
    state.phase_started_at = nil
    state.phase_end_at = nil
  end,

  appearance = function(context)
    return appearance_for(context, state_for(context))
  end,

  press = function(context)
    local state = state_for(context)
    if state.phase == "focus"
      or state.phase == "short-break"
      or state.phase == "long-break" then
      reset_session(context, state)
      return
    end

    start_session(context, state)
  end,

  disappear = function(context)
    local state = state_by_instance[context.instanceId]
    if state then
      stop_timer(state)
      state_by_instance[context.instanceId] = nil
    end
  end,
}
