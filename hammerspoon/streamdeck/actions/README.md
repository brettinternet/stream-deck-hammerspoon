# Hammerspoon action library

The Lua installation includes an optional catalog of ready-to-use actions under `streamdeck.actions`. Installing the bridge makes every action module available, but `require("streamdeck")` does not register them automatically.

## Register actions

Register the complete catalog with one bridge instance:

```lua
local streamdeck = require("streamdeck")
local actions = require("streamdeck.actions")

actions.registerAll(streamdeck)
streamdeck.start()
```

Copy the complete-catalog snippet above into `~/.hammerspoon/init.lua`, or use the selective form below in an existing configuration.

To expose only selected actions in Stream Deck, register their stable catalog names:

```lua
local streamdeck = require("streamdeck")
local actions = require("streamdeck.actions")

actions.register(streamdeck, {
  "application",
  "keep-awake",
  "window-snap",
})
streamdeck.start()
```

Unknown or duplicate names fail before anything is registered. Action modules return plain definitions and never register or start the bridge themselves; the catalog supplies their shared post-callback refresh policy so related actions stay synchronized.

### Keep local actions alongside the catalog

If a local action has the same action ID as a catalog action, keep the local definition and select only non-overlapping catalog names. Do not call `registerAll`: the bridge rejects duplicate action IDs.

```lua
local streamdeck = require("streamdeck")
local catalog = require("streamdeck.actions")

local customActions = {
  require("application"), -- Same ID as catalog "application"; retain this version.
  require("keep-awake"), -- Same ID as catalog "keep-awake"; retain this version.
  require("caffeine-alert"), -- Not supplied by the catalog.
}

for _, action in ipairs(customActions) do
  streamdeck.register(action)
end

catalog.register(streamdeck, {
  "lock-screen",
  "window-snap",
  -- Add any catalog names except "application" and "keep-awake".
})
streamdeck.start()
```

This lets an existing configuration preserve local policy or integrations while adopting catalog actions incrementally.

Use **Hammerspoon Toggle** when an action reports meaningful inactive and active states, **Hammerspoon Button** for one-shot actions, and **Hammerspoon Multi-State** for the keypad actions whose `presentationState` selects one of four static images.

## Catalog

| Name                   | Action ID                                            | Suggested type | Behavior and setup                                                                                                         |
| ---------------------- | ---------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `app-launcher`         | `com.brettinternet.hammerspoon.app-launcher`         | Toggle         | Launches or focuses the configured app, reports whether it is frontmost, and uses its macOS application icon when available. |
| `application`          | `com.brettinternet.hammerspoon.application-toggle`   | Toggle         | Hides, shows, focuses, or closes a configured application; without a bundle ID it follows the frontmost application.       |
| `audio-input-router`   | `com.brettinternet.hammerspoon.audio-input-router`   | Multi-State / Dial | Keys cycle up to four inputs; dials preview inputs while rotating and switch on press.                                     |
| `audio-output-router`  | `com.brettinternet.hammerspoon.audio-output-router`  | Multi-State / Dial | Keys cycle up to four outputs; dials preview outputs while rotating and switch on press.                                   |
| `clipboard-clean`      | `com.brettinternet.hammerspoon.clipboard-clean`      | Toggle         | Trims leading and trailing whitespace from the text clipboard.                                                             |
| `clipboard-stash`      | `com.brettinternet.hammerspoon.clipboard-stash`      | Toggle         | Stashes and restores clipboard text independently for each key instance.                                                   |
| `desktop-space-cycler` | `com.brettinternet.hammerspoon.desktop-space-cycler` | Multi-State    | Cycles through the first four user desktop spaces on the main screen. Requires Accessibility permission.                   |
| `timer`                | `com.brettinternet.hammerspoon.timer`               | Toggle         | Starts or cancels a configurable per-key timer with a live countdown, progress bar, and flashing completion background.      |
| `keep-awake`           | `com.brettinternet.hammerspoon.keep-awake`           | Toggle         | Toggles display sleep prevention with distinct successful on/off sounds.                                                   |
| `keyboard-layout`      | `com.brettinternet.hammerspoon.keyboard-layout`      | Toggle         | Switches between two enabled layouts selected from refreshable system dropdowns and shows the active layout badge.          |
| `last-application`     | `com.brettinternet.hammerspoon.last-application`     | Toggle         | Switches between the two most recently active applications.                                                                |
| `lock-screen`          | `com.brettinternet.hammerspoon.lock-screen`          | Button         | Locks the screen and plays the normal successful press sound.                                                              |
| `microphone`           | `com.brettinternet.hammerspoon.microphone-toggle`    | Toggle / Pedal | Toggles a selected input or provides push-to-talk, with optional per-app Zoom, Teams, and Slack mute shortcuts.             |
| `pomodoro`             | `com.brettinternet.hammerspoon.pomodoro`             | Toggle         | Press pauses or resumes the focus schedule, hold resets it, and the live phase countdown updates every second.               |
| `spotify`              | `com.brettinternet.hammerspoon.spotify`              | Toggle / Dial  | Press launches or toggles playback; artwork shows artist, track, progress, and state while dial rotation controls volume or tracks. |
| `system-monitor`       | `com.brettinternet.hammerspoon.system-monitor`       | Toggle         | Displays a live 120-second CPU or RAM chart; press to switch metrics. Uses green below or at 80% and red above 80%.        |
| `url-launcher`         | `com.brettinternet.hammerspoon.url-launcher`         | Button         | Opens the configured URL and uses its website favicon when Hammerspoon can load it.                                         |
| `youtube`              | `com.brettinternet.hammerspoon.youtube`              | Button         | Plays or pauses the first YouTube video in Chromium, or opens the configured URL. Requires Chromium automation permission. |
| `window-center`        | `com.brettinternet.hammerspoon.window-center`        | Toggle         | Centers the focused window without resizing it. Requires Accessibility permission.                                         |
| `window-maximize`      | `com.brettinternet.hammerspoon.window-maximize`      | Toggle         | Toggles the focused window's zoom state independently for each key. Requires Accessibility permission.                     |
| `window-next-screen`   | `com.brettinternet.hammerspoon.window-next-screen`   | Button         | Moves the focused window to the next display while preserving its relative frame. Requires Accessibility permission.       |
| `window-snap`          | `com.brettinternet.hammerspoon.window-snap`          | Toggle         | Cycles the focused window through left, right, and full-screen layouts. Requires Accessibility permission.                 |

The property inspector groups these actions by category and supports search, gesture help, conditional sections, per-field and per-action reset, and refreshable system dropdowns. A saved device that is disconnected remains selected as `Unavailable — Device Name` instead of being silently replaced.

All actions require macOS, Hammerspoon, the official Stream Deck application, and this project's installed `streamdeck` Lua module. Watchers are started only while their action has visible Stream Deck instances. Timers retain their own instance lifecycle and refresh after asynchronous transitions.
