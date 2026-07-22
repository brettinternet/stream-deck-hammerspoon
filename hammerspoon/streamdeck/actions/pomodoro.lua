-- Stream Deck action: a per-key Pomodoro session with timed work and breaks.
-- Press to run four 25-minute focus cycles with 5-minute breaks and a final 15-minute break; press to reset.

local action_id = "com.brettinternet.hammerspoon.pomodoro"
local focus_duration = 25 * 60
local short_break_duration = 5 * 60
local long_break_duration = 15 * 60
local cycles_per_session = 4
local state_by_instance = {}

local function new_state()
  return {
    phase = "ready",
    cycle = 0,
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
    or type(hs.timer.doAfter) ~= "function" then
    error("pomodoro timer unavailable")
  end
end

local function schedule(state, instance_id, seconds, callback)
  require_timer_api()

  state.generation = state.generation + 1
  local generation = state.generation
  local ok, timer_or_error = pcall(hs.timer.doAfter, seconds, function()
    if state_by_instance[instance_id] ~= state or state.generation ~= generation then
      return
    end

    state.timer = nil
    callback()
  end)
  if not ok then
    error("failed to schedule pomodoro timer: " .. tostring(timer_or_error))
  end
  if timer_or_error == nil or type(timer_or_error.stop) ~= "function" then
    error("failed to schedule pomodoro timer")
  end

  state.timer = timer_or_error
end

local function refresh(context)
  context:refresh()
end

local function finish_focus(context, state, instance_id)
  if state.cycle < cycles_per_session then
    state.phase = "short-break"
    schedule(state, instance_id, short_break_duration, function()
      state.cycle = state.cycle + 1
      state.phase = "focus"
      schedule(state, instance_id, focus_duration, function()
        finish_focus(context, state, instance_id)
      end)
      refresh(context)
    end)
    refresh(context)
    return
  end

  state.phase = "long-break"
  schedule(state, instance_id, long_break_duration, function()
    state.phase = "complete"
    state.cycle = 0
    refresh(context)
  end)
  refresh(context)
end

local function start_session(context, state)
  local instance_id = context.instanceId
  state.phase = "focus"
  state.cycle = 1

  local ok, err = pcall(function()
    schedule(state, instance_id, focus_duration, function()
      finish_focus(context, state, instance_id)
    end)
  end)
  if not ok then
    state.phase = "ready"
    state.cycle = 0
    state.timer = nil
    error(err)
  end

end

local function reset_session(state)
  stop_timer(state)
  state.phase = "ready"
  state.cycle = 0
end

local function appearance_for(state)
  if state.phase == "focus" then
    return {
      title = string.format("Focus %d/%d", state.cycle, cycles_per_session),
      state = "active",
    }
  end

  if state.phase == "short-break" then
    return {
      title = string.format("Break %d/%d", state.cycle, cycles_per_session),
      state = "active",
    }
  end

  if state.phase == "long-break" then
    return {
      title = "Long break",
      state = "active",
    }
  end

  if state.phase == "complete" then
    return {
      title = "Done",
      state = "inactive",
    }
  end

  return {
    title = "Start",
    state = "inactive",
  }
end

return {
  id = action_id,
  name = "Pomodoro session",

  appear = function(context)
    local state = state_for(context)
    stop_timer(state)
    state.phase = "ready"
    state.cycle = 0
  end,

  appearance = function(context)
    return appearance_for(state_for(context))
  end,

  press = function(context)
    local state = state_for(context)
    if state.phase == "focus"
      or state.phase == "short-break"
      or state.phase == "long-break" then
      reset_session(state)
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

