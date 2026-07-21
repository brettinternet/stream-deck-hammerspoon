# Backlog

This backlog records work explicitly described as later, deferred, or requiring a new protocol/architecture decision, together with each item's product disposition. It does not turn the repository's v1 non-goals into promises.

## Triage

The plugin's direction: any registered Hammerspoon behavior becomes a productive, useful Stream Deck key or Stream Deck + dial with minimal ceremony. Extensibility lives in the Lua registration API and the versioned protocol contract, not in speculative infrastructure. Dispositions below were verified against the implementation on 2026-07-21.

| Item | Disposition              | Rationale                                                                                                            |
| ---- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| B7   | **Ready now**            | Documentation contradicts a shipped, tested feature; cheap correction with direct user value.                        |
| B1   | Deferred — demand-driven | The versioned extension point exists (ADR-003); no concrete field is named by any real scenario yet.                 |
| B6   | Deferred — demand-driven | Encoders and touch already ship inside Button/Toggle; a new type needs a named behavior they cannot express.         |
| B2   | Gate, not scheduled work | Required only by the first breaking protocol change; it must accompany that change, never precede it.                |
| B3   | Conditional hardening    | Token + session auth is proportionate to the loopback threat model; triggered by a transport or client-model change. |
| B5   | Conditional hardening    | The 64 KiB frame cap plus one authenticated loopback client bounds today's exposure; same triggers as B3.            |
| B4   | Not planned              | No concrete second client exists; reopen only with a named use case, and only after B3.                              |

## Ready now

### B7 — Reconcile dynamic property-inspector documentation with the implementation

**Status:** Ready; documentation correction for an already-implemented, tested feature.

**Product assessment:** Necessary. The bounded settings-descriptor model is this plugin's "pluggable" story — Lua authors declare `text`, `number`, `boolean`, and `select` fields and get a working property-inspector form — yet the README and the Lua API exclusion list still deny it exists. The contradiction is internal: `docs/lua-api.md:170-171,184` documents the feature that `docs/lua-api.md:404` excludes, and `docs/protocol.md:131-133` already specifies it normatively.

**Description:** README and the Lua API exclusion list currently describe dynamic property-inspector forms as a v1 non-goal or excluded API. The implementation supports version-1 bounded settings descriptors (`text`, `number`, `boolean`, and `select`) and persists validated values, and two documents already describe that model. Update the remaining docs to distinguish the supported bounded descriptor model from still-excluded arbitrary forms or unbounded configuration messages.

**References:**

- `README.md:19` — currently calls dynamic property-inspector forms a v1 non-goal.
- `docs/architecture.md:158` — currently lists dynamic forms among later possibilities.
- `docs/lua-api.md:394-407` — exclusion list contradicting the same document's lines 170-171 and 184.
- `docs/lua-api.md:170-171,184` — already documents `settingsSchema`, `settingsSchemaVersion`, and the four bounded field types.
- `docs/protocol.md:131-133` — normative bounded field specification with bounds and rejection behavior.
- `plugin/src/property-inspector.ts:106-145,341,419-443,503-632` — settings-field type model, descriptor parsing, per-action schema resolution, and validation/rendering/saving.
- `protocol/schema/protocol-v1.json:77-165,225-260` — bounded settings schema contract.
- `plugin/tests/property-inspector.test.ts:553-870` — implementation coverage.

#### Implementation tasks

- [ ] B7-T1 — Update `README.md:19`, `docs/architecture.md:158`, and the `docs/lua-api.md` exclusion list so exclusions name only still-excluded behavior, resolving the Lua API document's internal contradiction.
- [ ] B7-T2 — Preserve explicit exclusions for arbitrary or unbounded inspector/configuration behavior.
- [ ] B7-T3 — Add or update documentation examples, point to `docs/protocol.md` as the normative field specification, and reference the existing tests.

#### Acceptance criteria

- [ ] B7-AC1 — No maintained document claims that all dynamic property-inspector forms are unimplemented.
- [ ] B7-AC2 — Documentation names the supported schema version and four supported field types.
- [ ] B7-AC3 — Documentation still rejects arbitrary plugin-to-Lua configuration messages and unbounded forms.

#### Definition of Done

- [ ] B7-DOD1 — Documentation references match the implementation and targeted inspector/protocol tests remain green.

## Deferred feature work (demand-driven)

### B1 — Define and implement additional appearance fields

**Status:** Deferred until a concrete field is named by a real scenario.

**Trigger:** An example or user scenario needs presentation the current field set cannot express.

**Product assessment:** Good extension point, wrong time. Protocol v1 already ships a complete bounded appearance set end to end — title, binary state, foreground/background hex colors, progress 0–1, a ≤4-character badge, and bundled or bounded custom PNG/SVG icons — and ADR-003 reserves versioned schema extension for additions. No example in `hammerspoon/examples/` currently needs a field this set cannot express, so speculative field design would add protocol surface without user value.

**Description:** Identify presentation fields beyond the v1 contract, assign ownership between Lua and the official plugin, and add them through a versioned protocol/schema extension. Implementation must begin with a product/protocol decision naming the concrete field and its driving scenario, not inferred fields.

**References:**

- `docs/architecture.md:147-158` — v1 appearance boundary and remaining appearance fields.
- `docs/architecture.md:180-186` — declarative presentation and later versioned extensions.
- `protocol/schema/protocol-v1.json:485-507` — current appearance fields and validation.
- `plugin/src/protocol.ts:104-118` — current TypeScript appearance model.

#### Implementation tasks

- [ ] B1-T1 — Decide the concrete fields, bounds, fallback behavior, and rendering owner.
- [ ] B1-T2 — Define the versioned schema extension and update TypeScript/Lua validators together.
- [ ] B1-T3 — Implement official-SDK rendering and safe fallback behavior.
- [ ] B1-T4 — Add positive, malformed, boundary, and compatibility fixtures/tests.

#### Acceptance criteria

- [ ] B1-AC1 — Existing v1 messages remain valid and retain title/state behavior when the extension is absent.
- [ ] B1-AC2 — Both validators reject malformed or oversized extension data before callback or SDK dispatch.
- [ ] B1-AC3 — Unsupported or invalid presentation data falls back deterministically without unsafe paths, URLs, or executable markup.

#### Definition of Done

- [ ] B1-DOD1 — Protocol decision, schema, TypeScript, Lua, fixtures, tests, and architecture docs agree.

### B6 — Add generic presentation types to the Stream Deck manifest

**Status:** Deferred until a use case names a behavior the shipped actions cannot express.

**Trigger:** A user-visible behavior that Button, Toggle, and their existing encoder/touch support cannot express — the realistic candidates are a more-than-two-state action or a dial-first action with its own identity.

**Product assessment:** The original premise understated what ships today: encoder and touchscreen support is not a gap. Both actions declare `Controllers: ["Keypad", "Encoder"]`, dial pushes/rotations and touch taps flow through `dialDown`/`dialRotate`/`dialUp`/`touchTap`, and encoder LCD rendering uses the `$A1`/`$A0` layouts. That raises the bar for a new manifest type: it must earn its UUID with behavior the two generic actions genuinely cannot represent.

**Description:** Add another generic Stream Deck action/presentation type only when a concrete use case requires it. The current manifest provides Button and Toggle, each covering Keypad and Encoder controllers; any new type must preserve stable action identity and property-inspector settings semantics.

**References:**

- `docs/architecture.md:188-194` — current generic button/toggle decision and later manifest possibility.
- `docs/architecture.md:86,117` — shipped dial/touch events and encoder LCD rendering profiles.
- `plugin/com.brettinternet.hammerspoon.sdPlugin/manifest.json:3-71` — current two shipped actions, including `Controllers` and `Encoder` layout blocks at 7-19 and 37-48.
- `plugin/src/actions/hammerspoon-action.ts:550-607` — shipped dial and touch event handlers.
- `README.md:12-14` — current Button and Toggle user-facing behavior.

#### Implementation tasks

- [ ] B6-T1 — Define the presentation type's user-visible behavior and Lua appearance contract.
- [ ] B6-T2 — Add the manifest action, assets, inspector routing, and compiled artifact.
- [ ] B6-T3 — Add device/controller coverage and release-package validation.

#### Acceptance criteria

- [ ] B6-AC1 — The new action has a stable UUID and does not change existing Button/Toggle settings identity.
- [ ] B6-AC2 — The official Stream Deck application owns lifecycle, rendering, and hardware access as before.
- [ ] B6-AC3 — Source and compiled manifest trees remain synchronized and package validation passes.

#### Definition of Done

- [ ] B6-DOD1 — Manual verification is completed with the official Stream Deck application and a supported device.

## Protocol gates

### B2 — Add protocol major-version negotiation

**Status:** Gate on the first breaking protocol change; not independently schedulable.

**Product assessment:** Necessary exactly once — alongside protocol v2. Implementing negotiation now would add surface with no counterpart to negotiate with; shipping a breaking major without it would strand deployed v1 peers. This item exists so the first breaking change cannot ship without it.

**Description:** Add a backward-compatible capability exchange before introducing protocol version 2 or another breaking major. v1 currently performs an admission check only; `helloAck` does not negotiate a version.

**References:**

- `docs/protocol.md:459-478` — breaking changes, negotiation requirements, and supported-version window.
- `plugin/src/protocol.ts:5` — current protocol version is fixed at 1.
- `protocol/schema/protocol-v1.json:166-173` — v1 schema requires `protocolVersion: 1`.
- `plugin/src/bridge.ts:541-551` — current hello contains only the v1 version, token, and plugin version.

#### Implementation tasks

- [ ] B2-T1 — Specify the capability fields and highest-common-version selection rules.
- [ ] B2-T2 — Add schemas and validators for negotiation and `VERSION_MISMATCH` handling.
- [ ] B2-T3 — Implement the supported-version window and major-specific dispatch.
- [ ] B2-T4 — Add cross-version fixtures, downgrade, mismatch, and malformed-negotiation tests.

#### Acceptance criteria

- [ ] B2-AC1 — Peers explicitly offer and select supported major versions before major-specific messages.
- [ ] B2-AC2 — Empty version intersections fail safely with `VERSION_MISMATCH`.
- [ ] B2-AC3 — No peer advertises a version it cannot validate and execute end to end.

#### Definition of Done

- [ ] B2-DOD1 — A migration guide and support window accompany the new major contract.

## Conditional security hardening

### B3 — Strengthen connection authentication and peer identity

**Status:** Deferred; triggered by a transport replacement, authenticated-upgrade support, or reopening B4.

**Product assessment:** Proportionate today. The mode-`0600` token file plus rotating in-memory session IDs matches the loopback threat model: a local attacker who can read the token can already execute arbitrary code as the user. Stronger peer identity earns its complexity only when the transport exposes upgrade headers or OS peer identity, or when a second client class (B4) appears. B4 must not reopen without this item.

**Description:** Replace or augment first-message token authentication with stronger peer authentication when Hammerspoon or the transport can support it. The current bridge reads a shared token file, sends it in `hello`, and establishes an in-memory session ID; it does not authenticate WebSocket upgrade headers or verify OS-level peer identity.

**References:**

- `docs/architecture.md:81-90,143-145` — current token/session lifecycle.
- `docs/security.md:40-45,95-97` — first-message limitation and later authentication options.
- `hammerspoon/streamdeck/server.lua:303-321` — current token check and session creation.
- `plugin/src/bridge.ts:541-551` — current first-message authentication.

#### Implementation tasks

- [ ] B3-T1 — Select the OS-backed credential, peer-identity, or authenticated-upgrade mechanism.
- [ ] B3-T2 — Define rotation, migration, failure, and fallback behavior without weakening v1 authentication.
- [ ] B3-T3 — Implement coordinated TypeScript/Lua authentication changes.
- [ ] B3-T4 — Add unauthorized-peer, rotation, reconnect, and downgrade-resistance tests.

#### Acceptance criteria

- [ ] B3-AC1 — Unauthenticated or incorrectly identified peers cannot dispatch callbacks.
- [ ] B3-AC2 — Authentication failures remain safe and actionable without exposing credentials or session IDs.
- [ ] B3-AC3 — No unauthenticated fallback, broader-than-loopback binding, or secret logging is introduced.

#### Definition of Done

- [ ] B3-DOD1 — Security review covers credential storage, rotation, transport behavior, and migration from the v1 token flow.

### B5 — Add stronger denial-of-service limits

**Status:** Deferred; same triggers as B3.

**Product assessment:** Mostly bounded already. The 64 KiB frame/body cap bounds parse work on both sides, `hs.httpserver` accepts one WebSocket client, and no callback dispatches before token and session checks. It is verified that no JSON nesting-depth limit, rate limiter, or connection-admission policy exists — but under one authenticated loopback client those add little; they become real requirements only if the transport or client model changes. Keep scoped for that day; do not schedule sooner.

**Description:** Add the later rate, connection, buffering, and parser-depth protections called out by the security guide. The current Lua server configures a 64 KiB HTTP body/frame limit; no explicit JSON nesting-depth limit, rate limiter, or stronger connection admission policy is present.

**References:**

- `docs/security.md:89-97` — current DoS concerns, required finite limits, and later hardening.
- `hammerspoon/streamdeck/protocol.lua:1-4` — current `MAX_FRAME_BYTES = 65536`.
- `hammerspoon/streamdeck/server.lua:475-486` — current body-size configuration.
- `plugin/src/protocol.ts:922-980` — current JSON parsing and schema validation path.

#### Implementation tasks

- [ ] B5-T1 — Define maximum JSON depth, collection sizes, parse work, and buffering behavior on both sides.
- [ ] B5-T2 — Add connection admission and rate limits that preserve legitimate reconnect behavior.
- [ ] B5-T3 — Enforce limits before callback dispatch and keep rejected payloads out of logs.
- [ ] B5-T4 — Add deterministic boundary, abuse, and recovery tests.

#### Acceptance criteria

- [ ] B5-AC1 — Oversized, deeply nested, high-rate, and connection-exhaustion traffic is rejected or throttled before callback execution.
- [ ] B5-AC2 — Limits are finite, documented, consistent across TypeScript and Lua, and do not create unbounded buffering.
- [ ] B5-AC3 — Safe diagnostics contain no token, session ID, credentials, or rejected payload body.

#### Definition of Done

- [ ] B5-DOD1 — Security review verifies the limits against the loopback threat model and reconnect behavior.

## Not planned

### B4 — Support multiple plugin clients with isolation

**Status:** Not planned. Reopen only with a named concrete second client, and only after B3.

**Product assessment:** No product case. The official Stream Deck application runs exactly one plugin process per plugin, the transport is loopback-only so remote clients are excluded by design, and `hs.httpserver` accepts one WebSocket client. Every plausible "second client" today is either the same plugin reconnecting (already handled by session rotation) or a hypothetical debugging client no one has asked for. `README.md:19` already lists multi-client as a v1 non-goal; this disposition aligns the backlog with it. The tasks below are preserved for the reopening case.

**Description:** Replace the one-client bridge assumption with deliberate multi-client lifecycle, authorization, instance ownership, and failure isolation. This is not a simple connection-count change because current session and instance state is designed around one local Stream Deck plugin process.

**References:**

- `README.md:19` — multiple simultaneous plugin clients are a v1 non-goal.
- `docs/architecture.md:123-125,147-158` — one-client limit and roadmap boundary.
- `docs/lua-api.md:390-405` — one supported local plugin client and excluded multi-client API.
- `docs/security.md:89-97` — single-client availability risk and later isolation hardening.

#### Implementation tasks

- [ ] B4-T1 — Define client identity, authorization ownership, session/context isolation, and lifecycle semantics.
- [ ] B4-T2 — Define resource, connection, and failure limits for concurrent clients.
- [ ] B4-T3 — Implement isolated client registries and synchronization behavior.
- [ ] B4-T4 — Add concurrent-client, stale-session, disconnect, and resource-exhaustion tests.

#### Acceptance criteria

- [ ] B4-AC1 — One client's disconnect, malformed traffic, or stale session cannot dispatch against another client's contexts.
- [ ] B4-AC2 — Client admission and resource limits are bounded and observable through safe diagnostics.
- [ ] B4-AC3 — Existing single-client behavior remains compatible or has an explicit migration contract.

#### Definition of Done

- [ ] B4-DOD1 — Multi-client behavior is documented as a protocol/architecture contract and independently security-reviewed.

## Explicit v1 non-goals

The following are intentionally outside the current contract and are not scheduled here as future commitments: direct Stream Deck hardware/HID access from Lua, unauthenticated operation, Bonjour/discovery, remote Lua evaluation, arbitrary Lua commands, a Lua settings-write API, polling as an appearance fallback, and arbitrary plugin-to-Lua configuration messages. See `README.md:8,19` and `docs/lua-api.md:394-407`.
