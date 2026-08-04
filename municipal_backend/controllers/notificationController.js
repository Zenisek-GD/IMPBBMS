import { Op } from "sequelize";
import { Notification } from "../models/notificationModel.js";
import { unreadCountFor } from "../services/notifier.js";

const serialize = (notification) => ({
  id: notification.id,
  type: notification.type,
  title: notification.title,
  body: notification.body,
  link: notification.link,
  refEntity: notification.refEntity,
  refId: notification.refId,
  severity: notification.severity,
  readAt: notification.readAt,
  createdAt: notification.createdAt,
});

// A user only ever sees their own inbox — there is no cross-user read.
export const listMyNotifications = async (req, res) => {
  const { unreadOnly, limit } = req.query;

  const where = { recipientId: req.currentUser.id };
  if (unreadOnly === "true") where.readAt = { [Op.is]: null };

  const notifications = await Notification.findAll({
    where,
    order: [["createdAt", "DESC"]],
    limit: Math.min(Number(limit) || 30, 100),
  });

  res.json({
    unreadCount: await unreadCountFor(req.currentUser.id),
    notifications: notifications.map(serialize),
  });
};

export const markRead = async (req, res) => {
  const notification = await Notification.findOne({
    where: { id: req.params.id, recipientId: req.currentUser.id },
  });
  if (!notification) return res.status(404).json({ message: "Notification not found." });

  if (!notification.readAt) {
    notification.readAt = new Date();
    await notification.save();
  }

  res.json(serialize(notification));
};

export const markAllRead = async (req, res) => {
  await Notification.update(
    { readAt: new Date() },
    { where: { recipientId: req.currentUser.id, readAt: { [Op.is]: null } } }
  );
  res.json({ unreadCount: 0 });
};
