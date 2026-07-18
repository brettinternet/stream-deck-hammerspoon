# Development backlog

Status: `done`, `ready`, `waiting`. Dependencies are task IDs; all acceptance criteria are required.

## Phase 1: Foundation

### FND-001 — Repository structure

- Status: done
- Depends on: none
- Acceptance: Monorepo separates plugin source/artifact, Lua library, protocol, docs, examples, and tests.

### FND-002 — Build and lint configuration

- Status: done
- Depends on: FND-001
- Acceptance: mise pins Bun, Node, and Lua; Bun installs JavaScript dependencies; check, lint, test, and build gates pass.

### FND-003 — Plugin manifest

- Status: done
- Depends on: FND-001
- Acceptance: Official CLI validates one generic Keypad action, property inspector, runtime versions, and assets.

### FND-004 — Development packaging

- Status: done
- Depends on: FND-002, FND-003
- Acceptance: Bun scripts build, validate, and package the `.sdPlugin` directory with the official CLI.

### FND-005 — Lua module loading

- Status: done
- Depends on: FND-001
- Acceptance: `require("streamdeck")` loads ordinary Hammerspoon Lua modules with no direct hardware dependency.

### FND-006 — Protocol definitions

- Status: done
- Depends on: FND-001
- Acceptance: Canonical versioned JSON Schema, TypeScript validation, Lua validation, examples, and error semantics agree.

### FND-007 — Local authentication

- Status: done
- Depends on: FND-005, FND-006
- Acceptance: Loopback server requires a mode-0600 shared token in the first message and fails closed.

### FND-008 — Basic WebSocket transport

- Status: done
- Depends on: FND-002, FND-006, FND-007
- Acceptance: Plugin and Hammerspoon exchange validated messages at the documented loopback endpoint without polling.

## Phase 2: Vertical slice

### VSL-001 — Action registration

- Status: done
- Depends on: FND-005
- Acceptance: Explicit stable Lua action definitions reject malformed and duplicate IDs and isolate callback errors.

### VSL-002 — Action discovery

- Status: done
- Depends on: FND-006, VSL-001
- Acceptance: Authenticated plugin receives labeled registered actions with optional settings schemas.

### VSL-003 — Property inspector selection

- Status: done
- Depends on: FND-003, VSL-002
- Acceptance: Inspector shows connection state, lists actions by name, and stores `actionId` per instance.

### VSL-004 — Key press invocation

- Status: done
- Depends on: FND-008, VSL-001, VSL-003
- Acceptance: A configured key invokes only its registered Lua press callback with instance settings.

### VSL-005 — Dynamic title or image update

- Status: done
- Depends on: VSL-004
- Acceptance: Valid Lua appearance updates the matching key title and binary state; malformed appearance is rejected.

### VSL-006 — Reconnection

- Status: done
- Depends on: FND-008, VSL-005
- Acceptance: Bounded backoff reauthenticates, refreshes actions, replays visible instances, and restores appearances after either process restarts.

### VSL-007 — Example action

- Status: done
- Depends on: VSL-004, VSL-005
- Acceptance: Microphone mute example toggles `hs.audiodevice`, refreshes, and renders state without hardware-specific test requirements.

## Phase 3: Customization

### CUS-001 — Settings schema contract

- Status: done
- Depends on: VSL-003
- Acceptance: Versioned schema supports bounded field types, defaults, constraints, validation errors, and compatibility tests at both boundaries.
- Commits: 90107f7e65dc49afe2d220ec6a9c6ff7f6606f57, cd4105d939232ce5057cc21a4c8c96b2b816255e
- Verification: TypeScript check and 43 plugin tests; Lua syntax check and 35 Lua bridge tests.
- Outcome: Explicit v1 settings fields validate bounded types, defaults, constraints, and errors at both boundaries; legacy schemas remain opaque and unsupported versions are not rendered.
- Follow-up: JSON Schema covers structural bounds; runtime validators enforce cross-field default/range and property-uniqueness invariants that draft 2020-12 cannot express directly.

### CUS-002 — Dynamic property-inspector controls

- Status: done
- Depends on: CUS-001
- Acceptance: Inspector renders supported schema controls, persists validated per-instance values, and clearly handles unsupported fields.
- Commits: 880e1c4fbda95f736bcbe11fce53cff24437ecfc, f847ecd1838f26a435c3e72dff599d7de0bd1a1a
- Verification: 63 plugin tests; 36 Lua bridge tests; 10 Lua startup tests; TypeScript and Lua checks; build; generated JavaScript syntax checks; Stream Deck manifest validation.
- Outcome: The inspector renders version 1 text, number, boolean, and select controls with defaults and native constraints, preserves per-instance and opaque settings, rejects invalid edits with clear status, and reports unsupported schemas without editable controls. HammerspoonAction forwards complete JSON settings through appearance, settings updates, and keyDown.

### CUS-003 — Additional presentation fields

- Status: done
- Depends on: CUS-001, VSL-005
- Acceptance: Foreground/background colors, progress, and badge fields are versioned, validated, rendered, and device-safe.
- Commits: 2be9819d47829f48ab0b15c0c654a184670dcb0a, c83692af9a6767fb1b607de84adef8c0ed88755a, c4ce5ce9a7db282b40b7b16336adfeb24823b69a, 51ae1d7eb3496e7c61dc8451eee68d9d25927050, 9c0642705ba32e3728d3a4327cefbd2b3499212c
- Verification: 67 plugin tests; 37 Lua bridge tests; 10 Lua startup tests; TypeScript and Lua checks; lint; build; generated JavaScript syntax checks; Stream Deck manifest validation; independent verifier PASS on all 5 criteria.
- Outcome: Versioned appearanceVersion 1 adds bounded foreground/background colors, progress, and UTF-8 badges across the canonical schema, TypeScript/Ajv, Lua validation, and plugin rendering. The plugin emits escaped SVG decoration through supported setImage calls, clears stale decoration safely, serializes per-instance renders across status/reconnect races, and retains the previous complete appearance when clearing fails. Legacy title/state and offline fallbacks remain supported.

### CUS-004 — Success and error APIs

- Status: done
- Depends on: VSL-004
- Acceptance: Instance context exposes success/error feedback with bounded duration, safe messages, and callback isolation.
- Commits: b6ef96a5cf41fa16164b2f6d9a1e9a1d2ff933f5, 164d6f1151d970bf2d07188b5ac5afd8cdc2d1f0
- Verification: 70 plugin tests; 40 Lua bridge tests; TypeScript check; Lua syntax check; plugin build; focused Unicode-boundary protocol test; independent verifier PASS on all 5 criteria.
- Outcome: Per-instance context success/error methods emit versioned feedback with safe UTF-8 messages and 100–10,000 ms durations. Lua and TypeScript validators agree on code-point bounds; the plugin correlates feedback by instance/action, shows message plus success/alert indicators, restores appearance after expiry, and isolates stale lifecycle, emitter, listener, SDK, and timer failures.

### CUS-005 — Per-instance state

- Status: done
- Depends on: VSL-003, VSL-006
- Acceptance: Multiple placements of one action retain independent settings/state across profiles, devices, reconnects, and disappearance.
- Commits: b3e0d9fe43198d32075909b693e9754c916edea0, 140d3ac
- Verification: 32 plugin tests; 41 Lua bridge tests; TypeScript check; Lua syntax check; independent verifier PASS on all 5 acceptance aspects.
- Outcome: Bridge and action adapters key snapshots, settings, appearances, and lifecycle events by Stream Deck instance ID. Same-action placements retain independent profile/device settings through updates and reconnect replay; Lua contexts rebuild independently from replayed settings, disappear cleanly, reject stale input/appearance, and preserve other visible instances. Explicit stale action removals cannot erase a newer binding.

### CUS-006 — Better icon handling

- Status: done
- Depends on: CUS-003
- Acceptance: Semantic bundled icons and validated custom SVG/image inputs render at supported sizes with safe fallbacks.
- Commits: 589dbe3, 61f28bbb945867bbb3bfb99a83c90da3cfe22f8a, 9d17210, c3e70b8, 9b39ffe, ebcb7c9, f607d8f
- Verification: `bun run check`; `bun test plugin/tests/protocol.test.ts plugin/tests/hammerspoon-action.test.ts` (35 pass, 153 expect calls); `lua hammerspoon/tests/run.lua` (41 pass); `bun run build`; independent verifier PASS on HEAD `f607d8f` across bundled fallback, valid 72/144 PNG/SVG, malformed/trailing PNG rejection, SVG parity, context delegation, action preservation, SDK fallback, and generated bundle/source-map reproducibility.
- Outcome: Versioned appearance icons accept semantic bundled slugs through the shipped `imgs/key.svg` fallback and bounded custom PNG/SVG data. TypeScript and Lua validate CRCs, dimensions, decoded PNG streams, consumed zlib data, canonical base64, and constrained SVG syntax with matching casing, bounds, text, and safety rules. Context delegates icon validation to the protocol; invalid icons preserve the previous complete appearance or safely clear to the SDK default, while titles/state remain coherent.

## Phase 4: Extended Stream Deck support

### EXT-001 — Key release

- Status: done
- Depends on: CUS-005
- Acceptance: Release events preserve instance identity/order and invoke optional protected Lua callbacks.
- Commits: 1cfe51dc73ceb9c87f4739557d12973c66bc07ce, 06963e18d6890657c5ac7832cc7f5720dafa3fd9
- Verification: 55 plugin tests; TypeScript check; 41 Lua bridge tests; Lua syntax/load check; plugin build; shipped bundle syntax check; independent verifier PASS on EXT-001.
- Outcome: Stream Deck onKeyUp events retain instance/action identity and order through HammerspoonAction, BridgeClient, the keyUp protocol schema, and Lua validation/dispatch. Optional release callbacks are validated as functions, omitted release is a no-op, and present callbacks run under xpcall with CALLBACK_FAILED reporting while keyDown/press behavior remains intact.

### EXT-002 — Long press

- Status: done
- Depends on: EXT-001
- Acceptance: Configurable deterministic thresholds distinguish tap and long press without duplicate callbacks.
- Commits: 5c28cea, f72f41f
- Verification: `lua hammerspoon/tests/run.lua` (44 pass); Lua syntax/load check; `git diff --check`; post-fix regression covers stale/replaced timer callbacks, duplicate timer callbacks, tap/long classification, cancellation, and callback isolation. Independent verifier identified and the review fix corrected the superseded implementation's stale-timer duplicate gap.
- Outcome: Optional `longPress` callbacks use bounded integer thresholds from 100–10,000 ms with a deterministic 500 ms default. Per-instance timers classify taps at key-up and long presses at threshold, preserve legacy immediate press behavior when unconfigured, cancel on key-up/disappear/settings replacement, and use generation and trigger guards to suppress stale or duplicate callbacks. Release and callback-error isolation remain protected.

### EXT-003 — Stream Deck+ encoders

- Status: done
- Depends on: EXT-005, CUS-005
- Acceptance: Rotate and push events use versioned payloads, independent contexts, SDK-compliant layouts, and hardware-free tests.
- Commits: b0df656, 73cc32e, 33b15ca
- Verification: `bun run check`; `bun run test`; `bun run build`; `bun run validate` (Stream Deck CLI validation successful); generated bundle contains `sendDialEvent`, `dialDown`, `dialRotate`, and `dialUp`; manifest JSON validation passed; independent verifier PASS.
- Outcome: Stream Deck+ encoder lifecycle and input events use authenticated versioned `dialDown`, `dialRotate`, and `dialUp` payloads. Dial actions receive SDK `$A1` layouts and per-instance settings/context; push falls back to `press`, rotation carries signed ticks and pressed state, and release remains optional and protected. Lua registry, context invocation, server dispatch, schema, plugin transport, generated artifact, docs, and hardware-free tests are synchronized.

### EXT-004 — Stream Deck+ touchscreen

- Status: done
- Depends on: EXT-003
- Acceptance: Touch/tap events and LCD updates are validated, instance-aware, and tested behind SDK interfaces.
- Commits: 3f45f996eda0fcbead30048fa5884e545565db8e, cdc7ddd
- Verification: 84 plugin tests; 45 Lua bridge tests; 10 Lua startup tests; TypeScript and Lua checks; build; generated JavaScript syntax check; Stream Deck manifest validation; independent verifier PASS on all 5 criteria.
- Outcome: Added authenticated, instance-correlated `touchTap` events carrying validated `hold` and bounded Stream Deck+ `tapPos` coordinates through the SDK adapter, BridgeClient, protocol schema/Ajv, Lua validation, registry, and protected per-instance callback dispatch. Dial LCD appearance updates remain behind SDK `setFeedback` with hardware-free coverage; manifest trigger descriptions, docs, and generated artifacts are synchronized.

### EXT-005 — Device metadata

- Status: done
- Depends on: CUS-005
- Acceptance: Context exposes stable, privacy-bounded device/controller metadata without leaking SDK objects into protocol modules.
- Commits: fb4f4c3, a684128
- Verification: `bun run --cwd plugin check`; focused plugin protocol/bridge/action tests (57 pass); Lua syntax check and bridge harness (44 pass); generated plugin syntax check; `bun run validate`; independent verifier: 4/5 criteria PASS; its only failure was the stale shipped artifact, fixed by a684128. Post-fix generated-artifact symbol check, `node --check`, and Stream Deck CLI validation pass, closing that finding.
- Outcome: Optional `instanceAppeared.metadata` carries a closed, protocol-owned controller/device DTO with lowercase enums, unknown-device fallback, and bounded dimensions. Hammerspoon contexts expose defensive `getDevice()` snapshots; repeated announcements update metadata without rerunning `appear`, and BridgeClient retains independent metadata through reconnect replay. SDK identifiers, names, connection state, actions, coordinates, and SDK objects never cross protocol modules.

### EXT-006 — Device-aware rendering

- Status: done
- Depends on: EXT-005, CUS-003
- Acceptance: Presentation adapts deterministically to supported key/LCD sizes and falls back safely for unknown devices.
- Commits: 298fbc53adaf395084569b1fa84339b5909b3916
- Verification: `bun run check`; `bun run test` (87 plugin tests, 45 Lua bridge tests, 10 Lua startup tests); focused rendering tests (21 pass); generated plugin `node --check`; `bun run validate`; independent verifier PASS on all 6 criteria.
- Outcome: Per-instance sanitized device metadata selects the SDK-backed 72×72 keypad profile or 200×100 encoder LCD profile. Recognized decorated encoders use `$A0` full-canvas SVG feedback and plain/fallback output uses `$A1`; unknown, missing, malformed, or mismatched metadata remains safe and does not alert solely for metadata. Layout transitions clear stale canvas feedback, failures remain atomic, lifecycle/reconnect serialization is preserved, and shipped artifacts/docs are synchronized.

## Phase 5: Developer ecosystem

### ECO-001 — Lua helper components

- Status: done
- Depends on: CUS-004, CUS-005
- Acceptance: Small composable helpers reduce common action boilerplate without hiding lifecycle or globalizing instance state.
- Commits: b9c232e, 9f0ffe8
- Verification: `lua hammerspoon/tests/run.lua` (46 pass); Lua syntax/load check; `git diff --check`; independent verifier PASS on all acceptance criteria for final HEAD `9f0ffe8` (parent `b9c232e`), including stale same-ID lifecycle isolation; focused Lua smoke PASS.
- Outcome: Added `streamdeck.helpers.perInstanceState(initializer)` with closure-scoped, context-owned state and explicit appear/disappear callbacks, plus `refreshAfter(callback)` for successful callback refreshes with return/error preservation. The multi-instance example and Lua API docs demonstrate the helpers without hiding bridge lifecycle or globalizing instance state. Stale callbacks cannot read, write, or remove a replacement lifecycle reusing an instance ID.

### ECO-002 — Example action library

- Status: done
- Depends on: ECO-001
- Acceptance: Tested examples cover common Hammerspoon watchers, application state, audio, and multi-instance patterns.
- Commits: a08346a, 28e1e0a, 1c778f0, 3aecf84, 1ae73fc, a034901, 7402685, fcba1af
- Verification: `bun run lua:check`; `lua hammerspoon/tests/run.lua` (46 pass, including 19 example cases); independent verifier PASS on all four acceptance dimensions and hardware-free/documentation criteria.
- Outcome: The documented 15-example library covers application watchers and frontmost state, input-audio mute, and independent multi-instance state with fake-Hammerspoon tests. The microphone and meeting-mode examples use the input-specific mute APIs and reject failed operations without refreshing.

### ECO-003 — Packaging and installation

- Status: done
- Depends on: FND-004, VSL-007
- Acceptance: Reproducible release artifacts install plugin and Lua library with version/checksum documentation and uninstall steps.
- Commits: e89bd74be2129651db62354d5277d3f9ca9f40d2, 621c336c9b4a43763a05c0ef3b13fe1bb62a8c16
- Verification: `bun run release` twice produced identical SHA256SUMS and preserved pre-existing generated-file hashes; SHA-256 verification, plugin archive test, and Lua archive inspection passed; `bun run check`, `bun run test`, and ESLint passed; independent verifier PASS on all 5 criteria.
- Outcome: Added a Bun release command that builds and validates the pinned Stream Deck package, normalizes plugin and Lua archive metadata for repeatable bytes without leaving tracked build output changed, writes versioned artifacts and SHA256SUMS/RELEASE.json, and documents verified installation and uninstall flows.

### ECO-004 — Diagnostics

- Status: done
- Depends on: CUS-004, VSL-006
- Acceptance: Redacted status output identifies auth, schema, reconnect, registry, and callback failures without secrets or stack traces.
- Commits: 230682b, 8509976, a5db2e2
- Verification: Plugin tests (94 pass); focused diagnostics tests (30 pass, 169 expect calls); TypeScript check; Lua syntax/load check; Lua bridge tests (46 pass); shipped bundle `node --check`; `git diff --check`; independent verifier PASS on the final commits for all five failure categories, redaction/bounds, failure-cause precedence, and shipped bundle/source-map parity.
- Outcome: Added a local BridgeClient diagnostics snapshot/event and `bridge-status` logger with bounded safe metadata, stable auth/schema/reconnect/registry/callback categories, canonical protocol messages, redaction, retry bounds, duplicate suppression, and shipped artifact parity. Authenticated auth and schema causes survive a later generic disconnect while later registry/callback failures supersede the preserved cause.

### ECO-005 — Protocol compatibility policy

- Status: done
- Depends on: FND-006, VSL-006
- Acceptance: Policy defines additive/minor and breaking/major changes, negotiation, deprecation, fixtures, and supported-version windows.
- Commits: 7e3e24a40d5840b1915b38250cce22eb7e747e4f, ad46b5d4e2c7eb910a70d6350cbfb47169d3f929
- Verification: `bun run check`; `bun run test`; independent verifier criterion-by-criterion PASS.
- Outcome: Defined the v1 exact-version posture, additive/minor and breaking/major change classes, explicit future negotiation rules, deprecation lifecycle, positive fixture ownership under `protocol/examples/`, and current-plus-previous major support windows. Contributor workflow now requires compatibility classification and synchronized schema, fixture, and validator updates.

### ECO-006 — Contributor documentation

- Status: done
- Depends on: ECO-003, ECO-004, ECO-005
- Acceptance: Contributor guide covers architecture changes, release workflow, protocol review, security reporting, and hardware-free verification.
- Commits: 71b051f
- Verification: `git diff --check 71b051f^ 71b051f`; independent verifier PASS on all five acceptance criteria; focused Markdown-link inspection passed.
- Outcome: CONTRIBUTING.md now documents architecture boundaries and source/artifact ownership, protocol compatibility/schema/fixture/validator review, reproducible release/checksum/install workflow, private security reporting and redaction, and hardware-free versus hardware-required verification.
