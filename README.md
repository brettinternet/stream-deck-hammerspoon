# Stream Deck ↔ Hammerspoon

[![CI](https://github.com/brettinternet/stream-deck-hammerspoon/actions/workflows/ci.yml/badge.svg)](https://github.com/brettinternet/stream-deck-hammerspoon/actions/workflows/ci.yml)

An Elgato Stream Deck plugin bridge for Hammerspoon. The plugin uses an authenticated, localhost-only WebSocket to send key and lifecycle events to a Hammerspoon Lua module; Hammerspoon returns registered actions and appearance updates.
Browse the [Hammerspoon examples](hammerspoon/examples/) for ready-to-copy configurations.

The official Stream Deck application remains the owner of plugin lifecycle, property inspectors, rendering, and hardware access. Keep it running during development and manual checks. Direct USB/HID or other hardware control is forbidden. This project does **not** replace the official application.

## What this is and is not

- One generic action, `com.brettinternet.hammerspoon.action`, points a Stream Deck instance at a registered Hammerspoon action.
- `hammerspoon/streamdeck/` is the reusable Lua API (`register`, `start`, `stop`, `refresh`, and context helpers).
- `protocol/schema/` is the canonical protocol-v1 JSON Schema.
- `plugin/` contains TypeScript and the compiled official plugin layout.
- `hs.streamdeck` is not used. This bridge is a separate `streamdeck` Lua module and does not depend on or modify a Hammerspoon `hs.streamdeck` extension.

Non-goals are direct hardware access, an unauthenticated mode, Bonjour/discovery, multiple simultaneous plugin clients, and dynamic property-inspector forms in protocol v1. This is distinct from [Hammerspoon's streamdeck extension](https://github.com/Hammerspoon/hammerspoon/tree/master/extensions/streamdeck) which requires circumventing the Stream Deck software.

## Quick start

Requirements: macOS, Hammerspoon, the official Stream Deck application, Stream Deck 7.1+, Node 24.18.0, Bun 1.3.14, and Lua 5.4.8. Provision the pinned runtimes and install JavaScript dependencies with:

```sh
mise install
lefthook install
bun install
bun run check
bun run test
bun run build
```

Make the Lua module available to Hammerspoon, then start/reload the bridge:

```sh
mkdir -p ~/.hammerspoon
ln -sfn "$PWD/hammerspoon/streamdeck" ~/.hammerspoon/streamdeck
lua -e 'assert(loadfile("hammerspoon/streamdeck/init.lua"))'
```

Create/use `~/.hammerspoon/streamdeck-token` through the Lua bridge; it contains two UUIDs and must remain mode `0600`. Never commit or log it. Follow [the development guide](docs/development.md) for the official CLI validate/pack/install/restart flow and the manual vertical slice.

For the smallest working example, start with the registration and context example in [the Lua API guide](docs/lua-api.md), then add the generic action in the official Stream Deck application and select its registered action ID in the property inspector. The development guide describes the expected key press, appearance, and reconnect observations.

## Architecture and protocol

The TypeScript plugin authenticates with a first-message `hello`, receives the registered action list, reports visible instances and key events, and requests appearance. The Lua server validates protocol-v1 messages, invokes protected registered callbacks, and computes title/state appearance. The loopback server uses default port `17321`, binds to localhost, disables Bonjour, and supports one plugin WebSocket client.

Read the design records before changing a boundary:

- [Architecture](docs/architecture.md)
- [Protocol](docs/protocol.md)
- [Lua API](docs/lua-api.md)
- [Security](docs/security.md)
- [Development](docs/development.md)
- [Troubleshooting](docs/troubleshooting.md)

## Current limitations and roadmap

Version 1 supports title and Stream Deck state (`0`/`1`) appearance, one generic action, one local client, and a plain TypeScript/HTML property inspector that stores an `actionId`. Hardware/UI completion requires a connected Stream Deck and active property inspector; core behavior can be verified with fake transports, tests, Lua load checks, and official CLI validation.

The near-term roadmap is to stabilize this v1 contract, improve diagnostics without exposing secrets, and expand inspector behavior only through a reviewed protocol/API change. No roadmap item permits bypassing the official Stream Deck application or adding direct hardware control.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contributor workflow and [LICENSE](LICENSE) for licensing.
