# Development

This repository is an official Elgato Stream Deck plugin that bridges the plugin to Hammerspoon over an authenticated loopback WebSocket. The official Stream Deck application owns plugin lifecycle and hardware access; this project does not open a direct hardware connection.

## Requirements

Current development targets are:

- Stream Deck SDK documentation 2.0.0
- Stream Deck 7.1 or newer
- Node.js 24.18.0 or newer (the project pins 24.18.0)
- `@elgato/streamdeck` 2.1.0
- Bun 1.3.14
- Lua 5.4.8
- A macOS installation of Hammerspoon
- The official Stream Deck application for install and hardware/UI checks

## Default bridge endpoint and transport behavior

The default Hammerspoon endpoint is the concrete WebSocket URL:

```text
ws://localhost:17321/streamdeck
```

Hammerspoon binds this endpoint to localhost/loopback with Bonjour disabled. The `hs.httpserver:websocket` message callback must return a string, so lifecycle events with no response can produce a zero-length transport frame. The TypeScript transport ignores only zero-length frames before JSON/protocol validation; every non-empty frame remains strict. Empty frames are transport artifacts, not protocol messages or an unauthenticated fallback, and this is a reversible transport-specific limitation.

Authentication starts with the shared token in the plugin's first `hello`. Hammerspoon then creates a fresh non-empty opaque in-memory `sessionId` with `hs.host.uuid()` and returns it in `helloAck.sessionId`. The plugin stores that ID only in memory and includes the exact ID in every later application message (`listActions`, `instanceAppeared`, `instanceDisappeared`, `keyDown`, and `requestAppearance`). Missing or stale IDs are rejected before dispatch. Since `hs.httpserver` does not provide a reliable close callback, the bridge clears the ID and prior instance contexts on close, stop, or failure; a valid reconnect hello is still accepted, safely clears any old contexts, and rotates the ID. A process-global authenticated boolean is not used as the binding.

Install the project runtimes with [mise](https://mise.jdx.dev/):

```sh
mise install
```

Use Bun for JavaScript dependencies and scripts. Do not use npm or npx for this repository:

```sh
bun install
```

Useful upstream references:

- [Stream Deck SDK documentation](https://docs.elgato.com/streamdeck/sdk/introduction/getting-started/)
- [Stream Deck CLI documentation](https://docs.elgato.com/streamdeck/cli/intro/)
- [Stream Deck CLI command reference](https://docs.elgato.com/streamdeck/cli/commands/)
- [Hammerspoon documentation](https://www.hammerspoon.org/docs/)
- [mise documentation](https://mise.jdx.dev/)

## Everyday checks

From the repository root:

```sh
bun run build       # compile the plugin into plugin/com.brettinternet.hammerspoon.sdPlugin/
bun run watch       # rebuild while TypeScript/UI sources change
bun run test        # full cross-language gate: plugin Bun tests, then Lua tests
bun run check       # repository checks, including type and static checks
```

Run the Lua load check after changing `hammerspoon/streamdeck/`:

```sh
mise exec -- lua -e 'assert(loadfile("hammerspoon/streamdeck/init.lua"))'
```

This is a syntax/load check only; it does not start Hammerspoon or exercise the bridge. The normal development loop is: edit, run the smallest relevant check, then run `bun run build` before packaging.

## Official CLI flow

Use the official Stream Deck CLI through Bun's package runner, with the CLI version locked by this repository (`@elgato/cli` 1.7.4). The executable is `streamdeck`; `link` is the CLI's install operation. Run these from the repository root after a successful build:

bunx --package @elgato/cli@1.7.4 streamdeck validate plugin/com.brettinternet.hammerspoon.sdPlugin
bunx --package @elgato/cli@1.7.4 streamdeck pack plugin/com.brettinternet.hammerspoon.sdPlugin
bunx --package @elgato/cli@1.7.4 streamdeck link plugin/com.brettinternet.hammerspoon.sdPlugin
bunx --package @elgato/cli@1.7.4 streamdeck restart com.brettinternet.hammerspoon
bunx --package @elgato/cli@1.7.4 streamdeck dev
```

`validate` checks the compiled plugin. `pack` (also named `bundle` by the CLI) creates the distributable `.streamDeckPlugin` package. `link` installs the plugin by linking the compiled directory into the official Stream Deck application. `restart` reloads the installed plugin. `dev` enables developer mode, which permits debugger attachment and property-inspector debugging; it is not a `--debug` plugin runner. Use the Node inspector or an IDE debugger to attach after enabling developer mode. Consult `bunx --package @elgato/cli@1.7.4 streamdeck --help` for version-specific options.

Keep the official Stream Deck application running throughout this flow. Do not substitute a direct USB/HID operation or another hardware controller. The CLI flow can validate, package, install, restart, and enable debug support without a connected deck; hardware/UI completion still requires the official application and a connected device.
For reproducible versioned plugin and Lua artifacts, checksums, installation, and uninstall steps, use the [release guide](releases.md) and run `bun run release`.

## Token setup

Authentication is required; there is no unauthenticated fallback. On first start, the Lua bridge creates two UUIDs in:

```text
~/.hammerspoon/streamdeck-token
```

The file must be readable only by the current user (`chmod 0600`). The plugin reads this runtime file when it connects. Never put the token in Stream Deck settings, source control, command-line arguments, screenshots, or logs. Never paste it into an issue or chat transcript. Session IDs are separate fresh opaque values: they are generated per accepted hello, kept only in memory, rotated on reconnect/plugin restart, and never logged or persisted.

To rotate credentials, stop the bridge, remove `~/.hammerspoon/streamdeck-token`, reload Hammerspoon so the Lua bridge generates a new pair of UUIDs, then restart the plugin. Token rotation invalidates old authenticated sessions; normal reconnect also invalidates the old in-memory session ID even when the token file is unchanged. If permissions or token contents are wrong, fix the file; do not disable authentication. Verify locally with:
```sh
stat -f '%Sp %N' ~/.hammerspoon/streamdeck-token
```

## Loading the Lua module

The reusable module is under `hammerspoon/streamdeck/`. Hammerspoon must be able to resolve the `streamdeck` module. During development, either link the directory into Hammerspoon's Lua path or copy it there:

```sh
mkdir -p ~/.hammerspoon
ln -sfn "$PWD/hammerspoon/streamdeck" ~/.hammerspoon/streamdeck
```

If symlinks are unsuitable, copy instead:

```sh
mkdir -p ~/.hammerspoon/streamdeck
cp -R hammerspoon/streamdeck/. ~/.hammerspoon/streamdeck/
```

Load/reload the module from Hammerspoon's configuration using its normal Lua `require`/start path, then reload Hammerspoon. Do not evaluate raw Lua snippets from the shell as a substitute for loading the module. Keep the token file outside the repository.

## Manual vertical slice

The complete hardware-facing slice cannot be automated without a connected Stream Deck and an active property inspector. Exercise it manually as follows:

1. Install the pinned runtimes with `mise install`, then run `bun install`, `bun run check`, `bun run test`, and `bun run build`.
2. Run the Lua load check and link or copy `hammerspoon/streamdeck/` into `~/.hammerspoon/`.
3. Ensure `~/.hammerspoon/streamdeck-token` exists with mode `0600`; start/reload Hammerspoon and start the bridge with its configured action registration, using the default endpoint `ws://localhost:17321/streamdeck` when checking the bridge connection.
4. Validate, pack, install, and restart the plugin with the official CLI commands above. Leave the official Stream Deck application running.
5. On the official Stream Deck, add the generic action `com.brettinternet.hammerspoon.action` to a key. For the initial action event, confirm the plugin reads settings from Stream Deck's `actionInfo.payload.settings`; select a registered action ID in its property inspector and save it to that instance's settings.
6. Press and release the key. Confirm the registered Hammerspoon callback runs and that the key renders the configured title and state (`0` or `1`).
7. Confirm the offline/reconnect path by reloading Hammerspoon: the key should temporarily show `Hammerspoon Offline`, then reconnect, receive a fresh `helloAck.sessionId`, refresh the action list, resend visible instances with that ID, and restore appearance.
8. Stop and restart only the bridge/plugin as needed; do not use direct hardware APIs or a second hardware controller.

## Troubleshooting

### The plugin stays offline

- Confirm Hammerspoon is running and the bridge is started.
- Confirm both ends use the default endpoint `ws://localhost:17321/streamdeck` and that the server binds localhost/loopback only.
- Check `~/.hammerspoon/streamdeck-token` exists, is readable by the relevant user, contains the current two-UUID token, and has mode `0600`.
- Reload Hammerspoon after changing the module or token, then restart the plugin.
- Verify the official Stream Deck application is still running; the bridge expects one local plugin client, not an independent hardware connection.

### Authentication fails

The first WebSocket message must be the protocol-v1 `hello` containing the shared token and `pluginVersion`. A valid hello always establishes a fresh session ID and invalidates any old one. Every later plugin-to-Lua application message must echo the exact current ID; an unauthenticated, malformed, missing-ID, or stale-ID message is rejected. Check the token file and permissions on both sides; never turn authentication off. Do not expect a WebSocket upgrade-header token: Hammerspoon's `hs.httpserver:websocket` exposes message callbacks rather than upgrade headers.

### Reconnect and session troubleshooting

If the plugin reconnects but actions do not run, treat the session as stale rather than trying to reuse a previous ID:

1. Reload or restart Hammerspoon so the bridge clears its in-memory session ID and instance contexts.
2. Restart the plugin (or use the official Stream Deck CLI `restart`) so it rereads the token and sends a new token-bearing `hello`.
3. Confirm the plugin receives `helloAck.sessionId`, keeps it only in memory, and includes it on `listActions`, each lifecycle event, `keyDown`, and `requestAppearance`.
4. Confirm the Lua bridge rejects missing/old IDs without invoking `appear`, `press`, or `disappear`; do not log or print the ID while diagnosing.
5. Wait for synchronization: the plugin requests actions, re-announces visible instances, and requests appearance. A repeated `instanceAppeared` for the same instance/action refreshes settings and must not run `appear` again.

If Hammerspoon cannot report the old socket's close, this sequence is still safe: the next valid hello clears prior contexts and rotates the session ID, so the abandoned client cannot send tokenless application messages.

### Empty frames or transport parse errors

`hs.httpserver:websocket` callbacks must return a string, so a lifecycle event with no response may appear as a zero-length frame. The TypeScript transport is expected to ignore only that zero-length frame before JSON/protocol validation. Do not treat it as an additional protocol message or an authentication failure. If a frame contains any bytes, it is not an empty-frame artifact: malformed JSON, an unsupported version, an unknown type, or any other invalid non-empty frame must remain a strict validation error. Check the sender/transport framing before changing protocol or authentication behavior.

### Actions or appearance are stale

Reloading Lua intentionally drops the instance registry, session ID, and instance contexts. Wait for the plugin's bounded reconnect, then confirm it re-authenticates, receives a fresh session ID, requests actions, resends visible instances, and requests appearance. A repeated `instanceAppeared` for an unchanged instance/action only refreshes settings; it must not rerun `appear`. An unknown/stale instance, action, or session ID should be corrected by restarting/reconnecting the two endpoints and selecting a current registered action in the property inspector, not by editing protocol messages manually.

### Module cannot be loaded

Check that `~/.hammerspoon/streamdeck/` is a link or copy of the repository's `hammerspoon/streamdeck/` directory, reload Hammerspoon, and run the Lua load check again. A load check does not prove that Hammerspoon has started the server or that callbacks are registered.

## Logs and diagnostics

Use the official Stream Deck application/plugin logs and Hammerspoon Console for diagnostics. Safe protocol error codes/messages and connection state may be logged; shared tokens, hello payloads, and session IDs must never be logged. Capture timestamps, plugin version, protocol version, port, and the safe error code when reporting a problem, but redact token paths if they reveal sensitive environment details. The server is loopback-only, Bonjour is disabled, and `hs.httpserver` effectively permits one WebSocket client; a second client is not a supported development setup.

## Hardware-free development

Builds, JavaScript/protocol tests, JSON Schema validation, official CLI validation/packing, and Lua load checks can run without hardware. Fake transports can prove protocol behavior. A connected Stream Deck and active property inspector are required to prove physical key rendering, key presses, and UI interaction. Do not bypass the official Stream Deck application or attempt direct USB/HID control; those paths are forbidden and are not equivalent acceptance checks.
