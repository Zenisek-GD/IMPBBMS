import { Op } from "sequelize";
import { Notification } from "../models/notificationModel.js";
import { unreadCountFor } from "../services/notifier.js";
import { parseListParams, searchCondition, pageEnvelope } from "../services/listQuery.js";

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
  const { unreadOnly, limit, search, sort, page, pageSize } = req.query;

  const where = { recipientId: req.currentUser.id };
  if (unreadOnly === "true") where.readAt = { [Op.is]: null };

  const searchWhere = searchCondition(search, ["title", "body", "type"]);
  const scoped = searchWhere ? { [Op.and]: [where, searchWhere] } : where;
  const unreadCount = await unreadCountFor(req.currentUser.id);

  // Paginated shape is opt-in (see listAuditLog): ?page= returns
  // { unreadCount, rows, total, page, pageSize, totalPages }.
  // Older callers (notification bell, dashboards) keep the plain shape.
  if (page !== undefined || pageSize !== undefined || sort !== undefined || search !== undefined) {
    const params = parseListParams(req.query, {
      sorts: { createdAt: "createdAt", severity: "severity" },
      defaultSort: { field: "createdAt", direction: "desc" },
    });
    const { count, rows } = await Notification.findAndCountAll({
      where: scoped,
      order: params.order,
      limit: params.limit,
      offset: params.offset,
    });
    return res.json({
      unreadCount,
      ...pageEnvelope({ rows: rows.map(serialize), total: count, page: params.page, pageSize: params.pageSize }),
    });
  }

  const notifications = await Notification.findAll({
    where: scoped,
    order: [["createdAt", "DESC"]],
    limit: Math.min(Number(limit) || 30, 100),
  });

  res.json({
    unreadCount,
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
