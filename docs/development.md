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

Authentication starts with the shared token in the plugin's first `hello`. Hammerspoon then creates a fresh non-empty opaque `sessionId` with `hs.host.uuid()` and returns it in `helloAck.sessionId`. The plugin stores that ID only in memory and includes it in every later application message (`listActions`, `instanceAppeared`, `instanceDisappeared`, `keyDown`, `keyUp`, `dialDown`, `dialRotate`, `dialUp`, `touchTap`, and `requestAppearance`). Missing or stale IDs are rejected before dispatch.

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
lua -- lua -e 'assert(loadfile("hammerspoon/streamdeck/init.lua"))'
```

This is a syntax/load check only; it does not start Hammerspoon or exercise the bridge. The normal development loop is: edit, run the smallest relevant check, then run `bun run build` before packaging.

## Development installer

After `mise install` and `bun install`, run the idempotent checkout installer with the official Stream Deck application installed and running:

```sh
bun run install:dev
```

It builds and validates the plugin, links it with the pinned local Stream Deck CLI, symlinks `hammerspoon/streamdeck/` into `~/.hammerspoon/streamdeck`, runs the Lua load check through mise, and restarts the linked plugin. It refuses to replace an existing Hammerspoon module path or a symlink pointing somewhere else. It does not edit `~/.hammerspoon/init.lua`, reload Hammerspoon, create the bridge token, or configure a Stream Deck key.

The manual Hammerspoon step remains:

```lua
local streamdeck = require("streamdeck")

-- streamdeck.register(...)
streamdeck.start()
```

Add that configuration to `~/.hammerspoon/init.lua`, register your actions, and reload Hammerspoon. Then add the Hammerspoon Action in Stream Deck and select a registered action ID in its inspector.

## Official CLI flow

Use the official Stream Deck CLI through Bun's package runner, with the CLI version locked by this repository (`@elgato/cli` 1.7.4). The executable is `streamdeck`; `link` is the CLI's install operation. Run these from the repository root after a successful build:

```sh
bunx --package @elgato/cli@1.7.4 streamdeck validate plugin/com.brettinternet.hammerspoon.sdPlugin
bunx --package @elgato/cli@1.7.4 streamdeck pack plugin/com.brettinternet.hammerspoon.sdPlugin
bunx --package @elgato/cli@1.7.4 streamdeck link plugin/com.brettinternet.hammerspoon.sdPlugin
open com.brettinternet.hammerspoon.streamDeckPlugin
bunx --package @elgato/cli@1.7.4 streamdeck restart com.brettinternet.hammerspoon
bunx --package @elgato/cli@1.7.4 streamdeck dev
```

`validate` checks the compiled plugin. `pack` (also named `bundle` by the CLI) creates the distributable `.streamDeckPlugin` package. `link` installs the plugin by linking the compiled directory into the official Stream Deck application. `open com.brettinternet.hammerspoon.streamDeckPlugin` opens the local extension. `restart` reloads the installed plugin. `dev` enables developer mode, which permits debugger attachment and property-inspector debugging; it is not a `--debug` plugin runner. Use the Node inspector or an IDE debugger to attach after enabling developer mode. Consult `bunx --package @elgato/cli@1.7.4 streamdeck --help` for version-specific options.

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

See the [troubleshooting guide](troubleshooting.md) for common offline, authentication, reconnect/session, transport, stale appearance, module-loading, diagnostics, and safe reporting issues. It also documents secrets that must not be logged.

## Hardware-free development

Builds, JavaScript/protocol tests, JSON Schema validation, official CLI validation/packing, and Lua load checks can run without hardware. Fake transports can prove protocol behavior. A connected Stream Deck and active property inspector are required to prove physical key rendering, key presses, and UI interaction. Do not bypass the official Stream Deck application or attempt direct USB/HID control; those paths are forbidden and are not equivalent acceptance checks.
