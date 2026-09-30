import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

// Shared by every standalone Node process. Keys are HMACs, never raw account
// names or IP addresses. Counters survive process restarts until their expiry.
export const RateLimitBucket = sequelize.define("RateLimitBucket", {
  id: { type: DataTypes.STRING(64), primaryKey: true },
  attempts: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  expiresAt: { type: DataTypes.BIGINT, allowNull: false },
}, { timestamps: false, indexes: [{ fields: ["expiresAt"] }] });
