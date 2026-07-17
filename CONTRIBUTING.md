# Contributing

Thanks for improving the Stream Deck–Hammerspoon bridge. Keep changes focused on the documented v1 contract and preserve the boundary between the official Stream Deck application and the Hammerspoon bridge.

## Before you start

Read the [architecture](docs/architecture.md), [protocol](docs/protocol.md), [Lua API](docs/lua-api.md), [security](docs/security.md), and [development](docs/development.md) documents relevant to your change. Do not add a second protocol, use `hs.streamdeck`, or access Stream Deck hardware directly.

Provision the pinned runtimes with mise and use Bun for all JavaScript package and script operations:

```sh
mise install
bun install
```

Do not use npm/npx to install dependencies or run project scripts. Lua development uses the mise-provided Lua 5.4.8 runtime.

## Change workflow

1. Describe the behavior and the contract boundary it changes.
2. Classify the change as additive/minor or breaking/major using the [protocol compatibility policy](docs/protocol.md#versioning-and-compatibility-policy).
3. Update the canonical protocol schema, `protocol/examples/` positive fixtures, and both validator/conformance suites together when changing a message.
4. Keep authentication first-message-only, loopback-only, and fail-closed. Never put the shared token in settings, source control, command arguments, screenshots, or logs.
5. Keep callbacks protected and action IDs explicit; reject duplicates and malformed or stale identifiers according to the protocol/API docs.
6. Keep TypeScript/UI changes inside the official plugin model. The official Stream Deck application must remain running for install, restart, and hardware checks.
7. Update the relevant documentation when a command, limitation, security property, public API, or compatibility promise changes.

## Checks

Run the focused checks for the files you changed, then the normal repository checks:

```sh
bun run build
bun run check
bun run test
mise exec -- lua -e 'assert(loadfile("hammerspoon/streamdeck/init.lua"))'
```

Use `bun run watch` while iterating on TypeScript/UI changes. Before a manual plugin check, use the official CLI to validate, pack, install, and restart the compiled plugin as documented in [Development](docs/development.md). Hardware and active property-inspector behavior require an actual Stream Deck; do not replace that check with direct USB/HID control.

## Security and reports

Treat the token at `~/.hammerspoon/streamdeck-token` as a credential. The Lua bridge creates two UUIDs and requires mode `0600`; rotate it if exposed. Keep logs limited to safe error codes, messages, versions, and connection state. Redact tokens and other local secrets from issues, patches, screenshots, and diagnostic bundles.

For a suspected vulnerability, avoid public disclosure of token material or an exploit reproduction that exposes credentials. Report the affected component, runtime versions, reproduction steps that do not include the token, impact, and a suggested mitigation privately to the repository maintainer. For ordinary bugs, include the plugin/Hammerspoon versions, protocol version, safe error code, timestamps, and whether the official Stream Deck application was running.

## Pull requests

Explain what changed, why it belongs in v1, and which checks you ran. Include protocol/schema and documentation updates in the same change when applicable. Call out hardware-dependent steps that could not be exercised. Keep generated/build output out of source changes unless the project workflow explicitly requires it.
