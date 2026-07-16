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
bun test            # JavaScript and protocol tests
bun run check       # repository checks, including type and static checks
```

Run the Lua load check after changing `hammerspoon/streamdeck/`:

```sh
lua -e 'assert(loadfile("hammerspoon/streamdeck/init.lua"))'
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

## Token setup

Authentication is required; there is no unauthenticated fallback. On first start, the Lua bridge creates two UUIDs in:

```text
~/.hammerspoon/streamdeck-token
```

The file must be readable only by the current user (`chmod 0600`). The plugin reads this runtime file when it connects. Never put the token in Stream Deck settings, source control, command-line arguments, screenshots, or logs. Never paste it into an issue or chat transcript.

To rotate credentials, stop the bridge, remove `~/.hammerspoon/streamdeck-token`, reload Hammerspoon so the Lua bridge generates a new pair of UUIDs, then restart the plugin. If permissions or token contents are wrong, fix the file; do not disable authentication. Verify locally with:
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

1. Install the pinned runtimes with `mise install`, then run `bun install`, `bun run check`, `bun test`, and `bun run build`.
2. Run the Lua load check and link or copy `hammerspoon/streamdeck/` into `~/.hammerspoon/`.
3. Ensure `~/.hammerspoon/streamdeck-token` exists with mode `0600`; start/reload Hammerspoon and start the bridge with its configured action registration.
4. Validate, pack, install, and restart the plugin with the official CLI commands above. Leave the official Stream Deck application running.
5. On the official Stream Deck, add the generic action `com.brettinternet.hammerspoon.action` to a key. In its property inspector, select a registered action ID and save it to that instance's settings.
6. Press and release the key. Confirm the registered Hammerspoon callback runs and that the key renders the configured title and state (`0` or `1`).
7. Confirm the offline/reconnect path by reloading Hammerspoon: the key should temporarily show `Hammerspoon Offline`, then reconnect, refresh the action list, resend visible instances, and restore appearance.
8. Stop and restart only the bridge/plugin as needed; do not use direct hardware APIs or a second hardware controller.

## Troubleshooting

### The plugin stays offline

- Confirm Hammerspoon is running and the bridge is started.
- Confirm both ends use the default loopback port `17321` and that the server binds localhost/loopback only.
- Check `~/.hammerspoon/streamdeck-token` exists, is readable by the relevant user, contains the current two-UUID token, and has mode `0600`.
- Reload Hammerspoon after changing the module or token, then restart the plugin.
- Verify the official Stream Deck application is still running; the bridge expects one local plugin client, not an independent hardware connection.

### Authentication fails

The first WebSocket message must be the protocol-v1 `hello` containing the shared token and `pluginVersion`. An unauthenticated or malformed message is rejected. Check the token file and permissions on both sides; never turn authentication off. Do not expect a WebSocket upgrade-header token: Hammerspoon's `hs.httpserver:websocket` exposes message callbacks rather than upgrade headers.

### Actions or appearance are stale

Reloading Lua intentionally drops the instance registry. Wait for the plugin's bounded reconnect, then confirm the plugin re-authenticates, requests actions, resends visible instances, and requests appearance. An unknown/stale instance or action ID should be corrected by selecting a current registered action in the property inspector, not by editing protocol messages manually.

### Module cannot be loaded

Check that `~/.hammerspoon/streamdeck/` is a link or copy of the repository's `hammerspoon/streamdeck/` directory, reload Hammerspoon, and run the Lua load check again. A load check does not prove that Hammerspoon has started the server or that callbacks are registered.

## Logs and diagnostics

Use the official Stream Deck application/plugin logs and Hammerspoon Console for diagnostics. Safe protocol error codes/messages and connection state may be logged; shared tokens must never be logged. Capture timestamps, plugin version, protocol version, port, and the safe error code when reporting a problem, but redact token paths if they reveal sensitive environment details. The server is loopback-only, Bonjour is disabled, and `hs.httpserver` effectively permits one WebSocket client; a second client is not a supported development setup.

## Hardware-free development

Builds, JavaScript/protocol tests, JSON Schema validation, official CLI validation/packing, and Lua load checks can run without hardware. Fake transports can prove protocol behavior. A connected Stream Deck and active property inspector are required to prove physical key rendering, key presses, and UI interaction. Do not bypass the official Stream Deck application or attempt direct USB/HID control; those paths are forbidden and are not equivalent acceptance checks.
