import Ajv2020 from "ajv/dist/2020.js";
import protocolSchema from "../../protocol/schema/protocol-v1.json";

export const PROTOCOL_VERSION = 1 as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };
export type JsonSettings = JsonObject;
export type Settings = JsonSettings;
export type WireState = 0 | 1;
export const APPEARANCE_VERSION = 1 as const;
export type AppearanceVersion = typeof APPEARANCE_VERSION;

export interface AppearanceFields {
  appearanceVersion?: AppearanceVersion;
  foregroundColor?: string;
  backgroundColor?: string;
  progress?: number;
  badge?: string;
}

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
  sessionId: string;
}

export interface AuthenticatedClientMessage extends WireMessage {
  sessionId: string;
}

export interface ListActionsMessage extends AuthenticatedClientMessage {
  type: "listActions";
  requestId: string;
}

export interface SettingsFieldBase {
  type: "text" | "number" | "boolean" | "select";
  key: string;
  label?: string;
  required?: boolean;
}

export interface TextSettingsField extends SettingsFieldBase {
  type: "text";
  default?: string;
  minLength?: number;
  maxLength?: number;
}

export interface NumberSettingsField extends SettingsFieldBase {
  type: "number";
  default?: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface BooleanSettingsField extends SettingsFieldBase {
  type: "boolean";
  default?: boolean;
}

export interface SelectSettingsField extends SettingsFieldBase {
  type: "select";
  default?: string;
  options: Array<{ value: string; label: string }>;
}

export type SettingsField = TextSettingsField | NumberSettingsField | BooleanSettingsField | SelectSettingsField;

export interface ActionDefinition {
  actionId: string;
  name: string;
  settingsSchema?: JsonValue[];
  settingsSchemaVersion?: number;
  [key: string]: unknown;
}

export interface ActionsMessage extends WireMessage {
  type: "actions";
  requestId: string;
  actions: ActionDefinition[];
}

export interface InstanceAppearedMessage extends AuthenticatedClientMessage {
  type: "instanceAppeared";
  instanceId: string;
  actionId: string;
  settings: JsonSettings;
}

export interface InstanceDisappearedMessage extends AuthenticatedClientMessage {
  type: "instanceDisappeared";
  instanceId: string;
  actionId: string;
}

export interface KeyDownMessage extends AuthenticatedClientMessage {
  type: "keyDown";
  instanceId: string;
  actionId: string;
}

export interface RequestAppearanceMessage extends AuthenticatedClientMessage {
  type: "requestAppearance";
  instanceId: string;
  actionId: string;
}

export interface AppearanceMessage extends WireMessage, AppearanceFields {
  type: "appearance";
  instanceId: string;
  actionId: string;
  title: string;
  state: WireState;
}

export type FeedbackKind = "success" | "error";

export interface FeedbackMessage extends WireMessage {
  type: "feedback";
  instanceId: string;
  actionId: string;
  kind: FeedbackKind;
  message: string;
  durationMs: number;
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
export type Feedback = FeedbackMessage;
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
  | FeedbackMessage
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
  feedback: true,
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
    while (index < source.length && !/[\s,}\]]/.test(source[index] ?? "")) {
      index += 1;
    }
    return false;
  };

  return scanValue();
}


function settingsSchemaError(actionIndex: number, fieldIndex: number, message: string): Error {
  return new Error(`Invalid server message: settingsSchema action ${actionIndex} field ${fieldIndex}: ${message}.`);
}

function stringLength(value: string): number {
  let length = 0;
  for (const character of value) {
    length += character.length > 0 ? 1 : 0;
  }
  return length;
}

function validateSettingsSchema(action: ActionDefinition, actionIndex: number): void {
  if (action.settingsSchemaVersion !== 1) {
    return;
  }

  const fields = action.settingsSchema as SettingsField[] | undefined;
  if (!fields) {
    throw settingsSchemaError(actionIndex, 0, "settingsSchemaVersion requires settingsSchema");
  }
  const keys = new Set<string>();
  fields.forEach((field, fieldIndex) => {
    if (keys.has(field.key)) {
      throw settingsSchemaError(actionIndex, fieldIndex, `duplicate key "${field.key}"`);
    }
    keys.add(field.key);

    if (field.type === "text") {
      if (
        field.minLength !== undefined &&
        field.maxLength !== undefined &&
        field.minLength > field.maxLength
      ) {
        throw settingsSchemaError(actionIndex, fieldIndex, "minLength must not exceed maxLength");
      }
      if (
        field.default !== undefined &&
        ((field.minLength !== undefined && stringLength(field.default) < field.minLength) ||
          (field.maxLength !== undefined && stringLength(field.default) > field.maxLength))
      ) {
        throw settingsSchemaError(actionIndex, fieldIndex, "default is outside the text length bounds");
      }
    } else if (field.type === "number") {
      if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
        throw settingsSchemaError(actionIndex, fieldIndex, "min must not exceed max");
      }
      if (
        field.default !== undefined &&
        ((field.min !== undefined && field.default < field.min) ||
          (field.max !== undefined && field.default > field.max))
      ) {
        throw settingsSchemaError(actionIndex, fieldIndex, "default is outside the number bounds");
      }
    } else if (field.type === "select") {
      const optionValues = new Set<string>();
      for (const option of field.options) {
        if (optionValues.has(option.value)) {
          throw settingsSchemaError(actionIndex, fieldIndex, `duplicate select option "${option.value}"`);
        }
        optionValues.add(option.value);
      }
      if (field.default !== undefined && !optionValues.has(field.default)) {
        throw settingsSchemaError(actionIndex, fieldIndex, "default must match a select option");
      }
    } else if (field.type === "boolean") {
      // Boolean fields have no kind-specific constraints.
    }
  });
}

function validateFeedback(message: FeedbackMessage): void {
  if (stringLength(message.message) > 256) {
    throw new Error("Invalid server message: feedback message exceeds 256 characters.");
  }
  for (const character of message.message) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      ((codePoint >= 0 && codePoint <= 0x1f) || (codePoint >= 0x7f && codePoint <= 0x9f))
    ) {
      throw new Error("Invalid server message: feedback message contains control characters.");
    }
  }
  try {
    encodeURIComponent(message.message);
  } catch {
    throw new Error("Invalid server message: feedback message must contain valid Unicode.");
  }
}

function schemaError(direction: "server" | "client"): Error {
  const details = ajv.errorsText(validateProtocolMessage.errors, { separator: "; " });
  return new Error(
    `Invalid ${direction} message: failed protocol schema validation${details ? `: ${details}` : ""}.`,
  );
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
  if (parsed.type === "appearance" && parsed.badge !== undefined) {
    for (const character of parsed.badge as string) {
      const codePoint = character.codePointAt(0);
      if (
        codePoint !== undefined &&
        (codePoint <= 0x08 || (codePoint >= 0x0b && codePoint <= 0x0c) || (codePoint >= 0x0e && codePoint <= 0x1f))
      ) {
        throw new Error("Invalid server message: badge contains XML-invalid control characters.");
      }
    }
    try {
      encodeURIComponent(parsed.badge as string);
    } catch {
      throw new Error("Invalid server message: badge must contain valid Unicode.");
    }
  }

  if (parsed.type === "actions") {
    const actions = parsed.actions as ActionDefinition[];
    const actionIds = new Set<string>();
    for (const [index, action] of actions.entries()) {
      validateSettingsSchema(action, index);
      if (actionIds.has(action.actionId)) {
        throw new Error("Invalid server message: duplicate action IDs are not allowed.");
      }
      actionIds.add(action.actionId);
    }
  }
  if (parsed.type === "feedback") {
    validateFeedback(parsed as FeedbackMessage);
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
