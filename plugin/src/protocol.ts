import Ajv2020 from "ajv/dist/2020.js";
import { inflateSync } from "node:zlib";
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

export type AppearanceIcon =
  | { kind: "bundled"; name: string }
  | { kind: "custom"; mediaType: "image/png" | "image/svg+xml"; dataBase64: string };

export interface AppearanceFields {
  appearanceVersion?: AppearanceVersion;
  foregroundColor?: string;
  backgroundColor?: string;
  progress?: number;
  badge?: string;
  icon?: AppearanceIcon;
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


const MAX_ICON_BYTES = 32768;
const MAX_ICON_BASE64_LENGTH = 43692;
const MAX_SVG_LENGTH = 16384;
const SVG_ELEMENTS = new Set(["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);
const SVG_ATTRIBUTES = new Set([
  "xmlns", "viewBox", "width", "height", "fill", "stroke", "stroke-width", "opacity",
  "fill-opacity", "stroke-opacity", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit",
  "fill-rule", "clip-rule", "d", "points", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
]);
const SVG_NUMERIC_ATTRIBUTES = new Set([
  "stroke-width", "opacity", "fill-opacity", "stroke-opacity", "stroke-miterlimit",
  "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "width", "height",
]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isCanonicalBase64(value: string): boolean {
  return value.length >= 4
    && value.length <= MAX_ICON_BASE64_LENGTH
    && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
    && Buffer.from(value, "base64").toString("base64") === value;
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 0 ? crc >>> 1 : (crc >>> 1) ^ 0xedb88320;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function isValidPng(bytes: Buffer): boolean {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return false;
  }
  let offset = 8;
  let hasHeader = false;
  let hasData = false;
  let expectedRawLength = 0;
  let rowLength = 0;
  const idatParts: Buffer[] = [];
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) {
      return false;
    }
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (!/^[A-Za-z]{4}$/.test(type) || end > bytes.length
      || crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== bytes.readUInt32BE(offset + 8 + length)) {
      return false;
    }
    if (!hasHeader) {
      if (type !== "IHDR" || length !== 13) {
        return false;
      }
      const width = bytes.readUInt32BE(offset + 8);
      const height = bytes.readUInt32BE(offset + 12);
      const bitDepth = bytes[offset + 16];
      const colorType = bytes[offset + 17];
      const bytesPerPixel = ({ 0: 1, 2: 3, 4: 2, 6: 4 } as Record<number, number>)[colorType];
      if (width !== height || (width !== 72 && width !== 144) || bitDepth !== 8
        || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20] !== 0
        || bytesPerPixel === undefined) {
        return false;
      }
      rowLength = width * bytesPerPixel + 1;
      expectedRawLength = height * rowLength;
      hasHeader = true;
    }
    if (type === "acTL") {
      return false;
    }
    if (type === "IDAT") {
      if (length === 0) {
        return false;
      }
      idatParts.push(bytes.subarray(offset + 8, offset + 8 + length));
      hasData = true;
    }
    if (type === "IEND") {
      if (!hasHeader || !hasData || length !== 0 || end !== bytes.length) {
        return false;
      }
      try {
        const raw = inflateSync(Buffer.concat(idatParts), { maxOutputLength: expectedRawLength });
        if (raw.length !== expectedRawLength) {
          return false;
        }
        for (let row = 0; row < raw.length; row += rowLength) {
          if (raw[row] > 4) {
            return false;
          }
        }
        return true;
      } catch {
        return false;
      }
    }
    offset = end;
  }
  return false;
}

function isSvgNumber(value: string): boolean {
  return /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)
    && Number.isFinite(Number(value))
    && Math.abs(Number(value)) <= 1000000;
}

function isSvgAttributeValue(name: string, value: string, rootSize?: 72 | 144): boolean {
  if (value.length > 4096 || /[<&>\u0000-\u001f\u007f-\u009f]/.test(value)) {
    return false;
  }
  if (name === "xmlns") {
    return value === "http://www.w3.org/2000/svg";
  }
  if (name === "viewBox") {
    return value === `0 0 ${rootSize ?? 0} ${rootSize ?? 0}`;
  }
  if (name === "width" || name === "height") {
    return rootSize !== undefined ? value === String(rootSize) : isSvgNumber(value);
  }
  if (name === "fill" || name === "stroke") {
    return value === "none" || /^#[0-9A-Fa-f]{6}$/.test(value);
  }
  if (name === "stroke-linecap") {
    return value === "butt" || value === "round" || value === "square";
  }
  if (name === "stroke-linejoin") {
    return value === "miter" || value === "round" || value === "bevel";
  }
  if (name === "fill-rule" || name === "clip-rule") {
    return value === "nonzero" || value === "evenodd";
  }
  if (SVG_NUMERIC_ATTRIBUTES.has(name)) {
    return isSvgNumber(value) && Number(value) >= 0;
  }
  if (name === "d" || name === "points") {
    return /^[A-Za-z0-9.,+\- \t\r\n]+$/.test(value);
  }
  return false;
}

function parseSvgTag(source: string): { name: string; attributes: Map<string, string>; selfClosing: boolean } | undefined {
  let body = source.trim();
  const selfClosing = body.endsWith("/");
  if (selfClosing) {
    body = body.slice(0, -1).trim();
  }
  const nameMatch = body.match(/^([a-z][a-z0-9-]*)\b/);
  if (!nameMatch) {
    return undefined;
  }
  const name = nameMatch[1];
  const attributes = new Map<string, string>();
  let rest = body.slice(name.length).trim();
  while (rest.length > 0) {
    const attributeMatch = rest.match(/^([A-Za-z][A-Za-z0-9-]*)\s*=\s*/);
    if (!attributeMatch) {
      return undefined;
    }
    const attribute = attributeMatch[1];
    if (attributes.has(attribute) || !SVG_ATTRIBUTES.has(attribute)) {
      return undefined;
    }
    rest = rest.slice(attributeMatch[0].length);
    const quote = rest[0];
    if (quote !== '"' && quote !== "'") {
      return undefined;
    }
    const end = rest.indexOf(quote, 1);
    if (end < 0) {
      return undefined;
    }
    attributes.set(attribute, rest.slice(1, end));
    rest = rest.slice(end + 1).trim();
  }
  return { name, attributes, selfClosing };
}

function sanitizeSvg(value: string): string | undefined {
  if (value.length === 0 || value.length > MAX_SVG_LENGTH) {
    return undefined;
  }
  let svg: string;
  try {
    svg = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(value));
  } catch {
    return undefined;
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(svg)) {
    return undefined;
  }
  const tags = /<([^<>]*)>/g;
  const stack: string[] = [];
  const output: string[] = [];
  let cursor = 0;
  let elementCount = 0;
  let rootSize: 72 | 144 | undefined;
  let rootSeen = false;
  let match: RegExpExecArray | null;
  while ((match = tags.exec(svg)) !== null) {
    if (svg.slice(cursor, match.index).trim() !== "") {
      return undefined;
    }
    cursor = tags.lastIndex;
    const body = match[1].trim();
    if (body.startsWith("!") || body.startsWith("?") || body.startsWith("/")) {
      if (!body.startsWith("/")) {
        return undefined;
      }
      const closingName = body.slice(1).trim();
      if (!/^[a-z][a-z0-9-]*$/.test(closingName) || stack.at(-1) !== closingName) {
        return undefined;
      }
      stack.pop();
      output.push(`</${closingName}>`);
      continue;
    }
    const parsed = parseSvgTag(body);
    if (!parsed || !SVG_ELEMENTS.has(parsed.name) || (parsed.name === "svg" && rootSeen)) {
      return undefined;
    }
    if (!rootSeen && parsed.name !== "svg") {
      return undefined;
    }
    elementCount += 1;
    if (elementCount > 128 || stack.length >= 16) {
      return undefined;
    }
    if (parsed.name === "svg") {
      const viewBox = parsed.attributes.get("viewBox");
      const size = viewBox === "0 0 72 72" ? 72 : viewBox === "0 0 144 144" ? 144 : undefined;
      if (parsed.attributes.get("xmlns") !== "http://www.w3.org/2000/svg" || size === undefined) {
        return undefined;
      }
      if (
        (parsed.attributes.get("width") !== undefined && parsed.attributes.get("width") !== String(size)) ||
        (parsed.attributes.get("height") !== undefined && parsed.attributes.get("height") !== String(size))
      ) {
        return undefined;
      }
      rootSize = size;
      rootSeen = true;
    }
    for (const [name, attributeValue] of parsed.attributes) {
      if (!isSvgAttributeValue(name, attributeValue, parsed.name === "svg" ? rootSize : undefined)) {
        return undefined;
      }
    }
    const serializedAttributes = [...parsed.attributes]
      .map(([name, attributeValue]) => `${name}="${attributeValue.replace(/["']/g, (character) => character === '"' ? "&quot;" : "&apos;")}"`)
      .join(" ");
    output.push(`<${parsed.name}${serializedAttributes.length > 0 ? ` ${serializedAttributes}` : ""}${parsed.selfClosing ? "/>" : ">"}`);
    if (!parsed.selfClosing) {
      stack.push(parsed.name);
    }
  }
  return cursor === svg.length && rootSeen && stack.length === 0 ? output.join("") : undefined;
}

export function isSafeAppearanceIcon(value: unknown): value is AppearanceIcon {
  if (!isObject(value)) {
    return false;
  }
  if (value.kind === "bundled") {
    return typeof value.name === "string"
      && /^[a-z][a-z0-9-]{0,31}$/.test(value.name)
      && Object.keys(value).every((key) => key === "kind" || key === "name");
  }
  if (
    value.kind !== "custom" ||
    (value.mediaType !== "image/png" && value.mediaType !== "image/svg+xml") ||
    typeof value.dataBase64 !== "string" ||
    !isCanonicalBase64(value.dataBase64) ||
    Object.keys(value).some((key) => !["kind", "mediaType", "dataBase64"].includes(key))
  ) {
    return false;
  }
  const bytes = Buffer.from(value.dataBase64, "base64");
  if (bytes.length === 0 || bytes.length > MAX_ICON_BYTES) {
    return false;
  }
  return value.mediaType === "image/png" ? isValidPng(bytes) : sanitizeSvg(bytes.toString("utf8")) !== undefined;
}

export function safeAppearanceIconImage(value: AppearanceIcon): string | undefined {
  if (!isSafeAppearanceIcon(value)) {
    return undefined;
  }
  if (value.kind === "bundled") {
    return undefined;
  }
  const bytes = Buffer.from(value.dataBase64, "base64");
  if (value.mediaType === "image/png") {
    return `data:${value.mediaType};base64,${value.dataBase64}`;
  }
  const sanitized = sanitizeSvg(bytes.toString("utf8"));
  return sanitized === undefined ? undefined : `data:image/svg+xml,${encodeURIComponent(sanitized)}`;
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
  if (parsed.type === "appearance" && parsed.icon !== undefined && !isSafeAppearanceIcon(parsed.icon)) {
    throw new Error("Invalid server message: icon is unsupported, malformed, oversized, or unsafe.");
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
