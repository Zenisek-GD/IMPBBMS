import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";

// Only hashes of browser credentials are persisted. Trust has its own fixed
// deadline and survives destruction or regeneration of an authenticated session.
export const TrustedDevice = sequelize.define("TrustedDevice", {
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: User, key: "id" } },
  roleId: { type: DataTypes.INTEGER, allowNull: true },
  roleVersion: { type: DataTypes.INTEGER, allowNull: true },
  tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  enrollmentId: { type: DataTypes.INTEGER, allowNull: false },
  credentialVersion: { type: DataTypes.STRING(64), allowNull: false },
  verifiedAt: { type: DataTypes.DATE(3), allowNull: false },
  twoFactorTrustedUntil: { type: DataTypes.DATE(3), allowNull: false },
}, { indexes: [{ fields: ["userId"] }, { fields: ["twoFactorTrustedUntil"] }] });

// A database-backed express-session store. Ended rows remain briefly as
// tombstones so an in-flight request cannot recreate a logged-out session.
export const LoginSession = sequelize.define("LoginSession", {
  id: { type: DataTypes.STRING(64), primaryKey: true },
  data: { type: DataTypes.JSON, allowNull: false },
  expiresAt: { type: DataTypes.DATE(3), allowNull: false },
  endedAt: { type: DataTypes.DATE(3), allowNull: true },
  endReason: { type: DataTypes.STRING(24), allowNull: true },
  purgeAt: { type: DataTypes.DATE(3), allowNull: false },
}, { indexes: [{ fields: ["expiresAt"] }, { fields: ["purgeAt"] }] });
