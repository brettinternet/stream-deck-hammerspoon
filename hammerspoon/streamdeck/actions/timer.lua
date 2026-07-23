-- Stream Deck action: a per-key configurable timer with a live countdown.

local default_duration_minutes = 25
local duration_bounds = { min = 1, max = 120 }
local refresh_interval = 1
local flash_interval = 0.5
local state_by_instance = {}

local function new_state()
  return {
    running = false,
    timer = nil,
    refresh_timer = nil,
    flash_timer = nil,
    end_at = nil,
    duration = nil,
    flashing = false,
    flash_on = false,
    generation = 0,
  }
end

local function stop_timers(state)
  for _, field in ipairs({ "timer", "refresh_timer", "flash_timer" }) do
    if state[field] then
      state[field]:stop()
      state[field] = nil
    end
  end
  state.generation = state.generation + 1
end

local function reset_state(state)
  state.running = false
  state.end_at = nil
  state.duration = nil
  state.flashing = false
  state.flash_on = false
end

local function require_timer_api()
  if type(hs) ~= "table"
    or type(hs.timer) ~= "table"
    or type(hs.timer.doAfter) ~= "function"
    or type(hs.timer.doEvery) ~= "function"
    or type(hs.timer.secondsSinceEpoch) ~= "function" then
    error("timer unavailable")
  end
end

local function clock_now()
  require_timer_api()
  local ok, value = pcall(hs.timer.secondsSinceEpoch)
  if not ok or type(value) ~= "number" or value ~= value
      or value == math.huge or value == -math.huge then
    error("timer unavailable")
  end
  return value
end

local function finite_number(value)
  return type(value) == "number"
    and value == value
    and value ~= math.huge
    and value ~= -math.huge
end

local function duration_for(context)
  local settings = type(context.getSettings) == "function" and context:getSettings() or nil
  local minutes = type(settings) == "table" and settings.durationMinutes or nil
  if not finite_number(minutes) or minutes ~= math.floor(minutes)
      or minutes < duration_bounds.min or minutes > duration_bounds.max then
    minutes = default_duration_minutes
  end
  return minutes * 60
end

local function format_remaining(seconds)
  local remaining = math.max(0, math.ceil(seconds))
  return string.format("%02d:%02d", math.floor(remaining / 60), remaining % 60)
end

local function start_flash_timer(context, state, instance_id, generation)
  local ok, timer_or_error = pcall(hs.timer.doEvery, flash_interval, function()
    if state_by_instance[instance_id] ~= state
        or state.generation ~= generation
        or not state.flashing then
      return
    end
    state.flash_on = not state.flash_on
    context:refresh()
  end)
  if not ok or timer_or_error == nil or type(timer_or_error.stop) ~= "function" then
    error("failed to schedule completion flash" .. (ok and "" or ": " .. tostring(timer_or_error)))
  end
  state.flash_timer = timer_or_error
end

local function start_timers(context, state, instance_id)
  state.generation = state.generation + 1
  local generation = state.generation
  local completion_ok, completion_or_error = pcall(hs.timer.doAfter, state.duration, function()
    if state_by_instance[instance_id] ~= state or state.generation ~= generation then
      return
    end

    state.timer = nil
    if state.refresh_timer then
      state.refresh_timer:stop()
      state.refresh_timer = nil
    end
    state.running = false
    state.end_at = nil
    state.flashing = true
    state.flash_on = true
    start_flash_timer(context, state, instance_id, generation)
    context:success("Timer complete", 1000)
    context:refresh()
  end)
  if not completion_ok then
    error("failed to start timer: " .. tostring(completion_or_error))
  end
  if completion_or_error == nil or type(completion_or_error.stop) ~= "function" then
    error("failed to start timer")
  end
  state.timer = completion_or_error

  local refresh_ok, refresh_or_error = pcall(hs.timer.doEvery, refresh_interval, function()
    if state_by_instance[instance_id] == state
        and state.generation == generation
        and state.running then
      context:refresh()
    end
  end)
  if not refresh_ok or refresh_or_error == nil or type(refresh_or_error.stop) ~= "function" then
    stop_timers(state)
    error("failed to schedule timer refresh" .. (refresh_ok and "" or ": " .. tostring(refresh_or_error)))
  end
  state.refresh_timer = refresh_or_error
end

return {
  id = "com.brettinternet.hammerspoon.timer",
  name = "Timer",
  description = "Start or cancel a configurable timer that flashes when it completes.",
  category = "Productivity",
  gesture = "Press: start or cancel timer",
  settingsSchemaVersion = 1,
  settingsSchema = {
    {
      type = "number",
      key = "durationMinutes",
      label = "Duration minutes",
      description = "Minutes before the timer completes.",
      default = default_duration_minutes,
      min = duration_bounds.min,
      max = duration_bounds.max,
      step = 1,
    },
  },

  appear = function(context)
    local state = new_state()
    state_by_instance[context.instanceId] = state
  end,

  appearance = function(context)
    local state = state_by_instance[context.instanceId]
    if state and state.running then
      local remaining = math.max(0, math.min(state.duration, state.end_at - clock_now()))
      return {
        title = format_remaining(remaining),
        state = "active",
        appearanceVersion = 1,
        badge = "ON",
        backgroundColor = "#7F1D1D",
        foregroundColor = "#F8FAFC",
        progress = 1 - (remaining / state.duration),
      }
    end

    if state and state.flashing then
      return {
        title = "Done",
        state = "inactive",
        appearanceVersion = 1,
        badge = "!",
        backgroundColor = state.flash_on and "#FACC15" or "#111827",
        foregroundColor = state.flash_on and "#111827" or "#F8FAFC",
        progress = 1,
      }
    end

    return {
      title = "Start",
      state = "inactive",
      appearanceVersion = 1,
      backgroundColor = "#111827",
      foregroundColor = "#F8FAFC",
      progress = 0,
    }
  end,

  press = function(context)
    local instance_id = context.instanceId
    local state = state_by_instance[instance_id]
    if not state then
      state = new_state()
      state_by_instance[instance_id] = state
    end

    if state.running then
      stop_timers(state)
      reset_state(state)
      context:success("Timer cancelled", 850)
      return
    end

    stop_timers(state)
    reset_state(state)
    state.duration = duration_for(context)
    local at = clock_now()
    state.running = true
    state.end_at = at + state.duration
    local ok, err = pcall(start_timers, context, state, instance_id)
    if not ok then
      stop_timers(state)
      reset_state(state)
      error(err, 0)
    end
    context:success("Timer started", 850)
  end,

  disappear = function(context)
    local state = state_by_instance[context.instanceId]
    if state then
      stop_timers(state)
      state_by_instance[context.instanceId] = nil
    end
  end,
}
