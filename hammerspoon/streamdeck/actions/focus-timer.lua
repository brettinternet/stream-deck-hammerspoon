-- Stream Deck action: a per-key 25-minute focus timer with a live countdown.

local focus_duration = 25 * 60
local refresh_interval = 1
local state_by_instance = {}

local function new_state()
  return {
    running = false,
    timer = nil,
    refresh_timer = nil,
    end_at = nil,
    generation = 0,
  }
end

local function stop_timers(state)
  if state.timer then
    state.timer:stop()
    state.timer = nil
  end
  if state.refresh_timer then
    state.refresh_timer:stop()
    state.refresh_timer = nil
  end
  state.generation = state.generation + 1
end

local function require_timer_api()
  if type(hs) ~= "table"
    or type(hs.timer) ~= "table"
    or type(hs.timer.doAfter) ~= "function"
    or type(hs.timer.doEvery) ~= "function"
    or type(hs.timer.secondsSinceEpoch) ~= "function" then
    error("focus timer unavailable")
  end
end

local function clock_now()
  require_timer_api()
  local ok, value = pcall(hs.timer.secondsSinceEpoch)
  if not ok or type(value) ~= "number" or value ~= value
      or value == math.huge or value == -math.huge then
    error("focus timer unavailable")
  end
  return value
end

local function format_remaining(seconds)
  local remaining = math.max(0, math.ceil(seconds))
  return string.format("%02d:%02d", math.floor(remaining / 60), remaining % 60)
end

local function start_timers(context, state, instance_id)
  state.generation = state.generation + 1
  local generation = state.generation
  local completion_ok, completion_or_error = pcall(hs.timer.doAfter, focus_duration, function()
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
    context:success("Focus complete", 1000)
    context:refresh()
  end)
  if not completion_ok then
    error("failed to start focus timer: " .. tostring(completion_or_error))
  end
  if completion_or_error == nil or type(completion_or_error.stop) ~= "function" then
    error("failed to start focus timer")
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
    error("failed to schedule focus refresh timer" .. (refresh_ok and "" or ": " .. tostring(refresh_or_error)))
  end
  state.refresh_timer = refresh_or_error
end

return {
  id = "com.brettinternet.hammerspoon.focus-timer",
  name = "Focus timer",
  description = "Start a 25-minute focus timer, or cancel it while running.",
  category = "Productivity",
  gesture = "Press: start or cancel the focus timer",

  appear = function(context)
    state_by_instance[context.instanceId] = new_state()
  end,

  appearance = function(context)
    local state = state_by_instance[context.instanceId]
    if state and state.running then
      local remaining = math.max(0, math.min(focus_duration, state.end_at - clock_now()))
      return {
        title = format_remaining(remaining),
        state = "active",
        appearanceVersion = 1,
        badge = "ON",
        backgroundColor = "#7F1D1D",
        foregroundColor = "#F8FAFC",
        progress = 1 - (remaining / focus_duration),
      }
    end

    return {
      title = "Ready",
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
      state.running = false
      state.end_at = nil
      context:success("Focus cancelled", 850)
      return
    end

    local at = clock_now()
    state.running = true
    state.end_at = at + focus_duration
    local ok, err = pcall(start_timers, context, state, instance_id)
    if not ok then
      stop_timers(state)
      state.running = false
      state.end_at = nil
      error(err, 0)
    end
    context:success("Focus started", 850)
  end,

  disappear = function(context)
    local state = state_by_instance[context.instanceId]
    if state then
      stop_timers(state)
      state_by_instance[context.instanceId] = nil
    end
  end,
}

