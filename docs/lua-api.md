# Stream Deck bridge Lua API

This module is the Hammerspoon side of the authenticated Stream Deck bridge. It is a normal Lua module loaded by the Hammerspoon configuration. It does not evaluate Lua received from the plugin, and it does not expose a direct hardware API.

The default protocol is authenticated loopback. An explicit LAN profile can add up to four isolated per-client PSK listeners; loopback remains the default and each listener owns one authenticated application session.

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

`start()` creates the token file when necessary. The default is `~/.hammerspoon/streamdeck-token`; it contains a generated shared token and is created with owner-only permissions (`0600`). Do not put the token in Stream Deck settings, action settings, source control, or logs. If the token cannot be read or written, the bridge remains disconnected; it never falls back to unauthenticated operation. Session IDs are not tokens: each accepted hello receives a fresh non-empty ID from 32 CSPRNG bytes read from `/dev/urandom`, held only in memory, rotated on reconnect/plugin restart, and never logged or persisted.

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

### Built-in Hammerspoon utility actions

Requiring `streamdeck` automatically registers these stable utility actions before user-defined actions:

| Action ID                               | Name                       | Behavior                                                                                                      |
| --------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `com.brettinternet.hammerspoon.reload`  | Reload Hammerspoon         | Reloads the Hammerspoon configuration.                                                                        |
| `com.brettinternet.hammerspoon.console` | Toggle Hammerspoon Console | Toggles the Hammerspoon Console window, reports whether it is visible, and uses the bundled Hammerspoon icon. |

They appear in the existing Hammerspoon Button and Hammerspoon Toggle action selectors, and in the keypad-only Hammerspoon Multi-State action; no separate Stream Deck action or manual registration is required. The reload action schedules `hs.reload()` on the next timer tick so the bridge can finish handling the button event before Hammerspoon resets its Lua environment. The plugin reconnects and restores visible instances after the reload.

These actions call only the fixed Hammerspoon APIs documented above. They do not evaluate Lua or shell commands from Stream Deck settings.

### `streamdeck.start(options)`

Starts the authenticated loopback WebSocket server and, only when `lan` is supplied, one authenticated LAN WebSocket server per configured client. It publishes the registered action list after authentication. With no options it creates only the loopback listener, disables Bonjour, uses port `17321`, and uses token path `~/.hammerspoon/streamdeck-token`.

The supported options are:

| Option      | Type    | Default                           | Meaning                                       |
| ----------- | ------- | --------------------------------- | --------------------------------------------- |
| `port`      | integer | `17321`                           | Loopback TCP port for the bridge.             |
| `tokenPath` | string  | `~/.hammerspoon/streamdeck-token` | Loopback shared-token file path.              |
| `lan`       | table   | disabled                          | Explicit LAN listener and per-client key map. |

The canonical multi-client form gives each client its own specific interface, unique port, and manually provisioned 32-byte key file with mode `0600`:

```lua
streamdeck.start({
  lan = {
    clients = {
      ["remote-deck"] = {
        interface = "en0",
        port = 17322,
        keyPath = "/Users/me/.hammerspoon/streamdeck-remote.key",
      },
      ["studio-deck"] = {
        interface = "en1",
        port = 17323,
        keyPath = "/Users/me/.hammerspoon/streamdeck-studio.key",
      },
    },
  },
})
```

At most four LAN clients may be configured. Client IDs, listener ports (including the loopback port), and key paths must be unique. A single-client shorthand remains supported:

```lua
streamdeck.start({
  lan = {
    interface = "en0",
    port = 17322,
    clients = { ["remote-deck"] = "/Users/me/.hammerspoon/streamdeck-remote.key" },
  },
})
```

The remote plugin uses `ws://<address>:<port>/streamdeck` with `lan = { clientId = "remote-deck", keyPath = "/path/to/streamdeck-remote.key" }`. A LAN listener rejects v1 `hello`/token messages and has no unauthenticated fallback. `start` validates all options and key files and raises a Lua error for an invalid value or startup failure. Use one `start` call per Hammerspoon load.

### `streamdeck.stop()`

Stops every listener, closes the plugin connections, clears each current in-memory session ID, and discards active instance contexts. It does not delete credential files or registered definitions. After `stop`, call `start` to open a new bridge using the same in-memory registry; the next loopback hello or LAN proof creates a new session ID in its selected slot.

### Authentication session lifecycle

The shared token is accepted only by the fixed loopback slot in `hello`. A valid hello is accepted even if that slot's prior session was still marked authenticated: the bridge safely clears only that slot's contexts, generates a fresh non-empty opaque `sessionId` from 32 CSPRNG bytes read from `/dev/urandom`, and returns it in the required `helloAck.sessionId`. The LAN slot uses its configured client ID and key for the nonce/HMAC handshake and returns its session ID in `lanReady`; it never reads or accepts the loopback token.

After `helloAck` or `lanReady`, every plugin-to-Lua application message (`listActions`, lifecycle, `keyDown`, `keyUp`, `dialDown`, `dialRotate`, `dialUp`, `touchTap`, and `requestAppearance`) must include the exact current `sessionId` for that slot. Missing, stale, or invalid IDs are rejected before action dispatch and invoke no callback. Session rotation, stop, authenticated rate exhaustion, and an invalid authenticated LAN frame reset only the affected slot's authentication, contexts, timers, and pending responses. Malformed messages and instance exhaustion return safe errors without dispatching or changing another slot. Because `hs.httpserver` does not provide reliable connection-close identity, each listener is a broadcast domain rather than a per-WebSocket channel; no slot state is shared across listeners.

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

### `context:playSound(spec)`

Explicitly resolves and plays a sound spec through the configured `streamdeck.sound` engine. This is the escape hatch for actions that need playback outside the automatic action policy. It returns `true` when playback is accepted and `false` for a missing, invalid, or failed sound. Playback failure is nonfatal: it never turns a successful callback into a callback failure.

### `context:invoke(name, ...)`

Invokes a named callback for the current action and preserves its return tuple as `ok, ...callbackReturns`. When the callback name is missing, it returns only `true`; when the callback raises or otherwise fails, it returns only `false`. This compatibility contract is also what lets the sound dispatcher inspect an explicit toggle sentinel without changing unrelated callback returns.

These are the context methods in v1. Contexts are per-instance: assigning one action to several keys gives each key an independent context and independent settings. Do not use a module-global settings table when per-key behavior is intended.

## Composable helper components

The optional `streamdeck.helpers` module provides small components for common per-instance lifecycle and refresh patterns. It keeps state in each returned component closure; it does not register actions, start the bridge, or hide lifecycle callbacks.

### `helpers.perInstanceState(initializer)`

Returns a state component with `appear`, `disappear`, `get`, and `set` functions. The initializer runs once for each context on its first `appear(context)`. Repeated appearances preserve that context's value, `disappear(context)` removes only that active context, and `get`/`set` can be used from the other action callbacks. Entries are bound to the context table as well as its instance ID, so stale callbacks cannot read, write, or remove a replacement lifecycle that reuses an ID. The initializer and every component context must be valid, and initializer errors remain callback errors.

### `helpers.svg(svg)`

Returns a custom SVG icon table with canonical padded base64 in `dataBase64`. The `svg` argument must be a string; bytes are encoded as-is, without markup sanitization. The normal appearance validator still applies its bounded safe-SVG profile before the icon is sent to the plugin.

### `helpers.areaChart(values, options)`

Returns a custom SVG icon containing a bounded square area chart. `values` must be a dense array of finite numbers; values outside the chart range are clamped. The optional `options` table accepts only `size` (`72` or `144`, default `72`), finite `min`/`max` bounds (defaults `0` and `100`, with `max > min`), six-digit `#RRGGBB` `backgroundColor` (default `#000000`) and `fillColor` (default `#FFFFFF`), and an optional `strokeColor` plus finite `strokeWidth` from `0.001` through the chart size (default `2`). The stroke is an open trace across the samples; it does not outline the chart baseline or sides. When there are more samples than pixels, points are deterministically downsampled in chronological order while retaining the newest value.

```lua
local icon = helpers.areaChart({ 18, 27, 34 }, {
  fillColor = "#2E86DE",
  backgroundColor = "#101820",
  strokeColor = "#1B5E8A",
  strokeWidth = 2,
})
```

The helper emits only the protocol's allowlisted SVG elements and attributes, so its result can be returned directly as `appearance.icon`.

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

| Field                   | Required | Type               | Meaning                                                                                                                                                                                           |
| ----------------------- | -------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                    | yes      | non-empty string   | Explicit, stable action ID. It must be unique within this Hammerspoon process.                                                                                                                    |
| `name`                  | yes      | non-empty string   | Human-readable action name shown when choosing the action in Stream Deck.                                                                                                                         |
| `settingsSchema`        | no       | table              | Optional settings schema supplied to the plugin's property inspector.                                                                                                                             |
| `settingsSchemaVersion` | no       | integer 1–16       | Settings descriptor version. Version 1 enables bounded validation; omitted versions remain legacy opaque arrays and newer bounded versions are preserved without rendering.                       |
| `appearance`            | yes      | function           | Computes title/state and optional versioned presentation fields for a context.                                                                                                                    |
| `press`                 | yes      | function           | Handles a key tap. It runs on key-down only when neither `longPress` nor `doublePress` is configured; otherwise it runs after gesture classification.                                                |
| `release`               | no       | function           | Handles a key-up or encoder push-release event for a context.                                                                                                                                     |
| `push`                  | no       | function           | Handles an encoder push event; when absent, the required `press` callback is used.                                                                                                                |
| `rotate`                | no       | function           | Handles encoder rotation as `rotate(context, ticks, pressed)`, where positive ticks are clockwise and negative ticks are counter-clockwise.                                                       |
| `longPress`             | no       | function           | Handles a press held for `longPressThresholdMs`; paired with the required `press` callback to distinguish taps from long presses.                                                                 |
| `longPressThresholdMs`  | no       | integer 100–10,000 | Milliseconds before `longPress` runs; requires `longPress` and defaults to 500.                                                                                                                   |
| `doublePress`           | no       | function           | Handles two short key taps completed within `doublePressThresholdMs`; paired with the required `press` callback.                                                                                   |
| `doublePressThresholdMs`| no       | integer 100–10,000 | Milliseconds after the first short key-up to wait for the second key-down; requires `doublePress` and defaults to 350.                                                                             |
| `appear`                | no       | function           | Runs when a new visible instance appears or a restored context is rebuilt after reconnect.                                                                                                        |
| `disappear`             | no       | function           | Runs when a visible instance disappears or the connection is torn down.                                                                                                                           |
| `sound`                 | no       | sound policy       | Optional `streamdeck.sound` policy. A press policy plays the configured press cue after a successful press; a toggle policy plays only for an explicit `sound.ON` or `sound.OFF` callback return. |

`push` and `rotate` are optional encoder-only callbacks. They receive the same per-instance context as key callbacks, including independent settings and device metadata. An action must still define `press`; it is the fallback for encoder push and remains the single-tap callback.
Registration rejects a non-table definition, missing required fields, wrong field types, an empty ID or name, duplicate IDs, unknown fields, malformed long- or double-press configuration, and thresholds outside 100–10,000 ms. `longPressThresholdMs` requires `longPress` and defaults to 500; `doublePressThresholdMs` requires `doublePress` and defaults to 350. `settingsSchema`, when supplied, must be a dense array of at most 32 JSON values. With `settingsSchemaVersion = 1`, each descriptor must use one of `text`, `number`, `boolean`, or `select`, with a unique bounded key, optional bounded label/required flag, kind-specific bounded constraints, and a type-correct default. Select options are bounded unique `{ value, label }` objects and defaults must match an option. Unknown descriptor or constraint keys, duplicate keys, invalid combinations, cycles, sparse arrays, non-finite numbers, and out-of-range values are rejected before action listing. Instance settings are not validated against the schema by the Lua bridge; the plugin inspector validates supported edits while Lua callbacks receive the decoded settings.
Version-1 settings descriptors are supported by the property inspector and persist validated values in Stream Deck instance settings. For example:

```lua
settingsSchemaVersion = 1,
settingsSchema = {
  { type = "text", key = "label", label = "Label", maxLength = 32, default = "Timer" },
  { type = "number", key = "minutes", label = "Minutes", min = 1, max = 120, step = 1, default = 25 },
  { type = "boolean", key = "notify", label = "Notify", default = true },
  {
    type = "select",
    key = "sound",
    label = "Sound",
    options = { { value = "bell", label = "Bell" }, { value = "chime", label = "Chime" } },
    default = "bell",
  },
}
```

`docs/protocol.md` is the normative field specification; the validated rendering and persistence behavior is covered by `plugin/tests/property-inspector.test.ts`.

The callbacks receive the current context. `press` and other callback return values are preserved by the bridge; the sound policy consumes only its documented `sound.ON`/`sound.OFF` sentinels and otherwise leaves callback values unchanged. `rotate` additionally receives integer `ticks` and boolean `pressed`; positive ticks are clockwise and negative ticks are counter-clockwise. `appearance` must return:

```lua
{
  title = "Muted",
  state = "active",
  appearanceVersion = 1,
  presentationState = 2,
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

`title` must be a string and `state` must be either `"active"` or `"inactive"`. The optional presentation fields require `appearanceVersion = 1`: `presentationState` is an integer from `0` through `3` for the keypad-only Multi-State action and falls back to binary `state` when omitted; it has no callback semantics. Colors must be six-digit `#RRGGBB` strings, `progress` must be between `0` and `1`, and `badge` must be valid UTF-8 of at most four characters. An icon is either a semantic bundled slug, which falls back to the shipped `hammerspoon` asset when unknown, or a custom `image/png`/`image/svg+xml` value with canonical padded base64. Custom data is bounded to 32,768 decoded bytes; the plugin derives and validates 72×72 or 144×144 dimensions and applies the constrained SVG profile before SDK rendering. For a recognized encoder, an appearance may instead supply paired `value` and `indicator` fields: `value` is non-empty, control-free UTF-8 with at most 16 Unicode scalar values, and `indicator` is a finite number from `0` through `100`. They must appear together, may retain an icon, and cannot combine with colors, `progress`, or `badge`; the plugin renders them through the official `$B1` layout. Unknown fields, missing required fields, invalid values, and unsupported appearance versions are rejected and do not update the key. Appearance is independent from press: a press callback does not implicitly change presentation.

## Sound feedback (Lua-only)

Sound feedback in this release is entirely Hammerspoon-side Lua. There are no property-inspector sound settings, no sound-related protocol messages, and no Stream Deck plugin playback. Trusted Hammerspoon configuration chooses sound specs and policies; the bridge plays them only after the callback that owns the action succeeds.

Load the shared module with:

```lua
local sound = require("streamdeck.sound")
```

### Sound specs and defaults

`sound.system(name[, options])` creates a system-sound spec resolved by Hammerspoon's `hs.sound.getByName`. `sound.file(path[, options])` creates a trusted local-file spec resolved by Hammerspoon's `hs.sound.getByFile`. File paths belong in Lua configuration, not in Stream Deck settings. Both constructors accept optional `volume`, `loop`, and `stopOnReload` playback options; a per-spec `stopOnReload` value overrides the global setting. Invalid names, paths, or options raise a synchronous Lua error. Missing sounds or later lookup/playback failures are silent and nonfatal.

Global semantic defaults are configured once per Hammerspoon load:

```lua
sound.configure({
  defaults = {
    press = sound.system("Tink"),
    on = sound.system("Pop"),
    off = sound.system("Funk"),
  },
})
```

The `press` policy (`sound.press([spec])`) plays one press cue after a successful press. With no spec it uses the global `defaults.press`; with a spec it uses that action's override. The `toggle` policy (`sound.toggle([options])`) waits for the successful press callback to return exactly `sound.ON` or `sound.OFF`, then plays the configured `on` or `off` cue respectively. Its optional `on` and `off` fields override those global defaults. It never calls `appearance`, reads a previous appearance, or infers state. A callback returning any other value is silent.

The `sound.ON` and `sound.OFF` exports are opaque protected cue sentinels. Return them from a toggle callback only after the underlying operation has committed the resulting state; do not construct replacement values.

```lua
local sound = require("streamdeck.sound")

streamdeck.register({
  -- id, name, and appearance omitted here
  sound = sound.toggle(),
  press = function(context)
    local enabled = hs.caffeinate.toggle("displayIdle")
    context:refresh()
    return enabled and sound.ON or sound.OFF
  end,
})
```

Sound dispatch is tied to the callback actually selected by the gesture. A normal tap plays a press/toggle cue only after `press` succeeds; a failed or thrown callback is silent. Configured long and double presses do not play the tap cue. `release`, `push`, `rotate`, and `touchTap` do not trigger press audio. Playback lookup or playback itself may fail, including when `hs.sound` is unavailable; such failures are best-effort, silent, and never change the callback result or bridge error handling.

The default Hammerspoon provider caches resolved system and file sound objects and replays them without avoidable allocations. `stopOnReload = true` is best-effort; it must not invalidate unnamed file sounds.

To replace the default provider, pass one resolver/player function. It receives each resolved spec and the current context, and a truthy return means playback was accepted:

```lua
sound.configure({
  provider = function(spec, context)
    -- Resolve and play spec through a trusted Hammerspoon audio path.
    return my_sound_player(spec, context) == true
  end,
  stopOnReload = true,
})
```

The custom provider is the single resolver/player for resolved specs; the default Hammerspoon provider is not called as a fallback. A missing provider result or a false/error return is silent and nonfatal.

## Callback semantics and protected errors

Callbacks run asynchronously in response to bridge events and are protected with `xpcall`. A Lua exception in user code cannot terminate the server or Hammerspoon's callback loop.

- `press(context)` runs for a single tap. For legacy actions without `longPress` or `doublePress`, it continues to run immediately for a key-down event.

- `longPress(context)` is optional. When configured, the bridge starts one protected per-instance timer on key-down; if it reaches `longPressThresholdMs`, it invokes `longPress` and suppresses `press` for that sequence. A key-up before the threshold cancels the timer. The default threshold is 500 ms.

- `doublePress(context)` is optional. It delays `press` until the first short key-up's `doublePressThresholdMs` window expires. A second key-down in that window cancels the pending tap; its short key-up invokes `doublePress`. A long press on either key cancels the sequence and invokes `longPress` when configured. The default window is 350 ms.

- `release(context)` runs once for each completed key-up sequence when supplied. With `doublePress`, it can run before the deferred `press` callback. Duplicate key-up events and canceled/replaced sequences do not invoke callbacks again.
- `appear(context)` runs once when a new instance/action context is created or when a fresh reconnect rebuilds a previously cleared context. A repeated `instanceAppeared` for the same instance/action is a settings refresh; it updates `context:getSettings()` and does not invoke `appear` again.
- `disappear(context)` runs when the plugin removes an instance. Use it to release instance-scoped resources. It is not a substitute for `stop()`.
- A callback failure is logged locally and sent to the plugin as a safe protocol `error`. If the error is associated with an instance, the plugin also shows alert feedback on that instance. Error details never include the shared token or session ID. A failed callback leaves the current presentation unchanged.
- A malformed appearance result is handled like a callback failure: no malformed fields are sent to Stream Deck, and the previous presentation remains in place.

Encoder events use the same context lifecycle and error isolation as key events. `dialDown` invokes `push(context)` when defined, otherwise `press(context)`; `dialRotate` invokes `rotate(context, ticks, pressed)` when defined; and `dialUp` invokes `release(context)` when defined. Encoder callbacks are independent per visible instance, so settings and state are not shared between placements.

`touchTap(context, hold, tapPos)` is optional and runs only for dial actions. `hold` is a boolean and `tapPos` is a bounded `[x, y]` touchscreen coordinate (`0 <= x <= 800`, `0 <= y <= 100`). The callback is protected and receives the instance's own context and settings.
Registration and startup failures are synchronous Lua errors. Callback failures are runtime errors handled by the bridge. This distinction makes a typo in the action table visible during configuration load while keeping a device callback failure from taking down the bridge.

When the plugin is not connected, refresh requests cannot be delivered. The plugin displays its disconnected/offline presentation and retries with bounded backoff. Once authentication succeeds again, it receives a fresh session ID, requests the action list, re-announces visible instances with that ID, and requests appearance. Re-announcing an unchanged instance/action refreshes settings but does not invoke `appear` again.

## Installed action library

The Lua release includes twenty-one optional action definitions under `streamdeck.actions`. Installation places them beside the bridge in the managed `~/.hammerspoon/streamdeck` directory, but `require("streamdeck")` does not register them automatically.

Register the complete catalog with one bridge:

```lua
local streamdeck = require("streamdeck")
local actions = require("streamdeck.actions")

actions.registerAll(streamdeck)
streamdeck.start()
```

Register only selected stable catalog names when a smaller action list is preferable:

```lua
actions.register(streamdeck, {
  "application",
  "keep-awake",
  "window-snap",
})
```

Each module under `hammerspoon/streamdeck/actions/` returns one plain registry-valid definition and never calls `register()` or `start()`. The catalog owns registration and the shared successful-callback refresh policy, preserving callback returns such as `sound.ON` and `sound.OFF`. Failed callbacks do not refresh the catalog. Watcher-backed actions start their watcher only while visible instances exist, and timer-backed actions retain their asynchronous instance refreshes.

The [action catalog](../hammerspoon/streamdeck/actions/) documents all names, action IDs, suggested Stream Deck types, permissions, settings, and complete or selective registration. The pedagogical per-instance toggle is no longer shipped as an action; reusable per-instance behavior remains available through `helpers.perInstanceState`.

The installed action definitions run without Stream Deck hardware in the repository's Lua test harness. Custom definitions can still use the complete example below.

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

The fixed loopback listener and each explicit LAN client listener own independent sessions and context registries. Because `hs.httpserver` lacks a reliable close callback and per-WebSocket identity, a listener is a broadcast domain, not a per-peer channel: a new valid handshake rotates only that listener's session, while stale or malformed messages cannot dispatch against another listener. This supports one local plugin by default and deliberate concurrent LAN clients without adding a second Hammerspoon daemon.

## Excluded APIs in v1

The following are intentionally outside this contract:

- remote Lua evaluation or arbitrary Lua commands sent from Stream Deck;
- direct hardware calls from Lua, device enumeration, or per-button hardware configuration;
- unversioned or arbitrary appearance fields; v1 permits only the closed bundled `hammerspoon` icon or bounded canonical-base64 PNG/SVG values validated at the protocol boundary;
- callback return values that mutate settings or presentation implicitly;
- a Lua settings-write API;
- Bonjour discovery; non-loopback binding is supported only through the explicit LAN client slots documented above;
- arbitrary or unbounded property-inspector forms and arbitrary plugin-to-Lua configuration messages; bounded `settingsSchemaVersion = 1` descriptors are supported as documented above;
- polling or a background watcher for appearance changes; use an explicit `refresh` call from a Hammerspoon event source instead.

Code written against this document should use the `streamdeck` module shown above and the official Stream Deck plugin; it should not depend on an alternate Hammerspoon Stream Deck namespace or on remote evaluation.
