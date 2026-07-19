# Stream Deck bridge Lua API

This module is the Hammerspoon side of the local Stream Deck bridge. It is a normal Lua module loaded by the Hammerspoon configuration. It does not evaluate Lua received from the plugin, and it does not expose a direct hardware API.

The bridge protocol is authenticated and loopback-only. The Stream Deck plugin is the client; Hammerspoon accepts one local plugin connection. The shared token authenticates `hello`, then each accepted hello creates a fresh opaque in-memory `sessionId`. The plugin must echo that exact ID on every later application message.

## Installation and loading

1. Install the official Stream Deck plugin built from this repository through Stream Deck.
2. Copy the `hammerspoon/streamdeck/` directory into the Hammerspoon configuration directory, preserving its `init.lua` (normally `~/.hammerspoon/streamdeck/init.lua`). A checkout can be copied with:

   ```sh
   cp -R hammerspoon/streamdeck ~/.hammerspoon/streamdeck
   ```

3. Load the module from `~/.hammerspoon/init.lua` and register actions before starting the bridge:

   ```lua
   local streamdeck = require("streamdeck")
   ```

`start()` creates the token file when necessary. The default is `~/.hammerspoon/streamdeck-token`; it contains a generated shared token and is created with owner-only permissions (`0600`). Do not put the token in Stream Deck settings, action settings, source control, or logs. If the token cannot be read or written, the bridge remains disconnected; it never falls back to unauthenticated operation. Session IDs are not tokens: each accepted hello receives a fresh non-empty ID generated with `hs.host.uuid()`, held only in memory, rotated on reconnect/plugin restart, and never logged or persisted.

A normal configuration calls `register` once for each action and then calls `start` once:

```lua
local streamdeck = require("streamdeck")

-- streamdeck.register(...)
streamdeck.start()
```

The module keeps its registry and connection/session state in memory. A Hammerspoon reload therefore requires the configuration to load the module, register all actions again, and start it again.

## Minimal API

### `streamdeck.register(definition)`

Adds one action definition to the in-memory registry. Register actions before `start()`. The action ID is the stable key used by the plugin's per-key settings.

The call validates synchronously. Invalid definitions and duplicate IDs raise a Lua error and do not partially register the definition. Wrap registration in `pcall` while diagnosing a configuration:

```lua
local ok, err = pcall(function()
  streamdeck.register(definition)
end)
if not ok then
  hs.printf("Stream Deck registration failed: %s", err)
end
```

### `streamdeck.start(options)`

Starts the authenticated loopback WebSocket server and publishes the registered action list to the plugin after a valid hello establishes a fresh session. With no options it uses the protocol defaults: loopback binding, Bonjour disabled, port `17321`, and token path `~/.hammerspoon/streamdeck-token`.

The supported options are:

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `port` | integer | `17321` | Local TCP port for the bridge. |
| `tokenPath` | string | `~/.hammerspoon/streamdeck-token` | Shared-token file path. |

The server is never exposed on a non-loopback interface. `start` validates its options and raises a Lua error for an invalid value or a server/token startup failure. Use one `start` call per Hammerspoon load.

### `streamdeck.stop()`

Stops the server, closes the plugin connection, clears the current in-memory session ID, and discards active instance contexts. It does not delete the token file or the registered definitions. After `stop`, call `start` to open a new bridge using the same in-memory registry; the next hello creates a new session ID.

### Authentication session lifecycle

The shared token is accepted only in `hello`. A valid hello is accepted even if a prior session was still marked authenticated: the bridge safely clears prior instance contexts, generates a fresh non-empty opaque `sessionId` with `hs.host.uuid()`, and returns it in the required `helloAck.sessionId`. This session ID is an in-memory capability, not a replacement for the token.

After `helloAck`, every plugin-to-Lua application message (`listActions`, lifecycle, `keyDown`, `keyUp`, `dialDown`, `dialRotate`, `dialUp`, `touchTap`, and `requestAppearance`) must include the exact current `sessionId`. Missing, stale, or invalid IDs are rejected before action dispatch and invoke no callback. The bridge clears the ID and contexts on close, `stop()`, or failure. Because `hs.httpserver` does not provide a reliable connection-close callback, this explicit ID check prevents an old authenticated state from becoming tokenless authorization.

### `streamdeck.refresh(actionId)`

Requests fresh appearance data for every visible instance of the registered action identified by `actionId`. It does not invoke the press, appear, or disappear callback and does not change settings. The action ID must be a registered string ID; an unknown ID is a synchronous error.

Use this when state changes outside a key press, such as a microphone being muted by another application.

### `context:refresh()`

Requests fresh appearance data for the current key instance only. It is normally called at the end of a successful `press` callback after changing the underlying state.

### `context:getSettings()`

Returns the settings stored by Stream Deck for the current key instance. Settings are ordinary decoded Lua values. The returned settings belong to this context; changing a local Lua table does not write settings back to Stream Deck. This v1 API has no settings-write method.
### `context:getDevice()`

Returns a defensive copy of optional per-instance controller/device metadata, or `nil` when unavailable. The closed DTO contains lowercase `controllerType`, a lowercase protocol device `type` (or `"unknown"`), and positive bounded `device.size.columns`/`rows`. SDK identifiers, names, connection state, visible actions, coordinates, and SDK objects are never exposed. Repeated lifecycle announcements update metadata without rerunning `appear`; callers may mutate the returned table without changing context state.

### `context:success(message, durationMs)` and `context:error(message, durationMs)`

Emit instance-scoped transient feedback after a callback succeeds or fails. `message` must be non-empty valid UTF-8, contain no Unicode control characters, and be at most 256 characters. `durationMs` is an inclusive millisecond range from 100 to 10,000. Invalid arguments return `false` without raising or exposing callback details; a valid emission returns `true` when queued. The plugin displays the message with the Stream Deck success or alert indicator, then restores the instance's previous appearance after the duration. Feedback is discarded safely when the instance disappears or the bridge reconnects.

These are the only context methods in v1. Contexts are per-instance: assigning one action to several keys gives each key an independent context and independent settings. Do not use a module-global settings table when per-key behavior is intended.

## Composable helper components

The optional `streamdeck.helpers` module provides small components for common per-instance lifecycle and refresh patterns. It keeps state in each returned component closure; it does not register actions, start the bridge, or hide lifecycle callbacks.

### `helpers.perInstanceState(initializer)`

Returns a state component with `appear`, `disappear`, `get`, and `set` functions. The initializer runs once for each context on its first `appear(context)`. Repeated appearances preserve that context's value, `disappear(context)` removes only that active context, and `get`/`set` can be used from the other action callbacks. Entries are bound to the context table as well as its instance ID, so stale callbacks cannot read, write, or remove a replacement lifecycle that reuses an ID. The initializer and every component context must be valid, and initializer errors remain callback errors.

### `helpers.svg(svg)`

Returns a custom SVG icon table with canonical padded base64 in `dataBase64`. The `svg` argument must be a string; bytes are encoded as-is, without markup sanitization. The normal appearance validator still applies its bounded safe-SVG profile before the icon is sent to the plugin.


### `helpers.refreshAfter(callback)`

Returns a callback wrapper that invokes `callback(context, ...)`, refreshes that same context once after a successful callback, and returns the callback's values unchanged. Errors propagate without refreshing. The callback must be a function.

```lua
local streamdeck = require("streamdeck")
local helpers = require("streamdeck.helpers")
local state = helpers.perInstanceState(function()
  return false
end)

streamdeck.register({
  id = "com.example.toggle",
  name = "Toggle",
  appearance = function(context)
    return {
      title = "Toggle",
      state = state:get(context) and "active" or "inactive",
    }
  end,
  press = helpers.refreshAfter(function(context)
    state:set(context, not state:get(context))
  end),
  appear = state.appear,
  disappear = state.disappear,
})
```

Lifecycle remains explicit: the bridge invokes `appear` and `disappear`, while the helper only owns the closure-scoped map and callback composition.

## Action definitions and validation

An action definition is a table with these fields:

| Field | Required | Type | Meaning |
| --- | --- | --- | --- |
| `id` | yes | non-empty string | Explicit, stable action ID. It must be unique within this Hammerspoon process. |
| `name` | yes | non-empty string | Human-readable action name shown when choosing the action in Stream Deck. |
| `settingsSchema` | no | table | Optional settings schema supplied to the plugin's property inspector. |
| `settingsSchemaVersion` | no | integer 1–16 | Settings descriptor version. Version 1 enables bounded validation; omitted versions remain legacy opaque arrays and newer bounded versions are preserved without rendering. |
| `appearance` | yes | function | Computes title/state and optional versioned presentation fields for a context. |
| `press` | yes | function | Handles a key tap, or a legacy key-down event when `longPress` is absent. Also handles encoder push when `push` is absent. |
| `release` | no | function | Handles a key-up or encoder push-release event for a context. |
| `push` | no | function | Handles an encoder push event; when absent, the required `press` callback is used. |
| `rotate` | no | function | Handles encoder rotation as `rotate(context, ticks, pressed)`, where positive ticks are clockwise and negative ticks are counter-clockwise. |
| `longPress` | no | function | Handles a press held for `longPressThresholdMs`; paired with the required `press` callback to distinguish taps from long presses. |
| `longPressThresholdMs` | no | integer 100–10,000 | Milliseconds before `longPress` runs; requires `longPress` and defaults to 500. |
| `appear` | no | function | Runs when a new visible instance appears or a restored context is rebuilt after reconnect. |
| `disappear` | no | function | Runs when a visible instance disappears or the connection is torn down. |

`push` and `rotate` are optional encoder-only callbacks. They receive the same per-instance context as key callbacks, including independent settings and device metadata. An action must still define `press`; it is the fallback for encoder push and remains the key callback.
Registration rejects a non-table definition, missing required fields, wrong field types, an empty ID or name, duplicate IDs, unknown fields, malformed long-press configuration, and thresholds outside 100–10,000 ms. `longPressThresholdMs` requires `longPress`; omitting it uses the deterministic 500 ms default. `settingsSchema`, when supplied, must be a dense array of at most 32 JSON values. With `settingsSchemaVersion = 1`, each descriptor must use one of `text`, `number`, `boolean`, or `select`, with a unique bounded key, optional bounded label/required flag, kind-specific bounded constraints, and a type-correct default. Select options are bounded unique `{ value, label }` objects and defaults must match an option. Unknown descriptor or constraint keys, duplicate keys, invalid combinations, cycles, sparse arrays, non-finite numbers, and out-of-range values are rejected before action listing. Instance settings are not validated against the schema by the Lua bridge; the plugin inspector validates supported edits while Lua callbacks receive the decoded settings.

The callbacks receive the current context. `press`, `release`, `push`, `rotate`, `longPress`, `appear`, and `disappear` return values are ignored. `rotate` additionally receives integer `ticks` and boolean `pressed`; positive ticks are clockwise and negative ticks are counter-clockwise. `appearance` must return:

```lua
{
  title = "Muted",
  state = "active",
  appearanceVersion = 1,
  foregroundColor = "#FFFFFF",
  backgroundColor = "#202020",
  progress = 0.5,
  badge = "ON",
  icon = {
    kind = "bundled",
    name = "hammerspoon",
  },
}
```

`title` must be a string and `state` must be either `"active"` or `"inactive"`. The optional presentation fields require `appearanceVersion = 1`: colors must be six-digit `#RRGGBB` strings, `progress` must be between `0` and `1`, and `badge` must be valid UTF-8 of at most four characters. An icon is either a semantic bundled slug, which falls back to the shipped `hammerspoon` asset when unknown, or a custom `image/png`/`image/svg+xml` value with canonical padded base64. Custom data is bounded to 32,768 decoded bytes; the plugin derives and validates 72×72 or 144×144 dimensions and applies the constrained SVG profile before SDK rendering. Unknown fields, missing required fields, invalid values, and unsupported appearance versions are rejected and do not update the key. Appearance is independent from press: a press callback does not implicitly change presentation.

## Callback semantics and protected errors

Callbacks run asynchronously in response to bridge events and are protected with `xpcall`. A Lua exception in user code cannot terminate the server or Hammerspoon's callback loop.

- `press(context)` runs for a tap. For legacy actions without `longPress`, it continues to run immediately for a key-down event.
- `longPress(context)` is optional. When configured, the bridge starts one protected per-instance timer on key-down; if it reaches `longPressThresholdMs`, it invokes `longPress` and suppresses `press` for that sequence. A key-up before the threshold cancels the timer and invokes `press` exactly once. The default threshold is 500 ms.
- `release(context)` runs once for a completed key-up sequence when supplied, after the tap or long-press callback. Duplicate key-up events and canceled/replaced sequences do not invoke callbacks again.
- `appear(context)` runs once when a new instance/action context is created or when a fresh reconnect rebuilds a previously cleared context. A repeated `instanceAppeared` for the same instance/action is a settings refresh; it updates `context:getSettings()` and does not invoke `appear` again.
- `disappear(context)` runs when the plugin removes an instance. Use it to release instance-scoped resources. It is not a substitute for `stop()`.
- A callback failure is logged locally and sent to the plugin as a safe protocol `error`. If the error is associated with an instance, the plugin also shows alert feedback on that instance. Error details never include the shared token or session ID. A failed callback leaves the current presentation unchanged.
- A malformed appearance result is handled like a callback failure: no malformed fields are sent to Stream Deck, and the previous presentation remains in place.


Encoder events use the same context lifecycle and error isolation as key events. `dialDown` invokes `push(context)` when defined, otherwise `press(context)`; `dialRotate` invokes `rotate(context, ticks, pressed)` when defined; and `dialUp` invokes `release(context)` when defined. Encoder callbacks are independent per visible instance, so settings and state are not shared between placements.

`touchTap(context, hold, tapPos)` is optional and runs only for dial actions. `hold` is a boolean and `tapPos` is a bounded `[x, y]` touchscreen coordinate (`0 <= x <= 800`, `0 <= y <= 100`). The callback is protected and receives the instance's own context and settings.
Registration and startup failures are synchronous Lua errors. Callback failures are runtime errors handled by the bridge. This distinction makes a typo in the action table visible during configuration load while keeping a device callback failure from taking down the bridge.

When the plugin is not connected, refresh requests cannot be delivered. The plugin displays its disconnected/offline presentation and retries with bounded backoff. Once authentication succeeds again, it receives a fresh session ID, requests the action list, re-announces visible instances with that ID, and requests appearance. Re-announcing an unchanged instance/action refreshes settings but does not invoke `appear` again.

## Example collection

The repository includes complete configuration snippets in `hammerspoon/examples/`:

- `microphone.lua` toggles the default input device's input mute state and refreshes the pressed key.
- `application.lua` toggles the focused application's hidden state, retaining the hidden target for the next click, or toggles a configured running application by bundle ID. A running process with no main window is reopened; when the action focuses a target, hiding it restores the application that was frontmost beforehand; `focusOnShow` controls whether showing activates the target and brings all its windows forward. It refreshes from `hs.application.watcher` events.
- `multi-instance.lua` keeps independent toggle state for each visible key and reads an optional per-instance `label` setting.
- `focus-timer.lua` (`com.brettinternet.hammerspoon.focus-timer`) starts and stops a per-key 25-minute focus timer, showing `Focus` while it runs and returning to `Ready` when it expires; its per-instance lifecycle owns the timer and refreshes the key on start, stop, and expiry.
- `pomodoro.lua` (`com.brettinternet.hammerspoon.pomodoro`) runs four per-key 25-minute focus cycles with short breaks and a final long break, showing each phase and refreshing immediately after presses and timer transitions.
- `window-maximize.lua` (`com.brettinternet.hammerspoon.window-maximize`) shows the focused application's name and toggles its focused window between zoomed and normal states, reporting `No window` when no focused window is available; it demonstrates focused-window state checks, per-instance lifecycle, and protected operation errors.
- `clipboard-clean.lua` (`com.brettinternet.hammerspoon.clipboard-clean`) reports when no text is available, then trims surrounding whitespace on press and refreshes the appearance; it demonstrates pasteboard read/write and appearance refresh.
- `keyboard-layout.lua` (`com.brettinternet.hammerspoon.keyboard-layout`) toggles between two keyboard layouts using `hs.keycodes`, defaults to `U.S.` and `Dvorak` when settings are absent, and refreshes the pressed key after a successful switch.
- `url-launcher.lua` (`com.brettinternet.hammerspoon.url-launcher`) opens a configured URL with `hs.urlevent`, defaults to a Hammerspoon documentation URL when settings are absent, and reports invalid or unavailable URL launches as protected errors.
- `window-snap.lua` (`com.brettinternet.hammerspoon.window-snap`) cycles each focused window through left-half, right-half, and full-work-area layouts with per-instance lifecycle state and refreshes after successful moves.
- `keep-awake.lua` (`com.brettinternet.hammerspoon.keep-awake`) toggles display-idle sleep prevention with `hs.caffeinate`, updates every visible instance after the global state changes, and reports unavailable or failed power APIs as protected errors.
- `app-launcher.lua` (`com.brettinternet.hammerspoon.app-launcher`) launches or focuses a configured application with safe per-key app/label defaults, shows when the target is frontmost, and refreshes after a successful launch or focus.
- `clipboard-stash.lua` (`com.brettinternet.hammerspoon.clipboard-stash`) parks one clipboard item per key, restores it on the next press, and resets its per-instance stash on disappearance.
- `window-center.lua` (`com.brettinternet.hammerspoon.window-center`) centers the focused window within its screen work area without changing its size, reporting when no focused window is available.
- `meeting-mode.lua` (`com.brettinternet.hammerspoon.meeting-mode`) coordinates microphone input mute and display-idle prevention as one global mode, refreshing every visible instance only after both changes succeed.
- `lock-screen.lua` (`com.brettinternet.hammerspoon.lock-screen`) provides a one-shot privacy key through `hs.caffeinate.lockScreen` without pretending the locked state is observable.

Copy any of the sixteen files into `~/.hammerspoon` or adapt it in your existing configuration. Each file registers a namespaced action for the generic Stream Deck action; select that registered action ID in the property inspector. The official bridge owns the connection, so the examples use `require("streamdeck")`, never `hs.streamdeck` or direct hardware access. The current v1 inspector edits `actionId` only, so settings-based examples use their documented defaults unless their settings are supplied by an adapted configuration.

All sixteen examples are hardware-free and use ordinary Hammerspoon APIs; they can be copied or adapted without a connected Stream Deck. They run without Hammerspoon or hardware in the repository's Lua test harness.

## Complete example: microphone mute

The following is a complete `~/.hammerspoon/init.lua` example. It registers one stable action, toggles the default input device, and derives the title/state independently from the press callback.

```lua
local streamdeck = require("streamdeck")

local function default_microphone()
  return hs.audiodevice.defaultInputDevice()
end

local function microphone_muted(microphone)
  local muted = microphone:inputMuted()
  if type(muted) ~= "boolean" then
    error("microphone input mute state unavailable")
  end
  return muted
end

streamdeck.register({
  id = "com.example.microphone-toggle",
  name = "Microphone mute",

  appearance = function(_context)
    local microphone = default_microphone()
    if not microphone then
      return {
        title = "No mic",
        state = "inactive",
      }
    end

    if microphone_muted(microphone) then
      return {
        title = "Muted",
        state = "active",
      }
    end

    return {
      title = "Live",
      state = "inactive",
    }
  end,

  press = function(context)
    local microphone = default_microphone()
    if not microphone then
      error("no default input device")
    end

    local muted = microphone_muted(microphone)
    if microphone:setInputMuted(not muted) ~= true then
      error("failed to set microphone mute state")
    end
    context:refresh()
  end,
})

streamdeck.start()
```

To verify the action, reload Hammerspoon, add Hammerspoon Toggle in Stream Deck, select `com.example.microphone-toggle` in its action settings, and press the key. Choose inactive and active images in Stream Deck for the live and muted states. A successful press toggles the default input mute state and refreshes only that key. If another application changes the mute state, run `streamdeck.refresh("com.example.microphone-toggle")` from the Hammerspoon configuration or another local Hammerspoon event handler to refresh all visible instances.

## Lifecycle and reload behavior

The lifecycle is intentionally explicit:

1. Hammerspoon loads the module.
2. The configuration registers every action definition.
3. `start()` creates/opens the authenticated loopback server.
4. The plugin authenticates with the shared token; Hammerspoon returns a fresh `helloAck.sessionId`, and the plugin echoes it on every subsequent application message.
5. Each visible key announces its instance. For a new instance/action context, the bridge invokes `appear` and computes its initial `appearance`; a repeated announcement for the same instance/action only refreshes settings and does not invoke `appear`.
6. `press` and appearance callbacks run for their corresponding contexts.
7. The plugin removes an instance; the bridge invokes `disappear`.
8. `stop()` or a Hammerspoon reload closes the connection, clears the session ID, and drops active contexts.

A reload does not preserve the Lua registry, session ID, or contexts. Register definitions on every reload before starting. The plugin reconnects after a reload, re-authenticates, receives a fresh session ID, receives the action list, and restores visible instances and appearances. Stream Deck's initial settings arrive to the plugin under `actionInfo.payload.settings`; the plugin forwards the decoded settings in `instanceAppeared`. Repeated `instanceAppeared` for the same instance/action is a settings refresh, not a second `appear` lifecycle. The token file is retained across reloads unless an administrator intentionally rotates it; changing or removing it requires restarting both sides so they read the same token.

The bridge accepts one WebSocket client because of the Hammerspoon HTTP server limitation. Because `hs.httpserver` lacks a reliable close callback, a client is never authorized merely because a process-global hello flag remains true: the next valid hello must carry the token, rotates the session ID, and clears prior contexts. This is sufficient for the one local Stream Deck plugin process; a second client is not a supported multi-user or multi-plugin deployment.

## Excluded APIs in v1

The following are intentionally outside this contract:

- remote Lua evaluation or arbitrary Lua commands sent from Stream Deck;
- direct hardware calls from Lua, device enumeration, or per-button hardware configuration;
- unversioned or arbitrary appearance fields; v1 permits only the closed bundled `hammerspoon` icon or bounded canonical-base64 PNG/SVG values validated at the protocol boundary;
- callback return values that mutate settings or presentation implicitly;
- a Lua settings-write API;
- multiple simultaneous plugin clients, Bonjour discovery, or non-loopback binding;
- dynamic property-inspector forms and arbitrary plugin-to-Lua configuration messages;
- polling or a background watcher for appearance changes; use an explicit `refresh` call from a Hammerspoon event source instead.

Code written against this document should use the `streamdeck` module shown above and the official Stream Deck plugin; it should not depend on an alternate Hammerspoon Stream Deck namespace or on remote evaluation.
