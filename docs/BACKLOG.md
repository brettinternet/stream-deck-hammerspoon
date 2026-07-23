# Backlog

This backlog records only incomplete work explicitly described as later, deferred, or requiring a new protocol/architecture decision. It does not turn the repository's v1 non-goals into promises; where an item deliberately revises a v1 boundary, the item says so.

## Triage

The only remaining item is B2, a standing gate that becomes schedulable with the first breaking protocol change.

| Item | Disposition              | Rationale                                                                                                                                                   |
| ---- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B2   | Gate, not scheduled work | Required only alongside the first breaking protocol change; remote clients make cross-machine version skew the normal failure mode when that day comes. |

## Protocol gates

### B2 — Add protocol major-version negotiation

**Status:** Gate on the first breaking protocol change; not independently schedulable.

**Product assessment:** Necessary exactly once — alongside protocol v2. Implementing negotiation now would add surface with no counterpart to negotiate with; shipping a breaking major without it would strand deployed peers. The remote-client track raises the stakes: once a plugin on a second machine talks to Hammerspoon on the first, the two sides update independently and version skew becomes the normal deployment state, not a hypothetical. This item exists so the first breaking change cannot ship without it.

**Description:** Add a backward-compatible capability exchange before introducing protocol version 2 or another breaking major. v1 currently performs an admission check only; `helloAck` does not negotiate a version.

**References:**

- `docs/protocol.md:461-478` — breaking changes, negotiation requirements, and supported-version window.
- `plugin/src/protocol.ts:5` — current protocol version is fixed at 1.
- `protocol/schema/protocol-v1.json:209-214` — v1 schema requires `protocolVersion: 1`.
- `plugin/src/bridge.ts:710-715` — the loopback hello contains only the v1 version, token, and plugin version.

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

The following are intentionally outside the current contract and are not scheduled here as future commitments: direct Stream Deck hardware/HID access from Lua, unauthenticated operation, Bonjour/discovery, remote Lua evaluation, arbitrary Lua commands, a Lua settings-write API, polling as an appearance fallback, and arbitrary plugin-to-Lua configuration messages. See `README.md:8,19` and `docs/lua-api.md:394-407`. Authenticated remote clients deliberately revised the loopback-only and single-client boundaries; they still require explicit configuration and authentication, never discovery or an unauthenticated mode.
