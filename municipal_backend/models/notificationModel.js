import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";

// Design doc Section 7.4: notifications are delivered to the recipient's
// in-system dashboard and do not depend on external email/SMS, though those
// can be added later as secondary channels.
export const Notification = sequelize.define(
  "Notification",
  {
    // Event that produced it — see NOTIFICATION_EVENTS in services/notifier.js.
    type: { type: DataTypes.STRING, allowNull: false },
    title: { type: DataTypes.STRING, allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: true },

    // Where clicking it should take the recipient.
    link: { type: DataTypes.STRING, allowNull: true },

    // Loose reference to the originating record, per Section 9's
    // notifications table (ref_entity, ref_id).
    refEntity: { type: DataTypes.STRING, allowNull: true },
    refId: { type: DataTypes.INTEGER, allowNull: true },

    severity: {
      type: DataTypes.ENUM("info", "success", "warning", "danger"),
      allowNull: false,
      defaultValue: "info",
    },
    readAt: { type: DataTypes.DATE, allowNull: true },
  },
  { indexes: [{ fields: ["recipientId", "readAt"] }] }
);

Notification.belongsTo(User, { as: "recipient", foreignKey: "recipientId" });

export { sequelize };
