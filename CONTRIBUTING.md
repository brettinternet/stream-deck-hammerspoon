# Contributing

Thanks for improving the Stream Deck–Hammerspoon bridge. Keep changes focused on the documented v1 contract and preserve the boundary between the official Stream Deck application and the Hammerspoon bridge.

## Before you start

Read the [architecture](docs/architecture.md), [protocol](docs/protocol.md), [Lua API](docs/lua-api.md), [security](docs/security.md), [development](docs/development.md), and [release](docs/releases.md) documents relevant to your change. Do not add a second protocol, use `hs.streamdeck`, or access Stream Deck hardware directly.

Provision the pinned runtimes with mise and use Bun for all JavaScript package and script operations:

```sh
mise install
bun install
```

Do not use npm/npx to install dependencies or run project scripts. Lua development uses the mise-provided Lua 5.4.8 runtime.

## Architecture-boundary changes

Keep Stream Deck device access, plugin lifecycle, presentation, settings, and property-inspector behavior in the official Stream Deck application and plugin. Keep the authenticated loopback bridge and reusable action API in Hammerspoon; never move hardware access or plugin ownership into Lua. When a change crosses that process boundary, changes the transport, or changes source/artifact ownership, explain the boundary in the change and update the [architecture contract](docs/architecture.md) and any relevant decision record.

Keep TypeScript source under `plugin/src/`, compiled plugin artifacts under `plugin/com.brettinternet.hammerspoon.sdPlugin/`, and the canonical protocol schema under `protocol/schema/`. Do not create a second schema or copy protocol definitions into a runtime.

## Change workflow

1. Describe the behavior and the contract boundary it changes, including any [architecture](docs/architecture.md) decision required.
2. Classify protocol changes as additive/minor or breaking/major using the [protocol compatibility policy](docs/protocol.md#versioning-and-compatibility-policy); do not smuggle a breaking change into v1.
3. For a message change, update the canonical JSON Schema, `protocol/examples/` positive fixtures, and both TypeScript and Lua validator/conformance coverage together. Review required fields, types, bounds, error semantics, correlation/session rules, and fixture ordering.
4. Keep authentication first-message-only, loopback-only, and fail-closed. Never put the shared token in settings, source control, command arguments, screenshots, or logs.
5. Keep callbacks protected and action IDs explicit; reject duplicates and malformed or stale identifiers according to the protocol/API docs.
6. Keep TypeScript/UI changes inside the official plugin model. The official Stream Deck application must remain running for install, restart, and hardware checks.
7. Update the relevant documentation when a command, limitation, security property, public API, or compatibility promise changes.

## Checks

Run the focused checks for the files you changed. The standard repository checks are:

```sh
bun run build
bun run check
bun run test
mise exec -- lua -e 'assert(loadfile("hammerspoon/streamdeck/init.lua"))'
```

Use `bun run watch` while iterating on TypeScript/UI changes. Before a manual plugin check, use the official CLI to validate, pack, install, and restart the compiled plugin as documented in [Development](docs/development.md). Hardware and active property-inspector behavior require an actual Stream Deck; do not replace that check with direct USB/HID control.

## Reproducible release and installation

For a versioned release, update the manifest version as part of the release change, then run the pinned release command from the repository root:

```sh
bun install
bun run release
```

From `dist/releases/<version>/`, verify the generated artifacts before installing:

```sh
shasum -a 256 -c SHA256SUMS
```

Install the plugin through the official Stream Deck application and install the Lua archive from the release directory:

```sh
open <plugin-uuid>-<version>.streamDeckPlugin
mkdir -p "$HOME/.hammerspoon"
tar -xzf stream-deck-hammerspoon-lua-<version>.tar.gz -C "$HOME/.hammerspoon"
mise exec -- lua -e 'assert(loadfile(os.getenv("HOME") .. "/.hammerspoon/streamdeck/init.lua"))'
```

Keep the official Stream Deck application running throughout installation and restart; do not use direct USB/HID access. The full [release guide](docs/releases.md) covers the exact artifact names, token handling, and uninstall workflow.

## Hardware-free versus hardware-required verification

Hardware-free checks include builds, JavaScript/protocol tests, JSON Schema validation, the official CLI's `validate`, `pack`, `link`, and `restart` operations, fake-transport protocol checks, and the Lua load check. They verify source, packaging, schema, and bridge behavior without a connected deck. A connected Stream Deck and active property inspector are required for physical key rendering, key presses/releases, and property-inspector interaction. Report hardware-dependent steps that were not exercised instead of substituting direct hardware access.

## Security and reports

Treat the token at `~/.hammerspoon/streamdeck-token` as a credential. The Lua bridge creates two UUIDs and requires mode `0600`; rotate it if exposed. Keep logs limited to safe error codes, messages, versions, and connection state. Redact tokens and other local secrets from issues, patches, screenshots, and diagnostic bundles.

Report suspected vulnerabilities privately to the repository maintainer rather than in a public issue or pull request. Include the affected component, runtime versions, reproduction steps that do not include token material, impact, and a suggested mitigation. Do not disclose the token, credentials, session IDs, raw payloads, stack traces, or an exploit reproduction that exposes secrets. For ordinary bugs, include the plugin/Hammerspoon versions, protocol version, safe error code, timestamps, and whether the official Stream Deck application was running.

## Pull requests

Explain what changed, why it belongs in v1, and which checks you ran. For architecture-boundary or protocol changes, include the relevant architecture decision, compatibility classification, schema/fixture/validator updates, and documentation updates in the same change. Call out hardware-dependent steps that could not be exercised. Keep generated/build output out of source changes unless the project workflow explicitly requires it.
