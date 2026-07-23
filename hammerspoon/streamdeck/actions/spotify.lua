-- Stream Deck action: Spotify playback, artwork, volume, and track controls.

local action_id = "com.brettinternet.hammerspoon.spotify"
local helpers = require("streamdeck.helpers")

local refresh_interval = 2
local volume_step = 2

local visible_contexts = {}
local refresh_timer
local artwork_url
local artwork_image
local artwork_icons_by_size = {}
local artwork_icon_attempted_by_size = {}
local requested_artwork_url
local snapshot = {
  running = false,
  playing = false,
  track = nil,
  artist = nil,
  position = 0,
  duration = 0,
  volume = 0,
}

local function require_spotify(method_name)
  if type(hs) ~= "table"
      or type(hs.spotify) ~= "table"
      or type(hs.spotify[method_name]) ~= "function" then
    error("Spotify action requires hs.spotify." .. method_name, 3)
  end
  return hs.spotify
end

local function refresh_visible_contexts()
  for _, context in pairs(visible_contexts) do
    context:refresh()
  end
end

local function clear_artwork_cache()
  artwork_image = nil
  artwork_icons_by_size = {}
  artwork_icon_attempted_by_size = {}
end

local function artwork_icon_for(context)
  local size = helpers.imageSize(context)
  if artwork_image == nil then
    return nil
  end
  if artwork_icon_attempted_by_size[size] then
    return artwork_icons_by_size[size]
  end
  artwork_icon_attempted_by_size[size] = true
  local icon = helpers.png(context, artwork_image)
  artwork_icons_by_size[size] = icon
  return icon
end

local function request_artwork(url)
  if url == artwork_url or url == requested_artwork_url then
    return
  end

  artwork_url = url
  clear_artwork_cache()
  requested_artwork_url = url
  if url == nil then
    return
  end
  if type(hs) ~= "table"
      or type(hs.image) ~= "table"
      or type(hs.image.imageFromURL) ~= "function" then
    error("Spotify action requires hs.image.imageFromURL", 3)
  end

  hs.image.imageFromURL(url, function(image)
    if artwork_url ~= url then
      return
    end
    artwork_image = image
    refresh_visible_contexts()
  end)
end

local function sample_spotify()
  local spotify = require_spotify("isRunning")
  local running = spotify.isRunning()
  if not running then
    snapshot = {
      running = false,
      playing = false,
      track = nil,
      volume = 0,
      artist = nil,
      position = 0,
      duration = 0,
    }
    request_artwork(nil)
    return
  end

  for _, method_name in ipairs({
    "getCurrentTrack",
    "getCurrentArtist",
    "getCurrentTrackArtworkURL",
    "getVolume",
    "getPosition",
    "getDuration",
    "isPlaying",
  }) do
    require_spotify(method_name)
  end

  local volume = spotify.getVolume()
  if type(volume) ~= "number" then
    volume = 0
  end
  volume = math.max(0, math.min(100, volume))
  local duration = spotify.getDuration()
  if type(duration) ~= "number" or duration ~= duration or duration <= 0 or duration == math.huge then
    duration = 0
  end
  local position = spotify.getPosition()
  if type(position) ~= "number" or position ~= position or position < 0 or position == math.huge then
    position = 0
  end
  if duration > 0 then position = math.min(position, duration) else position = 0 end
  snapshot = {
    running = true,
    playing = spotify.isPlaying() == true,
    track = spotify.getCurrentTrack(),
    artist = spotify.getCurrentArtist(),
    position = position,
    duration = duration,
    volume = volume,
  }
  request_artwork(spotify.getCurrentTrackArtworkURL())
end

local function start_refresh_timer()
  if type(hs) ~= "table"
      or type(hs.timer) ~= "table"
      or type(hs.timer.doEvery) ~= "function" then
    error("Spotify action requires hs.timer.doEvery", 3)
  end
  local timer = hs.timer.doEvery(refresh_interval, function()
    sample_spotify()
    refresh_visible_contexts()
  end)
  if timer == nil or type(timer.stop) ~= "function" then
    error("failed to start Spotify refresh timer", 3)
  end
  refresh_timer = timer
end

local function stop_refresh_timer()
  if refresh_timer ~= nil and type(refresh_timer.stop) == "function" then
    refresh_timer:stop()
  end
  refresh_timer = nil
end

local function dial_mode(context)
  local settings = context:getSettings()
  if type(settings) == "table" and settings.dialControl == "tracks" then
    return "tracks"
  end
  return "volume"
end

local function truncate_title(value, maximum)
  if type(value) ~= "string" or value == "" then return nil end
  local length = utf8.len(value)
  if length == nil or length <= maximum then return value end
  local offset = utf8.offset(value, maximum + 1)
  return value:sub(1, offset - 1) .. "…"
end

local function title_for_snapshot()
  if not snapshot.running then return "Spotify\nunavailable" end
  local track = truncate_title(snapshot.track, 22)
  local artist = truncate_title(snapshot.artist, 18)
  if artist and track then return artist .. "\n" .. track end
  return track or artist or "Spotify"
end

local function appearance_for(context)
  local artwork_icon = artwork_icon_for(context)
  local icon = artwork_icon or helpers.icon(
    "spotify",
    { foregroundColor = snapshot.running and "#1DB954" or helpers.colors.inactive }
  )
  local progress = snapshot.duration > 0 and snapshot.position / snapshot.duration or 0
  local device = type(context.getDevice) == "function" and context:getDevice() or nil
  local is_encoder = type(device) == "table" and device.controllerType == "encoder"
  if not snapshot.running then
    return {
      title = "Spotify\nunavailable",
      state = "inactive",
      appearanceVersion = 1,
      badge = "OFF",
      backgroundColor = "#1F2937",
      foregroundColor = helpers.colors.foreground,
      icon = icon,
      progress = 0,
    }
  end
  if not is_encoder then
    return {
      title = title_for_snapshot(),
      state = snapshot.playing and "active" or "inactive",
      appearanceVersion = 1,
      icon = icon,
      badge = snapshot.playing and "Ⅱ" or "▶",
      progress = progress,
      backgroundColor = "#102A1B",
      foregroundColor = helpers.colors.foreground,
    }
  end

  if dial_mode(context) == "tracks" then
    return {
      title = title_for_snapshot(),
      state = snapshot.playing and "active" or "inactive",
      appearanceVersion = 1,
      value = "Previous / Next",
      indicator = 50,
      icon = icon,
    }
  end

  return {
    title = "Spotify\nvolume",
    state = snapshot.playing and "active" or "inactive",
    appearanceVersion = 1,
    value = string.format("%d%%", math.floor(snapshot.volume + 0.5)),
    indicator = snapshot.volume,
    icon = icon,
  }
end

local function change_track(ticks)
  local spotify = require_spotify(ticks > 0 and "next" or "previous")
  local callback = ticks > 0 and spotify.next or spotify.previous
  for _ = 1, math.abs(ticks) do
    callback()
  end
end

return {
  id = action_id,
  name = "Spotify controls",
  description = "Press a key or encoder to play or pause Spotify, with artwork and playback state shown; rotate an encoder for volume or track changes.",
  category = "Media",
  gesture = "Press: play or pause · Dial: volume or track control",
  settingsSchemaVersion = 1,
  settingsSchema = {
    {
      type = "select",
      key = "dialControl",
      label = "Dial control",
      description = "Choose whether encoder rotation adjusts volume or moves to the previous or next track.",
      controllers = { "encoder" },
      options = {
        { value = "volume", label = "Volume" },
        { value = "tracks", label = "Previous / next track" },
      },
      default = "volume",
    },
  },

  appear = function(context)
    local first_instance = next(visible_contexts) == nil
    visible_contexts[context.instanceId] = context
    if first_instance then
      local ok, err = pcall(function()
        sample_spotify()
        start_refresh_timer()
      end)
      if not ok then
        visible_contexts[context.instanceId] = nil
        stop_refresh_timer()
        error(err, 0)
      end
    end
  end,

  disappear = function(context)
    if visible_contexts[context.instanceId] ~= context then
      return
    end
    visible_contexts[context.instanceId] = nil
    if next(visible_contexts) == nil then
      stop_refresh_timer()
    end
  end,

  appearance = appearance_for,

  press = function(context)
    local spotify = require_spotify("isRunning")
    local was_running = spotify.isRunning()
    require_spotify("playpause").playpause()
    if was_running then
      sample_spotify()
      context:success(snapshot.playing and "Playing" or "Paused", 900)
      return
    end
    context:success("Opening Spotify", 1000)
    if type(hs) == "table" and type(hs.timer) == "table" and type(hs.timer.doAfter) == "function" then
      hs.timer.doAfter(0.75, function()
        sample_spotify()
        refresh_visible_contexts()
      end)
    end
  end,

  rotate = function(context, ticks)
    if type(ticks) ~= "number" or ticks == 0 then
      return
    end
    if dial_mode(context) == "tracks" then
      change_track(ticks)
    else
      local spotify = require_spotify("setVolume")
      local next_volume = math.max(0, math.min(100, snapshot.volume + ticks * volume_step))
      spotify.setVolume(next_volume)
    end
    sample_spotify()
  end,
}
