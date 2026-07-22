import { describe, expect, test } from "bun:test";
import {
  deriveLanFrameKey,
  encodeHex,
  hmacSha256,
  lanFrameMac,
  lanFrameInfo,
  lanKdfSalt,
  lanProof,
  lanTranscript,
} from "../src/lan-crypto";
import { hkdfSync } from "node:crypto";

describe("LAN crypto vectors and canonical framing", () => {
  test("matches RFC 4231 HMAC-SHA256 vectors", () => {
    expect(encodeHex(hmacSha256(Buffer.alloc(20, 0x0b), "Hi There"))).toBe(
      "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
    );
    expect(encodeHex(hmacSha256("Jefe", "what do ya want for nothing?"))).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });

  test("matches RFC 5869 HKDF-SHA256 test case 1", () => {
    const result = hkdfSync(
      "sha256",
      Buffer.alloc(22, 0x0b),
      Buffer.from("000102030405060708090a0b0c", "hex"),
      Buffer.from("f0f1f2f3f4f5f6f7f8f9", "hex"),
      42,
    );
    expect(encodeHex(Buffer.from(result))).toBe(
      "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865",
    );
  });

  test("uses identical length-delimited transcript and frame bytes", () => {
    const clientNonce = Buffer.alloc(32, 1);
    const serverNonce = Buffer.alloc(32, 2);
    expect(encodeHex(lanTranscript("server", "client", clientNonce, serverNonce))).toBe(
      "0000001173747265616d6465636b2d6c616e2d76310000000673657276657200000006636c69656e74000000200101010101010101010101010101010101010101010101010101010101010101000000200202020202020202020202020202020202020202020202020202020202020202",
    );
    expect(encodeHex(lanKdfSalt("client", clientNonce, serverNonce))).toHaveLength(222);
    expect(encodeHex(lanFrameInfo("client-to-server"))).toBe(
      "0000001173747265616d6465636b2d6c616e2d7631000000056672616d6500000010636c69656e742d746f2d736572766572",
    );
    expect(encodeHex(lanFrameMac(Buffer.alloc(32, 3), "client-to-server", 1, "{}"))).toBe(
      "27fc2bae24140e8ee9ea331b5d9ede574440bc3bfcf726077258bc0fbb404346",
    );
    expect(encodeHex(lanProof(Buffer.alloc(32, 4), "client", "client", clientNonce, serverNonce))).toHaveLength(64);
    expect(deriveLanFrameKey(Buffer.alloc(32, 4), "client", clientNonce, serverNonce, "client-to-server")).toHaveLength(32);
  });
});
