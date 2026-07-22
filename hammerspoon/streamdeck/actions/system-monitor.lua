-- Stream Deck action: a shared live CPU and RAM history for every visible key.

local helpers = require("streamdeck.helpers")

local action_id = "com.brettinternet.hammerspoon.system-monitor"
local sample_interval = 1
local history_limit = 120
local cpu_color = "#2196F3"
local ram_color = "#FF9800"
local background_color = "#111827"

local visible_contexts = {}
local metric_by_instance = {}
local cpu_history = {}
local ram_history = {}
local monitor_timer
local timer_generation = 0
local previous_ticks
local last_cpu = 0
local last_ram = 0
local has_valid_cpu = false

local function finite_number(value)
  return type(value) == "number"
    and value == value
    and value ~= math.huge
    and value ~= -math.huge
end

local function require_system_monitor_apis()
  if type(hs) ~= "table"
    or type(hs.host) ~= "table"
    or type(hs.host.cpuUsageTicks) ~= "function" then
    error("system monitor requires hs.host.cpuUsageTicks")
  end
  if type(hs.host.vmStat) ~= "function" then
    error("system monitor requires hs.host.vmStat")
  end
  if type(hs.timer) ~= "table" or type(hs.timer.doEvery) ~= "function" then
    error("system monitor requires hs.timer.doEvery")
  end
end

local function append_sample(history, value)
  if #history == history_limit then
    table.remove(history, 1)
  end
  history[#history + 1] = value
end

local function tick_totals(snapshot)
  if type(snapshot) ~= "table" then
    return nil
  end

  local ticks = snapshot
  if type(snapshot.overall) == "table" then
    ticks = snapshot.overall
  end

  local active = 0
  local total = 0
  local has_ticks = false
  for _, field in ipairs({ "user", "nice", "system", "interrupt", "idle" }) do
    local value = ticks[field]
    if value ~= nil then
      if not finite_number(value) or value < 0 then
        return nil
      end
      has_ticks = true
      total = total + value
      if field ~= "idle" then
        active = active + value
      end
    end
  end

  if not has_ticks or ticks.idle == nil or total <= 0 then
    return nil
  end
  return { active = active, total = total }
end

local function cpu_from_ticks(snapshot)
  local current = tick_totals(snapshot)
  if not current then
    return nil
  end

  local result
  if previous_ticks then
    local active_delta = current.active - previous_ticks.active
    local total_delta = current.total - previous_ticks.total
    if active_delta >= 0 and total_delta > 0 and active_delta <= total_delta then
      result = (active_delta / total_delta) * 100
    end
  end
  previous_ticks = current
  return result
end

local function ram_percentage(snapshot)
  if type(snapshot) ~= "table" then
    return nil
  end

  local active = snapshot.pagesActive
  local wired = snapshot.pagesWiredDown
  local compressor = snapshot.pagesUsedByVMCompressor
  local page_size = snapshot.pageSize
  local memory_size = snapshot.memSize
  if not finite_number(active) or active < 0
    or not finite_number(wired) or wired < 0
    or not finite_number(compressor) or compressor < 0
    or not finite_number(page_size) or page_size <= 0
    or not finite_number(memory_size) or memory_size <= 0 then
    return nil
  end

  local percentage = (active + wired + compressor) * page_size / memory_size * 100
  if percentage < 0 then
    return 0
  end
  if percentage > 100 then
    return 100
  end
  return percentage
end

local function refresh_visible_contexts()
  for instance_id, context in pairs(visible_contexts) do
    if visible_contexts[instance_id] == context and type(context.refresh) == "function" then
      pcall(context.refresh, context)
    end
  end
end

local function sample()
  if monitor_timer == nil or next(visible_contexts) == nil then
    return
  end

  local hsapi = hs
  local ticks_ok, ticks = pcall(function()
    return hsapi.host.cpuUsageTicks()
  end)
  if not ticks_ok then
    return
  end
  local vm_ok, vm_stat = pcall(function()
    return hsapi.host.vmStat()
  end)
  if not vm_ok then
    return
  end

  local cpu = cpu_from_ticks(ticks)
  if cpu ~= nil then
    last_cpu = cpu
    has_valid_cpu = true
  elseif has_valid_cpu then
    cpu = last_cpu
  end

  local ram = ram_percentage(vm_stat)
  if ram == nil then
    return
  end
  last_ram = ram

  if cpu ~= nil then
    append_sample(cpu_history, cpu)
  end
  append_sample(ram_history, ram)
  refresh_visible_contexts()
end

local function start_timer()
  timer_generation = timer_generation + 1
  local generation = timer_generation
  local ok, timer_or_error = pcall(hs.timer.doEvery, sample_interval, function()
    if monitor_timer == nil or timer_generation ~= generation or next(visible_contexts) == nil then
      return
    end
    sample()
  end)
  if not ok then
    timer_generation = timer_generation + 1
    error("failed to start system monitor timer: " .. tostring(timer_or_error))
  end
  if timer_or_error == nil or type(timer_or_error.stop) ~= "function" then
    timer_generation = timer_generation + 1
    error("failed to start system monitor timer")
  end
  monitor_timer = timer_or_error
end

local function reset_measurements()
  previous_ticks = nil
  last_cpu = 0
  last_ram = 0
  has_valid_cpu = false
  cpu_history = {}
  ram_history = {}
end

local function stop_timer_and_reset()
  local timer = monitor_timer
  monitor_timer = nil
  timer_generation = timer_generation + 1
  if timer then
    pcall(timer.stop, timer)
  end
  reset_measurements()
  metric_by_instance = {}
end

local function history_values(history)
  local values = {}
  for index, value in ipairs(history) do
    values[index] = value
  end
  return values
end

local function rounded_percentage(value)
  return math.floor(value + 0.5)
end

local function appearance_for(context)
  local instance_id = context.instanceId
  local metric = metric_by_instance[instance_id] or "cpu"
  local is_cpu = metric == "cpu"
  local value = is_cpu and last_cpu or last_ram
  local title = string.format(
    "%s %d%%",
    is_cpu and "CPU" or "RAM",
    rounded_percentage(value)
  )

  return {
    title = title,
    state = "inactive",
    appearanceVersion = 1,
    icon = helpers.areaChart(
      history_values(is_cpu and cpu_history or ram_history),
      {
        size = 72,
        min = 0,
        max = 100,
        backgroundColor = background_color,
        fillColor = is_cpu and cpu_color or ram_color,
      }
    ),
  }
end
return {
  id = action_id,
  name = "System monitor",

  appear = function(context)
    local instance_id = context.instanceId
    if visible_contexts[instance_id] == context then
      return
    end

    local first_instance = next(visible_contexts) == nil
    if first_instance then
      require_system_monitor_apis()
      reset_measurements()
    end

    visible_contexts[instance_id] = context
    metric_by_instance[instance_id] = "cpu"

    if first_instance then
      local ok, err = pcall(start_timer)
      if not ok then
        visible_contexts[instance_id] = nil
        metric_by_instance[instance_id] = nil
        stop_timer_and_reset()
        error(err, 0)
      end
    end
  end,

  appearance = function(context)
    return appearance_for(context)
  end,

  press = function(context)
    local instance_id = context.instanceId
    if visible_contexts[instance_id] ~= context then
      return
    end
    if metric_by_instance[instance_id] == "ram" then
      metric_by_instance[instance_id] = "cpu"
    else
      metric_by_instance[instance_id] = "ram"
    end
  end,

  disappear = function(context)
    local instance_id = context.instanceId
    if visible_contexts[instance_id] ~= context then
      return
    end
    visible_contexts[instance_id] = nil
    metric_by_instance[instance_id] = nil
    if next(visible_contexts) == nil then
      stop_timer_and_reset()
    end
  end,
}
