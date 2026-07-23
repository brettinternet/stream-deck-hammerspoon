-- Stream Deck action: shared live histories sampled only for visible metric selections.

local helpers = require("streamdeck.helpers")

local action_id = "com.brettinternet.hammerspoon.system-monitor"
local sample_interval = 1
local default_window_seconds = 120
local minimum_window_seconds = 30
local maximum_window_seconds = 3600
local caution_threshold = 70
local warning_threshold = 80

local green_background_color = "#0D2818"
local green_fill_color = "#1B7F3A"
local green_stroke_color = "#34C759"
local yellow_background_color = "#2B250B"
local yellow_fill_color = "#8A6D13"
local yellow_stroke_color = "#FFD60A"
local red_background_color = "#2B1114"
local red_fill_color = "#A61B1B"
local red_stroke_color = "#FF453A"

local metric_options = {
  { value = "cpu", label = "CPU" },
  { value = "memory", label = "Memory usage" },
  { value = "memory_pressure", label = "Memory pressure" },
  { value = "disk", label = "Disk usage" },
  { value = "network", label = "Network interface" },
  { value = "internet", label = "Internet reachability" },
  { value = "wifi", label = "Wi-Fi signal" },
  { value = "battery", label = "Battery charge" },
  { value = "battery_power", label = "Battery power" },
  { value = "thermal", label = "Thermal state" },
  { value = "idle", label = "Idle time" },
}

local metric_labels = {
  cpu = "CPU",
  memory = "Memory",
  memory_pressure = "Pressure",
  disk = "Disk",
  network = "Network",
  internet = "Internet",
  wifi = "Wi-Fi",
  battery = "Battery",
  battery_power = "Battery",
  thermal = "Thermal",
  idle = "Idle",
}

local metric_kinds = {
  network = "latest",
  internet = "latest",
  thermal = "latest",
}

local visible_contexts = {}
local requested_metrics = {}
local requested_windows = {}
local histories = {}
local values = {}
for _, option in ipairs(metric_options) do
  requested_metrics[option.value] = false
  requested_windows[option.value] = default_window_seconds
  histories[option.value] = { samples = {}, first = 1 }
  values[option.value] = 0
end

local thermal_state = "Unknown"
local monitor_timer
local timer_generation = 0
local previous_ticks
local previous_vm_pressure
local has_valid_cpu = false
local fallback_timestamp = 0
local last_sample_timestamp = 0
local internet_reachability

local function finite_number(value)
  return type(value) == "number"
    and value == value
    and value ~= math.huge
    and value ~= -math.huge
end

local function settings_for(context)
  if context and type(context.getSettings) == "function" then
    return context:getSettings()
  elseif context then
    return context.settings
  end
  return nil
end

local function metric_for(context)
  local settings = settings_for(context)
  if type(settings) == "table" and requested_metrics[settings.metric] ~= nil then
    return settings.metric
  end
  return "cpu"
end

local function window_for(context)
  local settings = settings_for(context)
  local window = type(settings) == "table" and settings.windowSeconds or nil
  if finite_number(window)
    and window >= minimum_window_seconds
    and window <= maximum_window_seconds then
    return window
  end
  return default_window_seconds
end

local function require_system_monitor_api()
  if type(hs) ~= "table"
    or type(hs.timer) ~= "table"
    or type(hs.timer.doEvery) ~= "function" then
    error("system monitor requires hs.timer.doEvery")
  end
end

local function clear_history(metric)
  histories[metric] = { samples = {}, first = 1 }
end

local function history_count(metric)
  local history = histories[metric]
  return #history.samples - history.first + 1
end

local function compact_history(history)
  if history.first <= 64 or history.first * 2 <= #history.samples then
    return
  end
  local compacted = {}
  for index = history.first, #history.samples do
    compacted[#compacted + 1] = history.samples[index]
  end
  history.samples = compacted
  history.first = 1
end

local function prune_history(metric, timestamp)
  local history = histories[metric]
  local cutoff = timestamp - requested_windows[metric]
  while history.first <= #history.samples and history.samples[history.first].timestamp < cutoff do
    history.first = history.first + 1
  end
  compact_history(history)
end

local function append_sample(metric, value, timestamp)
  local history = histories[metric]
  history.samples[#history.samples + 1] = { timestamp = timestamp, value = value }
  prune_history(metric, timestamp)
end

local function record(metric, value, timestamp)
  values[metric] = value
  append_sample(metric, value, timestamp)
end

local function sample_timestamp(hsapi)
  local timer = type(hsapi) == "table" and hsapi.timer or nil
  if type(timer) == "table" and type(timer.absoluteTime) == "function" then
    local ok, nanoseconds = pcall(timer.absoluteTime)
    if ok and finite_number(nanoseconds) and nanoseconds >= 0 then
      return nanoseconds / 1000000000
    end
  end
  fallback_timestamp = fallback_timestamp + sample_interval
  return fallback_timestamp
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

local function memory_pressure_rate(snapshot, timestamp)
  if type(snapshot) ~= "table" then
    return nil
  end
  local page_outs = snapshot.pageOuts
  local swap_outs = snapshot.swapOuts
  if not finite_number(page_outs) or page_outs < 0
    or not finite_number(swap_outs) or swap_outs < 0 then
    return nil
  end

  local current = {
    page_outs = page_outs,
    swap_outs = swap_outs,
    timestamp = timestamp,
  }
  local previous = previous_vm_pressure
  previous_vm_pressure = current
  if not previous then
    return 0
  end

  local elapsed = timestamp - previous.timestamp
  local page_out_delta = current.page_outs - previous.page_outs
  local swap_out_delta = current.swap_outs - previous.swap_outs
  if elapsed <= 0 or page_out_delta < 0 or swap_out_delta < 0 then
    return nil
  end
  return (page_out_delta + swap_out_delta) / elapsed
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
  return ({
    nominal = 0,
    fair = 33,
    serious = 67,
    critical = 100,
  })[type(state) == "string" and state:lower() or ""]
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
    requested_windows[metric] = default_window_seconds
  end
  for instance_id, context in pairs(visible_contexts) do
    if visible_contexts[instance_id] == context then
      local metric = metric_for(context)
      requested_metrics[metric] = true
      requested_windows[metric] = math.max(requested_windows[metric], window_for(context))
    end
  end
  return requested_metrics
end

local function sample_cpu(hsapi, timestamp)
  if type(hsapi.host) ~= "table" or type(hsapi.host.cpuUsageTicks) ~= "function" then
    return false
  end
  local ok, ticks = pcall(hsapi.host.cpuUsageTicks)
  if not ok then
    return false
  end
  local cpu = cpu_from_ticks(ticks)
  if cpu ~= nil then
    has_valid_cpu = true
  elseif has_valid_cpu then
    cpu = values.cpu
  else
    cpu = values.cpu
  end
  record("cpu", cpu, timestamp)
  return true
end

local function sample_memory_metrics(hsapi, active, timestamp)
  if type(hsapi.host) ~= "table" or type(hsapi.host.vmStat) ~= "function" then
    return false
  end
  local ok, vm_stat = pcall(hsapi.host.vmStat)
  if not ok then
    return false
  end

  local sampled = false
  if active.memory then
    local memory = ram_percentage(vm_stat)
    if memory ~= nil then
      record("memory", memory, timestamp)
      sampled = true
    end
  end
  if active.memory_pressure then
    local pressure = memory_pressure_rate(vm_stat, timestamp)
    if pressure ~= nil then
      record("memory_pressure", pressure, timestamp)
      sampled = true
    end
  end
  return sampled
end

local function sample_disk(hsapi, timestamp)
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
  record("disk", disk, timestamp)
  return true
end

local function sample_network(hsapi, timestamp)
  if type(hsapi.network) ~= "table" or type(hsapi.network.primaryInterfaces) ~= "function" then
    return false
  end
  local ok, ipv4, ipv6 = pcall(hsapi.network.primaryInterfaces)
  if not ok then
    return false
  end
  record("network", (ipv4 or ipv6) and 100 or 0, timestamp)
  return true
end

local function sample_internet(hsapi, timestamp)
  local network = type(hsapi.network) == "table" and hsapi.network or nil
  local reachability = network and network.reachability
  if type(reachability) ~= "table" then
    return false
  end
  if internet_reachability == nil then
    if type(reachability.internet) ~= "function" then
      return false
    end
    local ok, object = pcall(reachability.internet)
    if not ok or object == nil then
      return false
    end
    internet_reachability = object
  end
  if type(internet_reachability.statusString) ~= "function" then
    return false
  end
  local ok, status = pcall(internet_reachability.statusString, internet_reachability)
  if not ok or type(status) ~= "string" then
    return false
  end
  record("internet", status:sub(2, 2) == "R" and 100 or 0, timestamp)
  return true
end

local function sample_wifi(hsapi, timestamp)
  if type(hsapi.wifi) ~= "table" or type(hsapi.wifi.interfaceDetails) ~= "function" then
    return false
  end
  local ok, details = pcall(hsapi.wifi.interfaceDetails)
  local rssi = ok and type(details) == "table" and details.rssi or nil
  if not finite_number(rssi) or rssi >= 0 then
    return false
  end
  record("wifi", rssi, timestamp)
  return true
end

local function sample_battery(hsapi, timestamp)
  if type(hsapi.battery) ~= "table" or type(hsapi.battery.percentage) ~= "function" then
    return false
  end
  local ok, percentage = pcall(hsapi.battery.percentage)
  if not ok or not finite_number(percentage) or percentage < 0 or percentage > 100 then
    return false
  end
  record("battery", percentage, timestamp)
  return true
end

local function sample_battery_power(hsapi, timestamp)
  if type(hsapi.battery) ~= "table" or type(hsapi.battery.watts) ~= "function" then
    return false
  end
  local ok, watts = pcall(hsapi.battery.watts)
  if not ok or not finite_number(watts) then
    return false
  end
  record("battery_power", watts, timestamp)
  return true
end

local function sample_thermal(hsapi, timestamp)
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
  record("thermal", thermal, timestamp)
  return true
end

local function sample_idle(hsapi, timestamp)
  if type(hsapi.host) ~= "table" or type(hsapi.host.idleTime) ~= "function" then
    return false
  end
  local ok, idle = pcall(hsapi.host.idleTime)
  if not ok or not finite_number(idle) or idle < 0 then
    return false
  end
  record("idle", idle, timestamp)
  return true
end

local samplers = {
  cpu = sample_cpu,
  disk = sample_disk,
  network = sample_network,
  internet = sample_internet,
  wifi = sample_wifi,
  battery = sample_battery,
  battery_power = sample_battery_power,
  thermal = sample_thermal,
  idle = sample_idle,
}

local function sample()
  if monitor_timer == nil or next(visible_contexts) == nil then
    return
  end

  local active = selected_metrics()
  if not active.cpu and history_count("cpu") > 0 then
    previous_ticks = nil
    has_valid_cpu = false
    values.cpu = 0
    clear_history("cpu")
  end
  if not active.memory_pressure then
    previous_vm_pressure = nil
  end

  local hsapi = hs
  local timestamp = sample_timestamp(hsapi)
  last_sample_timestamp = timestamp
  local sampled = false
  if active.memory or active.memory_pressure then
    sampled = sample_memory_metrics(hsapi, active, timestamp)
  end
  for metric, sampler in pairs(samplers) do
    if active[metric] and sampler(hsapi, timestamp) then
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
  previous_vm_pressure = nil
  has_valid_cpu = false
  thermal_state = "Unknown"
  fallback_timestamp = 0
  last_sample_timestamp = 0
  internet_reachability = nil
  for metric in pairs(histories) do
    clear_history(metric)
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

local function aggregated_values(metric, context)
  local history = histories[metric]
  local window = window_for(context)
  local cutoff = last_sample_timestamp - window
  local first = history.first
  while first <= #history.samples and history.samples[first].timestamp < cutoff do
    first = first + 1
  end
  local count = #history.samples - first + 1
  if count <= 0 then
    return {}
  end

  local columns = helpers.imageSize(context)
  if count <= columns then
    local raw_values = {}
    for index = first, #history.samples do
      raw_values[#raw_values + 1] = history.samples[index].value
    end
    return raw_values
  end

  local buckets = {}
  for index = first, #history.samples do
    local sample = history.samples[index]
    local bucket = math.min(columns, math.floor((sample.timestamp - cutoff) / window * columns) + 1)
    local entry = buckets[bucket]
    if entry == nil then
      entry = { total = 0, count = 0, last = sample.value }
      buckets[bucket] = entry
    end
    entry.total = entry.total + sample.value
    entry.count = entry.count + 1
    entry.last = sample.value
  end

  local summarized = {}
  for bucket = 1, columns do
    local entry = buckets[bucket]
    if entry ~= nil then
      summarized[#summarized + 1] = metric_kinds[metric] == "latest"
        and entry.last
        or entry.total / entry.count
    end
  end
  return summarized
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

local function history_min(history, maximum)
  local minimum = maximum
  for _, value in ipairs(history) do
    minimum = math.min(minimum, value)
  end
  return minimum
end

local function colors_for(level)
  if level == "red" then
    return red_background_color, red_fill_color, red_stroke_color
  elseif level == "yellow" then
    return yellow_background_color, yellow_fill_color, yellow_stroke_color
  end
  return green_background_color, green_fill_color, green_stroke_color
end

local function level_for(metric, value)
  if metric == "network" or metric == "internet" then
    return value > 0 and "green" or "red"
  elseif metric == "thermal" then
    if value >= 67 then
      return "red"
    elseif value >= 33 then
      return "yellow"
    end
  elseif metric == "battery" then
    if value <= 20 then
      return "red"
    elseif value <= 40 then
      return "yellow"
    end
  elseif metric == "wifi" then
    if value <= -75 then
      return "red"
    elseif value <= -60 then
      return "yellow"
    end
  elseif metric == "memory_pressure" then
    if value >= 5 then
      return "red"
    elseif value > 0 then
      return "yellow"
    end
  elseif metric ~= "idle" and metric ~= "battery_power" then
    if value > warning_threshold then
      return "red"
    elseif value >= caution_threshold then
      return "yellow"
    end
  end
  return "green"
end

local function appearance_for(context)
  local metric = metric_for(context)
  local value = values[metric]
  local title = string.format("%s %d%%", metric_labels[metric], rounded_percentage(value))
  local minimum = 0
  local maximum = 100
  local chart_values = aggregated_values(metric, context)

  if metric == "network" then
    title = value > 0 and "Network\nUp" or "Network\nDown"
  elseif metric == "internet" then
    title = value > 0 and "Internet\nUp" or "Internet\nDown"
  elseif metric == "wifi" then
    title = string.format("Wi-Fi\n%d dBm", rounded_percentage(value))
    minimum = -90
    maximum = -30
  elseif metric == "battery" then
    title = string.format("Battery %d%%", rounded_percentage(value))
  elseif metric == "battery_power" then
    title = string.format("Battery\n%.1f W", value)
    local magnitude = math.max(math.abs(history_min(chart_values, 0)), math.abs(history_max(chart_values, 0)), 1)
    minimum = -magnitude
    maximum = magnitude
  elseif metric == "thermal" then
    title = "Thermal\n" .. thermal_state
  elseif metric == "memory_pressure" then
    title = string.format("Pressure\n%.1f/s", value)
    maximum = history_max(chart_values, 1)
  elseif metric == "idle" then
    title = "Idle\n" .. idle_label(value)
    maximum = history_max(chart_values, 60)
  end

  local background_color, fill_color, stroke_color = colors_for(level_for(metric, value))
  return {
    title = title,
    state = "inactive",
    appearanceVersion = 1,
    icon = helpers.areaChart(
      context,
      chart_values,
      {
        min = minimum,
        max = maximum,
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
      description = "Disk usage is for the root volume; network interface requires a primary IPv4 or IPv6 interface.",
      options = metric_options,
      default = "cpu",
    },
    {
      type = "number",
      key = "windowSeconds",
      label = "Chart window (seconds)",
      description = "Raw samples are retained for the largest visible window and summarized to the key width.",
      min = minimum_window_seconds,
      max = maximum_window_seconds,
      step = 30,
      default = default_window_seconds,
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
