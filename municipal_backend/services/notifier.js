import { Op } from "sequelize";
import { Notification } from "../models/notificationModel.js";
import { User } from "../models/userModel.js";
import { Role } from "../models/roleModel.js";
import { Permission } from "../models/permissionModel.js";

// Design doc Section 7.4 lists the events that must notify: APP/RFQ
// publication, bid results, award issuance, and payment status changes.
export const NOTIFICATION_EVENTS = {
  RFQ_PUBLISHED: "rfq.published",
  BID_RESULT: "bid.result",
  AWARD_ISSUED: "award.issued",
  AWARD_RECOMMENDED: "award.recommended",
  VENDOR_VERIFIED: "vendor.verified",
  VENDOR_RETURNED: "vendor.returned",
  BIDDER_REQUIREMENTS_SUBMITTED: "bidder.requirements.submitted",
  BIDDER_ACCOUNT_ACTIVATED: "bidder.account.activated",
  APP_APPROVED: "app.approved",
  PR_RETURNED: "pr.returned",
  PR_APPROVED: "pr.approved",
  PAYMENT_STATUS: "payment.status",
  DELIVERY_ACCEPTED: "delivery.accepted",
  CONTRACT_READY: "contract.ready",
};

// Notifications are best-effort: a delivery failure must never roll back or
// break the business action that triggered it.
const safely = async (label, fn) => {
  try {
    return await fn();
  } catch (err) {
    console.error(`[notifier] ${label} failed:`, err.message);
    return null;
  }
};

export const notifyUsers = (userIds, payload) =>
  safely("notifyUsers", async () => {
    const unique = [...new Set(userIds.filter(Boolean))];
    if (unique.length === 0) return [];

    return Notification.bulkCreate(
      unique.map((recipientId) => ({
        recipientId,
        type: payload.type,
        title: payload.title,
        body: payload.body ?? null,
        link: payload.link ?? null,
        refEntity: payload.refEntity ?? null,
        refId: payload.refId ?? null,
        severity: payload.severity ?? "info",
      }))
    );
  });

// Fan out to everyone holding a permission — used when the recipient is a
// function ("whoever can certify funds"), not a specific person.
export const notifyByPermission = (permissionKey, payload) =>
  safely("notifyByPermission", async () => {
    const users = await User.findAll({
      where: { status: "active" },
      include: [
        {
          model: Role,
          required: true,
          include: [{ model: Permission, where: { key: permissionKey }, required: true }],
        },
      ],
    });
    return notifyUsers(users.map((user) => user.id), payload);
  });

export const notifyByRole = (roleKey, payload) =>
  safely("notifyByRole", async () => {
    const users = await User.findAll({
      where: { status: "active" },
      include: [{ model: Role, where: { key: roleKey }, required: true }],
    });
    return notifyUsers(users.map((user) => user.id), payload);
  });

export const unreadCountFor = (userId) =>
  Notification.count({ where: { recipientId: userId, readAt: { [Op.is]: null } } });
