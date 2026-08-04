import { Op } from "sequelize";
import { PendingItem } from "../models/pendingItemModel.js";
import { PrHeader, PrLineItem } from "../models/prModel.js";
import { User } from "../models/userModel.js";
import { Department } from "../models/departmentModel.js";

const includes = {
  include: [
    { model: PrHeader, as: "purchaseRequisition", include: [{ model: Department, as: "department" }] },
    { model: PrLineItem, as: "lineItem" },
    { model: User, as: "flaggedBy", attributes: ["id", "name"] },
  ],
};

const serialize = (item) => ({
  id: item.id,
  reason: item.reason,
  notes: item.notes,
  description: item.description,
  quantity: item.quantity === null ? null : Number(item.quantity),
  estimatedCost: item.estimatedCost === null ? null : Number(item.estimatedCost),
  priority: item.priority,
  flaggedAt: item.flaggedAt,
  resolvedAt: item.resolvedAt,
  resolution: item.resolution,
  prNumber: item.purchaseRequisition?.prNumber ?? null,
  departmentCode: item.purchaseRequisition?.department?.code ?? null,
  flaggedByName: item.flaggedBy?.name ?? null,
  // How long it has been waiting — the doc's Figma mock surfaced "aging".
  agingDays: Math.floor((Date.now() - new Date(item.flaggedAt).getTime()) / 86400000),
});

export const listPendingItems = async (req, res) => {
  const { resolved, priority } = req.query;

  const where = {};
  if (resolved === "true") where.resolvedAt = { [Op.ne]: null };
  else if (resolved === "false") where.resolvedAt = { [Op.is]: null };
  if (priority) where.priority = priority;

  const items = await PendingItem.findAll({ where, ...includes, order: [["flaggedAt", "ASC"]] });
  res.json(items.map(serialize));
};

// Section 7.5 / Section 6: items that were not awarded or not completed are
// flagged Pending rather than silently closed.
export const flagPendingItem = async (req, res) => {
  const { prLineItemId, reason, notes, priority } = req.body;

  const validReasons = ["notAwarded", "failedBidding", "cancelled", "partiallyDelivered", "notDelivered"];
  if (!validReasons.includes(reason)) {
    return res.status(400).json({ message: `Reason must be one of: ${validReasons.join(", ")}.` });
  }

  const lineItem = await PrLineItem.findByPk(prLineItemId, {
    include: [{ model: PrHeader }],
  });
  if (!lineItem) return res.status(400).json({ message: "That requisition line does not exist." });

  // Only flag a line once while it is still outstanding.
  const existing = await PendingItem.findOne({
    where: { prLineItemId, resolvedAt: { [Op.is]: null } },
  });
  if (existing) {
    return res.status(409).json({ message: "This line is already in the pending queue." });
  }

  const item = await PendingItem.create({
    prLineItemId: lineItem.id,
    prHeaderId: lineItem.prHeaderId,
    reason,
    notes: notes ?? null,
    priority: priority ?? "medium",
    // Snapshot so the queue survives later amendments to the requisition.
    description: lineItem.description,
    quantity: lineItem.quantity,
    estimatedCost: lineItem.lineTotal,
    flaggedById: req.currentUser.id,
    flaggedAt: new Date(),
  });

  res.status(201).json(serialize(await PendingItem.findByPk(item.id, includes)));
};

// Section 7.5: the queue feeds the next procurement cycle, so resolving is
// about deciding what happens to it — not deleting it.
export const resolvePendingItem = async (req, res) => {
  const { resolution, notes } = req.body;
  const item = await PendingItem.findByPk(req.params.id, includes);
  if (!item) return res.status(404).json({ message: "Pending item not found." });
  if (item.resolvedAt) return res.status(409).json({ message: "This item is already resolved." });

  if (!["carriedForward", "reprocured", "dropped"].includes(resolution)) {
    return res.status(400).json({ message: "Resolution must be carriedForward, reprocured, or dropped." });
  }
  // Dropping an item removes it from the next cycle, so it needs a reason.
  if (resolution === "dropped" && !notes?.trim()) {
    return res.status(400).json({ message: "Notes are required when dropping an item." });
  }

  await item.update({
    resolution,
    resolvedAt: new Date(),
    notes: notes?.trim() ?? item.notes,
  });

  res.json(serialize(await PendingItem.findByPk(item.id, includes)));
};
