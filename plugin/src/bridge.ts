import { EventEmitter } from "node:events";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFile as nodeReadFile } from "node:fs/promises";
import { randomBytes as nodeRandomBytes } from "node:crypto";
import WebSocket from "ws";

import {
  decodeHex,
  deriveLanFrameKey,
  doubleHmacEqual,
  encodeHex,
  lanFrameMac,
  lanProof,
  LAN_NONCE_BYTES,
  readLanKey,
} from "./lan-crypto.js";

import {
  PROTOCOL_VERSION,
  TOUCH_TAP_CANVAS_HEIGHT,
  TOUCH_TAP_CANVAS_WIDTH,
  parseServerMessage,
  sanitizeDeviceMetadata,
  serializeClientMessage,
  type AppearanceFields,
  type ClientMessage,
  type DeviceMetadata,
  type FeedbackKind,
  type JsonSettings,
  type JsonValue,
  type ServerMessage,
  type ProtocolErrorCode,
} from "./protocol.js";

export type BridgeStatus = "disconnected" | "connecting" | "authenticating" | "connected";
export type BridgeDiagnosticArea = "auth" | "schema" | "reconnect" | "registry" | "callback";
export type BridgeDiagnosticCode = ProtocolErrorCode | "TOKEN_UNAVAILABLE" | "LAN_KEY_UNAVAILABLE" | "SOCKET_FAILED" | "DISCONNECTED" | "RECONNECTING";
export interface BridgeDiagnosticLatest {
  area: BridgeDiagnosticArea;
  code: BridgeDiagnosticCode;
  at: string;
}
export interface BridgeDiagnosticStatus {
  version: 1;
  status: BridgeStatus;
  protocolVersion: typeof PROTOCOL_VERSION;
  pluginVersion: string;
  port: number;
  retryInMs?: number;
  latest?: BridgeDiagnosticLatest;
}

export interface BridgeAction {
  actionId: string;
  name: string;
  settingsSchema?: JsonValue[];
  settingsSchemaVersion?: number;
}
export interface BridgeAppearance extends AppearanceFields {
  type: "appearance";
  protocolVersion: typeof PROTOCOL_VERSION;
  instanceId: string;
  actionId: string;
  title: string;
  state: 0 | 1;
}

export interface BridgeFeedback {
  type: "feedback";
  protocolVersion: typeof PROTOCOL_VERSION;
  instanceId: string;
  actionId: string;
  kind: FeedbackKind;
  message: string;
  durationMs: number;
}

export interface BridgeProtocolError {
  code: string;
  message: string;
  requestId?: string;
  instanceId?: string;
}

export interface BridgeLanOptions {
  clientId: string;
  keyPath: string;
}

type LanHandshakePhase = "hello" | "challenge" | "ready";

export interface BridgeInstanceInput {
  instanceId: string;
  actionId?: string;
  settings: JsonSettings;
  metadata?: DeviceMetadata;
}

export interface BridgeClientOptions {
  url?: string;
  tokenPath?: string;
  lan?: BridgeLanOptions;
  pluginVersion: string;
  createSocket?: (url: string) => BridgeSocket;
  readToken?: (tokenPath: string) => Promise<string | Buffer>;
  readKey?: (keyPath: string) => Promise<string | Buffer>;
  randomBytes?: (size: number) => Buffer;
  setTimeout?: (callback: () => void, delay: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  random?: () => number;
  now?: () => Date;
  logger?: (line: string) => void;
}

export interface BridgeSocket {
  on(event: string, listener: (...args: unknown[]) => void): this;
  send(data: string): void;
  close(): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): this;
}

type InstanceSnapshot = {
  actionId?: string;
  settings: JsonSettings;
  metadata?: DeviceMetadata;
};

type TimerHandle = unknown;
type ServerErrorMessage = Extract<ServerMessage, { type: "error" }>;
type ActionsMessage = Extract<ServerMessage, { type: "actions" }>;
type AppearanceMessage = Extract<ServerMessage, { type: "appearance" }>;
type FeedbackMessage = Extract<ServerMessage, { type: "feedback" }>;
type BridgeMessage =
  | Pick<Extract<ClientMessage, { type: "hello" }>, "protocolVersion" | "type" | "token" | "pluginVersion">
  | Pick<Extract<ClientMessage, { type: "listActions" }>, "protocolVersion" | "type" | "requestId">
  | Pick<
      Extract<ClientMessage, { type: "instanceAppeared" }>,
      "protocolVersion" | "type" | "instanceId" | "actionId" | "settings" | "metadata"
    >
  | Pick<
      Extract<
        ClientMessage,
        { type: "instanceDisappeared" | "keyDown" | "keyUp" | "dialDown" | "dialUp" | "touchTap" | "requestAppearance" }
      >,
      "protocolVersion" | "type" | "instanceId" | "actionId"
    >
  | Pick<
      Extract<ClientMessage, { type: "dialRotate" }>,
      "protocolVersion" | "type" | "instanceId" | "actionId" | "ticks" | "pressed"
    >
  | Pick<
      Extract<ClientMessage, { type: "touchTap" }>,
      "protocolVersion" | "type" | "instanceId" | "actionId" | "hold" | "tapPos"
    >;
const LAN_FRAME_TYPE = "lanFrame";
const LAN_HELLO_TYPE = "lanHello";
const LAN_CHALLENGE_TYPE = "lanChallenge";
const LAN_PROOF_TYPE = "lanProof";
const LAN_READY_TYPE = "lanReady";
const LAN_CLIENT_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

function isLanUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "ws:" && parsed.hostname !== "localhost"
      && parsed.hostname !== "127.0.0.1" && parsed.hostname !== "[::1]"
      && parsed.pathname === "/streamdeck";
  } catch {
    return false;
  }
}


const DEFAULT_URL = "ws://localhost:17321/streamdeck";
const DEFAULT_TOKEN_PATH = join(homedir(), ".hammerspoon", "streamdeck-token");
const INITIAL_RECONNECT_MS = 250;
const MAX_RECONNECT_MS = 10_000;
const SOCKET_HANDSHAKE_TIMEOUT_MS = 5_000;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function copyJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(copyJsonValue);
  }
  if (value !== null && typeof value === "object") {
    const copied: JsonSettings = {};
    for (const [key, nested] of Object.entries(value)) {
      copied[key] = copyJsonValue(nested);
    }
    return copied;
  }
  return value;
}

function copySettings(settings: JsonSettings): JsonSettings {
  const copied: JsonSettings = {};
  for (const [key, value] of Object.entries(settings)) {
    copied[key] = copyJsonValue(value);
  }
  return copied;
}
function copyDeviceMetadata(metadata: DeviceMetadata): DeviceMetadata {
  return {
    controllerType: metadata.controllerType,
    device: {
      type: metadata.device.type,
      size: { columns: metadata.device.size.columns, rows: metadata.device.size.rows },
    },
  };
}

function copyAction(action: BridgeAction): BridgeAction {
  return {
    actionId: action.actionId,
    name: action.name,
    ...(action.settingsSchema === undefined
      ? {}
      : { settingsSchema: action.settingsSchema.map(copyJsonValue) }),
    ...(action.settingsSchemaVersion === undefined ? {} : { settingsSchemaVersion: action.settingsSchemaVersion }),
  };
}

function frameToString(data: unknown): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  return String(data);
}

const SAFE_PROTOCOL_MESSAGES: Readonly<Record<ProtocolErrorCode, string>> = {
  AUTH_REQUIRED: "Authentication is required.",
  AUTH_FAILED: "Authentication failed.",
  VERSION_MISMATCH: "Protocol version mismatch.",
  MALFORMED_MESSAGE: "Malformed protocol message.",
  UNKNOWN_TYPE: "Unknown protocol message type.",
  INVALID_FIELD: "Invalid protocol field.",
  INVALID_STATE: "Invalid protocol state.",
  UNKNOWN_ACTION: "Unknown action.",
  STALE_INSTANCE: "Stale instance.",
  CALLBACK_FAILED: "Action callback failed.",
  INTERNAL: "Internal server error.",
};
const MAX_DIAGNOSTIC_LINE = 384;

function safeProtocolCode(value: unknown): ProtocolErrorCode {
  return typeof value === "string" && Object.hasOwn(SAFE_PROTOCOL_MESSAGES, value)
    ? value as ProtocolErrorCode
    : "MALFORMED_MESSAGE";
}

function diagnosticCategory(code: BridgeDiagnosticCode, hasInstance = false): BridgeDiagnosticArea {
  if (code === "AUTH_REQUIRED" || code === "AUTH_FAILED" || code === "TOKEN_UNAVAILABLE" || code === "LAN_KEY_UNAVAILABLE") return "auth";
  if (code === "UNKNOWN_ACTION" || code === "STALE_INSTANCE" || code === "INVALID_STATE") return "registry";
  if (code === "CALLBACK_FAILED" || (code === "INTERNAL" && hasInstance)) return "callback";
  if (code === "SOCKET_FAILED" || code === "DISCONNECTED" || code === "RECONNECTING") return "reconnect";
  return "schema";
}

function sanitizePluginVersion(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 32);
  return sanitized || "unknown";
}

function portFromUrl(value: string): number {
  try {
    const parsed = new URL(value);
    const port = Number(parsed.port || (parsed.protocol === "wss:" ? 443 : 80));
    return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 17321;
  } catch {
    return 17321;
  }
}
const LEGACY_LOOPBACK_URL = /^ws:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:[/?#]|$)/i;

function isLegacyLoopbackUrl(value: string): boolean {
  if (!LEGACY_LOOPBACK_URL.test(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}


function safeError(error: unknown): BridgeProtocolError {
  let candidateCode: unknown;
  if (error !== null && typeof error === "object" && "code" in error) {
    candidateCode = error.code;
  }
  const code = safeProtocolCode(candidateCode);
  return { code, message: SAFE_PROTOCOL_MESSAGES[code] };
}

export class BridgeClient extends EventEmitter {
  readonly url: string;
  readonly tokenPath: string;
  readonly pluginVersion: string;
  readonly lan: BridgeLanOptions | undefined;

  private _status: BridgeStatus = "disconnected";
  private _actions: readonly BridgeAction[] = [];
  private readonly instances = new Map<string, InstanceSnapshot>();
  private readonly createSocket: (url: string) => BridgeSocket;
  private readonly readToken: (tokenPath: string) => Promise<string | Buffer>;
  private readonly readKey: (keyPath: string) => Promise<string | Buffer>;
  private readonly randomBytes: (size: number) => Buffer;
  private readonly scheduleTimeout: (callback: () => void, delay: number) => unknown;
  private readonly cancelTimeout: (handle: unknown) => void;
  private readonly random: () => number;
  private readonly now: () => Date;
  private readonly logger: (line: string) => void;
  private readonly port: number;
  private readonly safePluginVersion: string;
  private socket: BridgeSocket | undefined;
  private socketGeneration = 0;
  private handshakeTimer: TimerHandle;
  private reconnectTimer: TimerHandle;
  private reconnectAttempt = 0;
  private started = false;
  private authenticated = false;
  private sessionId: string | undefined;
  private nextRequestId = 0;
  private readonly pendingActions = new Set<string>();
  private latestDiagnostic: BridgeDiagnosticLatest | undefined;
  private retryInMs: number | undefined;
  private readonly loggedDiagnosticKeys = new Set<string>();
  private preserveFailureCause = false;
  private lanPhase: LanHandshakePhase | undefined;
  private lanKey: Buffer | undefined;
  private lanClientNonce: Buffer | undefined;
  private lanServerNonce: Buffer | undefined;
  private lanSendKey: Buffer | undefined;
  private lanReceiveKey: Buffer | undefined;
  private lanSendSequence = 0;
  private lanReceiveSequence = 0;

  constructor(options: BridgeClientOptions) {
    super();
    this.url = options.url ?? DEFAULT_URL;
    this.lan = options.lan;
    if (this.lan) {
      if (!isLanUrl(this.url)) throw new Error("LAN bridge URL must use ws://<host>/streamdeck.");
      if (!LAN_CLIENT_ID_PATTERN.test(this.lan.clientId)) throw new Error("LAN clientId must use 1-64 safe characters.");
      if (!isNonEmptyString(this.lan.keyPath)) throw new Error("LAN keyPath must be a non-empty string.");
    } else if (!isLegacyLoopbackUrl(this.url)) {
      throw new Error("Legacy bridge URL must target loopback.");
    }
    this.tokenPath = options.tokenPath ?? DEFAULT_TOKEN_PATH;
    this.pluginVersion = options.pluginVersion;
    this.safePluginVersion = sanitizePluginVersion(options.pluginVersion);
    this.port = portFromUrl(this.url);
    this.now = options.now ?? (() => new Date());
    this.logger = options.logger ?? (() => {});
    this.createSocket = options.createSocket ?? ((url) => new WebSocket(url) as unknown as BridgeSocket);
    this.readToken = options.readToken ?? ((tokenPath) => nodeReadFile(tokenPath, "utf8"));
    this.readKey = options.readKey ?? ((keyPath) => nodeReadFile(keyPath));
    this.randomBytes = options.randomBytes ?? nodeRandomBytes;
    this.scheduleTimeout = options.setTimeout ?? ((callback, delay) => setTimeout(callback, delay));
    this.cancelTimeout = options.clearTimeout ?? ((handle) => clearTimeout(handle as NodeJS.Timeout));
    this.random = options.random ?? Math.random;
  }


  get status(): BridgeStatus {
    return this._status;
  }

  get actions(): BridgeAction[] {
    return this._actions.map(copyAction);
  }
  get diagnostics(): BridgeDiagnosticStatus {
    const status: BridgeDiagnosticStatus = {
      version: 1,
      status: this._status,
      protocolVersion: PROTOCOL_VERSION,
      pluginVersion: this.safePluginVersion,
      port: this.port,
      ...(this.retryInMs === undefined ? {} : { retryInMs: this.retryInMs }),
      ...(this.latestDiagnostic === undefined ? {} : { latest: { ...this.latestDiagnostic } }),
    };
    return status;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.connect();
  }

  stop(): void {
    this.started = false;
    this.authenticated = false;
    this.sessionId = undefined;
    this.resetLanState();
    this.pendingActions.clear();
    this.clearReconnectTimer();
    this.clearHandshakeTimer();
    this.socketGeneration += 1;
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      try {
        socket.close();
      } catch {
        // A closing transport is already stopped.
      }
    }
    this.setStatus("disconnected");
  }

  upsertInstance(input: BridgeInstanceInput): void {
    if (!isNonEmptyString(input.instanceId)) return;
    const settings = copySettings(input.settings);
    const configuredActionId = isNonEmptyString(input.actionId)
      ? input.actionId
      : isNonEmptyString(settings.actionId)
        ? settings.actionId
        : undefined;
    if (configuredActionId) settings.actionId = configuredActionId;
    const previous = this.instances.get(input.instanceId);
    const suppliedMetadata = input.metadata === undefined ? previous?.metadata : sanitizeDeviceMetadata(input.metadata);
    const snapshot: InstanceSnapshot = {
      actionId: configuredActionId,
      settings,
      ...(suppliedMetadata === undefined ? {} : { metadata: copyDeviceMetadata(suppliedMetadata) }),
    };
    this.instances.set(input.instanceId, snapshot);
    if (
      this.authenticated
      && previous?.actionId
      && previous.actionId !== configuredActionId
    ) {
      this.send({
        protocolVersion: PROTOCOL_VERSION,
        type: "instanceDisappeared",
        instanceId: input.instanceId,
        actionId: previous.actionId,
      });
    }

    if (this.authenticated && configuredActionId && this.isKnownAction(configuredActionId)) {
      this.sendInstanceAppeared(input.instanceId, snapshot);
    }
  }

  removeInstance(instanceId: string, actionId?: string): void {
    if (!isNonEmptyString(instanceId)) return;
    const snapshot = this.instances.get(instanceId);
    if (snapshot && isNonEmptyString(actionId) && snapshot.actionId !== actionId) return;
    this.instances.delete(instanceId);
    if (!this.authenticated) return;
    const effectiveActionId = isNonEmptyString(actionId) ? actionId : snapshot?.actionId;
    if (effectiveActionId) {
      this.send({
        protocolVersion: PROTOCOL_VERSION,
        type: "instanceDisappeared",
        instanceId,
        actionId: effectiveActionId,
      });
    }
  }

  keyDown(instanceId: string, actionId?: string, settings?: JsonSettings): void {
    if (!isNonEmptyString(instanceId)) return;
    const snapshot = this.instances.get(instanceId);
    if (snapshot && settings) {
      snapshot.settings = copySettings(settings);
      if (snapshot.actionId) snapshot.settings.actionId = snapshot.actionId;
    }
    if (!this.authenticated || !snapshot) return;
    const effectiveActionId = isNonEmptyString(actionId) ? actionId : snapshot.actionId;
    if (!effectiveActionId || effectiveActionId !== snapshot.actionId || !this.isKnownAction(effectiveActionId)) return;
    this.send({
      protocolVersion: PROTOCOL_VERSION,
      type: "keyDown",
      instanceId,
      actionId: effectiveActionId,
    });
  }

  keyUp(instanceId: string, actionId?: string, settings?: JsonSettings): void {
    if (!isNonEmptyString(instanceId)) return;
    const snapshot = this.instances.get(instanceId);
    if (snapshot && settings) {
      snapshot.settings = copySettings(settings);
      if (snapshot.actionId) snapshot.settings.actionId = snapshot.actionId;
    }
    if (!this.authenticated || !snapshot) return;
    const effectiveActionId = isNonEmptyString(actionId) ? actionId : snapshot.actionId;
    if (!effectiveActionId || effectiveActionId !== snapshot.actionId || !this.isKnownAction(effectiveActionId)) return;
    this.send({
      protocolVersion: PROTOCOL_VERSION,
      type: "keyUp",
      instanceId,
      actionId: effectiveActionId,
    });
  }

  dialDown(instanceId: string, actionId?: string, settings?: JsonSettings): void {
    this.sendDialEvent(instanceId, "dialDown", actionId, settings);
  }

  dialRotate(
    instanceId: string,
    actionId: string | undefined,
    ticks: number,
    pressed: boolean,
    settings?: JsonSettings,
  ): void {
    if (!Number.isInteger(ticks) || typeof pressed !== "boolean") return;
    this.sendDialEvent(instanceId, "dialRotate", actionId, settings, { ticks, pressed });
  }

  dialUp(instanceId: string, actionId?: string, settings?: JsonSettings): void {
    this.sendDialEvent(instanceId, "dialUp", actionId, settings);
  }

  private sendDialEvent(
    instanceId: string,
    type: "dialDown" | "dialRotate" | "dialUp" | "touchTap",
    actionId?: string,
    settings?: JsonSettings,
    payload: { ticks: number; pressed: boolean } | { hold: boolean; tapPos: [number, number] } | undefined = undefined,
  ): void {
    if (!isNonEmptyString(instanceId)) return;
    const snapshot = this.instances.get(instanceId);
    if (snapshot && settings) {
      snapshot.settings = copySettings(settings);
      if (snapshot.actionId) snapshot.settings.actionId = snapshot.actionId;
    }
    if (!this.authenticated || !snapshot) return;
    const effectiveActionId = isNonEmptyString(actionId) ? actionId : snapshot.actionId;
    if (!effectiveActionId || effectiveActionId !== snapshot.actionId || !this.isKnownAction(effectiveActionId)) return;
    this.send({
      protocolVersion: PROTOCOL_VERSION,
      type,
      instanceId,
      actionId: effectiveActionId,
      ...(payload === undefined ? {} : payload),
    } as BridgeMessage);
  }

  touchTap(
    instanceId: string,
    actionId: string | undefined,
    hold: boolean,
    tapPos: [number, number],
    settings?: JsonSettings,
  ): void {
    if (typeof hold !== "boolean" || !Array.isArray(tapPos) || tapPos.length !== 2
      || tapPos.some((coordinate, index) => typeof coordinate !== "number" || !Number.isFinite(coordinate)
        || coordinate < 0 || coordinate > (index === 0 ? TOUCH_TAP_CANVAS_WIDTH : TOUCH_TAP_CANVAS_HEIGHT))) {
      return;
    }
    this.sendDialEvent(instanceId, "touchTap", actionId, settings, { hold, tapPos: [tapPos[0], tapPos[1]] });
  }

  requestActions(): void {
    if (!this.authenticated || this.pendingActions.size > 0) return;
    const requestId = this.newRequestId();
    this.pendingActions.add(requestId);
    this.send({ protocolVersion: PROTOCOL_VERSION, type: "listActions", requestId });
  }

  private connect(): void {
    if (!this.started) return;
    this.clearReconnectTimer();
    this.preserveFailureCause = false;
    this.retryInMs = undefined;
    this.authenticated = false;
    this.sessionId = undefined;
    this.resetLanState();
    this.setStatus("connecting");
    const generation = ++this.socketGeneration;
    void this.openSocket(generation);
  }
  private async openSocket(generation: number): Promise<void> {
    let token: string | undefined;
    if (!this.lan) {
      try {
        const value = await this.readToken(this.tokenPath);
        token = (Buffer.isBuffer(value) ? value.toString("utf8") : value).trim();
        if (!token) throw new Error("Token unavailable.");
      } catch {
        if (this.isCurrent(generation)) {
          this.emitDiagnostic("auth", "TOKEN_UNAVAILABLE", undefined, true);
          this.connectionFailed(generation);
        }
        return;
      }
    } else {
      try {
        this.lanKey = readLanKey(await this.readKey(this.lan.keyPath));
        this.lanClientNonce = this.randomBytes(LAN_NONCE_BYTES);
        if (this.lanClientNonce.length !== LAN_NONCE_BYTES) throw new Error("Invalid LAN nonce.");
        this.lanPhase = "hello";
      } catch {
        if (this.isCurrent(generation)) {
          this.emitDiagnostic("auth", "LAN_KEY_UNAVAILABLE", undefined, true);
          this.connectionFailed(generation);
        }
        return;
      }
    }

    if (!this.isCurrent(generation)) return;
    let socket: BridgeSocket;
    try {
      socket = this.createSocket(this.url);
    } catch {
      this.emitDiagnostic("reconnect", "SOCKET_FAILED");
      this.connectionFailed(generation);
      return;
    }
    if (!this.isCurrent(generation)) {
      try {
        socket.close();
      } catch {
        // Ignore stale transport cleanup errors.
      }
      return;
    }

    this.socket = socket;
    const onOpen = () => {
      if (!this.isCurrent(generation)) return;
      this.setStatus("authenticating");
      if (this.lan) {
        const clientNonce = this.lanClientNonce;
        if (!clientNonce) {
          this.closeCurrentSocket(generation);
          return;
        }
        this.sendLanHandshake({
          protocolVersion: PROTOCOL_VERSION,
          type: LAN_HELLO_TYPE,
          clientId: this.lan.clientId,
          clientNonce: encodeHex(clientNonce),
        });
      } else {
        this.send({
          protocolVersion: PROTOCOL_VERSION,
          type: "hello",
          token: token!,
          pluginVersion: this.pluginVersion,
        });
      }
    };
    const onMessage = (data: unknown) => this.handleMessage(generation, data);
    const onClose = () => {
      if (!this.isCurrent(generation)) return;
      this.clearHandshakeTimer();
      this.connectionFailed(generation);
    };
    const onError = () => {
      if (!this.isCurrent(generation)) return;
      this.clearHandshakeTimer();
      this.connectionFailed(generation);
    };
    socket.on("open", onOpen);
    socket.on("message", onMessage);
    socket.on("close", onClose);
    socket.on("error", onError);
    this.handshakeTimer = this.scheduleTimeout(() => {
      if (!this.isCurrent(generation)) return;
      this.clearHandshakeTimer();
      this.emitDiagnostic("reconnect", "SOCKET_FAILED");
      const currentSocket = this.socket;
      this.socket = undefined;
      try {
        currentSocket?.close();
      } catch {
        // A timed-out transport is already being replaced.
      }
      this.connectionFailed(generation);
    }, SOCKET_HANDSHAKE_TIMEOUT_MS);
  }

  private sendLanHandshake(message: Record<string, unknown>): boolean {
    if (!this.socket) return false;
    try {
      this.socket.send(JSON.stringify(message));
      return true;
    } catch {
      this.emitDiagnostic("reconnect", "SOCKET_FAILED");
      this.connectionFailed(this.socketGeneration);
      return false;
    }
  }

  private failLanAuthentication(generation: number): void {
    if (!this.isCurrent(generation)) return;
    this.emitDiagnostic("auth", "AUTH_FAILED", undefined, true);
    this.closeCurrentSocket(generation);
  }

  private handleLanMessage(generation: number, frame: string): void {
    let value: unknown;
    try {
      value = JSON.parse(frame) as unknown;
    } catch {
      this.failLanAuthentication(generation);
      return;
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      this.failLanAuthentication(generation);
      return;
    }
    const message = value as Record<string, unknown>;
    if (message.protocolVersion !== PROTOCOL_VERSION) {
      this.emitDiagnostic("auth", "VERSION_MISMATCH", undefined, true);
      this.closeCurrentSocket(generation);
      return;
    }
    if (!this.authenticated && this.lanPhase === "hello" && message.type === LAN_CHALLENGE_TYPE) {
      const clientNonce = this.lanClientNonce;
      const key = this.lanKey;
      const serverNonce = typeof message.serverNonce === "string"
        ? decodeHex(message.serverNonce, LAN_NONCE_BYTES)
        : undefined;
      const proof = typeof message.serverProof === "string"
        ? decodeHex(message.serverProof, 32)
        : undefined;
      if (!clientNonce || !key || !serverNonce || !proof || message.clientId !== this.lan?.clientId) {
        this.failLanAuthentication(generation);
        return;
      }
      const expected = lanProof(key, "server", this.lan!.clientId, clientNonce, serverNonce);
      if (!doubleHmacEqual(expected, proof)) {
        this.failLanAuthentication(generation);
        return;
      }
      this.lanServerNonce = serverNonce;
      this.lanSendKey = deriveLanFrameKey(key, this.lan!.clientId, clientNonce, serverNonce, "client-to-server");
      this.lanReceiveKey = deriveLanFrameKey(key, this.lan!.clientId, clientNonce, serverNonce, "server-to-client");
      this.lanPhase = "challenge";
      this.sendLanHandshake({
        protocolVersion: PROTOCOL_VERSION,
        type: LAN_PROOF_TYPE,
        clientId: this.lan!.clientId,
        clientProof: encodeHex(lanProof(key, "client", this.lan!.clientId, clientNonce, serverNonce)),
      });
      return;
    }
    if (!this.authenticated && this.lanPhase === "challenge" && message.type === LAN_READY_TYPE) {
      if (typeof message.sessionId !== "string" || message.sessionId.length === 0) {
        this.failLanAuthentication(generation);
        return;
      }
      this.sessionId = message.sessionId;
      this.authenticated = true;
      this.lanPhase = "ready";
      this.lanSendSequence = 0;
      this.lanReceiveSequence = 0;
      this.reconnectAttempt = 0;
      this.setStatus("connected");
      this.clearHandshakeTimer();
      this.requestActions();
      return;
    }
    if (this.authenticated && this.lanPhase === "ready" && message.type === LAN_FRAME_TYPE) {
      const sequence = message.sequence;
      const payload = message.payload;
      const mac = typeof message.mac === "string" ? decodeHex(message.mac, 32) : undefined;
      if (!Number.isSafeInteger(sequence) || sequence !== this.lanReceiveSequence + 1
        || typeof payload !== "string" || !mac || !this.lanReceiveKey) {
        this.failLanAuthentication(generation);
        return;
      }
      const expected = lanFrameMac(this.lanReceiveKey, "server-to-client", sequence, payload);
      if (!doubleHmacEqual(expected, mac)) {
        this.failLanAuthentication(generation);
        return;
      }
      this.lanReceiveSequence = sequence;
      let parsed: ServerMessage;
      try {
        parsed = parseServerMessage(payload);
      } catch {
        this.failLanAuthentication(generation);
        return;
      }
      switch (parsed.type) {
        case "actions":
          this.handleActions(parsed);
          break;
        case "appearance":
          this.handleAppearance(parsed);
          break;
        case "feedback":
          this.handleFeedback(parsed);
          break;
        case "error":
          this.handleRemoteError(parsed);
          break;
      }
      return;
    }
    if (message.type === "error") {
      try {
        this.handleRemoteError(parseServerMessage(frame) as ServerErrorMessage);
      } catch {
        this.failLanAuthentication(generation);
      }
      return;
    }
    this.failLanAuthentication(generation);
  }

  private handleMessage(generation: number, data: unknown): void {
    if (!this.isCurrent(generation)) return;
    const frame = frameToString(data);
    if (frame.length === 0) return;
    if (this.lan) {
      this.handleLanMessage(generation, frame);
      return;
    }

    let message: ServerMessage;
    try {
      message = parseServerMessage(frame);
    } catch (error) {
      const safe = safeError(error);
      this.emitProtocolError(safe);
      this.emitDiagnostic("schema", safeProtocolCode(safe.code), undefined, true);
      if (!this.authenticated) this.closeCurrentSocket(generation);
      return;
    }

    if (message.type === "helloAck") {
      if (this.authenticated || this._status !== "authenticating") {
        const error = { code: "INVALID_STATE", message: SAFE_PROTOCOL_MESSAGES.INVALID_STATE };
        this.emitProtocolError(error);
        this.emitDiagnostic("auth", "INVALID_STATE", undefined, true);
        return;
      }
      this.sessionId = message.sessionId;
      this.authenticated = true;
      this.reconnectAttempt = 0;
      this.setStatus("connected");
      this.clearHandshakeTimer();
      this.requestActions();
      return;
    }

    if (!this.authenticated) {
      if (message.type === "error") {
        this.handleRemoteError(message);
      } else {
        const error = { code: "AUTH_REQUIRED", message: SAFE_PROTOCOL_MESSAGES.AUTH_REQUIRED };
        this.emitProtocolError(error);
        this.emitDiagnostic("auth", "AUTH_REQUIRED", undefined, true);
        this.closeCurrentSocket(generation);
      }
      return;
    }

    switch (message.type) {
      case "actions":
        this.handleActions(message);
        break;
      case "appearance":
        this.handleAppearance(message);
        break;
      case "feedback":
        this.handleFeedback(message);
        break;
      case "error":
        this.handleRemoteError(message);
        break;
    }
  }

  private handleActions(message: ActionsMessage): void {
    if (!this.pendingActions.delete(message.requestId)) {
      const error = { code: "INVALID_STATE", message: SAFE_PROTOCOL_MESSAGES.INVALID_STATE };
      this.emitProtocolError(error);
      this.emitDiagnostic("registry", "INVALID_STATE");
      return;
    }
    this._actions = message.actions.map(copyAction);
    this.emit("actions", this._actions.map(copyAction));
    this.replayInstances();
  }

  private handleAppearance(message: AppearanceMessage): void {
    const instance = this.instances.get(message.instanceId);
    if (!instance || instance.actionId !== message.actionId || !this.isKnownAction(message.actionId)) return;
    const appearance: BridgeAppearance = {
      type: "appearance",
      protocolVersion: PROTOCOL_VERSION,
      instanceId: message.instanceId,
      actionId: message.actionId,
      title: message.title,
      state: message.state,
      ...(message.appearanceVersion === undefined ? {} : { appearanceVersion: message.appearanceVersion }),
      ...(message.presentationState === undefined ? {} : { presentationState: message.presentationState }),
      ...(message.foregroundColor === undefined ? {} : { foregroundColor: message.foregroundColor }),
      ...(message.backgroundColor === undefined ? {} : { backgroundColor: message.backgroundColor }),
      ...(message.progress === undefined ? {} : { progress: message.progress }),
      ...(message.icon === undefined ? {} : { icon: message.icon }),
      ...(message.badge === undefined ? {} : { badge: message.badge }),
      ...(message.value === undefined ? {} : { value: message.value }),
      ...(message.indicator === undefined ? {} : { indicator: message.indicator }),
    };
    this.emit("appearance", appearance);
  }

  private handleFeedback(message: FeedbackMessage): void {
    const instance = this.instances.get(message.instanceId);
    if (!instance || instance.actionId !== message.actionId || !this.isKnownAction(message.actionId)) return;
    const feedback: BridgeFeedback = {
      type: "feedback",
      protocolVersion: PROTOCOL_VERSION,
      instanceId: message.instanceId,
      actionId: message.actionId,
      kind: message.kind,
      message: message.message,
      durationMs: message.durationMs,
    };
    for (const listener of this.listeners("feedback")) {
      try {
        listener(feedback);
      } catch {
        // A feedback listener must not break transport processing or other listeners.
      }
    }
  }

  private handleRemoteError(message: ServerErrorMessage): void {
    const code = safeProtocolCode(message.code);
    const error: BridgeProtocolError = {
      code,
      message: SAFE_PROTOCOL_MESSAGES[code],
      ...(message.requestId === undefined ? {} : { requestId: message.requestId }),
      ...(message.instanceId === undefined ? {} : { instanceId: message.instanceId }),
    };
    if (message.requestId) this.pendingActions.delete(message.requestId);
    this.emitProtocolError(error);
    const preserveCause = ["AUTH_REQUIRED", "AUTH_FAILED", "VERSION_MISMATCH"].includes(code);
    this.emitDiagnostic(diagnosticCategory(code, message.instanceId !== undefined), code, undefined, preserveCause);
    if (!this.authenticated && ["AUTH_REQUIRED", "AUTH_FAILED", "VERSION_MISMATCH"].includes(code)) {
      this.closeCurrentSocket(this.socketGeneration);
    }
  }

  private replayInstances(): void {
    if (!this.authenticated) return;
    for (const [instanceId, snapshot] of this.instances) {
      if (!this.isCurrentInstance(instanceId, snapshot) || !snapshot.actionId || !this.isKnownAction(snapshot.actionId)) continue;
      this.sendInstanceAppeared(instanceId, snapshot);
      if (this.isCurrentInstance(instanceId, snapshot)) {
        this.send({
          protocolVersion: PROTOCOL_VERSION,
          type: "requestAppearance",
          instanceId,
          actionId: snapshot.actionId,
        });
      }
    }
  }

  private sendInstanceAppeared(instanceId: string, snapshot: InstanceSnapshot): void {
    if (!snapshot.actionId) return;
    this.send({
      protocolVersion: PROTOCOL_VERSION,
      type: "instanceAppeared",
      instanceId,
      actionId: snapshot.actionId,
      settings: copySettings(snapshot.settings),
      ...(snapshot.metadata === undefined ? {} : { metadata: copyDeviceMetadata(snapshot.metadata) }),
    });
  }

  private send(message: BridgeMessage): boolean {
    if (!this.socket) return false;
    const sessionId = this.sessionId;
    if (this.lan) {
      if (!isNonEmptyString(sessionId)) return false;
      let payload: string;
      try {
        payload = serializeClientMessage({ ...message, sessionId } as ClientMessage);
      } catch {
        return false;
      }
      return this.sendLanPayload(payload);
    }
    let outbound: ClientMessage;
    if (message.type === "hello") {
      outbound = message;
    } else {
      if (!isNonEmptyString(sessionId)) return false;
      outbound = { ...message, sessionId } as ClientMessage;
    }
    try {
      this.socket.send(serializeClientMessage(outbound));
      return true;
    } catch {
      this.emitDiagnostic("reconnect", "SOCKET_FAILED");
      this.connectionFailed(this.socketGeneration);
      return false;
    }
  }

  private sendLanPayload(payload: string): boolean {
    const key = this.lanSendKey;
    if (!this.socket || !key) return false;
    const sequence = this.lanSendSequence + 1;
    try {
      this.socket.send(JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        type: LAN_FRAME_TYPE,
        sequence,
        payload,
        mac: encodeHex(lanFrameMac(key, "client-to-server", sequence, payload)),
      }));
      this.lanSendSequence = sequence;
      return true;
    } catch {
      this.emitDiagnostic("reconnect", "SOCKET_FAILED");
      this.connectionFailed(this.socketGeneration);
      return false;
    }
  }

  private clearHandshakeTimer(): void {
    if (this.handshakeTimer === undefined) return;
    this.cancelTimeout(this.handshakeTimer);
    this.handshakeTimer = undefined;
  }
  private resetLanState(): void {
    this.lanPhase = undefined;
    this.lanKey = undefined;
    this.lanClientNonce = undefined;
    this.lanServerNonce = undefined;
    this.lanSendKey = undefined;
    this.lanReceiveKey = undefined;
    this.lanSendSequence = 0;
    this.lanReceiveSequence = 0;
  }

  private connectionFailed(generation: number): void {
    if (!this.isCurrent(generation)) return;
    if (this.socket === undefined && this._status === "disconnected") return;
    this.authenticated = false;
    this.sessionId = undefined;
    this.resetLanState();
    this.pendingActions.clear();
    this.clearHandshakeTimer();
    this.setStatus("disconnected");
    this.socket = undefined;
    if (!this.preserveFailureCause) this.emitDiagnostic("reconnect", "DISCONNECTED");
    for (const [instanceId, snapshot] of this.instances) {
      if (snapshot.actionId) {
        this.emit("appearance", {
          type: "appearance",
          protocolVersion: PROTOCOL_VERSION,
          instanceId,
          actionId: snapshot.actionId,
          title: "Hammerspoon Offline",
          state: 0,
        } satisfies BridgeAppearance);
      }
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!this.started || this.reconnectTimer !== undefined) return;
    const baseDelay = Math.min(MAX_RECONNECT_MS, INITIAL_RECONNECT_MS * 2 ** Math.min(this.reconnectAttempt, 6));
    this.reconnectAttempt += 1;
    const jitter = 0.5 + Math.max(0, Math.min(1, this.random()));
    const delay = Math.min(MAX_RECONNECT_MS, Math.round(baseDelay * jitter));
    if (this.preserveFailureCause) {
      this.retryInMs = delay;
    } else {
      this.emitDiagnostic("reconnect", "RECONNECTING", delay);
    }
    this.reconnectTimer = this.scheduleTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, delay);
  }

  private closeCurrentSocket(generation: number): void {
    if (!this.isCurrent(generation)) return;
    const socket = this.socket;
    this.socket = undefined;
    this.authenticated = false;
    this.sessionId = undefined;
    if (socket) {
      try {
        socket.close();
      } catch {
        // The close event will be handled if the transport supports it.
      }
    }
    this.connectionFailed(generation);
  }

  private isKnownAction(actionId: string): boolean {
    return this._actions.some((action) => action.actionId === actionId);
  }

  private isCurrentInstance(instanceId: string, snapshot: InstanceSnapshot): boolean {
    return this.instances.get(instanceId) === snapshot;
  }

  private newRequestId(): string {
    this.nextRequestId += 1;
    return `bridge-${this.nextRequestId}`;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer === undefined) return;
    this.cancelTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  private isCurrent(generation: number): boolean {
    return this.started && generation === this.socketGeneration;
  }

  private setStatus(status: BridgeStatus): void {
    if (this._status === status) return;
    this._status = status;
    this.emit("status", status);
  }

  private emitDiagnostic(
    area: BridgeDiagnosticArea,
    code: BridgeDiagnosticCode,
    retryInMs?: number,
    preserveCause = false,
  ): void {
    if (preserveCause) {
      this.preserveFailureCause = true;
    } else if (area !== "reconnect") {
      this.preserveFailureCause = false;
    }
    this.retryInMs = retryInMs === undefined
      ? undefined
      : Math.max(0, Math.min(MAX_RECONNECT_MS, Math.floor(retryInMs)));
    let at = new Date(0).toISOString();
    try {
      const timestamp = this.now();
      if (timestamp instanceof Date && Number.isFinite(timestamp.getTime())) at = timestamp.toISOString();
    } catch {
      // Keep a fixed safe UTC timestamp when the injected clock fails.
    }
    this.latestDiagnostic = { area, code, at };
    const status = this.diagnostics;
    const encoded = JSON.stringify(status);
    const safeFallback = JSON.stringify({
      version: 1,
      status: status.status,
      protocolVersion: status.protocolVersion,
      pluginVersion: status.pluginVersion,
      port: status.port,
    });
    const line = `bridge-status ${encoded.length + 14 <= MAX_DIAGNOSTIC_LINE ? encoded : safeFallback}`;
    const key = `${area}:${code}`;
    if (!this.loggedDiagnosticKeys.has(key)) {
      this.loggedDiagnosticKeys.add(key);
      try {
        this.logger(line);
      } catch {
        // Diagnostics logging must not affect transport processing.
      }
    }
    this.emit("diagnostics", this.diagnostics);
  }

  private emitProtocolError(error: BridgeProtocolError): void {
    this.emit("protocolError", error);
  }
}
