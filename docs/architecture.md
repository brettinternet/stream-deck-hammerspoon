# Stream Deck–Hammerspoon bridge architecture

## Purpose and scope

This repository defines an official Elgato Stream Deck plugin that bridges configured Stream Deck keys to reusable Hammerspoon Lua actions over an authenticated loopback WebSocket. The bridge keeps Stream Deck presentation and device lifecycle on the plugin side, and keeps action registration, callbacks, and action-specific behavior on the Hammerspoon side.

This document is the architecture contract for protocol v1 and the first vertical slice. It describes process boundaries and locked decisions; it is not a promise of features outside that slice.

## Ownership and coexistence

The Stream Deck application and the official plugin own all Stream Deck-facing concerns:

- the plugin UUID is `com.brettinternet.hammerspoon`;
- the generic action UUIDs are `com.brettinternet.hammerspoon.button` for one-state buttons and `com.brettinternet.hammerspoon.action` for two-state toggles;
- device connection, key lifecycle events, titles, state, icons, and per-instance settings stay in the official plugin;
- the property inspector uses the official Stream Deck UI WebSocket and custom `sendToPlugin` events;
- the compiled plugin is installed and managed as an Elgato `.sdPlugin`.

Hammerspoon owns the local bridge server and reusable Lua API. Hammerspoon does not become a Stream Deck plugin, does not access Stream Deck hardware directly, and does not own the Stream Deck property inspector. A Hammerspoon reload may restart the bridge, but it does not change Stream Deck ownership.

This is deliberately distinct from `hs.streamdeck`: **`hs.streamdeck` is not used, imported, implemented, or treated as a compatibility layer.** The only Hammerspoon integration in this contract is the reusable `hammerspoon/streamdeck/` Lua module and its `hs.httpserver` WebSocket endpoint. Coexistence means the official plugin remains the sole Stream Deck integration while Hammerspoon supplies the action runtime behind a local authenticated connection.

Relevant upstream references:

- [Elgato Stream Deck SDK: Getting Started](https://docs.elgato.com/streamdeck/sdk/introduction/getting-started) (SDK 2.0.0; Node 24+ and Stream Deck 7.1+ for new development).
- [Elgato Stream Deck SDK: property inspectors](https://docs.elgato.com/streamdeck/sdk/guides/ui).
- [Hammerspoon `hs.httpserver`](https://www.hammerspoon.org/docs/hs.httpserver.html), including `setInterface`, `setPort`, `websocket`, `start`, and `stop`.

## Monorepo layout

The repository has one Bun workspace/package at the root. The required tree is:

```text
.
├── package.json                         # Bun workspace/package root
├── mise.toml                            # pinned Bun, Node, and Lua runtimes
├── plugin/
│   ├── package.json                     # plugin package
│   ├── src/                             # TypeScript source
│   └── com.brettinternet.hammerspoon.sdPlugin/
│       ├── bin/                         # compiled plugin output
│       ├── imgs/                         # distributed icons/assets
│       ├── ui/                           # property inspector assets
│       └── manifest.json                 # official plugin manifest
├── hammerspoon/
│   └── streamdeck/                       # reusable Lua bridge/API
├── protocol/
│   └── schema/                           # canonical protocol JSON Schema
├── docs/
│   └── architecture.md
└── backlog/                              # present only when the Backlog.md CLI supports it
```

The source tree and the compiled `.sdPlugin` tree are separate. The compiled directory is the artifact Stream Deck consumes; TypeScript source remains under `plugin/src/`. Protocol schemas are not copied into either runtime as a second source of truth. The `backlog/` node is conditional per the repository bootstrap contract, not a runtime dependency.

## Components and process boundaries

```text
Stream Deck device
        │ device events and presentation commands
        ▼
Stream Deck application
        │ official plugin lifecycle / plugin WebSocket
        ▼
TypeScript plugin process (plugin/)
        │ authenticated protocol-v1 WebSocket to ws://localhost:17321/streamdeck
        ▼
Hammerspoon hs.httpserver `/streamdeck` endpoint
        │ strict protocol validation and instance registry
        ▼
Lua bridge (hammerspoon/streamdeck/)
        │ registered action callback/context
        ▼
User Hammerspoon action code
```

The property inspector is a separate official Stream Deck UI surface. It communicates with the plugin through the official UI WebSocket and custom `sendToPlugin` events. The plugin owns the selected `actionId` in Stream Deck per-instance settings; the inspector does not connect to Hammerspoon directly.

The runtime flow is:

1. Hammerspoon starts the `hs.httpserver` WebSocket endpoint at the default URL `ws://localhost:17321/streamdeck`; it binds loopback (`localhost`) and disables Bonjour.
2. The plugin reads the runtime token file and opens one WebSocket connection.
3. The plugin's first protocol message is `hello`, containing the shared token and `pluginVersion`.
4. Hammerspoon validates the hello and, even when an earlier session was marked authenticated, accepts it by clearing prior instance contexts, generates a fresh non-empty in-memory opaque `sessionId`, and returns it in the required `helloAck.sessionId`.
5. The plugin sends that exact `sessionId` on every subsequent application message: `listActions`, `instanceAppeared`, `instanceDisappeared`, `keyDown`, `keyUp`, `dialDown`, `dialRotate`, `dialUp`, `touchTap`, and `requestAppearance`. Missing or stale IDs are rejected before any action or callback is invoked.
6. Stream Deck instance lifecycle events become `instanceAppeared` and `instanceDisappeared`; key presses and releases become `keyDown` and `keyUp`; encoder pushes, rotations, and touchscreen taps become `dialDown`, `dialRotate`, `dialUp`, and `touchTap`; appearance refreshes become `requestAppearance`. A repeated `instanceAppeared` for the same instance/action is a settings refresh and does not run `appear` again.
7. Lua computes presentation and sends `appearance`, or sends an asynchronous `error` with a safe code/message. Callback code may also emit validated, instance/action-correlated `feedback` with a bounded safe message and duration.
8. The plugin applies the v1 `title` and `state` to the Stream Deck key. Feedback temporarily sets the safe message as the title and calls `showOk` or `showAlert`, then restores the previous appearance after expiry.

Every protocol message has `protocolVersion: 1` and a `type`. After `helloAck`, every plugin-to-Lua application message carries the current `sessionId`; `hello` carries the token but no session ID, and `helloAck` returns the newly generated ID. Unknown fields are ignored. Malformed messages and unknown types are rejected. TypeScript validates against the canonical JSON Schema with Ajv; Lua mirrors strict required/type checks because it cannot execute that JSON Schema directly.

## Identity and state ownership

- **Plugin identity:** `com.brettinternet.hammerspoon` identifies the official plugin.
- **Action identity:** `com.brettinternet.hammerspoon.button` is the generic one-state action UUID and `com.brettinternet.hammerspoon.action` is the generic two-state toggle UUID. Neither is one UUID per Lua action.
- **Lua action identity:** each registered Lua definition has an explicit, stable `actionId`. Duplicate IDs are rejected. Titles, key positions, and array order are never identifiers.
- **Instance identity:** each configured Stream Deck key is represented by its Stream Deck-provided `instanceId`. The plugin retains visible instance metadata; the Lua registry keeps independent contexts keyed by instance identity. Multiple instances may select the same or different stable Lua `actionId`s.
- **Settings:** the property inspector stores the selected `actionId` in Stream Deck per-instance settings. For initial action events, the plugin reads real Stream Deck settings from `actionInfo.payload.settings`; it uses that setting when sending lifecycle and key events. A repeated `instanceAppeared` updates the existing context's settings instead of creating a second appearance lifecycle.
- **Context:** a Lua action context is per instance. `context:refresh()` and `context:getSettings()` operate on that instance's state; one instance cannot silently mutate another instance's context. Contexts are discarded when the authenticated session is cleared.

Identity is explicit across the boundary: an instance identifies a configured key, while an `actionId` identifies registered Lua behavior. Reconnect resends instance identity; it does not create new action IDs or infer identity from presentation.

## First vertical slice

The first slice is one complete path, not a collection of disconnected scaffolds:

1. Register one Lua action with an explicit `actionId` and protected callbacks.
2. Start the Hammerspoon bridge, create/read the `~/.hammerspoon/streamdeck-token` file as needed, and listen on authenticated loopback WebSocket port `17321`.
3. Start the official plugin, authenticate with `hello`/`helloAck`, and obtain the action registry through correlated `listActions`/`actions`.
4. Configure one generic Stream Deck keypad instance through the plain TypeScript/HTML property inspector; persist its selected `actionId` in Stream Deck settings.
5. Send that instance's `instanceAppeared` event and receive its computed `appearance`.
6. Render the returned title and state (`0` or `1`), plus any bounded versioned presentation decoration, through the official plugin SDK.
7. Press and release the key, routing `keyDown` and `keyUp` to the selected Lua action, and apply any resulting appearance/feedback.
8. Stop or reload Hammerspoon, observe the plugin's disconnected title, reconnect, authenticate again, and synchronize all visible instances and their appearances.

The v1 appearance contract requires `title` and `state` and optionally accepts `appearanceVersion: 1` colors, progress, badge, and a closed icon representation. Semantic bundled slugs resolve to the shipped 72×72 plugin asset, with unknown slugs using that same safe fallback; custom PNG/SVG data is canonical padded base64 and strictly bounded/validated before SDK rendering. Invalid input falls back to title/state and the shipped or manifest image.
The plugin uses the SDK's 72×72 key profile for keypad actions. For a recognized encoder metadata profile, title-only LCD feedback uses built-in `$A1`; decorated feedback uses `$A0` with a deterministic 200×100 per-encoder full-canvas image. Missing, malformed, unknown, or controller-mismatched metadata keeps the safe key or `$A1` title-only fallback.

## Lifecycle and reconnect

### Startup and shutdown

`register(definition)` adds a stable Lua action definition and rejects duplicate IDs. `start(options)` binds the server to loopback, disables Bonjour, applies the default port when no port is supplied, and begins accepting the plugin connection. `stop()` closes the server, clears the current in-memory session ID, and discards active instance contexts. `refresh(actionId)` refreshes all relevant appearances for an action, while `context:refresh()` refreshes one instance context. Callbacks are protected with `xpcall`; callback failure becomes a safe asynchronous protocol error rather than an uncaught bridge failure.

The Hammerspoon server accepts one WebSocket client because of `hs.httpserver` limitations. That is sufficient for one local Stream Deck plugin process and is an explicit v1 limit. Because `hs.httpserver:websocket` exposes message callbacks rather than HTTP upgrade headers or a connection-close callback, authentication is a first-message protocol exchange plus an in-memory session capability, not a process-global hello boolean. A valid hello is accepted again when a plugin reconnects or restarts: it safely clears any prior contexts, rotates to a fresh non-empty opaque `sessionId` generated with `hs.host.uuid()`, and returns that ID in `helloAck`. Every post-hello plugin message must echo the exact current ID; missing, stale, or invalid IDs are rejected without invoking any callback. The ID is cleared on close, stop, or failure, so a later client cannot inherit tokenless authorization merely because the prior connection was never reported closed.

### `hs.httpserver` callback transport behavior

`hs.httpserver:websocket` callbacks must return a string. A lifecycle or encoder event with no response therefore produces a zero-length transport frame. The TypeScript transport ignores only zero-length frames before JSON/protocol validation; every non-empty frame still goes through strict JSON Schema/protocol validation. A zero-length frame is not a protocol message, a fifteenth protocol type, or an unauthenticated fallback. This is a reversible, transport-specific limitation: replacing the transport can remove the accommodation without changing the v1 message contract or authentication rules.

### Reconnect synchronization

The plugin uses bounded exponential backoff with jitter: 250 ms initially, doubling to a 10 s maximum. A successful authenticated `helloAck` resets the backoff and installs the returned session ID only in memory. While disconnected, the plugin retains visible instance metadata in TypeScript and marks titles `Hammerspoon Offline`; it clears the session ID on close, stop, or connection failure.

After a new authenticated connection, the plugin performs synchronization in this order:

1. request the current action registry (`listActions`) with the new session ID;
2. resend `instanceAppeared` with the new session ID for every visible instance;
3. request appearance with the new session ID for every visible instance (`requestAppearance`).

`instanceAppeared` computes normal initial appearance for a new instance/action. If the same instance/action is announced again, Lua refreshes its settings and does not invoke `appear` a second time; `requestAppearance` exists separately for appearance-only refresh and reconnect resynchronization. A Hammerspoon reload drops its registry, session ID, and instance contexts and starts a new server; the plugin's reconnect path repopulates the server from the visible Stream Deck instances. Stale or unknown instance/action/session IDs are reported as safe asynchronous errors and do not authorize a fallback action.

### Token lifecycle

The default token path is `~/.hammerspoon/streamdeck-token`. Lua creates it from two UUIDs and applies file mode `0600`; the plugin reads this runtime file. The token is sent only in `hello`, is never logged, and is never included in Stream Deck settings. Session IDs are fresh opaque values held only in memory, never persisted or logged, and rotated on every accepted hello. If the token cannot be read or accepted, or if the session ID is missing/stale, the plugin remains disconnected with actionable status; it never falls back to unauthenticated operation.

## Current limitations and roadmap boundary

Current v1 limitations are intentional:

- one local plugin client, the fixed default URL `ws://localhost:17321/streamdeck`, and first-message authentication;
- loopback transport only; no remote clients, Bonjour discovery, or unauthenticated mode;
- raw token file permissions may interact with Stream Deck plugin sandbox/file-permission behavior;
- title and binary state are always supported; versioned appearance fields add bounded colors, progress, badges, and validated icons;
- custom icon bytes are bounded and constrained to supported PNG dimensions or a safe SVG profile; arbitrary paths, URLs, MIME parameters, executable SVG, and raw Lua input are rejected;
- hardware/property-inspector completion cannot be automated without a connected Stream Deck and active inspector; fake transports and official CLI validation cover core bridge behavior, with manual end-to-end verification required.

The roadmap boundary is the protocol-v1 contract above. Remaining appearance fields, arbitrary or unbounded property-inspector forms, more clients, richer connection authentication, or other phase-3-and-later behavior require a new contract and decision; they must not be inferred from this architecture document. The bounded version-1 settings descriptors are already part of the current contract. No implementation claim is made for those later possibilities.

## Decision records

Each record is intentionally short but complete. Reversibility describes what can change without silently changing the v1 contract.

### ADR-001: WebSocket instead of polling

- **Problem:** The plugin must deliver key/lifecycle events and receive appearance changes promptly without a background polling loop or an extra daemon.
- **Choice:** Use one authenticated WebSocket from the TypeScript plugin to Hammerspoon's `hs.httpserver:websocket` on loopback.
- **Alternatives:** HTTP polling; a separate local daemon; direct Stream Deck hardware access from Hammerspoon.
- **Tradeoffs / consequences:** WebSocket gives event delivery and a single bidirectional channel, but `hs.httpserver` exposes message callbacks rather than upgrade headers or a rich connection lifecycle and requires callbacks to return a string. No-response lifecycle events can consequently appear as zero-length transport frames; the TypeScript transport ignores only those empty frames before validation, while every non-empty frame remains strict. Authentication therefore uses the shared token in `hello` plus a fresh in-memory session ID echoed on every later plugin message; missing or stale IDs cannot dispatch actions, and a valid reconnect hello rotates the ID and clears prior contexts. Loopback and the fixed default URL simplify discovery but exclude remote clients.
- **Reversibility:** The transport-specific empty-frame accommodation can be removed when the transport changes without changing protocol messages or authentication. Replacing the transport boundary otherwise requires a new protocol/transport decision. The message types, identities, and auth semantics should remain the migration contract; v1 does not support polling as a fallback.

### ADR-002: One shared token for the loopback bridge

- **Problem:** A local port must reject unrelated clients while the transport lacks a usable authenticated upgrade-header hook.
- **Choice:** Share one runtime token through `~/.hammerspoon/streamdeck-token`; Lua creates it from two UUIDs with mode `0600`, and the plugin sends it only in `hello`. Each accepted hello additionally establishes a fresh opaque in-memory session ID.
- **Alternatives:** No authentication; a token in Stream Deck settings; an HTTP/WebSocket header; OS-specific credential/keychain integration.
- **Tradeoffs / consequences:** The file is simple, inspectable, and shared by both processes, but plugin sandbox/file permissions may vary. A missing, unreadable, or invalid token produces an actionable disconnected state. The token is never logged or persisted in per-instance settings. Session IDs are never logged or persisted, are required on all post-hello plugin messages, and rotate on reconnect; old IDs cannot invoke callbacks. Unauthenticated fallback is prohibited.
- **Reversibility:** Token storage or rotation can be changed behind the `hello` authentication contract. Removing session binding, accepting old session IDs, removing authentication, or exposing the token in settings would be a breaking security decision, not a compatible tweak.

### ADR-003: Declarative presentation from Lua

- **Problem:** Lua actions need to control key presentation without coupling Hammerspoon code to Stream Deck APIs or device details.
- **Choice:** Lua actions return declarative title/state data and an optional versioned presentation record; the plugin validates and renders it through the official SDK, with `showOk`/`showAlert` feedback only when warranted.
- **Alternatives:** Imperative device commands in Lua; plugin-owned polling of Lua state; arbitrary image/SVG input; an unbounded presentation DSL.
- **Tradeoffs / consequences:** The boundary remains small, testable, and preserves official plugin ownership. Optional decoration is bounded and safely escaped, while malformed appearances are rejected. Rendering and action behavior remain separate, so appearance can be refreshed without pressing a key.
- **Reversibility:** New appearance fields can be added as a later versioned schema extension. Changing existing field meaning or moving rendering responsibility to Lua requires a protocol and ownership decision.

### ADR-004: Generic button and toggle UUIDs

- **Problem:** Lua users can register many actions without rebuilding or publishing a new Stream Deck action for each one, but Stream Deck must know whether to offer one configurable image or separate inactive and active images.
- **Choice:** Ship one generic button UUID, `com.brettinternet.hammerspoon.button`, and retain `com.brettinternet.hammerspoon.action` as the generic toggle UUID. Both store the selected stable Lua `actionId` in per-instance settings.
- **Alternatives:** One Stream Deck UUID per Lua action; a generated action manifest; one two-state action for every behavior; hard-coded action names inferred from titles.
- **Tradeoffs / consequences:** The Lua registry remains extensible and existing toggle profiles keep their UUID. Users choose the presentation type when adding a key, and the shared property inspector must target the UUID of the inspected action.
- **Reversibility:** Additional generic presentation types can coexist in a later manifest, but changing either existing UUID or settings identity requires migration.

### ADR-005: Bun monorepo with separated source and artifact trees

- **Problem:** Plugin TypeScript, compiled Stream Deck files, reusable Lua, protocol schema, and documentation need one reproducible repository boundary without mixing process-owned files.
- **Choice:** Use a root Bun workspace/package. Keep source under `plugin/`, the compiled artifact under `plugin/com.brettinternet.hammerspoon.sdPlugin/`, Lua under `hammerspoon/streamdeck/`, schema under `protocol/schema/`, docs under `docs/`, and Backlog.md data under `backlog/` only when supported.
- **Alternatives:** Separate repositories; a plugin-only repository with Lua elsewhere; putting compiled files beside source; a Node package manager instead of Bun.
- **Tradeoffs / consequences:** One repository makes protocol and cross-process changes reviewable together and preserves an exact packaging boundary. It requires contributors to respect source-versus-artifact ownership and the pinned mise runtimes (Bun 1.3.14, Node 24.18.0, Lua 5.4.8).
- **Reversibility:** Directory ownership can be split later through a deliberate repository migration. Moving files ad hoc would break build/package boundaries and is not a v1-compatible change.

### ADR-006: JSON Schema owns the protocol contract

- **Problem:** TypeScript and Lua must agree on message shape while only TypeScript can directly use a JSON Schema validator.
- **Choice:** Make `protocol/schema/` the canonical protocol source of truth. TypeScript validates with Ajv; Lua mirrors strict required/type checks. Conformance examples/tests detect drift.
- **Alternatives:** TypeScript types as the sole source; Lua validation as the sole source; handwritten prose only; generated code with no canonical schema.
- **Tradeoffs / consequences:** A machine-readable contract enables consistent rejection of malformed/unknown messages and supports independent implementations, but Lua's mirror checks must be kept aligned. Unknown fields remain ignored, while malformed messages and unknown types are rejected.
- **Reversibility:** Validator libraries or generated bindings can change without changing the wire contract. Moving schema ownership or changing required fields requires a protocol version/decision and coordinated plugin/Lua migration.

### ADR-007: Explicit reconnect synchronization

- **Problem:** Hammerspoon reloads can discard registries and instance contexts, while the Stream Deck plugin still knows which keys are visible; reconnect must restore a coherent state without polling.
- **Choice:** Retain visible instance metadata in the plugin, show `Hammerspoon Offline`, reconnect with bounded jittered backoff, authenticate again, accept a fresh session ID, request actions, resend every visible `instanceAppeared`, and request every visible appearance.
- **Alternatives:** Recreate only the last pressed key; wait for a future key press; continuously poll; let Lua persist stale instances across reloads.
- **Tradeoffs / consequences:** Replay is deterministic and repairs a fresh Lua registry and context set, and separating `instanceAppeared` from `requestAppearance` avoids conflating registration with refresh. Repeated `instanceAppeared` for an unchanged instance/action only refreshes settings and does not rerun `appear`. It can generate a burst of replay traffic for many visible keys and depends on explicit stable IDs; stale IDs become safe errors rather than guessed actions.
- **Reversibility:** Backoff parameters and synchronization batching can change without changing identity semantics. Removing replay, retaining stale Lua state, or making polling a fallback would change the lifecycle contract and requires a new decision.
