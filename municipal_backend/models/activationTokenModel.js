import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";

// The invitation an authorized official issues to an approved bidder.
//
// Only the SHA-256 hash of the token is stored. The raw token exists in exactly
// one place — the link in the bidder's mailbox — so a dump of this table cannot
// be used to activate anyone's account. Same reasoning as PasswordResetToken.
export const ActivationToken = sequelize.define("ActivationToken", {
  tokenHash: { type: DataTypes.STRING, allowNull: false, unique: true },

  // The accredited address the invitation was sent to, captured at issue time.
  //
  // This is the anchor for the security requirement that "only the email address
  // submitted and approved during the bidder accreditation process can be used
  // for account activation". Holding it here rather than reading User.email at
  // activation time means that if anyone edits the account's address after the
  // invitation goes out, the token no longer matches and activation fails —
  // which is the correct outcome, because the new address was never accredited.
  issuedToEmail: { type: DataTypes.STRING, allowNull: false },

  expiresAt: { type: DataTypes.DATE, allowNull: false },

  // Single-use. Set the moment OTP verification completes activation; a used
  // token is never accepted again (workflow requirement 8).
  usedAt: { type: DataTypes.DATE, allowNull: true },

  // Revoked when a fresh invitation is issued, so only the newest link works.
  revokedAt: { type: DataTypes.DATE, allowNull: true },

  // When the invitation email was actually handed to the SMTP server, and when
  // the bidder first opened the link. Both are audited events in their own right
  // (workflow requirement 11); these columns let the officials' console show the
  // state of an outstanding invitation without querying the audit log.
  sentAt: { type: DataTypes.DATE, allowNull: true },
  firstAccessedAt: { type: DataTypes.DATE, allowNull: true },

  // How many invitations this bidder has been sent. Shown to the official so a
  // repeatedly-resent invitation is visible as such.
  sendCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
});

ActivationToken.belongsTo(User, { foreignKey: "userId", allowNull: false });
User.hasMany(ActivationToken, { foreignKey: "userId" });

// The official who created the account and issued the invitation — kept for
// accountability alongside the audit entry.
ActivationToken.belongsTo(User, { as: "issuedBy", foreignKey: "issuedByUserId" });

export { sequelize };
