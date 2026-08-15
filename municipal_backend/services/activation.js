import crypto from "crypto";
import { Op } from "sequelize";
import { ActivationToken } from "../models/activationTokenModel.js";
import { User } from "../models/userModel.js";
import { Role } from "../models/roleModel.js";
import { activationTtlHours, frontendOrigin } from "../config/mail.js";

// 256 bits from the CSPRNG. Long enough that guessing is not a strategy, so the
// link needs no rate limit of its own to be safe against enumeration.
const generateToken = () => crypto.randomBytes(32).toString("hex");

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

export const activationUrlFor = (token) => `${frontendOrigin}/activate?token=${token}`;

/**
 * Issues a fresh invitation for a bidder's account and revokes any earlier one,
 * so only the most recent link works.
 *
 * Returns { token, record, url } — `token` is the raw secret and is the only copy
 * that will ever exist. Hand it straight to the mailer; do not log it, return it
 * over the API, or keep it.
 */
export const issueActivationToken = async ({ user, issuedByUserId = null }) => {
  const now = new Date();

  const previous = await ActivationToken.findAll({ where: { userId: user.id } });
  await ActivationToken.update(
    { revokedAt: now },
    { where: { userId: user.id, usedAt: null, revokedAt: null } }
  );

  const token = generateToken();
  const record = await ActivationToken.create({
    userId: user.id,
    tokenHash: hashToken(token),
    // Snapshotted from the account, which in turn was created from the address
    // approved during accreditation. See the model for why this is stored rather
    // than read back from the user at activation time.
    issuedToEmail: user.email,
    expiresAt: new Date(now.getTime() + activationTtlHours * 60 * 60 * 1000),
    issuedByUserId,
    sendCount: previous.reduce((total, row) => Math.max(total, row.sendCount), 0) + 1,
  });

  return { token, record, url: activationUrlFor(token), expiresInHours: activationTtlHours };
};

/**
 * Resolves a raw token to its live record and account, or explains why it will
 * not be honoured.
 *
 * Every rejection carries the same outward message. An activation link that
 * distinguished "expired" from "already used" from "never existed" would confirm
 * to anyone holding an old link that the account behind it is real.
 */
export const resolveActivationToken = async (token) => {
  const invalid = {
    ok: false,
    message: "This activation link is invalid, already used, or has expired.",
  };

  if (typeof token !== "string" || token.length !== 64) return invalid;

  const record = await ActivationToken.findOne({
    where: {
      tokenHash: hashToken(token),
      usedAt: null,
      revokedAt: null,
      expiresAt: { [Op.gt]: new Date() },
    },
  });
  if (!record) return invalid;

  // Role is included so callers can attribute audit entries to the account's
  // real role. This flow serves both bidder onboarding and administrator-
  // initiated resets of internal officials, so it must not assume "vendor".
  const user = await User.findByPk(record.userId, { include: [Role] });
  if (!user) return invalid;

  // An account already activated has no business being activated again, even
  // with a token that looks live.
  if (user.status !== "pendingActivation") return invalid;

  // The accreditation binding. If the account's address no longer matches the one
  // the invitation was issued to, the address was changed after approval and the
  // current one was never accredited — so this link cannot activate it.
  if (user.email.toLowerCase() !== record.issuedToEmail.toLowerCase()) {
    return {
      ok: false,
      message:
        "The email address on this account has changed since the invitation was sent. " +
        "Contact the BAC Secretariat for a new invitation.",
    };
  }

  return { ok: true, record, user };
};

// Marks the first time a bidder opened their link, for the officials' console.
// Only the first access is recorded here; every access is recorded in the audit
// log regardless (workflow requirement 11).
export const markActivationAccessed = async (record) => {
  if (record.firstAccessedAt) return false;
  await record.update({ firstAccessedAt: new Date() });
  return true;
};

// Spends the token. Called once, at the moment OTP verification completes the
// activation, which is what makes the link single-use (workflow requirement 8).
//
// Takes the caller's transaction so spending the token and activating the account
// either both happen or neither does.
export const consumeActivationToken = (record, options = {}) =>
  record.update({ usedAt: new Date() }, options);
