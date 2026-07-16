import Ajv2020 from "ajv/dist/2020.js";
import protocolSchema from "../../protocol/schema/protocol-v1.json";

export const PROTOCOL_VERSION = 1 as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };
export type JsonSettings = JsonObject;
export type Settings = JsonSettings;
export type WireState = 0 | 1;
export type State = WireState;

export interface WireMessage {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: string;
  [key: string]: unknown;
}

export interface HelloMessage extends WireMessage {
  type: "hello";
  token: string;
  pluginVersion: string;
}

export interface HelloAckMessage extends WireMessage {
  type: "helloAck";
}

export interface ListActionsMessage extends WireMessage {
  type: "listActions";
  requestId: string;
}

export interface ActionDefinition {
  actionId: string;
  name: string;
  settingsSchema?: JsonValue[];
  [key: string]: unknown;
}

export interface ActionsMessage extends WireMessage {
  type: "actions";
  requestId: string;
  actions: ActionDefinition[];
}

export interface InstanceAppearedMessage extends WireMessage {
  type: "instanceAppeared";
  instanceId: string;
  actionId: string;
  settings: JsonSettings;
}

export interface InstanceDisappearedMessage extends WireMessage {
  type: "instanceDisappeared";
  instanceId: string;
  actionId: string;
}

export interface KeyDownMessage extends WireMessage {
  type: "keyDown";
  instanceId: string;
  actionId: string;
}

export interface RequestAppearanceMessage extends WireMessage {
  type: "requestAppearance";
  instanceId: string;
  actionId: string;
}

export interface AppearanceMessage extends WireMessage {
  type: "appearance";
  instanceId: string;
  actionId: string;
  title: string;
  state: WireState;
}

export type ProtocolErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_FAILED"
  | "VERSION_MISMATCH"
  | "MALFORMED_MESSAGE"
  | "UNKNOWN_TYPE"
  | "INVALID_FIELD"
  | "INVALID_STATE"
  | "UNKNOWN_ACTION"
  | "STALE_INSTANCE"
  | "CALLBACK_FAILED"
  | "INTERNAL";

export interface ErrorMessage extends WireMessage {
  type: "error";
  code: ProtocolErrorCode;
  message: string;
  requestId?: string;
  instanceId?: string;
}

export type ProtocolErrorMessage = ErrorMessage;

export type Hello = HelloMessage;
export type HelloAck = HelloAckMessage;
export type ListActions = ListActionsMessage;
export type Actions = ActionsMessage;
export type InstanceAppeared = InstanceAppearedMessage;
export type InstanceDisappeared = InstanceDisappearedMessage;
export type KeyDown = KeyDownMessage;
export type RequestAppearance = RequestAppearanceMessage;
export type Appearance = AppearanceMessage;

export type ClientMessage =
  | HelloMessage
  | ListActionsMessage
  | InstanceAppearedMessage
  | InstanceDisappearedMessage
  | KeyDownMessage
  | RequestAppearanceMessage;

export type ServerMessage =
  | HelloAckMessage
  | ActionsMessage
  | AppearanceMessage
  | ErrorMessage;

type ClientMessageType = ClientMessage["type"];
type ServerMessageType = ServerMessage["type"];

const CLIENT_MESSAGE_TYPES: Record<ClientMessageType, true> = {
  hello: true,
  listActions: true,
  instanceAppeared: true,
  instanceDisappeared: true,
  keyDown: true,
  requestAppearance: true,
};

const SERVER_MESSAGE_TYPES: Record<ServerMessageType, true> = {
  helloAck: true,
  actions: true,
  appearance: true,
  error: true,
};

const ajv = new Ajv2020({ allErrors: true });
const validateProtocolMessage = ajv.compile(protocolSchema);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown, seen = new Set<object>()): value is JsonValue {
  if (value === null) {
    return true;
  }

  switch (typeof value) {
    case "string":
    case "boolean":
      return true;
    case "number":
      return Number.isFinite(value);
    case "object": {
      if (seen.has(value)) {
        return false;
      }
      seen.add(value);
      const valid = Array.isArray(value)
        ? value.every((item) => isJsonValue(item, seen))
        : Object.values(value).every((item) => isJsonValue(item, seen));
      seen.delete(value);
      return valid;
    }
    default:
      return false;
  }
}

function hasDuplicateObjectKeys(source: string): boolean {
  let index = 0;

  const skipWhitespace = (): void => {
    while (index < source.length && /\s/.test(source[index] ?? "")) {
      index += 1;
    }
  };

  const skipString = (): string => {
    const start = index;
    index += 1;
    while (index < source.length) {
      const character = source[index];
      index += 1;
      if (character === "\\") {
        index += 1;
      } else if (character === '"') {
        break;
      }
    }
    return source.slice(start, index);
  };

  const scanValue = (): boolean => {
    skipWhitespace();
    const character = source[index];
    if (character === "{") {
      index += 1;
      skipWhitespace();
      const keys = new Set<string>();
      if (source[index] === "}") {
        index += 1;
        return false;
      }
      while (index < source.length) {
        skipWhitespace();
        const encodedKey = skipString();
        const key = JSON.parse(encodedKey) as string;
        if (keys.has(key)) {
          return true;
        }
        keys.add(key);
        skipWhitespace();
        index += 1;
        if (scanValue()) {
          return true;
        }
        skipWhitespace();
        if (source[index] === "}") {
          index += 1;
          return false;
        }
        index += 1;
      }
      return false;
    }
    if (character === "[") {
      index += 1;
      skipWhitespace();
      if (source[index] === "]") {
        index += 1;
        return false;
      }
      while (index < source.length) {
        if (scanValue()) {
          return true;
        }
        skipWhitespace();
        if (source[index] === "]") {
          index += 1;
          return false;
        }
        index += 1;
      }
      return false;
    }
    if (character === '"') {
      skipString();
      return false;
    }
    while (index < source.length && !/[\s,]}]/.test(source[index] ?? "")) {
      index += 1;
    }
    return false;
  };

  return scanValue();
}

function schemaError(direction: "server" | "client"): Error {
  return new Error(`Invalid ${direction} message: failed protocol schema validation.`);
}

function classifyServerType(type: unknown): void {
  if (typeof type !== "string") {
    throw new Error("Invalid server message: missing message type.");
  }
  if (Object.hasOwn(CLIENT_MESSAGE_TYPES, type)) {
    throw new Error("Invalid server message: received a plugin-to-Lua message.");
  }
  if (!Object.hasOwn(SERVER_MESSAGE_TYPES, type)) {
    throw new Error("Invalid server message: unknown message type.");
  }
}

function classifyClientType(type: unknown): void {
  if (typeof type !== "string") {
    throw new Error("Invalid client message: missing message type.");
  }
  if (Object.hasOwn(SERVER_MESSAGE_TYPES, type)) {
    throw new Error("Invalid client message: received a Lua-to-plugin message.");
  }
  if (!Object.hasOwn(CLIENT_MESSAGE_TYPES, type)) {
    throw new Error("Invalid client message: unknown message type.");
  }
}

export function parseServerMessage(data: string): ServerMessage {
  if (data.length === 0) {
    throw new Error("Cannot parse server message: empty frame.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw new Error("Cannot parse server message: invalid JSON.");
  }

  if (!isObject(parsed)) {
    throw new Error("Invalid server message: expected a JSON object.");
  }
  classifyServerType(parsed.type);

  if (hasDuplicateObjectKeys(data)) {
    throw new Error("Invalid server message: duplicate object fields are not allowed.");
  }
  if (!validateProtocolMessage(parsed)) {
    throw schemaError("server");
  }

  if (parsed.type === "actions") {
    const actions = parsed.actions as ActionDefinition[];
    const actionIds = new Set<string>();
    for (const action of actions) {
      if (actionIds.has(action.actionId)) {
        throw new Error("Invalid server message: duplicate action IDs are not allowed.");
      }
      actionIds.add(action.actionId);
    }
  }

  return parsed as ServerMessage;
}

export function serializeClientMessage(message: ClientMessage): string {
  if (!isObject(message)) {
    throw new Error("Invalid client message: expected a JSON object.");
  }
  classifyClientType(message.type);

  if (!validateProtocolMessage(message)) {
    throw schemaError("client");
  }
  if (message.type === "instanceAppeared" && !isJsonValue(message.settings)) {
    throw new Error("Invalid client message: settings must contain JSON values.");
  }

  try {
    const encoded = JSON.stringify(message);
    if (encoded === undefined) {
      throw new Error("not JSON");
    }
    return encoded;
  } catch {
    throw new Error("Invalid client message: value is not JSON-serializable.");
  }
}
