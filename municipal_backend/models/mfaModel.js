import crypto from "node:crypto";
import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";

// ── SECOND FACTOR ────────────────────────────────────────────────────────────
// A password is a secret the holder can be tricked into typing somewhere else.
// Every account in this system can approve spending, issue a document under the
// municipality's name, or read the whole procurement record — so a stolen
// password should not be enough on its own, and here it is not.
//
// One enrolment per user, holding the shared secret their authenticator app
// derives codes from. Alongside it, recovery codes: without them, a lost phone
// means an account nobody can get back into except by an administrator wiping
// the enrolment, which is a support burden and a social-engineering target.

// ── The secret at rest ───────────────────────────────────────────────────────
// A TOTP secret cannot be hashed the way a password is — verifying a code
// requires the original bytes. So it is encrypted instead, with AES-256-GCM,
// under a key held outside the database.
//
// That distinction matters for what a database leak costs. Password hashes
// survive one; TOTP secrets in plaintext would not, and an attacker holding
// them could mint valid codes for every account forever. With the key in the
// environment, a dump of the tables alone is not enough.
//
// GCM rather than CBC so the ciphertext is authenticated: a tampered secret
// fails to decrypt loudly instead of silently producing codes that never match.
const keyMaterial = () => {
  const configured = process.env.MFA_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!configured) {
    throw new Error(
      "Two-factor authentication needs MFA_ENCRYPTION_KEY (or SESSION_SECRET) set in the backend .env. " +
        "Without it there is nowhere safe to keep authenticator secrets."
    );
  }
  // Stretched to exactly 32 bytes. A deployment that reuses SESSION_SECRET gets
  // a distinct key from it because of the salt, so rotating one does not
  // silently change the other's meaning.
  return crypto.scryptSync(configured, "procurenance.mfa.v1", 32);
};

export const encryptSecret = (plaintext) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyMaterial(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  // iv:tag:ciphertext — everything needed to decrypt except the key.
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(":");
};

export const decryptSecret = (stored) => {
  const [iv, tag, ciphertext] = String(stored).split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyMaterial(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
};

export const MfaEnrollment = sequelize.define(
  "MfaEnrollment",
  {
    // Encrypted, never returned by any endpoint. It is shown to the user once,
    // during enrolment, from the value held in memory — never read back out of
    // the database afterwards, so a compromised admin account cannot harvest
    // secrets by reading other people's enrolments.
    encryptedSecret: { type: DataTypes.TEXT, allowNull: false },

    // pending — the secret is issued but the user has not yet proved their app
    //           has it. Nothing is enforced until they do, because an enrolment
    //           that started but never completed would otherwise lock them out.
    // active  — confirmed and required at sign-in.
    status: {
      type: DataTypes.ENUM("pending", "active"),
      allowNull: false,
      defaultValue: "pending",
    },

    confirmedAt: { type: DataTypes.DATE, allowNull: true },
    lastUsedAt: { type: DataTypes.DATE, allowNull: true },

    // ── Replay guard ──────────────────────────────────────────────────────────
    // The time step the last accepted code came from. Any code at or below this
    // is refused, which closes the window where a code shoulder-surfed or
    // captured by a phishing proxy could be used a second time within its own
    // thirty seconds. Without it TOTP is single-use only by convention.
    lastUsedStep: { type: DataTypes.BIGINT, allowNull: true },

    // ── Brute force ───────────────────────────────────────────────────────────
    // Six digits is a million possibilities, which sounds ample until an
    // attacker with the password can try them at machine speed. Counted per
    // enrolment rather than per IP, because the account is what is under attack
    // and an attacker can change address freely.
    failedAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lockedUntil: { type: DataTypes.DATE, allowNull: true },
  },
  { indexes: [{ fields: ["userId"], unique: true }] }
);

MfaEnrollment.belongsTo(User, { as: "user", foreignKey: "userId" });
User.hasOne(MfaEnrollment, { as: "mfa", foreignKey: "userId" });

// ── Recovery codes ───────────────────────────────────────────────────────────
// Ten single-use codes, shown once at enrolment and never again. Stored hashed
// for the same reason a password is: they are equivalent to the second factor,
// so a database leak must not hand them over.
//
// SHA-256 rather than bcrypt here, deliberately. These are 80 bits of system-
// generated randomness, not a human-chosen password — there is no dictionary to
// attack and nothing for a slow hash to buy, and login latency matters.
export const MfaRecoveryCode = sequelize.define(
  "MfaRecoveryCode",
  {
    codeHash: { type: DataTypes.STRING(64), allowNull: false },
    usedAt: { type: DataTypes.DATE, allowNull: true },
    // Recorded so an auditor can see where a recovery was performed from — a
    // code spent from an unfamiliar address is worth a question.
    usedFromIp: { type: DataTypes.STRING(64), allowNull: true },
  },
  { indexes: [{ fields: ["userId"] }, { fields: ["codeHash"] }] }
);

MfaRecoveryCode.belongsTo(User, { as: "user", foreignKey: "userId" });
User.hasMany(MfaRecoveryCode, { as: "recoveryCodes", foreignKey: "userId" });

export const hashRecoveryCode = (code) =>
  crypto.createHash("sha256").update(String(code).replace(/[\s-]/g, "").toUpperCase()).digest("hex");

// Crockford-ish base32 without I, L, O, U — the characters people misread as 1,
// 1, 0 and V when copying a code off a printed sheet under pressure.
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

export const generateRecoveryCodes = (count = 10) =>
  Array.from({ length: count }, () => {
    const raw = Array.from(crypto.randomBytes(16))
      .map((byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length])
      .join("")
      .slice(0, 16);
    // Grouped for legibility: XXXX-XXXX-XXXX-XXXX.
    return raw.match(/.{1,4}/g).join("-");
  });

export const MFA_LOCK_THRESHOLD = 5;
export const MFA_LOCK_MINUTES = 15;

export { sequelize };
