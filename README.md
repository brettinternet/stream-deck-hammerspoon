# Stream Deck ↔ Hammerspoon

[![CI](https://github.com/brettinternet/stream-deck-hammerspoon/actions/workflows/ci.yml/badge.svg)](https://github.com/brettinternet/stream-deck-hammerspoon/actions/workflows/ci.yml)

An Elgato Stream Deck plugin bridge for Hammerspoon. The plugin uses an authenticated loopback WebSocket by default to send key and lifecycle events to a Hammerspoon Lua module; Hammerspoon returns registered actions and appearance updates. An explicit LAN profile can add up to four isolated per-client PSK listeners without changing the loopback default.
Browse the installed [Hammerspoon action library](hammerspoon/streamdeck/actions/) for ready-to-use actions and configuration examples.

The official Stream Deck application remains the owner of plugin lifecycle, property inspectors, rendering, and hardware access. Keep it running during development and manual checks. Direct USB/HID or other hardware control is forbidden. This project does **not** replace the official application.

## Features

- **Hammerspoon Button** runs a registered Lua action with one configurable image. **Hammerspoon Toggle** adds separate inactive and active images. Both work on Stream Deck keys and encoder controls, including push, rotation, and touch.
- **Hammerspoon Multi-State** is a keypad action with four static presentation images. A bounded Lua `presentationState` selects the current image.
- Add any Hammerspoon action to a Stream Deck **Multi Action**.
- The property inspector lists registered actions and can render bounded per-instance `text`, `number`, `boolean`, and `select` settings declared in Lua.
- Lua actions can update their title, state, colors, progress, badge, and icon while visible, show transient success or error feedback, handle taps, long presses, and releases, and optionally play trusted Hammerspoon sounds.
- `require("streamdeck")` also provides **Reload Hammerspoon** and **Toggle Hammerspoon Console**. See the [Lua API guide](docs/lua-api.md).
- The optional `streamdeck.actions` catalog ships with the Lua module and can register all actions or only selected names; no separate action installation is required.
- `hammerspoon/streamdeck/` is the reusable Lua API. `protocol/schema/` is the canonical protocol-v1 JSON Schema. `plugin/` contains the TypeScript source and compiled official plugin layout.

This is not [Hammerspoon's `hs.streamdeck` extension](https://www.hammerspoon.org/docs/hs.streamdeck.html) which requires circumventing the Stream Deck software. It is a separate `streamdeck` Lua module and does not depend on or modify `hs.streamdeck`.

Non-goals are direct hardware access, an unauthenticated mode, Bonjour/discovery, arbitrary or unbounded property-inspector forms, and arbitrary plugin-to-Lua configuration messages. Protocol v1 supports bounded `settingsSchemaVersion: 1` descriptors with `text`, `number`, `boolean`, and `select` fields; [the protocol guide](docs/protocol.md) defines their normative contract. LAN clients are not discovered automatically and require deliberate per-client configuration.

## Quick start

Requirements: macOS, Hammerspoon, the official Stream Deck application, and Stream Deck 7.1 or later. Keep the Stream Deck application running while installing and using the plugin.

### Install a release

Download the matching `.streamDeckPlugin`, Lua archive, installer, and `SHA256SUMS` from the [latest release](https://github.com/brettinternet/stream-deck-hammerspoon/releases/latest). Keep the installer beside the Lua archive, then verify and install them:

```sh
shasum -a 256 -c SHA256SUMS
open <plugin-uuid>-<version>.streamDeckPlugin
chmod +x stream-deck-hammerspoon-install.sh
./stream-deck-hammerspoon-install.sh \
  stream-deck-hammerspoon-lua-<version>.tar.gz
```

### Build from source

To build and link the plugin from a checkout instead:

```sh
git clone https://github.com/brettinternet/stream-deck-hammerspoon.git
cd stream-deck-hammerspoon
mise install
bun install
bun run install:dev
```

`install:dev` builds and validates the plugin, links it to Stream Deck, and symlinks the Lua module into `~/.hammerspoon/streamdeck`. It is for source/development installs; release users do not need Node, Bun, Lua, or this checkout.

### Configure Hammerspoon

Register the installed action catalog in `~/.hammerspoon/init.lua`, then reload Hammerspoon:

```lua
local streamdeck = require("streamdeck")
local actions = require("streamdeck.actions")

actions.registerAll(streamdeck)
streamdeck.start()
```

Use `actions.register(streamdeck, { "application", "keep-awake" })` instead to expose only selected catalog actions. The bridge creates `~/.hammerspoon/streamdeck-token` on its first successful start. It contains two UUIDs and must remain mode `0600`. Never commit or log it. See the [action catalog](hammerspoon/streamdeck/actions/) or define custom actions with the [Lua API guide](docs/lua-api.md).

LAN operation is an explicit opt-in. Configure one listener per remote client with a specific interface, unique port, and manually provisioned 32-byte key file (`0600`); the default `streamdeck.start()` above still creates only the legacy loopback listener:

```lua
streamdeck.start({
  lan = {
    clients = {
      ["remote-deck"] = {
        interface = "en0",
        port = 17322,
        keyPath = "/Users/me/.hammerspoon/streamdeck-remote.key",
      },
    },
  },
})
```

The bridge accepts at most four LAN client entries (five listeners including loopback). Client IDs, listener ports, and credential paths must be unique. The remote plugin must explicitly use `ws://<address>:17322/streamdeck` with `lan = { clientId = "remote-deck", keyPath = "/path/to/streamdeck-remote.key" }`; there is no token or unauthenticated fallback on a LAN listener. See the [Lua API guide](docs/lua-api.md) for the shorthand single-client form and validation rules.

In the Stream Deck application, add a Hammerspoon action and select its registered action ID in the property inspector. Use Button for one image, Toggle for inactive and active images, and keypad-only Multi-State when `presentationState` should choose one of four static images. See the [setup guide](docs/setup.md) for complete release installation details.

## Architecture and protocol

The TypeScript plugin authenticates with a first-message `hello`, receives the registered action list, reports visible instances and key events, and requests appearance. The Lua server validates protocol-v1 messages, invokes protected registered callbacks, and computes title/state appearance. The fixed loopback listener uses default port `17321` and binds to localhost; explicitly configured LAN client slots use separate interfaces and ports with per-slot state and PSK frames.

Read the design records before changing a boundary:

- [Architecture](docs/architecture.md)
- [Protocol](docs/protocol.md)
- [Lua API](docs/lua-api.md)
- [Security](docs/security.md)
- [Development](docs/development.md)
- [Setup](docs/setup.md)
- [Troubleshooting](docs/troubleshooting.md)
