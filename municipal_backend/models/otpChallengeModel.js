import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";

// Every purpose for which the system will mail a one-time code. Kept as an enum
// rather than free text so a challenge minted to confirm a profile edit can
// never be replayed to authorise a payment-bearing action.
export const OTP_PURPOSES = [
  "accountActivation",
  "passwordReset",
  "passwordChange",
  "profileUpdate",
  "bidSubmission",
];

// Human wording used in the email subject and body, and in audit summaries.
export const OTP_PURPOSE_LABELS = {
  accountActivation: "account activation",
  passwordReset: "password reset",
  passwordChange: "password change",
  profileUpdate: "profile update",
  bidSubmission: "bid submission",
};

export const OtpChallenge = sequelize.define(
  "OtpChallenge",
  {
    // The handle the client quotes when submitting a code. Opaque and random, so
    // challenges cannot be enumerated by counting up through primary keys — the
    // client never learns the row id.
    reference: { type: DataTypes.STRING(36), allowNull: false, unique: true },

    purpose: { type: DataTypes.ENUM(...OTP_PURPOSES), allowNull: false },

    // Keyed HMAC of the code, never the code itself (workflow requirement 13
    // forbids storing OTPs, and that has to hold for the operational tables too,
    // not only the audit log). A 6-digit code is one of a million, so a bare
    // SHA-256 would be reversible by exhaustive search in under a second from a
    // database dump. The HMAC key lives in the process environment, so a dump of
    // this table alone reveals nothing. See services/otp.js.
    codeHash: { type: DataTypes.STRING, allowNull: false },

    // The address the code was sent to, recorded so verification can confirm the
    // code went to the accredited channel and not to an address changed since.
    deliveredTo: { type: DataTypes.STRING, allowNull: false },

    expiresAt: { type: DataTypes.DATE, allowNull: false },
    consumedAt: { type: DataTypes.DATE, allowNull: true },

    // Retired without being used — when a newer challenge supersedes this one,
    // or the attempt ceiling is hit.
    voidedAt: { type: DataTypes.DATE, allowNull: true },

    // Guessing budget. Without a ceiling, a 5-minute window is long enough to
    // walk a fair share of a six-digit space.
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    maxAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },

    // ── The verified ticket ───────────────────────────────────────────────────
    // Verifying a code does not itself perform the sensitive action; it mints a
    // short-lived, single-use ticket that authorises exactly one follow-up call.
    //
    // This split exists so the system never has to hold the sensitive payload
    // while it waits for a code. A "send OTP, then save this new password"
    // design has to park the new password somewhere in the meantime — in a row,
    // in a session, in a cache — and any of those is a plaintext password at
    // rest. Here the password is not submitted until *after* verification, in
    // the same request that hashes and stores it, so it exists in memory for the
    // length of one call and nowhere else.
    ticketHash: { type: DataTypes.STRING, allowNull: true },
    ticketExpiresAt: { type: DataTypes.DATE, allowNull: true },
    ticketUsedAt: { type: DataTypes.DATE, allowNull: true },

    // What the challenge was raised over, for purposes that act on a specific
    // record — an RFQ for a bid submission, say. A ticket minted for one target
    // will not authorise an action against another.
    contextRef: { type: DataTypes.STRING, allowNull: true },
    contextId: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    indexes: [{ fields: ["reference"] }, { fields: ["userId", "purpose"] }],
  }
);

OtpChallenge.belongsTo(User, { foreignKey: "userId", allowNull: false });
User.hasMany(OtpChallenge, { foreignKey: "userId" });

export { sequelize };
