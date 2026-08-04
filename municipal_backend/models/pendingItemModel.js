import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";
import { PrLineItem, PrHeader } from "./prModel.js";

// Design doc Section 7.5: PR line items not awarded or not completed are
// flagged Pending rather than closed, and surfaced in a dedicated queue for the
// next procurement cycle. Section 6 adds that both cancelled/not-proceeded and
// simply unawarded items route here instead of silently closing.
export const PendingItem = sequelize.define("PendingItem", {
  reason: {
    type: DataTypes.ENUM("notAwarded", "failedBidding", "cancelled", "partiallyDelivered", "notDelivered"),
    allowNull: false,
  },
  notes: { type: DataTypes.TEXT, allowNull: true },

  // Snapshot of the line at the moment it was flagged, so the queue stays
  // readable even if the originating requisition is later amended.
  description: { type: DataTypes.STRING, allowNull: false },
  quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
  estimatedCost: { type: DataTypes.DECIMAL(15, 2), allowNull: true },

  priority: {
    type: DataTypes.ENUM("low", "medium", "high"),
    allowNull: false,
    defaultValue: "medium",
  },

  flaggedAt: { type: DataTypes.DATE, allowNull: false },
  resolvedAt: { type: DataTypes.DATE, allowNull: true },
  resolution: {
    type: DataTypes.ENUM("carriedForward", "reprocured", "dropped"),
    allowNull: true,
  },
});

PendingItem.belongsTo(PrLineItem, { as: "lineItem", foreignKey: "prLineItemId" });
PendingItem.belongsTo(PrHeader, { as: "purchaseRequisition", foreignKey: "prHeaderId" });
PendingItem.belongsTo(User, { as: "flaggedBy", foreignKey: "flaggedById" });

export { sequelize };
