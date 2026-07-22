-- Stream Deck action: a Stream Deck key for a per-key 25-minute focus timer.
-- Press once to start the timer, press again to cancel it, or let it finish to return the key to Ready.

local focus_duration = 25 * 60
local state_by_instance = {}

local function stop_timer(state)
  if state.timer then
    state.timer:stop()
    state.timer = nil
  end
end

return {
  id = "com.brettinternet.hammerspoon.focus-timer",
  name = "Focus timer",
  description = "Start a 25-minute focus timer, or cancel it while running.",
  category = "Productivity",
  gesture = "Press: start or cancel the focus timer",

  appear = function(context)
    state_by_instance[context.instanceId] = {
      running = false,
      timer = nil,
    }
  end,

  appearance = function(context)
    local state = state_by_instance[context.instanceId]
    if state and state.running then
      return {
        title = "Focus",
        state = "active",
      }
    end

    return {
      title = "Ready",
      state = "inactive",
    }
  end,

  press = function(context)
    local instance_id = context.instanceId
    local state = state_by_instance[instance_id]
    if not state then
      state = {
        running = false,
        timer = nil,
      }
      state_by_instance[instance_id] = state
    end

    if state.running then
      stop_timer(state)
      state.running = false
      context:success("Focus cancelled", 850)
      return
    end

    if not hs.timer or type(hs.timer.doAfter) ~= "function" then
      error("focus timer unavailable")
    end

    local ok, timer_or_error = pcall(hs.timer.doAfter, focus_duration, function()
      if state_by_instance[instance_id] ~= state then
        return
      end

      state.timer = nil
      state.running = false
      context:success("Focus complete", 1000)
      context:refresh()
    end)
    if not ok then
      error("failed to start focus timer: " .. tostring(timer_or_error))
    end
    if timer_or_error == nil or type(timer_or_error.stop) ~= "function" then
      error("failed to start focus timer")
    end

    state.timer = timer_or_error
    state.running = true
    context:success("Focus started", 850)
  end,

  disappear = function(context)
    local state = state_by_instance[context.instanceId]
    if state then
      stop_timer(state)
      state_by_instance[context.instanceId] = nil
    end
  end,
}

