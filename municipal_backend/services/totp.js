import crypto from "node:crypto";

// ── TIME-BASED ONE-TIME PASSWORDS (RFC 6238) ─────────────────────────────────
// The second factor. A shared secret is generated once, shown to the officer as
// a QR code, and stored in their authenticator app; both sides then derive the
// same six digits from that secret and the current time. Nothing travels
// between them at sign-in, so a code cannot be intercepted in transit or
// replayed from a phishing page more than a few seconds later.
//
// Implemented directly rather than pulled from a package. This is the one piece
// of the system where a supply-chain compromise would be silent and total — a
// dependency that returned a predictable code would let anybody in and nothing
// would look wrong. It is also barely fifty lines of well-specified arithmetic,
// and the RFC ships published test vectors, so correctness is *provable* rather
// than assumed. See services/totp.test.mjs, which checks exactly those vectors.
//
// Compatible with Google Authenticator, Microsoft Authenticator, Authy, 1Password
// and every other RFC 6238 client: SHA-1, six digits, thirty-second steps. Those
// three parameters are the defaults every app assumes when they are absent from
// the enrolment URI, and departing from them is the usual reason a QR scans but
// the codes never match.

const DIGITS = 6;
const STEP_SECONDS = 30;
const ALGORITHM = "sha1";

// ── base32 (RFC 4648, no padding) ────────────────────────────────────────────
// The encoding authenticator apps expect in the otpauth:// URI. Not base64:
// base32 avoids the case-sensitivity and the `+/=` characters that make a
// secret painful to read aloud or type in by hand when a camera will not focus.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const base32Encode = (buffer) => {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];

  return output;
};

export const base32Decode = (input) => {
  // Tolerant of what a human retypes: spaces, lower case, and the `=` padding
  // some apps add. Rejecting those would make manual entry fail for reasons the
  // user cannot see.
  const cleaned = String(input).toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");

  let bits = 0;
  let value = 0;
  const bytes = [];

  for (const char of cleaned) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error("That secret is not valid base32.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
};

// 160 bits, the size RFC 4226 recommends for a SHA-1 HMAC key.
export const generateSecret = () => base32Encode(crypto.randomBytes(20));

// ── HOTP (RFC 4226) ──────────────────────────────────────────────────────────
// The counter-based primitive TOTP is built on: HMAC the counter with the
// secret, then take a 4-byte slice whose offset is chosen by the last nibble of
// the digest — "dynamic truncation".
const hotp = (secretBuffer, counter) => {
  const counterBuffer = Buffer.alloc(8);
  // 64-bit big-endian. `writeBigUInt64BE` rather than two 32-bit writes so the
  // value stays correct past 2^32 steps.
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const digest = crypto.createHmac(ALGORITHM, secretBuffer).update(counterBuffer).digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
};

export const counterFor = (at = new Date(), step = STEP_SECONDS) =>
  Math.floor(Math.floor(at.getTime() / 1000) / step);

export const generateToken = (secret, at = new Date()) =>
  hotp(base32Decode(secret), counterFor(at));

// ── Verification ─────────────────────────────────────────────────────────────
// Returns the *step* the code matched, or null. The caller stores that step and
// refuses anything at or below it next time, which is what stops a code being
// replayed inside its own thirty-second window — the single most common gap in
// a hand-rolled TOTP implementation.
//
// `window` allows for clock drift between the phone and the server. One step
// either side (±30s) is the usual compromise: enough for an unsynchronised
// phone, small enough that a shoulder-surfed code expires quickly.
export const verifyToken = (secret, token, { at = new Date(), window = 1 } = {}) => {
  const candidate = String(token ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(candidate)) return null;

  const secretBuffer = base32Decode(secret);
  const current = counterFor(at);

  for (let drift = -window; drift <= window; drift += 1) {
    const step = current + drift;
    // Timing-safe: a plain `===` on the digits leaks, through response time,
    // how many leading characters were right. Six digits is a small enough
    // space that the leak is worth closing.
    const expected = Buffer.from(hotp(secretBuffer, step));
    const supplied = Buffer.from(candidate);
    if (expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied)) {
      return step;
    }
  }

  return null;
};

// ── Enrolment URI ────────────────────────────────────────────────────────────
// What the QR code encodes. The label carries the account so a user with
// several can tell them apart in the app; the issuer is what the app shows as
// the heading. Both are percent-encoded — an LGU name with a comma in it would
// otherwise split the label and the entry would appear under the wrong heading.
export const buildOtpAuthUri = ({ secret, account, issuer }) => {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: ALGORITHM.toUpperCase(),
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
};

export const TOTP_PARAMETERS = { digits: DIGITS, stepSeconds: STEP_SECONDS, algorithm: ALGORITHM };
