import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

// A durable receipt identifies one user action across retries and server
// instances. A pending/uncertain receipt is never automatically re-executed.
export const MutationReceipt = sequelize.define("MutationReceipt", {
  id: { type: DataTypes.STRING(64), primaryKey: true },
  actorId: { type: DataTypes.INTEGER, allowNull: false },
  actorScope: { type: DataTypes.STRING(64), allowNull: false },
  requestHash: { type: DataTypes.STRING(64), allowNull: false },
  status: { type: DataTypes.ENUM("processing", "completed", "uncertain"), allowNull: false, defaultValue: "processing" },
  statusCode: { type: DataTypes.INTEGER, allowNull: true },
  responseBody: { type: DataTypes.JSON, allowNull: true },
  completedAt: { type: DataTypes.DATE, allowNull: true },
}, { indexes: [{ fields: ["actorId", "createdAt"] }] });
