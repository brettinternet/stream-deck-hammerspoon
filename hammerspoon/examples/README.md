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

[`init.lua`](init.lua) is the runnable version of that configuration. Copy those lines into `~/.hammerspoon/init.lua`, or symlink the file into `~/.hammerspoon` and require it from your existing configuration.

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

Use **Hammerspoon Toggle** when an action reports meaningful inactive and active states, **Hammerspoon Button** for one-shot actions, and **Hammerspoon Multi-State** for the keypad actions whose `presentationState` selects one of four static images.

## Catalog

| Name                   | Action ID                                            | Suggested type | Behavior and setup                                                                                                         |
| ---------------------- | ---------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `app-launcher`         | `com.brettinternet.hammerspoon.app-launcher`         | Toggle         | Launches or focuses the app named in action settings and reports whether it is frontmost.                                  |
| `application`          | `com.brettinternet.hammerspoon.application-toggle`   | Toggle         | Hides, shows, focuses, or closes a configured application; without a bundle ID it follows the frontmost application.       |
| `audio-output-router`  | `com.brettinternet.hammerspoon.audio-output-router`  | Multi-State    | Cycles through up to four connected outputs automatically, or through output names supplied in action settings.            |
| `clipboard-clean`      | `com.brettinternet.hammerspoon.clipboard-clean`      | Toggle         | Trims leading and trailing whitespace from the text clipboard.                                                             |
| `clipboard-stash`      | `com.brettinternet.hammerspoon.clipboard-stash`      | Toggle         | Stashes and restores clipboard text independently for each key instance.                                                   |
| `desktop-space-cycler` | `com.brettinternet.hammerspoon.desktop-space-cycler` | Multi-State    | Cycles through the first four user desktop spaces on the main screen. Requires Accessibility permission.                   |
| `focus-timer`          | `com.brettinternet.hammerspoon.focus-timer`          | Toggle         | Starts or cancels a 25-minute timer independently for each key.                                                            |
| `keep-awake`           | `com.brettinternet.hammerspoon.keep-awake`           | Toggle         | Toggles display sleep prevention with distinct successful on/off sounds.                                                   |
| `keyboard-layout`      | `com.brettinternet.hammerspoon.keyboard-layout`      | Toggle         | Switches between two keyboard layouts configured in action settings.                                                       |
| `last-application`     | `com.brettinternet.hammerspoon.last-application`     | Toggle         | Switches between the two most recently active applications.                                                                |
| `lock-screen`          | `com.brettinternet.hammerspoon.lock-screen`          | Button         | Locks the screen and plays the normal successful press sound.                                                              |
| `meeting-mode`         | `com.brettinternet.hammerspoon.meeting-mode`         | Toggle         | Mutes the default microphone and prevents display sleep as one coherent mode.                                              |
| `microphone`           | `com.brettinternet.hammerspoon.microphone-toggle`    | Toggle         | Toggles the default microphone mute state.                                                                                 |
| `pomodoro`             | `com.brettinternet.hammerspoon.pomodoro`             | Toggle         | Runs four 25-minute focus cycles with short breaks and a final long break.                                                 |
| `url-launcher`         | `com.brettinternet.hammerspoon.url-launcher`         | Button         | Opens the label and URL configured in action settings.                                                                     |
| `youtube`              | `com.brettinternet.hammerspoon.youtube`              | Button         | Plays or pauses the first YouTube video in Chromium, or opens the configured URL. Requires Chromium automation permission. |
| `window-center`        | `com.brettinternet.hammerspoon.window-center`        | Toggle         | Centers the focused window without resizing it. Requires Accessibility permission.                                         |
| `window-maximize`      | `com.brettinternet.hammerspoon.window-maximize`      | Toggle         | Toggles the focused window's zoom state independently for each key. Requires Accessibility permission.                     |
| `window-next-screen`   | `com.brettinternet.hammerspoon.window-next-screen`   | Button         | Moves the focused window to the next display while preserving its relative frame. Requires Accessibility permission.       |
| `window-snap`          | `com.brettinternet.hammerspoon.window-snap`          | Toggle         | Cycles the focused window through left, right, and full-screen layouts. Requires Accessibility permission.                 |

All actions require macOS, Hammerspoon, the official Stream Deck application, and this project's installed `streamdeck` Lua module. Watchers are started only while their action has visible Stream Deck instances. Timers retain their own instance lifecycle and refresh after asynchronous transitions.
