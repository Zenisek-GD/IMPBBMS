import crypto from "crypto";
import { Op } from "sequelize";
import { OtpChallenge, OTP_PURPOSE_LABELS } from "../models/otpChallengeModel.js";
import { otpTtlMinutes } from "../config/mail.js";
import { sendOtpEmail } from "./mailer.js";

// How long a ticket minted by a successful verification stays usable. Long
// enough to type a new password into a form, short enough that a ticket left in
// a closed tab is worthless.
const TICKET_TTL_MINUTES = 10;

// Resend controls. The cooldown stops a bidder mashing "resend" and racing three
// codes into their inbox (each one voiding the last, so the first one they read
// no longer works — confusing, and it looks broken). The ceiling stops the
// endpoint being used to flood someone's mailbox.
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ISSUES_PER_WINDOW = 5;
const ISSUE_WINDOW_MINUTES = 15;

// Keyed hashing, not plain hashing. A six-digit code has a million possible
// values: SHA-256 of it can be reversed by trying all of them, which on any
// modern machine is instant. Peppering with a key held only in the process
// environment means a stolen database gives up nothing without the application's
// configuration as well.
//
// Derived from SESSION_SECRET so the deployment has one secret to manage rather
// than two that must both be remembered. Rotating it invalidates codes in
// flight, which is acceptable for something that lives five minutes.
const otpKey = () => {
  const secret = process.env.SESSION_SECRET ?? "dev-only-insecure-secret";
  return crypto.createHash("sha256").update(`otp:${secret}`).digest();
};

const hashCode = (code) => crypto.createHmac("sha256", otpKey()).update(code).digest("hex");

const hashTicket = (ticket) => crypto.createHash("sha256").update(ticket).digest("hex");

// Compares two hex digests without leaking, through how long the comparison
// takes, how many leading characters matched.
const constantTimeEqual = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

// Six digits, uniformly distributed, from the CSPRNG. `crypto.randomInt` is used
// rather than `Math.random()` (not cryptographically secure) and rather than
// `randomBytes % 1000000` (modulo bias — the low codes would come up slightly
// more often than the high ones).
export const generateOtpCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

// Cryptographically secure, single-use, 256 bits.
const generateTicket = () => crypto.randomBytes(32).toString("hex");

const generateReference = () => crypto.randomUUID();

/**
 * Raises a challenge: mints a code, mails it to the address given, and voids any
 * earlier outstanding challenge for the same user and purpose.
 *
 * Returns { ok: true, reference, expiresAt, deliveredTo, delivery } on success,
 * or { ok: false, status, message } if the caller is asking too often.
 *
 * The code itself is never returned to the caller and never logged — the only
 * way to learn it is to read the mailbox it was sent to, which is the entire
 * point of the mechanism.
 */
export const issueOtp = async ({
  user,
  purpose,
  deliveredTo,
  contextRef = null,
  contextId = null,
}) => {
  const now = new Date();
  const windowStart = new Date(now.getTime() - ISSUE_WINDOW_MINUTES * 60 * 1000);

  const recent = await OtpChallenge.findAll({
    where: { userId: user.id, purpose, createdAt: { [Op.gt]: windowStart } },
    order: [["createdAt", "DESC"]],
  });

  if (recent.length >= MAX_ISSUES_PER_WINDOW) {
    return {
      ok: false,
      status: 429,
      message: `Too many codes requested. Please wait ${ISSUE_WINDOW_MINUTES} minutes and try again.`,
    };
  }

  const newest = recent[0];
  if (newest) {
    const secondsSince = (now - new Date(newest.createdAt)) / 1000;
    if (secondsSince < RESEND_COOLDOWN_SECONDS) {
      return {
        ok: false,
        status: 429,
        message: `A code was just sent. You can request another in ${Math.ceil(
          RESEND_COOLDOWN_SECONDS - secondsSince
        )} seconds.`,
        retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_SECONDS - secondsSince),
      };
    }
  }

  // Only the newest code should work. Leaving older ones live would widen the
  // guessing surface for no benefit.
  await OtpChallenge.update(
    { voidedAt: now },
    { where: { userId: user.id, purpose, consumedAt: null, voidedAt: null } }
  );

  const code = generateOtpCode();
  const challenge = await OtpChallenge.create({
    reference: generateReference(),
    purpose,
    codeHash: hashCode(code),
    deliveredTo,
    userId: user.id,
    expiresAt: new Date(now.getTime() + otpTtlMinutes * 60 * 1000),
    contextRef,
    contextId,
  });

  const delivery = await sendOtpEmail({
    to: deliveredTo,
    name: user.name,
    code,
    purpose,
    purposeLabel: OTP_PURPOSE_LABELS[purpose] ?? purpose,
    expiresInMinutes: otpTtlMinutes,
  });

  return {
    ok: true,
    reference: challenge.reference,
    expiresAt: challenge.expiresAt,
    deliveredTo,
    expiresInMinutes: otpTtlMinutes,
    delivery,
  };
};

/**
 * Checks a submitted code. On success, marks the challenge consumed and returns
 * a one-time ticket the caller must present to actually perform the action.
 *
 * `userId` is required and matched against the challenge, so knowing a reference
 * is not enough to verify against somebody else's challenge.
 */
export const verifyOtp = async ({ reference, code, userId, purpose }) => {
  if (typeof reference !== "string" || typeof code !== "string") {
    return { ok: false, status: 400, message: "A verification code is required." };
  }

  const challenge = await OtpChallenge.findOne({ where: { reference } });

  // One message for every failure mode below. Distinguishing "no such challenge"
  // from "wrong code" from "not your challenge" would tell a prober which of
  // those it got right.
  const reject = (message = "That code is incorrect or has expired.") => ({
    ok: false,
    status: 400,
    message,
  });

  if (!challenge) return reject();
  if (challenge.userId !== userId) return reject();
  if (challenge.purpose !== purpose) return reject();
  if (challenge.consumedAt || challenge.voidedAt) return reject();
  if (new Date(challenge.expiresAt) <= new Date()) return reject();

  if (challenge.attempts >= challenge.maxAttempts) {
    await challenge.update({ voidedAt: new Date() });
    return reject("Too many incorrect attempts. Request a new code.");
  }

  // Counted before the comparison, so a failed guess costs a attempt even if the
  // request is abandoned mid-flight.
  await challenge.increment("attempts");

  if (!constantTimeEqual(challenge.codeHash, hashCode(code))) {
    const remaining = challenge.maxAttempts - (challenge.attempts + 1);
    if (remaining <= 0) {
      await challenge.update({ voidedAt: new Date() });
      return reject("Too many incorrect attempts. Request a new code.");
    }
    return reject(
      `That code is incorrect. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
    );
  }

  const ticket = generateTicket();
  const now = new Date();
  await challenge.update({
    consumedAt: now,
    ticketHash: hashTicket(ticket),
    ticketExpiresAt: new Date(now.getTime() + TICKET_TTL_MINUTES * 60 * 1000),
  });

  return {
    ok: true,
    challenge,
    ticket,
    ticketExpiresAt: challenge.ticketExpiresAt,
    ticketTtlMinutes: TICKET_TTL_MINUTES,
  };
};

/**
 * Spends a ticket. Call this inside the request that performs the sensitive
 * action, and refuse the action if it returns { ok: false }.
 *
 * Purpose and context are re-checked here as well as at verification time: the
 * ticket authorises one specific act, so a ticket earned by confirming a profile
 * edit must not be spendable on a bid submission.
 */
export const consumeTicket = async ({
  reference,
  ticket,
  userId,
  purpose,
  contextRef = null,
  contextId = null,
}) => {
  const reject = (message = "Email verification is required before this action.") => ({
    ok: false,
    status: 400,
    message,
  });

  if (typeof reference !== "string" || typeof ticket !== "string") return reject();

  const challenge = await OtpChallenge.findOne({ where: { reference } });
  if (!challenge) return reject();
  if (challenge.userId !== userId) return reject();
  if (challenge.purpose !== purpose) return reject();
  if (!challenge.consumedAt || !challenge.ticketHash) return reject();
  if (challenge.ticketUsedAt) return reject("That verification has already been used.");
  if (!challenge.ticketExpiresAt || new Date(challenge.ticketExpiresAt) <= new Date()) {
    return reject("Your verification has expired. Please request a new code.");
  }
  if (!constantTimeEqual(challenge.ticketHash, hashTicket(ticket))) return reject();

  // A challenge raised over a specific record only authorises that record.
  if (contextRef !== null && challenge.contextRef !== contextRef) return reject();
  if (contextId !== null && Number(challenge.contextId) !== Number(contextId)) return reject();

  await challenge.update({ ticketUsedAt: new Date() });
  return { ok: true, challenge };
};

// Public shape of a challenge — everything the client legitimately needs to
// render the code-entry step, and nothing that would help it guess.
export const serializeChallenge = (issued) => ({
  reference: issued.reference,
  expiresAt: issued.expiresAt,
  expiresInMinutes: issued.expiresInMinutes,
  // Enough to reassure the user which inbox to check, without publishing the
  // full accredited address to anyone who can reach the endpoint.
  sentTo: maskEmail(issued.deliveredTo),
  // Whether the message went to a real SMTP server or to the server console.
  // Surfaced so a developer running without credentials is not left staring at
  // an empty inbox wondering what broke.
  delivery: issued.delivery?.transport ?? "unknown",
});

// b****r@example.com — recognisable to its owner, not much use to anyone else.
export const maskEmail = (email) => {
  if (typeof email !== "string" || !email.includes("@")) return "your registered email";
  const [local, domain] = email.split("@");
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}${"*".repeat(Math.min(local.length - 2, 6))}${local.at(-1)}@${domain}`;
};
