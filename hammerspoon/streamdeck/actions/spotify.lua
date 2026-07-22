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
    }
    request_artwork(nil)
    return
  end

  for _, method_name in ipairs({
    "getCurrentTrack",
    "getCurrentTrackArtworkURL",
    "getVolume",
    "isPlaying",
  }) do
    require_spotify(method_name)
  end

  local volume = spotify.getVolume()
  if type(volume) ~= "number" then
    volume = 0
  end
  volume = math.max(0, math.min(100, volume))
  snapshot = {
    running = true,
    playing = spotify.isPlaying() == true,
    track = spotify.getCurrentTrack(),
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

local function title_for_snapshot()
  if not snapshot.running then
    return "Spotify closed"
  end
  if type(snapshot.track) == "string" and snapshot.track ~= "" then
    return snapshot.track
  end
  return "Spotify"
end

local function appearance_for(context)
  local artwork_icon = artwork_icon_for(context)
  local device = type(context.getDevice) == "function" and context:getDevice() or nil
  local is_encoder = type(device) == "table" and device.controllerType == "encoder"
  if not is_encoder then
    return {
      title = title_for_snapshot(),
      state = snapshot.playing and "active" or "inactive",
      appearanceVersion = 1,
      icon = artwork_icon,
    }
  end

  if dial_mode(context) == "tracks" then
    return {
      title = title_for_snapshot(),
      state = snapshot.playing and "active" or "inactive",
      appearanceVersion = 1,
      value = "Previous / Next",
      indicator = 50,
      icon = artwork_icon,
    }
  end

  return {
    title = "Spotify volume",
    state = snapshot.playing and "active" or "inactive",
    appearanceVersion = 1,
    value = string.format("%d%%", math.floor(snapshot.volume + 0.5)),
    indicator = snapshot.volume,
    icon = artwork_icon,
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
  settingsSchemaVersion = 1,
  settingsSchema = {
    {
      type = "select",
      key = "dialControl",
      label = "Dial control",
      description = "Choose whether encoder rotation adjusts volume or moves to the previous or next track.",
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

  press = function()
    local spotify = require_spotify("isRunning")
    local was_running = spotify.isRunning()
    require_spotify("playpause").playpause()
    if was_running then
      sample_spotify()
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
