# Troubleshooting

Use this guide after completing the [development guide](./development.md). Keep the official Stream Deck application running during every plugin check. The bridge is authenticated, loopback-only, and supports one plugin WebSocket client; do not substitute direct USB/HID access or a second hardware controller.

## Quick triage

From the repository root, confirm the source and packaging checks first:

```sh
bun run check
bun run test
bun run build
lua -e 'assert(loadfile("hammerspoon/streamdeck/init.lua"))'
bunx --package @elgato/cli@1.7.4 streamdeck validate plugin/com.brettinternet.hammerspoon.sdPlugin
```

Then confirm the Lua module is available to Hammerspoon, the bridge is running, and the linked plugin is restarted with the official CLI:

```sh
bunx --package @elgato/cli@1.7.4 streamdeck link plugin/com.brettinternet.hammerspoon.sdPlugin
bunx --package @elgato/cli@1.7.4 streamdeck restart com.brettinternet.hammerspoon
```

## The plugin stays offline

- Confirm Hammerspoon is running and the bridge is started.
- Confirm both ends use the default endpoint `ws://localhost:17321/streamdeck` and that the server binds localhost/loopback only.
- Check `~/.hammerspoon/streamdeck-token` exists, is readable by the relevant user, contains the current two-UUID token, and has mode `0600`.
- Reload Hammerspoon after changing the module or token, then restart the plugin.
- Verify the official Stream Deck application is still running; the bridge expects one local plugin client, not an independent hardware connection.

## Authentication fails

The first WebSocket message must be the protocol-v1 `hello` containing the shared token and `pluginVersion`. A valid hello always establishes a fresh session ID and invalidates any old one. Every later plugin-to-Lua application message must echo the exact current ID; an unauthenticated, malformed, missing-ID, or stale-ID message is rejected. Check the token file and permissions on both sides; never turn authentication off. Do not expect a WebSocket upgrade-header token: Hammerspoon's `hs.httpserver:websocket` exposes message callbacks rather than upgrade headers.

## Reconnect and session troubleshooting

If the plugin reconnects but actions do not run, treat the session as stale rather than trying to reuse a previous ID:

1. Reload or restart Hammerspoon so the bridge clears its in-memory session ID and instance contexts.
2. Restart the plugin (or use the official Stream Deck CLI `restart`) so it rereads the token and sends a new token-bearing `hello`.
3. Confirm the plugin receives `helloAck.sessionId`, keeps it only in memory, and includes it on `listActions`, each lifecycle event, `keyDown`, `keyUp`, `dialDown`, `dialRotate`, `dialUp`, `touchTap`, and `requestAppearance`.
4. Confirm the Lua bridge rejects missing/old IDs without invoking `appear`, `press`, `release`, `disappear`, or `touchTap`; do not log or print the ID while diagnosing.
5. Wait for synchronization: the plugin requests actions, re-announces visible instances, and requests appearance. A repeated `instanceAppeared` for the same instance/action refreshes settings and must not run `appear` again.

If Hammerspoon cannot report the old socket's close, this sequence is still safe: the next valid hello clears prior contexts and rotates the session ID, so the abandoned client cannot send tokenless application messages.

## Empty frames or transport parse errors

`hs.httpserver:websocket` callbacks must return a string, so a lifecycle event with no response may appear as a zero-length frame. The TypeScript transport is expected to ignore only that zero-length frame before JSON/protocol validation. Do not treat it as an additional protocol message or an authentication failure. If a frame contains any bytes, it is not an empty-frame artifact: malformed JSON, an unsupported version, an unknown type, or any other invalid non-empty frame must remain a strict validation error. Check the sender/transport framing before changing protocol or authentication behavior.

## Actions or appearance are stale

Reloading Lua intentionally drops the instance registry, session ID, and instance contexts. Wait for the plugin's bounded reconnect, then confirm it re-authenticates, receives a fresh session ID, requests actions, resends visible instances, and requests appearance. A repeated `instanceAppeared` for an unchanged instance/action only refreshes settings; it must not rerun `appear`. An unknown/stale instance, action, or session ID should be corrected by restarting/reconnecting the two endpoints and selecting a current registered action in the property inspector, not by editing protocol messages manually.

## Module cannot be loaded

Check that `~/.hammerspoon/streamdeck/` is a link or copy of the repository's `hammerspoon/streamdeck/` directory, reload Hammerspoon, and run the Lua load check again. A load check does not prove that Hammerspoon has started the server or that callbacks are registered.

For a development symlink:

```sh
mkdir -p ~/.hammerspoon
ln -sfn "$PWD/hammerspoon/streamdeck" ~/.hammerspoon/streamdeck
lua -e 'assert(loadfile("hammerspoon/streamdeck/init.lua"))'
```

## Logs and diagnostics

Use the official Stream Deck application/plugin logs and Hammerspoon Console for diagnostics. `BridgeClient.diagnostics` is a local, redacted snapshot and the `diagnostics` event publishes the same shape whenever a new failure is observed:

```json
{
  "version": 1,
  "status": "disconnected",
  "protocolVersion": 1,
  "pluginVersion": "0.1.0",
  "port": 17321,
  "retryInMs": 250,
  "latest": {
    "area": "auth",
    "code": "AUTH_FAILED",
    "at": "2026-07-17T00:00:00.000Z"
  }
}
```

`area` identifies `auth`, `schema`, `reconnect`, `registry`, or `callback`. Auth/schema causes are retained over a generic disconnect, while reconnect diagnostics expose bounded retry delay. Plugin versions are restricted to a short safe character set, timestamps are UTC, and optional diagnostic log lines use the `bridge-status <JSON>` prefix, stay under 384 bytes, and suppress repeated area/code pairs. The snapshot and log line never contain token or hello payloads, session/correlation IDs, URLs or token paths, callback/malformed text, or stack traces. Safe protocol error codes/messages and connection state may be logged; shared tokens, hello payloads, and session IDs must never be logged. Capture timestamps, plugin version, protocol version, port, and the safe error code when reporting a problem, but redact token paths if they reveal sensitive environment details. The server is loopback-only, Bonjour is disabled, and `hs.httpserver` effectively permits one WebSocket client; a second client is not a supported development setup.

When reporting a problem, include the plugin and Hammerspoon versions, protocol version, timestamp, official Stream Deck application status, and the safe diagnostic error code. Never include the token, hello payload, session ID, raw payloads, stack traces, or unredacted local paths.
