package.path = "hammerspoon/?.lua;hammerspoon/?/init.lua;" .. package.path

local Crypto = require("streamdeck.crypto")

local function fail(message) error(message, 2) end
local function assertEqual(actual, expected, message)
  if actual ~= expected then fail((message or "values differ") .. ": expected " .. expected .. ", got " .. tostring(actual)) end
end
local function fromHex(value) return assert(Crypto.hexDecode(value)) end

local K = {
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
}
local function rotr(value, bits) return ((value >> bits) | (value << (32 - bits))) & 0xffffffff end
local function sha256(input)
  local bytes = { string.byte(input, 1, -1) }
  local bitLength = #bytes * 8
  bytes[#bytes + 1] = 0x80
  while #bytes % 64 ~= 56 do bytes[#bytes + 1] = 0 end
  for shift = 56, 0, -8 do bytes[#bytes + 1] = math.floor(bitLength / (2 ^ shift)) & 0xff end
  local h = { 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19 }
  for offset = 1, #bytes, 64 do
    local w = {}
    for index = 0, 15 do
      local base = offset + index * 4
      w[index] = ((bytes[base] << 24) | (bytes[base + 1] << 16) | (bytes[base + 2] << 8) | bytes[base + 3]) & 0xffffffff
    end
    for index = 16, 63 do
      local a, b = w[index - 15], w[index - 2]
      local s0 = rotr(a, 7) ~ rotr(a, 18) ~ (a >> 3)
      local s1 = rotr(b, 17) ~ rotr(b, 19) ~ (b >> 10)
      w[index] = (w[index - 16] + s0 + w[index - 7] + s1) & 0xffffffff
    end
    local a, b, c, d, e, f, g, hh = table.unpack(h)
    for index = 0, 63 do
      local s1 = rotr(e, 6) ~ rotr(e, 11) ~ rotr(e, 25)
      local choose = (e & f) ~ ((~e) & g)
      local temp1 = (hh + s1 + choose + K[index + 1] + w[index]) & 0xffffffff
      local s0 = rotr(a, 2) ~ rotr(a, 13) ~ rotr(a, 22)
      local majority = (a & b) ~ (a & c) ~ (b & c)
      local temp2 = (s0 + majority) & 0xffffffff
      hh, g, f, e, d, c, b, a = g, f, e, (d + temp1) & 0xffffffff, c, b, a, (temp1 + temp2) & 0xffffffff
    end
    h[1], h[2], h[3], h[4] = (h[1] + a) & 0xffffffff, (h[2] + b) & 0xffffffff, (h[3] + c) & 0xffffffff, (h[4] + d) & 0xffffffff
    h[5], h[6], h[7], h[8] = (h[5] + e) & 0xffffffff, (h[6] + f) & 0xffffffff, (h[7] + g) & 0xffffffff, (h[8] + hh) & 0xffffffff
  end
  local output = {}
  for _, value in ipairs(h) do output[#output + 1] = string.pack(">I4", value) end
  return table.concat(output)
end
local function hmac(key, data)
  if #key > 64 then key = sha256(key) end
  key = key .. string.rep("\0", 64 - #key)
  local inner, outer = {}, {}
  for index = 1, 64 do
    local byte = string.byte(key, index)
    inner[index], outer[index] = string.char(byte ~ 0x36), string.char(byte ~ 0x5c)
  end
  return sha256(table.concat(outer) .. sha256(table.concat(inner) .. data))
end

local fakeHs = { hash = { hmacSHA256 = function(key, data) return Crypto.hexEncode(hmac(key, data)) end } }
local vectors = {
  { key = string.rep("\x0b", 20), data = "Hi There", expected = "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7" },
  { key = "Jefe", data = "what do ya want for nothing?", expected = "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843" },
}
for _, vector in ipairs(vectors) do assertEqual(Crypto.hexEncode(Crypto.hmac(fakeHs, vector.key, vector.data)), vector.expected, "RFC 4231 HMAC-SHA256") end
local hkdf = Crypto.hkdf(
  fakeHs,
  fromHex("0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b"),
  fromHex("000102030405060708090a0b0c"),
  fromHex("f0f1f2f3f4f5f6f7f8f9"),
  42
)
assertEqual(Crypto.hexEncode(hkdf), "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865", "RFC 5869 HKDF-SHA256")
local transcript = Crypto.transcript("server", "client", string.rep("\1", 32), string.rep("\2", 32))
assertEqual(Crypto.hexEncode(transcript), "0000001173747265616d6465636b2d6c616e2d76310000000673657276657200000006636c69656e74000000200101010101010101010101010101010101010101010101010101010101010101000000200202020202020202020202020202020202020202020202020202020202020202", "LAN transcript framing")
local frameMac = Crypto.frameMac(fakeHs, string.rep("\3", 32), "client-to-server", 1, "{}")
assertEqual(Crypto.hexEncode(frameMac), "27fc2bae24140e8ee9ea331b5d9ede574440bc3bfcf726077258bc0fbb404346", "LAN frame MAC framing")
assert(Crypto.doubleHmacEqual(fakeHs, frameMac, frameMac), "double HMAC comparison accepts equal values")
assert(not Crypto.doubleHmacEqual(fakeHs, frameMac, string.rep("\0", 32)), "double HMAC comparison rejects unequal values")
_G.hs.hash = fakeHs.hash
_G.__streamdeckTestHash = fakeHs
return 1
