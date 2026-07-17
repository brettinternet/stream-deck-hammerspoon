import { EventEmitter } from "node:events";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFile as nodeReadFile } from "node:fs/promises";
import WebSocket from "ws";

import {
  PROTOCOL_VERSION,
  parseServerMessage,
  serializeClientMessage,
  type AppearanceFields,
  type ClientMessage,
  type FeedbackKind,
  type JsonSettings,
  type JsonValue,
  type ServerMessage,
} from "./protocol.js";

export type BridgeStatus = "disconnected" | "connecting" | "authenticating" | "connected";

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

export interface BridgeInstanceInput {
  instanceId: string;
  actionId?: string;
  settings: JsonSettings;
}

export interface BridgeClientOptions {
  url?: string;
  tokenPath?: string;
  pluginVersion: string;
  createSocket?: (url: string) => BridgeSocket;
  readToken?: (tokenPath: string) => Promise<string | Buffer>;
  setTimeout?: (callback: () => void, delay: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  random?: () => number;
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
      "protocolVersion" | "type" | "instanceId" | "actionId" | "settings"
    >
  | Pick<
      Extract<ClientMessage, { type: "instanceDisappeared" | "keyDown" | "requestAppearance" }>,
      "protocolVersion" | "type" | "instanceId" | "actionId"
    >;

const DEFAULT_URL = "ws://localhost:17321/streamdeck";
const DEFAULT_TOKEN_PATH = join(homedir(), ".hammerspoon", "streamdeck-token");
const INITIAL_RECONNECT_MS = 250;
const MAX_RECONNECT_MS = 10_000;

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

function safeError(error: unknown): BridgeProtocolError {
  if (error && typeof error === "object") {
    const candidate = error as { code?: unknown; message?: unknown };
    return {
      code: isNonEmptyString(candidate.code) ? candidate.code : "MALFORMED_MESSAGE",
      message: isNonEmptyString(candidate.message) ? candidate.message : "Invalid protocol message.",
    };
  }
  return { code: "MALFORMED_MESSAGE", message: "Invalid protocol message." };
}

export class BridgeClient extends EventEmitter {
  readonly url: string;
  readonly tokenPath: string;
  readonly pluginVersion: string;

  private _status: BridgeStatus = "disconnected";
  private _actions: readonly BridgeAction[] = [];
  private readonly instances = new Map<string, InstanceSnapshot>();
  private readonly createSocket: (url: string) => BridgeSocket;
  private readonly readToken: (tokenPath: string) => Promise<string | Buffer>;
  private readonly scheduleTimeout: (callback: () => void, delay: number) => unknown;
  private readonly cancelTimeout: (handle: unknown) => void;
  private readonly random: () => number;
  private socket: BridgeSocket | undefined;
  private socketGeneration = 0;
  private reconnectTimer: TimerHandle;
  private reconnectAttempt = 0;
  private started = false;
  private authenticated = false;
  private sessionId: string | undefined;
  private nextRequestId = 0;
  private readonly pendingActions = new Set<string>();

  constructor(options: BridgeClientOptions) {
    super();
    this.url = options.url ?? DEFAULT_URL;
    this.tokenPath = options.tokenPath ?? DEFAULT_TOKEN_PATH;
    this.pluginVersion = options.pluginVersion;
    this.createSocket = options.createSocket ?? ((url) => new WebSocket(url) as unknown as BridgeSocket);
    this.readToken = options.readToken ?? ((tokenPath) => nodeReadFile(tokenPath, "utf8"));
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

  start(): void {
    if (this.started) return;
    this.started = true;
    this.connect();
  }

  stop(): void {
    this.started = false;
    this.authenticated = false;
    this.sessionId = undefined;
    this.pendingActions.clear();
    this.clearReconnectTimer();
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
    const snapshot = { actionId: configuredActionId, settings };
    this.instances.set(input.instanceId, snapshot);

    if (this.authenticated && configuredActionId && this.isKnownAction(configuredActionId)) {
      this.sendInstanceAppeared(input.instanceId, snapshot);
    }
  }

  removeInstance(instanceId: string, actionId?: string): void {
    if (!isNonEmptyString(instanceId)) return;
    const snapshot = this.instances.get(instanceId);
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

  requestActions(): void {
    if (!this.authenticated || this.pendingActions.size > 0) return;
    const requestId = this.newRequestId();
    this.pendingActions.add(requestId);
    this.send({ protocolVersion: PROTOCOL_VERSION, type: "listActions", requestId });
  }

  private connect(): void {
    if (!this.started) return;
    this.clearReconnectTimer();
    this.authenticated = false;
    this.sessionId = undefined;
    this.setStatus("connecting");
    const generation = ++this.socketGeneration;
    void this.openSocket(generation);
  }

  private async openSocket(generation: number): Promise<void> {
    let token: string;
    try {
      const value = await this.readToken(this.tokenPath);
      token = (Buffer.isBuffer(value) ? value.toString("utf8") : value).trim();
      if (!token) throw new Error("Token unavailable.");
    } catch {
      if (this.isCurrent(generation)) this.connectionFailed(generation);
      return;
    }

    if (!this.isCurrent(generation)) return;
    let socket: BridgeSocket;
    try {
      socket = this.createSocket(this.url);
    } catch {
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
      this.send({
        protocolVersion: PROTOCOL_VERSION,
        type: "hello",
        token,
        pluginVersion: this.pluginVersion,
      });
    };
    const onMessage = (data: unknown) => this.handleMessage(generation, data);
    const onClose = () => this.connectionFailed(generation);
    const onError = () => this.connectionFailed(generation);
    socket.on("open", onOpen);
    socket.on("message", onMessage);
    socket.on("close", onClose);
    socket.on("error", onError);
  }

  private handleMessage(generation: number, data: unknown): void {
    if (!this.isCurrent(generation)) return;
    const frame = frameToString(data);
    if (frame.length === 0) return;

    let message: ServerMessage;
    try {
      message = parseServerMessage(frame);
    } catch (error) {
      this.emitProtocolError(safeError(error));
      if (!this.authenticated) this.closeCurrentSocket(generation);
      return;
    }

    if (message.type === "helloAck") {
      if (this.authenticated || this._status !== "authenticating") {
        this.emitProtocolError({ code: "INVALID_STATE", message: "Unexpected authentication acknowledgement." });
        return;
      }
      this.sessionId = message.sessionId;
      this.authenticated = true;
      this.reconnectAttempt = 0;
      this.setStatus("connected");
      this.requestActions();
      return;
    }

    if (!this.authenticated) {
      if (message.type === "error") {
        this.handleRemoteError(message);
      } else {
        this.emitProtocolError({ code: "AUTH_REQUIRED", message: "Authentication acknowledgement required." });
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
      this.emitProtocolError({ code: "INVALID_STATE", message: "Unexpected action registry response." });
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
      ...(message.foregroundColor === undefined ? {} : { foregroundColor: message.foregroundColor }),
      ...(message.backgroundColor === undefined ? {} : { backgroundColor: message.backgroundColor }),
      ...(message.progress === undefined ? {} : { progress: message.progress }),
      ...(message.badge === undefined ? {} : { badge: message.badge }),
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
    const error: BridgeProtocolError = {
      code: message.code,
      message: message.message,
      ...(message.requestId === undefined ? {} : { requestId: message.requestId }),
      ...(message.instanceId === undefined ? {} : { instanceId: message.instanceId }),
    };
    if (message.requestId) this.pendingActions.delete(message.requestId);
    this.emitProtocolError(error);
    if (!this.authenticated && ["AUTH_REQUIRED", "AUTH_FAILED", "VERSION_MISMATCH"].includes(message.code)) {
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
    });
  }

  private send(message: BridgeMessage): boolean {
    if (!this.socket) return false;
    let outbound: ClientMessage;
    if (message.type === "hello") {
      outbound = message;
    } else {
      const sessionId = this.sessionId;
      if (!isNonEmptyString(sessionId)) return false;
      outbound = { ...message, sessionId } as ClientMessage;
    }
    try {
      this.socket.send(serializeClientMessage(outbound));
      return true;
    } catch {
      this.connectionFailed(this.socketGeneration);
      return false;
    }
  }

  private connectionFailed(generation: number): void {
    if (!this.isCurrent(generation)) return;
    if (this.socket === undefined && this._status === "disconnected") return;
    this.authenticated = false;
    this.sessionId = undefined;
    this.pendingActions.clear();
    this.socket = undefined;
    this.setStatus("disconnected");
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

  private emitProtocolError(error: BridgeProtocolError): void {
    this.emit("protocolError", error);
  }
}
