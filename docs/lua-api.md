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

After `helloAck`, every plugin-to-Lua application message (`listActions`, `instanceAppeared`, `instanceDisappeared`, `keyDown`, and `requestAppearance`) must include the exact current `sessionId`. Missing, stale, or invalid IDs are rejected before action dispatch and invoke no callback. The bridge clears the ID and contexts on close, `stop()`, or failure. Because `hs.httpserver` does not provide a reliable connection-close callback, this explicit ID check prevents a later client from inheriting tokenless authorization from a prior process-global hello flag. Reconnect or plugin restart sends a new token-bearing hello and rotates the ID; old-session messages remain invalid. Session IDs are never logged.

### `streamdeck.refresh(actionId)`

Requests fresh appearance data for every visible instance of the registered action identified by `actionId`. It does not invoke the press, appear, or disappear callback and does not change settings. The action ID must be a registered string ID; an unknown ID is a synchronous error.

Use this when state changes outside a key press, such as a microphone being muted by another application.

### `context:refresh()`

Requests fresh appearance data for the current key instance only. It is normally called at the end of a successful `press` callback after changing the underlying state.

### `context:getSettings()`

Returns the settings stored by Stream Deck for the current key instance. Settings are ordinary decoded Lua values. The returned settings belong to this context; changing a local Lua table does not write settings back to Stream Deck. This v1 API has no settings-write method.

These are the only context methods in v1. Contexts are per-instance: assigning one action to several keys gives each key an independent context and independent settings. Do not use a module-global settings table when per-key behavior is intended.

## Action definitions and validation

An action definition is a table with these fields:

| Field | Required | Type | Meaning |
| --- | --- | --- | --- |
| `id` | yes | non-empty string | Explicit, stable action ID. It must be unique within this Hammerspoon process. |
| `name` | yes | non-empty string | Human-readable action name shown when choosing the action in Stream Deck. |
| `settingsSchema` | no | table | Optional settings schema supplied to the plugin's property inspector. |
| `settingsSchemaVersion` | no | positive integer | Settings descriptor version. Version 1 enables bounded validation; omitted versions remain legacy opaque arrays and newer versions are preserved without rendering. |
| `appearance` | yes | function | Computes the current title and binary state for a context. |
| `press` | yes | function | Handles a key-down event for a context. |
| `appear` | no | function | Runs when a new visible instance appears or a restored context is rebuilt after reconnect. |
| `disappear` | no | function | Runs when a visible instance disappears or the connection is torn down. |

Registration rejects a non-table definition, missing required fields, wrong field types, an empty ID or name, duplicate IDs, and unknown fields. `settingsSchema`, when supplied, must be a dense array of at most 32 JSON values. With `settingsSchemaVersion = 1`, each descriptor must use one of `text`, `number`, `boolean`, or `select`, with a unique bounded key, optional bounded label/required flag, kind-specific bounded constraints, and a type-correct default. Select options are bounded unique `{ value, label }` objects and defaults must match an option. Unknown descriptor or constraint keys, duplicate keys, invalid combinations, cycles, sparse arrays, non-finite numbers, and out-of-range values are rejected before action listing. Instance settings are not validated against this schema yet. Legacy arrays without a version remain opaque for compatibility. IDs are not generated by the module. Use a stable, namespaced ID such as `com.example.microphone-toggle`; changing an ID creates a new action from the plugin's perspective and strands existing per-key assignments.

The callbacks receive the current context. `press`, `appear`, and `disappear` return values are ignored. `appearance` must return exactly:

```lua
{
  title = "Muted",
  state = "active",
}
```

`title` must be a string and `state` must be either `"active"` or `"inactive"`. These are the only v1 appearance fields. A returned table containing an unknown field, a missing field, a non-string title, or any other state is rejected and does not update the key. Appearance is independent from press: a press callback does not implicitly change presentation.

## Callback semantics and protected errors

Callbacks run asynchronously in response to bridge events and are protected with `xpcall`. A Lua exception in user code cannot terminate the server or Hammerspoon's callback loop.

- `press(context)` runs only for a key-down event. Its return value is ignored. It should perform the requested operation, then call `context:refresh()` if the operation changes the key's appearance.
- `appearance(context)` runs when an instance appears, after `context:refresh()`, and after `streamdeck.refresh(actionId)`. It should read current state and return the `{ title, state }` table; it should not perform the press operation.
- `appear(context)` runs once when a new instance/action context is created or when a fresh reconnect rebuilds a previously cleared context. A repeated `instanceAppeared` for the same instance/action is a settings refresh; it updates `context:getSettings()` and does not invoke `appear` again.
- `disappear(context)` runs when the plugin removes an instance. Use it to release instance-scoped resources. It is not a substitute for `stop()`.
- A callback failure is logged locally and sent to the plugin as a safe protocol `error`. If the error is associated with an instance, the plugin also shows alert feedback on that instance. Error details never include the shared token or session ID. A failed callback leaves the current presentation unchanged.
- A malformed appearance result is handled like a callback failure: no malformed fields are sent to Stream Deck, and the previous presentation remains in place.

Registration and startup failures are synchronous Lua errors. Callback failures are runtime errors handled by the bridge. This distinction makes a typo in the action table visible during configuration load while keeping a device callback failure from taking down the bridge.

When the plugin is not connected, refresh requests cannot be delivered. The plugin displays its disconnected/offline presentation and retries with bounded backoff. Once authentication succeeds again, it receives a fresh session ID, requests the action list, re-announces visible instances with that ID, and requests appearance. Re-announcing an unchanged instance/action refreshes settings but does not invoke `appear` again.

## Example collection

The repository includes complete configuration snippets in `hammerspoon/examples/`:

- `microphone.lua` toggles the default input device and refreshes the pressed key.
- `application.lua` shows the frontmost application, hides it on press, and refreshes from `hs.application.watcher` events.
- `multi-instance.lua` keeps independent toggle state for each visible key and reads an optional per-instance `label` setting.
- `focus-timer.lua` (`com.brettinternet.hammerspoon.focus-timer`) starts and stops a per-key 25-minute focus timer, showing `Focus` while it runs and returning to `Ready` when it expires; its per-instance lifecycle owns the timer and refreshes the key on start, stop, and expiry.
- `window-maximize.lua` (`com.brettinternet.hammerspoon.window-maximize`) shows the focused application's name and toggles its focused window between zoomed and normal states, reporting `No window` when no focused window is available; it demonstrates focused-window state checks, per-instance lifecycle, and protected operation errors.
- `clipboard-clean.lua` (`com.brettinternet.hammerspoon.clipboard-clean`) reports when no text is available, then trims surrounding whitespace on press and refreshes the appearance; it demonstrates pasteboard read/write and appearance refresh.
- `keyboard-layout.lua` (`com.brettinternet.hammerspoon.keyboard-layout`) toggles between two keyboard layouts using `hs.keycodes`, defaults to `U.S.` and `Dvorak` when settings are absent, and refreshes the pressed key after a successful switch.
- `url-launcher.lua` (`com.brettinternet.hammerspoon.url-launcher`) opens a configured URL with `hs.urlevent`, defaults to a Hammerspoon documentation URL when settings are absent, and reports invalid or unavailable URL launches as protected errors.
- `window-snap.lua` (`com.brettinternet.hammerspoon.window-snap`) cycles each focused window through left-half, right-half, and full-work-area layouts with per-instance lifecycle state and refreshes after successful moves.
- `keep-awake.lua` (`com.brettinternet.hammerspoon.keep-awake`) toggles display-idle sleep prevention with `hs.caffeinate`, updates every visible instance after the global state changes, and reports unavailable or failed power APIs as protected errors.
- `app-launcher.lua` (`com.brettinternet.hammerspoon.app-launcher`) launches or focuses a configured application with safe per-key app/label defaults, shows when the target is frontmost, and refreshes after a successful launch or focus.
- `clipboard-stash.lua` (`com.brettinternet.hammerspoon.clipboard-stash`) parks one clipboard item per key, restores it on the next press, and resets its per-instance stash on disappearance.
- `window-center.lua` (`com.brettinternet.hammerspoon.window-center`) centers the focused window within its screen work area without changing its size, reporting when no focused window is available.
- `meeting-mode.lua` (`com.brettinternet.hammerspoon.meeting-mode`) coordinates microphone muting and display-idle prevention as one global mode, refreshing every visible instance only after both changes succeed.
- `lock-screen.lua` (`com.brettinternet.hammerspoon.lock-screen`) provides a one-shot privacy key through `hs.caffeinate.lockScreen` without pretending the locked state is observable.

Copy any of the fifteen files into `~/.hammerspoon` or adapt it in your existing configuration. Each file registers a namespaced action for the generic Stream Deck action; select that registered action ID in the property inspector. The official bridge owns the connection, so the examples use `require("streamdeck")`, never `hs.streamdeck` or direct hardware access. The current v1 inspector edits `actionId` only, so settings-based examples use their documented defaults unless their settings are supplied by an adapted configuration.

All fifteen examples are hardware-free and use ordinary Hammerspoon APIs; they can be copied or adapted without a connected Stream Deck. They run without Hammerspoon or hardware in the repository's Lua test harness.

## Complete example: microphone mute

The following is a complete `~/.hammerspoon/init.lua` example. It registers one stable action, toggles the default input device, and derives the title/state independently from the press callback.

```lua
local streamdeck = require("streamdeck")

local function default_microphone()
  return hs.audiodevice.defaultInputDevice()
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

    if microphone:muted() then
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

    microphone:setMuted(not microphone:muted())
    context:refresh()
  end,
})

streamdeck.start()
```

To verify the action, reload Hammerspoon, add the generic bridge action in Stream Deck, select `com.example.microphone-toggle` in its action settings, and press the key. A successful press toggles the default input mute state and refreshes only that key. If another application changes the mute state, run `streamdeck.refresh("com.example.microphone-toggle")` from the Hammerspoon configuration or another local Hammerspoon event handler to refresh all visible instances.

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
- appearance fields other than `title` and `state` (`active`/`inactive`);
- callback return values that mutate settings or presentation implicitly;
- a Lua settings-write API;
- multiple simultaneous plugin clients, Bonjour discovery, or non-loopback binding;
- dynamic property-inspector forms and arbitrary plugin-to-Lua configuration messages;
- polling or a background watcher for appearance changes; use an explicit `refresh` call from a Hammerspoon event source instead.

Code written against this document should use the `streamdeck` module shown above and the official Stream Deck plugin; it should not depend on an alternate Hammerspoon Stream Deck namespace or on remote evaluation.
