# Stream Deck ↔ Hammerspoon

[![CI](https://github.com/brettinternet/stream-deck-hammerspoon/actions/workflows/ci.yml/badge.svg)](https://github.com/brettinternet/stream-deck-hammerspoon/actions/workflows/ci.yml)

An Elgato Stream Deck plugin bridge for Hammerspoon. The plugin uses an authenticated loopback WebSocket by default to send key and lifecycle events to a Hammerspoon Lua module; Hammerspoon returns registered actions and appearance updates.
Browse the [Hammerspoon examples](hammerspoon/examples/) for ready-to-copy configurations.

The official Stream Deck application remains the owner of plugin lifecycle, property inspectors, rendering, and hardware access. Keep it running during development and manual checks. Direct USB/HID or other hardware control is forbidden. This project does **not** replace the official application.

## Features

- **Hammerspoon Button** runs a registered Lua action with one configurable image. **Hammerspoon Toggle** adds separate inactive and active images. Both work on Stream Deck keys and encoder controls, including push, rotation, and touch.
- **Hammerspoon Multi-State** is a keypad action with four static presentation images. A bounded Lua `presentationState` selects the current image.
- Add any Hammerspoon action to a Stream Deck **Multi Action**.
- The property inspector lists registered actions and can render bounded per-instance `text`, `number`, `boolean`, and `select` settings declared in Lua.
- Lua actions can update their title, state, colors, progress, badge, and icon while visible, show transient success or error feedback, handle taps, long presses, and releases, and optionally play trusted Hammerspoon sounds.
- `require("streamdeck")` also provides **Reload Hammerspoon** and **Toggle Hammerspoon Console**. See the [Lua API guide](docs/lua-api.md).
- `hammerspoon/streamdeck/` is the reusable Lua API. `protocol/schema/` is the canonical protocol-v1 JSON Schema. `plugin/` contains the TypeScript source and compiled official plugin layout.

This is not Hammerspoon's `hs.streamdeck` extension. It is a separate `streamdeck` Lua module and does not depend on or modify `hs.streamdeck`.

Non-goals are direct hardware access, an unauthenticated mode, Bonjour/discovery, multiple simultaneous plugin clients, arbitrary or unbounded property-inspector forms, and arbitrary plugin-to-Lua configuration messages. Protocol v1 supports bounded `settingsSchemaVersion: 1` descriptors with `text`, `number`, `boolean`, and `select` fields; [the protocol guide](docs/protocol.md) defines their normative contract. This is distinct from [Hammerspoon's streamdeck extension](https://github.com/Hammerspoon/hammerspoon/tree/master/extensions/streamdeck) which requires circumventing the Stream Deck software.

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

Add the bridge, your registrations, and `streamdeck.start()` to `~/.hammerspoon/init.lua`, then reload Hammerspoon:

```lua
local streamdeck = require("streamdeck")

-- streamdeck.register({ ... })
streamdeck.start()
```

The bridge creates `~/.hammerspoon/streamdeck-token` on its first successful start. It contains two UUIDs and must remain mode `0600`. Never commit or log it. Start with the registration and context example in [the Lua API guide](docs/lua-api.md), or browse the [Hammerspoon examples](hammerspoon/examples/) for ready-to-copy configurations.

In the Stream Deck application, add a Hammerspoon action and select its registered action ID in the property inspector. Use Button for one image, Toggle for inactive and active images, and keypad-only Multi-State when `presentationState` should choose one of four static images. See the [setup guide](docs/setup.md) for complete release installation details.

## Architecture and protocol

The TypeScript plugin authenticates with a first-message `hello`, receives the registered action list, reports visible instances and key events, and requests appearance. The Lua server validates protocol-v1 messages, invokes protected registered callbacks, and computes title/state appearance. The loopback server uses default port `17321`, binds to localhost, disables Bonjour, and supports one plugin WebSocket client.

Read the design records before changing a boundary:

- [Architecture](docs/architecture.md)
- [Protocol](docs/protocol.md)
- [Lua API](docs/lua-api.md)
- [Security](docs/security.md)
- [Development](docs/development.md)
- [Setup](docs/setup.md)
- [Troubleshooting](docs/troubleshooting.md)
