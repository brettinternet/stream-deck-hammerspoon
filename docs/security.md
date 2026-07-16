# Security

This bridge is a local, authenticated control channel between the official Stream Deck plugin and Hammerspoon. Authentication limits which local process can use the bridge; loopback binding limits where it can be reached. Neither one replaces the other.

## Assets and trust boundaries

| Asset or boundary | Security property |
| --- | --- |
| Stream Deck plugin package (`plugin/com.brettinternet.hammerspoon.sdPlugin/`) and its TypeScript/UI code | Code and built-in placeholder images are distributable assets. They contain no shared token. |
| Plugin process and its runtime settings | The plugin reads the token at runtime. The token is not stored in Stream Deck per-instance settings or sent through the property inspector. |
| Hammerspoon process and `hammerspoon/streamdeck/` Lua module | The Lua module owns the server, token file, connection authentication, action registry, and callback dispatch. Registered callbacks are trusted code running in the user's Hammerspoon process. |
| Token file (`~/.hammerspoon/streamdeck-token`) | This is the bearer credential shared by the plugin and Lua bridge. Its confidentiality depends on the local operating system and file permissions. |
| Loopback WebSocket at the default URL `ws://localhost:17321/streamdeck` | The transport is reachable only through localhost/loopback. It is not a remote service and does not provide encryption. |
| Protocol schema and validators | The JSON Schema is the protocol source of truth. TypeScript uses Ajv; Lua mirrors the required and type checks. |

The trust boundary is crossed only after a valid `hello` message authenticates the WebSocket. Before that point, the peer is untrusted input. The Stream Deck app, property inspector, plugin UI, local filesystem, and any other process on the host are not automatically trusted merely because they are local. Hammerspoon callbacks and the explicitly registered action definitions are trusted application code; message data is not code.

## Threat model and limits

The v1 design addresses accidental exposure beyond the host, unauthorized or malformed local WebSocket clients, invalid protocol data, and accidental disclosure through diagnostics. It assumes the user's account, Hammerspoon process, plugin installation, and operating-system file permissions have not already been compromised.

A process that can read `~/.hammerspoon/streamdeck-token`, impersonate the user, inject into Hammerspoon or the plugin, or otherwise control the host can use or replace the bridge. Token authentication cannot defend against that process. Loopback is a reachability restriction, **not authentication**: another local process may still connect to the port and attempt to authenticate. The bridge does not claim to protect against a compromised host, root, a malicious process with equivalent file access, or a stolen token.

The token is a bearer credential. Anyone who obtains it can authenticate until it is rotated or revoked. The WebSocket is not configured as a general remote endpoint, and v1 does not add TLS, remote access, or multi-user authorization.

## Binding and connection authentication

Hammerspoon starts `hs.httpserver` at the default URL `ws://localhost:17321/streamdeck`, on localhost/loopback only, with Bonjour disabled. Binding failure is a startup failure; the bridge does not retry by opening a non-loopback listener and does not fall back to an unauthenticated server.

`hs.httpserver:websocket` exposes message callbacks, but **websocket upgrade headers are unavailable to the Lua callback**. Consequently, the token cannot be placed in or checked from an HTTP upgrade header in v1. Authentication is a protocol-level first message:

1. Lua loads the token before accepting useful application traffic.
2. The plugin's first message must be a protocol v1 `hello` containing the shared token and `pluginVersion`.
3. Lua validates the message shape and token before acknowledging it with `helloAck`.
4. Until that acknowledgement, every other message is rejected. An invalid token, malformed hello, missing hello, or unknown first message never creates an authenticated session.
5. Rejected clients receive only a safe protocol error where a response is possible; they are not given token-comparison details or a reason that reveals secret material.

First-message authentication is a limitation as well as a design choice. The connection exists before the credential is presented, so a local peer can consume a connection slot or send repeated invalid attempts. It also provides no transport encryption and does not prove that the peer is the expected plugin beyond possession of the token. The plugin must display the disconnected/offline state when authentication cannot complete; it must never continue through an unauthenticated fallback.

### Callback return constraint and empty frames

`hs.httpserver:websocket` requires its message callback to return a string. A lifecycle event with no response therefore produces a zero-length transport frame. The TypeScript transport ignores only zero-length frames before JSON/protocol validation; every non-empty frame remains subject to strict JSON Schema/protocol validation. A zero-length frame is a transport artifact, not a protocol message or an eleventh type, and it does not bypass first-message authentication or authorize any client. This is a reversible, transport-specific limitation rather than an unauthenticated fallback.

## Token lifecycle

### Generation and storage

Lua creates the default token file at `~/.hammerspoon/streamdeck-token` when no token exists, using two UUIDs as the generated token. The generated value is written as a runtime secret, not bundled into the plugin, committed to source, placed in Stream Deck settings, or included in a protocol error. Lua and the plugin read the runtime file rather than accepting a token from UI settings.

The file must be owned and readable only by the user running Hammerspoon, with Unix mode `0600` (owner read/write; no group or other permissions). A deployment where the plugin sandbox cannot read this path is a supported failure mode to report as disconnected/actionably unavailable; it must not weaken permissions or switch to unauthenticated operation. The token file contents and the token itself must never be written to logs.

### Rotation and revocation

To rotate or revoke a token, stop the bridge, remove `~/.hammerspoon/streamdeck-token`, and restart/reload the Lua bridge so Lua generates a new token from two UUIDs. Restart or reconnect the plugin after rotation so it rereads the runtime token. The old token is then rejected, and existing authenticated sessions must not be treated as authorized after the bridge restart. Verify that the replacement file is again mode `0600`.

Deletion/restart is the v1 revocation procedure; there is no unauthenticated recovery mode and no token in settings to edit. Rotation cannot help if an attacker still has equivalent access to the host or can read the replacement file.

## Startup and failure behavior

Startup must fail closed in each of these cases:

- the token cannot be created, opened, or read;
- the token file cannot be kept at the required `0600` permissions;
- the token is unavailable to the plugin runtime; or
- the loopback server cannot bind its configured port.

Lua does not start a usable unauthenticated bridge in any of these cases. The plugin shows its actionable disconnected/offline state and follows its bounded reconnect behavior. A client with an invalid token, invalid first message, malformed JSON, unsupported protocol version, or unknown message type is rejected and never reaches action dispatch. Errors may identify a safe operational condition using a stable code/message, but must not echo secrets or raw input.

## Protocol and input validation

Every message contains `protocolVersion: 1` and a `type`. The canonical JSON Schema defines the allowed message shapes. TypeScript validates incoming and outgoing protocol data with Ajv, and Lua performs equivalent strict required-field and type checks because it cannot directly execute the JSON Schema.

Validation occurs before authentication state changes or action dispatch. Unknown fields are ignored as specified by v1; malformed messages, unsupported protocol versions, and unknown types are rejected. Request, instance, and action identifiers are data values used to select known registry entries, not executable names. Stale or unknown identifiers produce safe errors and cannot invoke arbitrary callbacks.

The bridge must not evaluate Lua source received over the WebSocket. There is no raw Lua evaluation endpoint, expression endpoint, shell command endpoint, or dynamic callback lookup. Lua dispatches only to explicitly registered action definitions, and protected callbacks use `xpcall` so callback failures do not turn message data into code execution.

Protocol errors contain only safe error codes/messages and optional `requestId`/`instanceId` correlation values. They must not include the token, token file contents, credentials, raw malformed payloads, Lua source, stack traces, or other secrets. Logs follow the same rule: never log the token, hello payload, authentication comparison, or a complete message that could contain one. Log only necessary redacted operational facts such as lifecycle, message type, safe identifiers, and failure code.

## Denial of service and message size

Loopback does not prevent a local process from connecting, sending invalid data, or occupying the one available WebSocket client slot. JSON parsing, validation, callback execution, reconnect churn, and oversized frames therefore remain denial-of-service concerns. v1 traffic is intentionally small and structured, but implementations must impose a finite message/frame size limit and reject oversized input before dispatch; they must also avoid unbounded buffering and avoid logging rejected bodies. Invalid clients must not receive action execution, and callback failures must be contained.

`hs.httpserver` is effectively single-client for this bridge. One local Stream Deck plugin process is the supported client; this is not a multi-client authorization or isolation mechanism. A second client, or a client that holds the connection without authenticating, can reduce availability. The bridge must report loss of the authenticated client as disconnected and must not silently authorize another peer without the normal first-message token check.

## Future hardening

Potential later hardening includes an OS-backed credential or peer-identity check, a transport/API that supports authenticated upgrade headers, stronger rate and connection limits, explicit protocol size/depth limits, and clearer multi-client isolation. These are not v1 behavior. They must not be approximated by logging secrets, weakening file permissions, binding beyond loopback, accepting messages before `helloAck`, or adding an unauthenticated fallback.
