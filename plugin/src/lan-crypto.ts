import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

export const LAN_PROTOCOL_LABEL = "streamdeck-lan-v1";
export const LAN_KEY_BYTES = 32;
export const LAN_NONCE_BYTES = 32;

const COMPARISON_KEY = Buffer.from("streamdeck-lan-double-hmac-v1", "utf8");

type Binary = string | Uint8Array;

function bytes(value: Binary): Buffer {
  return typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
}

function u32be(value: number): Buffer {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new Error("LAN field is too large.");
  const result = Buffer.allocUnsafe(4);
  result.writeUInt32BE(value, 0);
  return result;
}

export function u64be(value: number): Buffer {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("LAN sequence is invalid.");
  const result = Buffer.alloc(8);
  result.writeBigUInt64BE(BigInt(value), 0);
  return result;
}

export function encodeLanFields(fields: readonly Binary[]): Buffer {
  const encoded: Buffer[] = [];
  for (const field of fields) {
    const value = bytes(field);
    encoded.push(u32be(value.length), value);
  }
  return Buffer.concat(encoded);
}

export function decodeHex(value: string, expectedBytes?: number): Buffer | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(value)) return undefined;
  const decoded = Buffer.from(value, "hex");
  return expectedBytes !== undefined && decoded.length !== expectedBytes ? undefined : decoded;
}

export function encodeHex(value: Uint8Array): string {
  return Buffer.from(value).toString("hex");
}

export function hmacSha256(key: Binary, data: Binary): Buffer {
  return createHmac("sha256", bytes(key)).update(bytes(data)).digest();
}

export function doubleHmacEqual(expected: Binary, actual: Binary): boolean {
  const left = hmacSha256(COMPARISON_KEY, hmacSha256(COMPARISON_KEY, expected));
  const right = hmacSha256(COMPARISON_KEY, hmacSha256(COMPARISON_KEY, actual));
  return left.length === right.length && timingSafeEqual(left, right);
}

export function lanTranscript(role: "client" | "server", clientId: string, clientNonce: Uint8Array, serverNonce: Uint8Array): Buffer {
  return encodeLanFields([LAN_PROTOCOL_LABEL, role, clientId, clientNonce, serverNonce]);
}

export function lanProof(key: Binary, role: "client" | "server", clientId: string, clientNonce: Uint8Array, serverNonce: Uint8Array): Buffer {
  return hmacSha256(key, lanTranscript(role, clientId, clientNonce, serverNonce));
}

export function lanKdfSalt(clientId: string, clientNonce: Uint8Array, serverNonce: Uint8Array): Buffer {
  return encodeLanFields([LAN_PROTOCOL_LABEL, "salt", clientId, clientNonce, serverNonce]);
}

export function lanFrameInfo(direction: "client-to-server" | "server-to-client"): Buffer {
  return encodeLanFields([LAN_PROTOCOL_LABEL, "frame", direction]);
}

export function deriveLanFrameKey(
  key: Binary,
  clientId: string,
  clientNonce: Uint8Array,
  serverNonce: Uint8Array,
  direction: "client-to-server" | "server-to-client",
): Buffer {
  const derived = hkdfSync("sha256", bytes(key), lanKdfSalt(clientId, clientNonce, serverNonce), lanFrameInfo(direction), 32);
  return Buffer.from(derived);
}

export function lanFrameMac(
  frameKey: Binary,
  direction: "client-to-server" | "server-to-client",
  sequence: number,
  payload: Binary,
): Buffer {
  return hmacSha256(frameKey, encodeLanFields([LAN_PROTOCOL_LABEL, "frame", direction, u64be(sequence), bytes(payload)]));
}

export function readLanKey(value: Binary): Buffer {
  const key = bytes(value);
  if (key.length !== LAN_KEY_BYTES) throw new Error("LAN credential must be exactly 32 bytes.");
  return key;
}
