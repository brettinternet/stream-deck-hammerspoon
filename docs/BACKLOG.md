# Backlog

This backlog records work explicitly described as later, deferred, or requiring a new protocol/architecture decision, together with each item's product disposition. It does not turn the repository's v1 non-goals into promises; where an item deliberately revises a v1 boundary, the item says so.

## Triage

The plugin's direction: any registered Hammerspoon behavior becomes a productive, fun Stream Deck key or Stream Deck + dial with minimal ceremony. Extensibility lives in the Lua registration API and the versioned protocol contract, not in speculative infrastructure. Dispositions verified against the implementation and set on 2026-07-21. Priority order: B7, then B1 and B6, then the remote-client track (B3 → B5 → B4). B2 is a standing gate, not scheduled work.

| Item | Disposition                  | Rationale                                                                                                                                                      |
| ---- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B7   | **Ready now**                | Documentation contradicts a shipped, tested feature; cheap correction with direct user value.                                                                  |
| B1   | Scheduled after B7           | Appearance richness is the fun axis; the versioned extension point (ADR-003) is ready and concrete candidates exist.                                           |
| B6   | Scheduled after B7           | A multi-state or dial-first action serves real examples; encoders/touch already ship inside Button/Toggle, so a new type must earn its UUID.                   |
| B3   | Planned — prerequisite of B4 | The cleartext first-message token is safe only on loopback; a LAN client requires confidentiality, credential provisioning, and a deliberate binding decision. |
| B5   | Planned — prerequisite of B4 | LAN exposure turns rate, admission, and parser limits from theoretical into real requirements.                                                                 |
| B4   | Planned — remote LAN client  | Named use case: a second Stream Deck on another computer on the LAN drives the same Hammerspoon bridge. Requires B3 and B5; loopback stays the default.        |
| B2   | Gate, not scheduled work     | Required only alongside the first breaking protocol change — and a LAN client makes cross-machine version skew the normal failure mode when that day comes.    |

## Ready now

### B7 — Reconcile dynamic property-inspector documentation with the implementation

**Status:** Complete 2026-07-21 — `911fd396e35d1dc22009fb81a83747934df429b8` and `6c9b83b6569fdcedcb5045743f370322291bf8e4` reconcile the documentation; independent verification passed B7-AC1 through B7-DOD1, and `bun test tests/property-inspector.test.ts tests/protocol.test.ts` passed (41 tests).

**Product assessment:** Necessary. The bounded settings-descriptor model is this plugin's "pluggable" story — Lua authors declare `text`, `number`, `boolean`, and `select` fields and get a working property-inspector form. Before this correction, the README and Lua API exclusion list denied that support despite `docs/lua-api.md` and `docs/protocol.md` documenting it.

**Description:** Reconcile the README, architecture guide, and Lua API with the already-implemented version-1 bounded settings descriptors (`text`, `number`, `boolean`, and `select`) that persist validated values. The completed documentation distinguishes that supported model from still-excluded arbitrary forms and unbounded configuration messages.

**References:**

- `README.md` — previously called dynamic property-inspector forms a v1 non-goal.
- `docs/architecture.md` — previously listed dynamic forms among later possibilities.
- `docs/lua-api.md` — the prior exclusion list contradicted the same document's settings-schema documentation.
- `docs/lua-api.md:170-171,184` — already documents `settingsSchema`, `settingsSchemaVersion`, and the four bounded field types.
- `docs/protocol.md:131-133` — normative bounded field specification with bounds and rejection behavior.
- `plugin/src/property-inspector.ts:106-145,341,419-443,503-632` — settings-field type model, descriptor parsing, per-action schema resolution, and validation/rendering/saving.
- `protocol/schema/protocol-v1.json:77-165,225-260` — bounded settings schema contract.
- `plugin/tests/property-inspector.test.ts:553-870` — implementation coverage.

#### Implementation tasks

- [x] B7-T1 — Update `README.md:19`, `docs/architecture.md:158`, and the `docs/lua-api.md` exclusion list so exclusions name only still-excluded behavior, resolving the Lua API document's internal contradiction.
- [x] B7-T2 — Preserve explicit exclusions for arbitrary or unbounded inspector/configuration behavior.
- [x] B7-T3 — Add or update documentation examples, point to `docs/protocol.md` as the normative field specification, and reference the existing tests.

#### Acceptance criteria

- [x] B7-AC1 — No maintained document claims that all dynamic property-inspector forms are unimplemented.
- [x] B7-AC2 — Documentation names the supported schema version and four supported field types.
- [x] B7-AC3 — Documentation still rejects arbitrary plugin-to-Lua configuration messages and unbounded forms.

#### Definition of Done

- [x] B7-DOD1 — Documentation references match the implementation and targeted inspector/protocol tests remain green.

## Scheduled after B7

B1 and B6 follow B7 by priority order, not technical dependency; they are independent of B7 and of each other and may proceed in parallel.

### B1 — Define and implement additional appearance fields

**Status:** Complete 2026-07-21 — `0cc5f4662071275c574e583ae6ef283946885669` and `b5859d07cc3920605c3d6dc8979e488bdcceae55` add the additive v1 encoder extension; independent verification passed B1-AC1 through B1-DOD1, and `bun run check && bun run test && bun run validate` passed.

**Product assessment:** Appearance richness is the fun axis of this plugin, and the versioned extension point (ADR-003) was designed for exactly this. v1 already ships title, binary state, foreground/background hex colors, progress 0–1, a ≤4-character badge, and bundled or bounded custom PNG/SVG icons end to end. Candidate fields, grounded in shipped capability and existing examples: encoder `value`/`indicator` fields mapping to the SDK `$B1` layout so a dial shows a live level bar on the LCD (volume, brightness, timer progress); a brief pulse/flash state-change cue rendered by the plugin; icon tinting for state-colored variants of bundled icons; title styling (size, alignment, multi-line). B1-T1 selects from these — it does not have to invent fields from nothing anymore.

**Description:** Choose presentation fields beyond the v1 contract from the candidate list (or a better-grounded alternative), assign ownership between Lua and the official plugin, and add them through a versioned protocol/schema extension. Implementation begins with the product/protocol decision in B1-T1, not inferred fields.

**References:**

- `docs/architecture.md:147-158` — v1 appearance boundary and remaining appearance fields.
- `docs/architecture.md:180-186` — declarative presentation and later versioned extensions.
- `docs/architecture.md:117` — current `$A1`/`$A0` encoder rendering profiles the `$B1` candidate would extend.
- `protocol/schema/protocol-v1.json:485-507` — current appearance fields and validation.
- `plugin/src/protocol.ts:104-118` — current TypeScript appearance model.

#### Implementation tasks

- [x] B1-T1 — Decide the concrete fields, bounds, fallback behavior, and rendering owner.
  - Decision (2026-07-21): keep `appearanceVersion: 1` for additive compatibility and add a paired encoder `value`/`indicator` payload. `value` is a non-empty, control-free display string of at most 16 Unicode scalar values; `indicator` is a finite number from 0 through 100. Lua validates and declares both fields; the plugin alone maps a valid pair on a recognized encoder to the official `$B1` layout, using only the already-validated title and safe bundled/custom icon data. The pair is rejected unless both fields are present and it is not combined with `foregroundColor`, `backgroundColor`, `progress`, or `badge`; keypads, unsupported encoder profiles, and SDK failures keep the existing title/state or `$A1` fallback. Keeping the version at 1 lets older v1 receivers ignore the optional fields safely rather than rejecting a new enum value.
- [x] B1-T2 — Define the versioned schema extension and update TypeScript/Lua validators together.
- [x] B1-T3 — Implement official-SDK rendering and safe fallback behavior.
- [x] B1-T4 — Add positive, malformed, boundary, and compatibility fixtures/tests.

#### Acceptance criteria

- [x] B1-AC1 — Existing v1 messages remain valid and retain title/state behavior when the extension is absent.
- [x] B1-AC2 — Both validators reject malformed or oversized extension data before callback or SDK dispatch.
- [x] B1-AC3 — Unsupported or invalid presentation data falls back deterministically without unsafe paths, URLs, or executable markup.

#### Definition of Done

- [x] B1-DOD1 — Protocol decision, schema, TypeScript, Lua, fixtures, tests, and architecture docs agree.

### B6 — Add generic presentation types to the Stream Deck manifest

**Status:** Complete 2026-07-21 — `ddb70bf175c5c09b8053a3f2ecd7943d7db3b55f` and `42ac4deeac136b11cca5f0f76070c79ce77e7d90` complete and independently review the implementation; B6-T2/T3 and B6-AC1 through B6-AC3 are verified. `bun run install:dev` rebuilt, validated, linked, and restarted `com.brettinternet.hammerspoon`. The owner manually verified in the official Stream Deck application on a supported keypad that Multi-State cycles states 0–3, omitted `presentationState` falls back to binary `state`, and Button/Toggle retain their selected action IDs and work normally. After independent review found the ignored root package stale, the current `.streamDeckPlugin` archive was rebuilt; Stream Deck validation passed and its `bin/plugin.js` SHA-256 matches the compiled tree. Temporary Hammerspoon test actions were removed after verification.

**Product assessment:** Encoder and touchscreen support is not a gap — both shipped actions declare `Controllers: ["Keypad", "Encoder"]`, dial pushes/rotations and touch taps flow through `dialDown`/`dialRotate`/`dialUp`/`touchTap`, and encoder LCD rendering uses the `$A1`/`$A0` layouts. A new manifest type must therefore earn its UUID with behavior Button and Toggle cannot express. Two grounded candidates: a more-than-two-state multi-state action (the pomodoro example currently squeezes its focus/break phases into title text where distinct per-phase images would be clearer and more fun), and a dial-first action whose identity and settings are tuned for continuous values rather than presses. B6-T1 selects the type.

**Description:** Add a generic Stream Deck action/presentation type for a behavior the shipped actions cannot express, selected in B6-T1 from the grounded candidates or a better one. The current manifest provides Button and Toggle, each covering Keypad and Encoder controllers; any new type must preserve stable action identity and property-inspector settings semantics.

**References:**

- `docs/architecture.md:188-194` — current generic button/toggle decision and later manifest possibility.
- `docs/architecture.md:86,117` — shipped dial/touch events and encoder LCD rendering profiles.
- `plugin/com.brettinternet.hammerspoon.sdPlugin/manifest.json:3-71` — current two shipped actions, including `Controllers` and `Encoder` layout blocks at 7-19 and 37-48.
- `plugin/src/actions/hammerspoon-action.ts:550-607` — shipped dial and touch event handlers.
- `hammerspoon/examples/pomodoro.lua` — multi-phase example a multi-state action would serve directly.
- `README.md:12-14` — current Button and Toggle user-facing behavior.

#### Implementation tasks

- [x] B6-T1 — Define the presentation type's user-visible behavior and Lua appearance contract.
  - Decision (2026-07-21): add the keypad-only **Hammerspoon Multi-State** action with stable UUID `com.brettinternet.hammerspoon.multistate` and four manifest states. It uses the existing action selection and property-inspector settings unchanged; lifecycle, callbacks, and hardware access stay in the official plugin. Lua keeps the required binary `state` field for Button/Toggle compatibility and may add `presentationState` only when `appearanceVersion = 1`: an integer 0–3 selects the Multi-State action's static state image, while an omitted field deterministically falls back to the existing binary state. The value is display-only, has no callback semantics, is ignored by Button/Toggle, and is rejected outside its bounded range.
- [x] B6-T2 — Add the manifest action, assets, inspector routing, and compiled artifact.
- [x] B6-T3 — Add device/controller coverage and release-package validation.

#### Acceptance criteria

- [x] B6-AC1 — The new action has a stable UUID and does not change existing Button/Toggle settings identity.
- [x] B6-AC2 — The official Stream Deck application owns lifecycle, rendering, and hardware access as before.
- [x] B6-AC3 — Source and compiled manifest trees remain synchronized and package validation passes.

#### Definition of Done

- [x] B6-DOD1 — Manual verification is completed with the official Stream Deck application and a supported device.

## Remote-client track (planned)

The driving use case: a second Stream Deck, attached to another computer on the LAN, runs the official Stream Deck application and this plugin and drives the same Hammerspoon bridge. This deliberately revises the v1 loopback/single-client boundary. Loopback single-client remains the default; LAN operation is explicit opt-in configuration. Dependency order is B3, then B5, then B4 — the port must not leave loopback before authentication (B3) and abuse limits (B5) are in place.

### B3 — Strengthen connection authentication and peer identity

**Status:** Complete 2026-07-21 — `27a801f7fa43c8087c3a4cecd0acf5eb5b20a518`, `4a12c21fa2ad1958c0477ee292684f374b38ad7b`, and `8a376badc1b142e92ebcea71581e7f6a954ee262` implement and harden the opt-in PSK LAN transport. Independent verification passed B3-T3/T4, B3-AC1 through B3-DOD1: `bun run check`, `bun run test` (116 TypeScript, 70 Lua bridge, 10 Lua startup), `bun run build`, and Stream Deck package validation passed. The reviewer also confirmed source-map synchronization. B4-T5 retains the user-facing remote-profile configuration; B3 exposes only the deliberate library/manual profile.

**Product assessment:** The current model — a mode-`0600` token file sent in cleartext in `hello` over an unencrypted loopback WebSocket — is proportionate exactly because packets never leave the machine. On a LAN, every part of that sentence fails: the token can be sniffed, replayed, or intercepted by an active peer. B3 must deliver authentication that stays safe off-loopback: confidentiality for the credential (TLS via the transport, or a challenge-response that never transmits the token), a provisioning story for getting the credential onto the second machine, and a deliberate opt-in non-loopback binding decision. Note `hs.httpserver` accepts one WebSocket client, so the transport itself is likely replaced in this track; select the mechanism with that in mind.

**Description:** Replace or augment first-message cleartext token authentication with peer authentication that remains safe when the server binds beyond loopback. The current bridge reads a shared token file, sends it in `hello`, and establishes an in-memory session ID; it does not authenticate WebSocket upgrade headers, encrypt the transport, or verify peer identity.

**References:**

- `docs/architecture.md:81-90,143-145` — current token/session lifecycle.
- `docs/security.md:40-45,95-97` — first-message limitation and later authentication options.
- `hammerspoon/streamdeck/server.lua:303-321` — current token check and session creation.
- `plugin/src/bridge.ts:541-551` — current first-message authentication.

#### Implementation tasks

- [x] B3-T1 — Select the authentication mechanism (transport encryption, challenge-response, or authenticated upgrade) that remains safe off-loopback, accounting for the likely transport replacement.
  - Decision (2026-07-21, supersedes the same-date mutual-TLS companion decision): pre-shared-key mutual authentication implemented entirely inside the two existing runtimes — no companion process and no native Keychain/TLS component on either Mac. The remote hop is a second `hs.httpserver` instance bound to a specific interface (prefer interface name over a DHCP-assigned IP) on a separate explicit opt-in port; the loopback listener remains byte-for-byte unchanged. Handshake: client sends its client ID and nonce, server replies with its nonce, and each side proves knowledge of that client's key by MACing the full transcript (protocol label, role, client ID, both nonces), which defeats reflection and identity misbinding; the server verifies the client proof before any dispatch and the client verifies the server proof before sending events. Per-connection session keys derive via HKDF over HMAC-SHA256 with distinct per-direction and per-purpose labels; every subsequent frame carries an HMAC over the sequence number and exact payload bytes with strict increment-by-one per-direction counters; any gap, repeat, or MAC failure closes the connection; MAC comparison is constant-time (double-HMAC). Lua uses the current `hs.hash` HMAC-SHA256 API and reads `/dev/urandom` for randomness (not `hs.host.uuid()`); TypeScript uses `node:crypto` (`hkdfSync`, `randomBytes`).
  - Rationale: the acceptance criteria require mutual authentication and that unauthenticated peers cannot dispatch — not traffic confidentiality. The superseded decision imported a confidentiality requirement absent from the ACs, and that import alone forced the companion process, private CA, enrollment ceremony, and a second local-IPC authentication problem whose maintenance surface exceeds the shipped plugin. The PSK scheme provides mutual authentication, integrity, and replay protection for all application traffic; the accepted residual exposure is LAN-observable traffic content (low sensitivity, to be documented as an explicit boundary) and observe/drop denial of service, which fails safe.
  - Compatibility: the loopback v1 wire contract is unchanged, so B2 stays un-triggered. One authenticated session remains the global limit in B3 — enabling the remote profile while the loopback client is active is out of scope until B4's isolation work. Verify early in T3 that the one-WebSocket-client-per-instance behavior holds per `hs.httpserver` instance (the finding is empirical, not documented).
- [x] B3-T2 — Define credential provisioning for a second machine plus rotation, migration, failure, and fallback behavior without weakening v1 authentication.
  - Decision (2026-07-21, supersedes the same-date CSR/Keychain enrollment decision): provisioning is one manual copy of a per-client 32-byte CSPRNG key file (mode `0600`; per-client files under `~/.hammerspoon/` on the primary, a configured path on the remote Mac) between the owner's machines — the same trust story as the shipped v1 token file. Rotation regenerates and recopies the file; revocation deletes that client's server-side key file and drops its session; per-client identity is which key authenticated the handshake. Domain separation: the LAN listener speaks only the PSK protocol and rejects v1 `hello`/token outright; the remote plugin profile never reads or sends the v1 token (the client side is already confined by B3-T2.5); missing or invalid credentials leave the remote profile disconnected with a safe, actionable reason and never downgrade to `ws://`, token authentication, or an unauthenticated mode.
- [x] B3-T2.5 — Restrict the legacy token transport to literal loopback endpoints before opening a socket or reading the shared token.
  - Completion (2026-07-21): `29c873181695eafc5d7deac9929e8f45e28a5823` and `9912b073fb4b8f6cad2eab7fa0a8daed2d7752bf` accept only literal `ws://localhost`, `ws://127.0.0.1`, or `ws://[::1]` forms and reject all other legacy endpoints before token authentication. Independent verification found URL-normalized aliases (`127.1`, decimal IPv4, expanded IPv6); the latter commit fixes them and tests those boundaries. The source, compiled plugin artifact, tests, and security guide agree.
- [x] B3-T2.75 — Define the companion runtime and trust bootstrap needed to ship the selected mutual-TLS architecture.
  - Resolution (2026-07-21): the owner rejected both companion footprints via this task's own escape hatch, and the mutual-TLS architecture is superseded by the re-decided B3-T1/T2 above. Footprint (a), a separately installed persistent companion, is a signed/notarized launchd-managed daemon plus a native remote-Mac Keychain component, an enrollment ceremony, CA/revocation management, and an authenticated-IPC design — a maintenance surface larger than the shipped plugin, defending bounded pre-registered callback dispatch on a home LAN. Footprint (b) is incoherent: the companion must run on the Hammerspoon Mac, which need not run the Stream Deck application, and Elgato lifecycle ownership of a security-critical listener is wrong even when co-located. No native TLS/Keychain component runs on either Mac.
- [x] B3-T3 — Implement the opt-in LAN listener, PSK handshake, and per-frame authentication across TypeScript and Lua; cross-validate both crypto implementations against RFC 4231 (HMAC) and RFC 5869 (HKDF) test vectors; update `docs/security.md` with the LAN trust boundary, the explicit statement that traffic content is observable to LAN peers by design, the per-client revocation procedure, and a minimum Hammerspoon version.
- [x] B3-T4 — Add unauthorized-peer, replayed-handshake, replayed/reflected/tampered-frame, wrong-key-client, downgrade (v1 `hello` at the LAN listener), revocation-mid-session, rotation, and reconnect tests.

#### Acceptance criteria

- [x] B3-AC1 — Unauthenticated or incorrectly identified peers cannot dispatch callbacks.
- [x] B3-AC2 — Authentication failures remain safe and actionable without exposing credentials or session IDs.
- [x] B3-AC3 — No unauthenticated fallback or secret logging is introduced; non-loopback binding exists only as explicit opt-in behind the new authentication, and loopback remains the default.

#### Definition of Done

- [x] B3-DOD1 — Security review covers credential storage, provisioning, rotation, transport behavior, and migration from the v1 token flow.

### B5 — Add stronger denial-of-service limits

**Status:** Planned; prerequisite of B4, after B3.

**Product assessment:** Under one authenticated loopback client, the 64 KiB frame/body cap bounds the realistic exposure, and no JSON nesting-depth limit, rate limiter, or connection-admission policy exists (verified). The moment the port is reachable from the LAN, those absences become real: unauthenticated peers can open connections, spray oversized or deeply nested frames, and exhaust the bridge before authentication ever runs. These limits must land before or with B4, not after.

**Description:** Add the rate, connection-admission, buffering, and parser-depth protections called out by the security guide, sized for a LAN-reachable listener. The current Lua server configures a 64 KiB HTTP body/frame limit; no explicit JSON nesting-depth limit, rate limiter, or stronger connection admission policy is present.

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

- [ ] B5-DOD1 — Security review verifies the limits against the LAN threat model and reconnect behavior.

### B4 — Support multiple plugin clients with isolation

**Status:** Planned; requires B3 and B5 first.

**Product assessment:** The use case is a second Stream Deck attached to another computer on the LAN driving the same Hammerspoon bridge. That makes this a transport-and-security project, not a connection-count change: binding leaves loopback only as explicit opt-in (B3); abuse limits must already exist (B5). Client identity becomes per-machine, instance ownership must be partitioned per client, and one client's disconnect or malformed traffic must not disturb the other's keys. Shipping this revises the README non-goals ("multiple simultaneous plugin clients") and the loopback-only architecture boundary — deliberately, through this contract. Transport caveat recorded 2026-07-21: the multi-client transport question remains genuinely unsolved — B3's two-listener design supports one loopback client plus one remote client at most, listening `hs.socket` instances broadcast writes to all connected clients and their read callbacks carry no client attribution, so B4-T1 must choose between per-client `hs.httpserver` instances and a deliberate `hs.socket` design; do not inherit an assumption that B3 closed this.

**Description:** Replace the one-client bridge assumption with deliberate multi-client lifecycle, authorization, instance ownership, and failure isolation, so a local plugin and a remote LAN plugin can operate concurrently. Loopback single-client remains the default configuration.

**References:**

- `README.md:19` — multi-client is currently a v1 non-goal; shipping B4 updates this deliberately.
- `docs/architecture.md:123-125,147-158` — one-client limit and roadmap boundary.
- `docs/lua-api.md:390-405` — one supported local plugin client and excluded multi-client API.
- `docs/security.md:89-97` — single-client availability risk and later isolation hardening.

#### Implementation tasks

- [ ] B4-T1 — Define client identity, authorization ownership, session/context isolation, and lifecycle semantics.
- [ ] B4-T2 — Define resource, connection, and failure limits for concurrent clients.
- [ ] B4-T3 — Implement isolated client registries and synchronization behavior.
- [ ] B4-T4 — Add concurrent-client, stale-session, disconnect, and resource-exhaustion tests.
- [ ] B4-T5 — Define the explicit opt-in network configuration (default remains loopback) and update the README/architecture non-goal wording as part of the same change.

#### Acceptance criteria

- [ ] B4-AC1 — One client's disconnect, malformed traffic, or stale session cannot dispatch against another client's contexts.
- [ ] B4-AC2 — Client admission and resource limits are bounded and observable through safe diagnostics.
- [ ] B4-AC3 — Existing single-client loopback behavior remains the compatible default; LAN operation requires explicit configuration.

#### Definition of Done

- [ ] B4-DOD1 — Multi-client behavior is documented as a protocol/architecture contract and independently security-reviewed.

## Protocol gates

### B2 — Add protocol major-version negotiation

**Status:** Gate on the first breaking protocol change; not independently schedulable.

**Product assessment:** Necessary exactly once — alongside protocol v2. Implementing negotiation now would add surface with no counterpart to negotiate with; shipping a breaking major without it would strand deployed peers. The remote-client track raises the stakes: once a plugin on a second machine talks to Hammerspoon on the first, the two sides update independently and version skew becomes the normal deployment state, not a hypothetical. This item exists so the first breaking change cannot ship without it.

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

## Explicit v1 non-goals

The following are intentionally outside the current contract and are not scheduled here as future commitments: direct Stream Deck hardware/HID access from Lua, unauthenticated operation, Bonjour/discovery, remote Lua evaluation, arbitrary Lua commands, a Lua settings-write API, polling as an appearance fallback, and arbitrary plugin-to-Lua configuration messages. See `README.md:8,19` and `docs/lua-api.md:394-407`. The remote-client track (B3/B5/B4) deliberately revises the loopback-only and single-client boundaries through its own contract; it does not touch the exclusions above — remote clients still require explicit configuration and authentication, never discovery or an unauthenticated mode.
