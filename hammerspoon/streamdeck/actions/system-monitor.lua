-- Stream Deck action: shared live histories sampled only for visible metric selections.

local helpers = require("streamdeck.helpers")

local action_id = "com.brettinternet.hammerspoon.system-monitor"
local sample_interval = 1
local history_limit = 120
local warning_threshold = 80
local healthy_background_color = "#0D2818"
local healthy_fill_color = "#34C759"
local healthy_stroke_color = "#1B7F3A"
local warning_background_color = "#2B1114"
local warning_fill_color = "#FF453A"
local warning_stroke_color = "#A61B1B"

local metric_options = {
  { value = "cpu", label = "CPU" },
  { value = "memory", label = "Memory" },
  { value = "disk", label = "Disk usage" },
  { value = "network", label = "Network status" },
  { value = "thermal", label = "Thermal state" },
  { value = "idle", label = "Idle time" },
}

local metric_labels = {
  cpu = "CPU",
  memory = "Memory",
  disk = "Disk",
  network = "Network",
  thermal = "Thermal",
  idle = "Idle",
}

local visible_contexts = {}
local requested_metrics = {
  cpu = false,
  memory = false,
  disk = false,
  network = false,
  thermal = false,
  idle = false,
}
local histories = {
  cpu = {},
  memory = {},
  disk = {},
  network = {},
  thermal = {},
  idle = {},
}
local values = {
  cpu = 0,
  memory = 0,
  disk = 0,
  network = 0,
  thermal = 0,
  idle = 0,
}
local thermal_state = "Unknown"
local monitor_timer
local timer_generation = 0
local previous_ticks
local has_valid_cpu = false

local function finite_number(value)
  return type(value) == "number"
    and value == value
    and value ~= math.huge
    and value ~= -math.huge
end

local function metric_for(context)
  local settings = nil
  if context and type(context.getSettings) == "function" then
    settings = context:getSettings()
  elseif context then
    settings = context.settings
  end
  if type(settings) == "table" and requested_metrics[settings.metric] ~= nil then
    return settings.metric
  end
  return "cpu"
end

local function require_system_monitor_api()
  if type(hs) ~= "table"
    or type(hs.timer) ~= "table"
    or type(hs.timer.doEvery) ~= "function" then
    error("system monitor requires hs.timer.doEvery")
  end
end

local function append_sample(history, value)
  if #history == history_limit then
    table.remove(history, 1)
  end
  history[#history + 1] = value
end

local function record(metric, value)
  values[metric] = value
  append_sample(histories[metric], value)
end

local function tick_totals(snapshot)
  if type(snapshot) ~= "table" then
    return nil
  end

  local ticks = type(snapshot.overall) == "table" and snapshot.overall or snapshot
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
  return math.max(0, math.min(percentage, 100))
end

local function disk_percentage(volumes)
  if type(volumes) ~= "table" then
    return nil
  end
  local root = volumes["/"]
  if type(root) ~= "table" then
    return nil
  end
  local total = root.NSURLVolumeTotalCapacityKey
  local available = root.NSURLVolumeAvailableCapacityKey
  if not finite_number(total) or total <= 0
    or not finite_number(available) or available < 0 then
    return nil
  end
  return math.max(0, math.min((total - available) / total * 100, 100))
end

local function thermal_percentage(state)
  local value = ({
    nominal = 0,
    fair = 33,
    serious = 67,
    critical = 100,
  })[type(state) == "string" and state:lower() or ""]
  return value
end

local function refresh_visible_contexts()
  for instance_id, context in pairs(visible_contexts) do
    if visible_contexts[instance_id] == context and type(context.refresh) == "function" then
      pcall(context.refresh, context)
    end
  end
end

local function selected_metrics()
  for metric in pairs(requested_metrics) do
    requested_metrics[metric] = false
  end
  for instance_id, context in pairs(visible_contexts) do
    if visible_contexts[instance_id] == context then
      requested_metrics[metric_for(context)] = true
    end
  end
  return requested_metrics
end

local function sample_cpu(hsapi)
  if type(hsapi.host) ~= "table" or type(hsapi.host.cpuUsageTicks) ~= "function" then
    return false
  end
  local ok, ticks = pcall(hsapi.host.cpuUsageTicks)
  if not ok then
    return false
  end
  local cpu = cpu_from_ticks(ticks)
  if cpu ~= nil then
    values.cpu = cpu
    has_valid_cpu = true
  elseif has_valid_cpu then
    cpu = values.cpu
  end
  if cpu == nil then
    append_sample(histories.cpu, values.cpu)
    return true
  end
  append_sample(histories.cpu, cpu)
  return true
end

local function sample_memory(hsapi)
  if type(hsapi.host) ~= "table" or type(hsapi.host.vmStat) ~= "function" then
    return false
  end
  local ok, vm_stat = pcall(hsapi.host.vmStat)
  if not ok then
    return false
  end
  local memory = ram_percentage(vm_stat)
  if memory == nil then
    return false
  end
  record("memory", memory)
  return true
end

local function sample_disk(hsapi)
  if type(hsapi.host) ~= "table" or type(hsapi.host.volumeInformation) ~= "function" then
    return false
  end
  local ok, volumes = pcall(hsapi.host.volumeInformation)
  if not ok then
    return false
  end
  local disk = disk_percentage(volumes)
  if disk == nil then
    return false
  end
  record("disk", disk)
  return true
end

local function sample_network(hsapi)
  if type(hsapi.network) ~= "table" or type(hsapi.network.primaryInterfaces) ~= "function" then
    return false
  end
  local ok, ipv4, ipv6 = pcall(hsapi.network.primaryInterfaces)
  if not ok then
    return false
  end
  record("network", (ipv4 or ipv6) and 100 or 0)
  return true
end

local function sample_thermal(hsapi)
  if type(hsapi.host) ~= "table" or type(hsapi.host.thermalState) ~= "function" then
    return false
  end
  local ok, state = pcall(hsapi.host.thermalState)
  if not ok then
    return false
  end
  local thermal = thermal_percentage(state)
  if thermal == nil then
    return false
  end
  thermal_state = state
  record("thermal", thermal)
  return true
end

local function sample_idle(hsapi)
  if type(hsapi.host) ~= "table" or type(hsapi.host.idleTime) ~= "function" then
    return false
  end
  local ok, idle = pcall(hsapi.host.idleTime)
  if not ok or not finite_number(idle) or idle < 0 then
    return false
  end
  record("idle", idle)
  return true
end

local samplers = {
  cpu = sample_cpu,
  memory = sample_memory,
  disk = sample_disk,
  network = sample_network,
  thermal = sample_thermal,
  idle = sample_idle,
}

local function sample()
  if monitor_timer == nil or next(visible_contexts) == nil then
    return
  end

  local active = selected_metrics()
  if not active.cpu and #histories.cpu > 0 then
    previous_ticks = nil
    has_valid_cpu = false
    values.cpu = 0
    histories.cpu = {}
  end

  local sampled = false
  local hsapi = hs
  for metric, sampler in pairs(samplers) do
    if active[metric] and sampler(hsapi) then
      sampled = true
    end
  end
  if sampled then
    refresh_visible_contexts()
  end
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
  has_valid_cpu = false
  thermal_state = "Unknown"
  for metric in pairs(histories) do
    histories[metric] = {}
    values[metric] = 0
  end
end

local function stop_timer_and_reset()
  local timer = monitor_timer
  monitor_timer = nil
  timer_generation = timer_generation + 1
  if timer then
    pcall(timer.stop, timer)
  end
  reset_measurements()
end

local function history_values(history)
  local values_copy = {}
  for index, value in ipairs(history) do
    values_copy[index] = value
  end
  return values_copy
end

local function rounded_percentage(value)
  return math.floor(value + 0.5)
end

local function idle_label(seconds)
  if seconds < 60 then
    return string.format("%ds", math.floor(seconds + 0.5))
  end
  return string.format("%dm", math.floor(seconds / 60 + 0.5))
end

local function history_max(history, minimum)
  local maximum = minimum
  for _, value in ipairs(history) do
    maximum = math.max(maximum, value)
  end
  return maximum
end

local function appearance_for(context)
  local metric = metric_for(context)
  local value = values[metric]
  local title = string.format("%s %d%%", metric_labels[metric], rounded_percentage(value))
  local max = 100
  local warning = value > warning_threshold

  if metric == "network" then
    title = value > 0 and "Network\nUp" or "Network\nDown"
    warning = value == 0
  elseif metric == "thermal" then
    title = "Thermal\n" .. thermal_state
    warning = value > 33
  elseif metric == "idle" then
    title = "Idle\n" .. idle_label(value)
    max = history_max(histories.idle, 60)
    warning = false
  end

  local background_color = warning and warning_background_color or healthy_background_color
  local fill_color = warning and warning_fill_color or healthy_fill_color
  local stroke_color = warning and warning_stroke_color or healthy_stroke_color

  return {
    title = title,
    state = "inactive",
    appearanceVersion = 1,
    icon = helpers.areaChart(
      context,
      history_values(histories[metric]),
      {
        min = 0,
        max = max,
        backgroundColor = background_color,
        fillColor = fill_color,
        strokeColor = stroke_color,
        strokeWidth = 2,
      }
    ),
  }
end

return {
  id = action_id,
  name = "System monitor",
  description = "View a selected live metric; only visible metric selections are sampled.",
  category = "System",
  gesture = "Press: show metric-setting hint",
  settingsSchemaVersion = 2,
  settingsSchema = {
    {
      type = "select",
      key = "metric",
      label = "System metric",
      description = "Metric shown on this key. Disk usage is for the root volume; network status requires a primary IPv4 or IPv6 interface.",
      options = metric_options,
      default = "cpu",
    },
  },

  appear = function(context)
    local instance_id = context.instanceId
    if visible_contexts[instance_id] == context then
      return
    end

    local first_instance = next(visible_contexts) == nil
    if first_instance then
      require_system_monitor_api()
      reset_measurements()
    end

    visible_contexts[instance_id] = context

    if first_instance then
      local ok, err = pcall(start_timer)
      if not ok then
        visible_contexts[instance_id] = nil
        stop_timer_and_reset()
        error(err, 0)
      end
    end
  end,

  appearance = function(context)
    return appearance_for(context)
  end,

  press = function(context)
    context:success("Configure\nmetric", 850)
  end,

  disappear = function(context)
    local instance_id = context.instanceId
    if visible_contexts[instance_id] ~= context then
      return
    end
    visible_contexts[instance_id] = nil
    if next(visible_contexts) == nil then
      stop_timer_and_reset()
    end
  end,
}
