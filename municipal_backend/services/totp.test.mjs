// Correctness proof for services/totp.js.
//
// Run with: node services/totp.test.mjs
//
// The vectors below are the ones published in RFC 6238 Appendix B. They are the
// reason this implementation is hand-rolled rather than taken from a package:
// a TOTP that is subtly wrong lets the wrong people in and looks perfectly
// healthy from the outside, so it needs to be checked against the standard
// rather than trusted.
//
// The RFC tabulates eight-digit codes; this implementation issues six, which is
// what authenticator apps default to. Six digits is the eight-digit value mod
// 10^6 — the last six characters — because 10^6 divides 10^8 exactly.

import assert from "node:assert/strict";
import {
  base32Encode,
  base32Decode,
  generateToken,
  verifyToken,
  generateSecret,
  counterFor,
  buildOtpAuthUri,
} from "./totp.js";

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n       ${err.message}`);
    process.exitCode = 1;
  }
};

// RFC 6238 uses the ASCII seed "12345678901234567890" for SHA-1.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "ascii"));

console.log("\nRFC 6238 Appendix B — SHA-1 test vectors");

// [ unix seconds, eight-digit code from the RFC ]
const VECTORS = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
  // Past 2^32 seconds. This is the case that catches an implementation using a
  // 32-bit counter write instead of a 64-bit one.
  [20000000000, "65353130"],
];

for (const [seconds, eightDigit] of VECTORS) {
  const expected = eightDigit.slice(-6);
  test(`t=${seconds} → ${expected}`, () => {
    assert.equal(generateToken(RFC_SECRET, new Date(seconds * 1000)), expected);
  });
}

console.log("\nbase32");
test("round-trips arbitrary bytes", () => {
  for (let i = 0; i < 200; i += 1) {
    const bytes = Buffer.from(Array.from({ length: 1 + (i % 32) }, (_, n) => (i * 7 + n * 13) % 256));
    assert.deepEqual(base32Decode(base32Encode(bytes)), bytes);
  }
});
test("tolerates lower case, spaces and padding a user retypes", () => {
  const secret = generateSecret();
  const mangled = `${secret.toLowerCase().match(/.{1,4}/g).join(" ")}==`;
  assert.equal(generateToken(mangled, new Date(0)), generateToken(secret, new Date(0)));
});
test("rejects characters outside the alphabet", () => {
  assert.throws(() => base32Decode("ABC!DEF"), /not valid base32/);
});

console.log("\nverification");
const secret = generateSecret();
const now = new Date("2026-08-11T10:00:00Z");

test("accepts the current code and reports its step", () => {
  const step = verifyToken(secret, generateToken(secret, now), { at: now });
  assert.equal(step, counterFor(now));
});
test("accepts one step of clock drift either side", () => {
  const before = new Date(now.getTime() - 30_000);
  const after = new Date(now.getTime() + 30_000);
  assert.ok(verifyToken(secret, generateToken(secret, before), { at: now }) !== null);
  assert.ok(verifyToken(secret, generateToken(secret, after), { at: now }) !== null);
});
test("refuses a code two steps stale", () => {
  const old = new Date(now.getTime() - 90_000);
  assert.equal(verifyToken(secret, generateToken(secret, old), { at: now }), null);
});
test("refuses a code from a different secret", () => {
  assert.equal(verifyToken(secret, generateToken(generateSecret(), now), { at: now }), null);
});
test("refuses malformed input without throwing", () => {
  for (const bad of ["", null, undefined, "abcdef", "12345", "1234567", "12 34 56", {}]) {
    assert.equal(verifyToken(secret, bad, { at: now }), null);
  }
});
test("the returned step is what lets a caller block replay", () => {
  const token = generateToken(secret, now);
  const first = verifyToken(secret, token, { at: now });
  const second = verifyToken(secret, token, { at: now });
  // Both verify — the primitive is stateless. Refusing the second is the
  // caller's job, using the step, and MfaEnrollment.lastUsedStep does exactly
  // that. Asserted here so nobody assumes this function guards replay.
  assert.equal(first, second);
});

console.log("\nenrolment URI");
test("is a valid otpauth URI with the parameters apps assume", () => {
  const uri = buildOtpAuthUri({ secret, account: "mayor@example.gov.ph", issuer: "ProcureNance" });
  const parsed = new URL(uri);
  assert.equal(parsed.protocol, "otpauth:");
  assert.equal(parsed.searchParams.get("secret"), secret);
  assert.equal(parsed.searchParams.get("digits"), "6");
  assert.equal(parsed.searchParams.get("period"), "30");
  assert.equal(parsed.searchParams.get("algorithm"), "SHA1");
});
test("percent-encodes an issuer containing a comma", () => {
  const uri = buildOtpAuthUri({
    secret,
    account: "a@b.test",
    issuer: "Municipality of Roxas, Oriental Mindoro",
  });
  // The label must not contain a raw comma — it would split the label and file
  // the entry under the wrong heading in the app.
  const label = uri.slice("otpauth://totp/".length, uri.indexOf("?"));
  assert.ok(!label.includes(","), `label leaked a raw comma: ${label}`);
  assert.ok(decodeURIComponent(label).includes("Oriental Mindoro"));
});

console.log(`\n${passed} checks passed${process.exitCode ? " — WITH FAILURES" : ""}\n`);
