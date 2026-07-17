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
- Status: ready
- Depends on: VSL-004
- Acceptance: Instance context exposes success/error feedback with bounded duration, safe messages, and callback isolation.

### CUS-005 — Per-instance state
- Status: ready
- Depends on: VSL-003, VSL-006
- Acceptance: Multiple placements of one action retain independent settings/state across profiles, devices, reconnects, and disappearance.

### CUS-006 — Better icon handling
- Status: waiting
- Depends on: CUS-003
- Acceptance: Semantic bundled icons and validated custom SVG/image inputs render at supported sizes with safe fallbacks.

## Phase 4: Extended Stream Deck support

### EXT-001 — Key release
- Status: waiting
- Depends on: CUS-005
- Acceptance: Release events preserve instance identity/order and invoke optional protected Lua callbacks.

### EXT-002 — Long press
- Status: waiting
- Depends on: EXT-001
- Acceptance: Configurable deterministic thresholds distinguish tap and long press without duplicate callbacks.

### EXT-003 — Stream Deck+ encoders
- Status: waiting
- Depends on: EXT-005, CUS-005
- Acceptance: Rotate and push events use versioned payloads, independent contexts, SDK-compliant layouts, and hardware-free tests.

### EXT-004 — Stream Deck+ touchscreen
- Status: waiting
- Depends on: EXT-003
- Acceptance: Touch/tap events and LCD updates are validated, instance-aware, and tested behind SDK interfaces.

### EXT-005 — Device metadata
- Status: waiting
- Depends on: CUS-005
- Acceptance: Context exposes stable, privacy-bounded device/controller metadata without leaking SDK objects into protocol modules.

### EXT-006 — Device-aware rendering
- Status: waiting
- Depends on: EXT-005, CUS-003
- Acceptance: Presentation adapts deterministically to supported key/LCD sizes and falls back safely for unknown devices.

## Phase 5: Developer ecosystem

### ECO-001 — Lua helper components
- Status: waiting
- Depends on: CUS-004, CUS-005
- Acceptance: Small composable helpers reduce common action boilerplate without hiding lifecycle or globalizing instance state.

### ECO-002 — Example action library
- Status: waiting
- Depends on: ECO-001
- Acceptance: Tested examples cover common Hammerspoon watchers, application state, audio, and multi-instance patterns.

### ECO-003 — Packaging and installation
- Status: ready
- Depends on: FND-004, VSL-007
- Acceptance: Reproducible release artifacts install plugin and Lua library with version/checksum documentation and uninstall steps.

### ECO-004 — Diagnostics
- Status: waiting
- Depends on: CUS-004, VSL-006
- Acceptance: Redacted status output identifies auth, schema, reconnect, registry, and callback failures without secrets or stack traces.

### ECO-005 — Protocol compatibility policy
- Status: ready
- Depends on: FND-006, VSL-006
- Acceptance: Policy defines additive/minor and breaking/major changes, negotiation, deprecation, fixtures, and supported-version windows.

### ECO-006 — Contributor documentation
- Status: waiting
- Depends on: ECO-003, ECO-004, ECO-005
- Acceptance: Contributor guide covers architecture changes, release workflow, protocol review, security reporting, and hardware-free verification.
