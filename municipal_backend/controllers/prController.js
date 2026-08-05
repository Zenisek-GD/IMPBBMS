import { Op } from "sequelize";
import { sequelize } from "../models/db.js";
import { PrHeader, PrLineItem } from "../models/prModel.js";
import { AppEntry } from "../models/appEntryModel.js";
import { Department } from "../models/departmentModel.js";
import { User } from "../models/userModel.js";
import { Obligation } from "../models/appropriationModel.js";
import { availableFor, nextObligationNo } from "../services/budgetLedger.js";
import { evaluateTransition, permissionForTransition, isEditable } from "../services/prWorkflow.js";
import { notifyUsers, notifyByPermission, NOTIFICATION_EVENTS } from "../services/notifier.js";
import { auditFromRequest, AUDIT_ACTIONS } from "../services/auditLog.js";

// Section 5.3: "Date required must be at least 15 days after submission,
// unless emergency rules apply."
const MINIMUM_LEAD_DAYS = 15;

// Section 5.3: "Emergency PRs require a mandatory justification of sufficient
// length." The doc does not fix a number, so a deliberate floor is set here —
// long enough to be a real explanation rather than a placeholder.
const EMERGENCY_JUSTIFICATION_MIN_LENGTH = 30;

const withIncludes = {
  include: [
    { model: PrLineItem, as: "lineItems" },
    { model: AppEntry, as: "appEntry" },
    { model: Department, as: "department" },
    { model: User, as: "requester", attributes: ["id", "name"] },
    { model: User, as: "cashCertifiedBy", attributes: ["id", "name"] },
  ],
};

const serialize = (pr) => ({
  id: pr.id,
  prNumber: pr.prNumber,
  purpose: pr.purpose,
  dateRequired: pr.dateRequired,
  isEmergency: pr.isEmergency,
  justification: pr.justification,
  totalAmount: Number(pr.totalAmount),
  status: pr.status,
  returnRemarks: pr.returnRemarks,
  // The two limbs of LGC Sec. 344, side by side: appropriation certified and
  // obligated by the Budget Officer, cash certified by the Treasurer.
  fundsReservedAt: pr.fundsReservedAt,
  cashCertifiedAt: pr.cashCertifiedAt,
  cashCertifiedByName: pr.cashCertifiedBy?.name ?? null,
  submittedAt: pr.submittedAt,
  appEntryId: pr.appEntryId,
  appEntryTitle: pr.appEntry?.projectTitle ?? null,
  appEntryAbc: pr.appEntry ? Number(pr.appEntry.abc) : null,
  departmentCode: pr.department?.code ?? null,
  requesterName: pr.requester?.name ?? null,
  lineItems: (pr.lineItems ?? []).map((item) => ({
    id: item.id,
    description: item.description,
    unit: item.unit,
    quantity: Number(item.quantity),
    unitCost: Number(item.unitCost),
    lineTotal: Number(item.lineTotal),
  })),
  editable: isEditable(pr.status),
});

// Section 5.3: "PR total cannot exceed the remaining ABC balance from the
// linked APP entry." Everything already committed against the entry counts,
// except requisitions that were returned or are still drafts.
const COMMITTED_STATUSES = [
  "pendingDepartmentHeadEndorsement",
  "pendingBudgetCertification",
  "pendingSecretariatReview",
  "pendingHopeApproval",
  "approved",
];

export const remainingBalanceFor = async (appEntryId, { excludePrId } = {}) => {
  const appEntry = await AppEntry.findByPk(appEntryId);
  if (!appEntry) return null;

  const where = { appEntryId, status: { [Op.in]: COMMITTED_STATUSES } };
  if (excludePrId) where.id = { [Op.ne]: excludePrId };

  const committed = (await PrHeader.sum("totalAmount", { where })) ?? 0;

  return {
    abc: Number(appEntry.abc),
    committed: Number(committed),
    remaining: Number(appEntry.abc) - Number(committed),
  };
};

export const getAppBalance = async (req, res) => {
  const balance = await remainingBalanceFor(Number(req.params.appEntryId), {
    excludePrId: req.query.excludePrId ? Number(req.query.excludePrId) : undefined,
  });
  if (!balance) return res.status(404).json({ message: "APP entry not found." });
  res.json(balance);
};

const computeLineItems = (rawItems) => {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { error: "At least one line item is required." };
  }

  const items = [];
  for (const raw of rawItems) {
    if (!raw.description?.trim()) return { error: "Every line item needs a description." };

    const quantity = Number(raw.quantity);
    const unitCost = Number(raw.unitCost);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { error: `Quantity for "${raw.description}" must be greater than 0.` };
    }
    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      return { error: `Unit cost for "${raw.description}" must be greater than 0.` };
    }

    // Section 5.3: estimated costs are validated and summed automatically —
    // the client never supplies the line total.
    items.push({
      description: raw.description.trim(),
      unit: raw.unit ?? null,
      quantity,
      unitCost,
      lineTotal: Number((quantity * unitCost).toFixed(2)),
    });
  }

  const total = Number(items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));
  return { items, total };
};

const validateHeader = ({ dateRequired, isEmergency, justification }, { submitting }) => {
  if (!dateRequired) return "Date required is mandatory.";

  if (isEmergency) {
    if (!justification || justification.trim().length < EMERGENCY_JUSTIFICATION_MIN_LENGTH) {
      return `An emergency requisition needs a justification of at least ${EMERGENCY_JUSTIFICATION_MIN_LENGTH} characters.`;
    }
    return null;
  }

  // The 15-day rule is a submission gate, not a drafting gate — a requester
  // can save an incomplete draft and fix the date before submitting.
  if (submitting) {
    const required = new Date(dateRequired);
    const earliest = new Date();
    earliest.setHours(0, 0, 0, 0);
    earliest.setDate(earliest.getDate() + MINIMUM_LEAD_DAYS);

    if (required < earliest) {
      return `Date required must be at least ${MINIMUM_LEAD_DAYS} days from today unless the requisition is an emergency.`;
    }
  }

  return null;
};

const nextPrNumber = async () => {
  const year = new Date().getFullYear();
  const count = await PrHeader.count({ where: { prNumber: { [Op.like]: `PR-${year}-%` } } });
  return `PR-${year}-${String(count + 1).padStart(4, "0")}`;
};

export const listPrs = async (req, res) => {
  const { status, search } = req.query;
  const where = {};
  if (status) where.status = status;
  if (search) where.prNumber = { [Op.like]: `%${search}%` };

  // A requester without a review permission sees only their department's.
  const canSeeAll = [
    "pr.endorse",
    "pr.certify",
    // Without this the Treasurer could not see the queue they are now required
    // to act on — they hold no department, so the fallback filter below would
    // return nothing.
    "pr.certifyCash",
    "pr.review",
    "pr.approve",
    "audit.viewAll",
  ].some((permission) => req.permissions.has(permission));
  if (!canSeeAll && req.currentUser.departmentId) {
    where.departmentId = req.currentUser.departmentId;
  }

  const prs = await PrHeader.findAll({ where, ...withIncludes, order: [["createdAt", "DESC"]] });
  res.json(prs.map(serialize));
};

export const createPr = async (req, res) => {
  const { appEntryId, lineItems, ...header } = req.body;

  // Section 5.3: a PR must link to an approved APP entry.
  if (!appEntryId) return res.status(400).json({ message: "A linked APP entry is required." });

  const appEntry = await AppEntry.findByPk(appEntryId);
  if (!appEntry) return res.status(400).json({ message: "That APP entry does not exist." });
  if (!["approved", "locked"].includes(appEntry.status)) {
    return res.status(400).json({ message: "The linked APP entry must be approved first." });
  }

  const headerError = validateHeader(header, { submitting: false });
  if (headerError) return res.status(400).json({ message: headerError });

  const computed = computeLineItems(lineItems);
  if (computed.error) return res.status(400).json({ message: computed.error });

  const balance = await remainingBalanceFor(appEntryId);
  if (computed.total > balance.remaining) {
    return res.status(400).json({
      message: `Total ₱${computed.total.toLocaleString()} exceeds the APP entry's remaining balance of ₱${balance.remaining.toLocaleString()}.`,
      balance,
    });
  }

  const created = await sequelize.transaction(async (transaction) => {
    const pr = await PrHeader.create(
      {
        ...header,
        prNumber: await nextPrNumber(),
        appEntryId,
        requesterId: req.currentUser.id,
        departmentId: req.currentUser.departmentId ?? appEntry.implementingUnitId,
        totalAmount: computed.total,
        status: "draft",
      },
      { transaction }
    );

    await PrLineItem.bulkCreate(
      computed.items.map((item) => ({ ...item, prHeaderId: pr.id })),
      { transaction }
    );

    return pr;
  });

  res.status(201).json(serialize(await PrHeader.findByPk(created.id, withIncludes)));
};

export const updatePr = async (req, res) => {
  const pr = await PrHeader.findByPk(req.params.id, withIncludes);
  if (!pr) return res.status(404).json({ message: "Requisition not found." });

  if (!isEditable(pr.status)) {
    return res.status(409).json({ message: `This requisition is in "${pr.status}" and can no longer be edited.` });
  }

  const { lineItems, ...header } = req.body;
  const merged = { ...serialize(pr), ...header };

  const headerError = validateHeader(merged, { submitting: false });
  if (headerError) return res.status(400).json({ message: headerError });

  let computed = null;
  if (lineItems) {
    computed = computeLineItems(lineItems);
    if (computed.error) return res.status(400).json({ message: computed.error });

    const balance = await remainingBalanceFor(pr.appEntryId, { excludePrId: pr.id });
    if (computed.total > balance.remaining) {
      return res.status(400).json({
        message: `Total ₱${computed.total.toLocaleString()} exceeds the APP entry's remaining balance of ₱${balance.remaining.toLocaleString()}.`,
        balance,
      });
    }
  }

  await sequelize.transaction(async (transaction) => {
    await pr.update(
      { ...header, ...(computed ? { totalAmount: computed.total } : {}) },
      { transaction }
    );

    if (computed) {
      await PrLineItem.destroy({ where: { prHeaderId: pr.id }, transaction });
      await PrLineItem.bulkCreate(
        computed.items.map((item) => ({ ...item, prHeaderId: pr.id })),
        { transaction }
      );
    }
  });

  res.json(serialize(await PrHeader.findByPk(pr.id, withIncludes)));
};

export const transitionPr = async (req, res) => {
  const { action, remarks } = req.body;
  const pr = await PrHeader.findByPk(req.params.id, withIncludes);
  if (!pr) return res.status(404).json({ message: "Requisition not found." });

  // Endorsement is the one step not gated purely by permission: Section 5.2
  // says the *Department Head* endorses, and headship is a property of the
  // office rather than a role. Anyone explicitly granted pr.endorse may also
  // act, which keeps the permission matrix meaningful.
  if (action === "endorse") {
    const department = await Department.findByPk(pr.departmentId);
    const isHead = department?.headUserId === req.currentUser.id;

    if (!isHead && !req.permissions.has("pr.endorse")) {
      return res.status(403).json({
        message: department?.headUserId
          ? "Only the head of this department may endorse its requisitions."
          : "This department has no head assigned. Ask the System Administrator to designate one.",
      });
    }

    // A requester must not endorse their own requisition.
    if (pr.requesterId === req.currentUser.id) {
      return res.status(403).json({ message: "You cannot endorse your own requisition." });
    }
  } else {
    const requiredPermission = permissionForTransition(action, pr.status);
    if (!requiredPermission || !req.permissions.has(requiredPermission)) {
      return res.status(403).json({ message: "You do not have permission to perform this action." });
    }
  }

  // Captured before the update so the audit entry can show the transition.
  const previousStatus = pr.status;

  const result = evaluateTransition({ action, currentStatus: pr.status, remarks });
  if (!result.ok) return res.status(409).json({ message: result.message });

  // Re-check the two rules that can go stale between drafting and submitting:
  // the 15-day lead time, and the APP balance other requisitions may have eaten.
  if (action === "submit") {
    const headerError = validateHeader(pr, { submitting: true });
    if (headerError) return res.status(400).json({ message: headerError });

    const balance = await remainingBalanceFor(pr.appEntryId, { excludePrId: pr.id });
    if (Number(pr.totalAmount) > balance.remaining) {
      return res.status(409).json({
        message: `Total ₱${Number(pr.totalAmount).toLocaleString()} now exceeds the APP entry's remaining balance of ₱${balance.remaining.toLocaleString()}. Another requisition may have consumed it.`,
        balance,
      });
    }
  }

  // ── Obligation ─────────────────────────────────────────────────────────────
  // Certifying availability of funds *is* the obligation. From that moment the
  // amount is committed and unavailable to anything else, whether or not a peso
  // has moved — which is why it now writes an Obligation Request rather than
  // only stamping `fundsReservedAt` on the requisition.
  //
  // Checked before the transaction opens so a failure here returns a clean 409
  // rather than rolling back a partially applied transition.
  let obligationNumber = null;
  if (action === "certify") {
    const appropriationId = pr.appEntry?.appropriationId ?? null;
    if (!appropriationId) {
      return res.status(409).json({
        message:
          "This requisition's APP entry is not charged against any appropriation, so there is nothing to obligate against.",
      });
    }

    const balance = await availableFor(appropriationId);
    if (balance.status !== "enacted") {
      return res.status(409).json({
        message: `Ordinance ${balance.ordinanceNo} is "${balance.status}". Funds cannot be certified against it.`,
      });
    }

    if (Number(pr.totalAmount) > balance.available) {
      return res.status(409).json({
        message:
          `₱${Number(pr.totalAmount).toLocaleString()} exceeds the ₱${balance.available.toLocaleString()} ` +
          `still uncommitted under ${balance.ordinanceNo}. ` +
          `₱${balance.obligated.toLocaleString()} of ₱${balance.amount.toLocaleString()} is already obligated.`,
        balance,
      });
    }

    obligationNumber = await nextObligationNo(new Date().getFullYear());
  }

  await sequelize.transaction(async (transaction) => {
    const changes = { status: result.to };

    if (action === "return") changes.returnRemarks = remarks.trim();
    if (action === "submit") {
      changes.returnRemarks = null;
      changes.submittedAt = new Date();
    }
    if (action === "certify") changes.fundsReservedAt = new Date();

    // LGC Sec. 344's second certification. Recorded against the Treasurer
    // personally — the statute makes the officer, not the office, accountable
    // for the statement that the money is there.
    if (action === "certifyCash") {
      changes.cashCertifiedAt = new Date();
      changes.cashCertifiedById = req.currentUser.id;
    }

    await pr.update(changes, { transaction });

    if (action === "certify") {
      await Obligation.create(
        {
          obligationNo: obligationNumber,
          amount: pr.totalAmount,
          status: "obligated",
          certifiedAt: new Date(),
          certifiedById: req.currentUser.id,
          particulars: pr.purpose ?? pr.prNumber,
          appropriationId: pr.appEntry.appropriationId,
          prHeaderId: pr.id,
        },
        { transaction }
      );
    }

    // Returning a certified requisition releases the money it was holding.
    // Without this the balance would stay committed to a requisition that is no
    // longer going anywhere, and the appropriation would silently bleed away.
    if (action === "return") {
      await Obligation.update(
        {
          status: "cancelled",
          cancelledAt: new Date(),
          cancellationReason: `${pr.prNumber} returned: ${remarks.trim()}`,
        },
        { where: { prHeaderId: pr.id, status: "obligated" }, transaction }
      );
    }
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.PR_TRANSITION,
    entityRef: "pr",
    entityId: pr.id,
    summary: obligationNumber
      ? `${pr.prNumber}: certify — ${obligationNumber} obligated ₱${Number(pr.totalAmount).toLocaleString()}`
      : action === "certifyCash"
        ? `${pr.prNumber}: treasury certified cash available for ₱${Number(pr.totalAmount).toLocaleString()}`
        : `${pr.prNumber}: ${action}`,
    beforeState: { status: previousStatus },
    afterState: {
      status: result.to,
      remarks: remarks?.trim() ?? null,
      ...(obligationNumber ? { obligationNo: obligationNumber } : {}),
      // The certification itself, on the record. Both limbs of Sec. 344 are
      // then reconstructable from the log alone.
      ...(action === "certifyCash"
        ? { cashCertified: true, amountCertified: Number(pr.totalAmount) }
        : {}),
    },
  });

  if (action === "return") {
    await notifyUsers([pr.requesterId], {
      type: NOTIFICATION_EVENTS.PR_RETURNED,
      title: `${pr.prNumber} was returned`,
      body: remarks.trim(),
      link: "/purchase-requisitions",
      refEntity: "pr",
      refId: pr.id,
      severity: "danger",
    });
  }
  // Hand the requisition to the next office. Without this the Treasurer would
  // have to go looking for work that arrived in their queue — the same gap that
  // made the bidder-account handoff necessary.
  if (result.to === "pendingTreasuryCertification") {
    await notifyByPermission("pr.certifyCash", {
      type: NOTIFICATION_EVENTS.PR_APPROVED,
      title: `${pr.prNumber} awaiting treasury certification`,
      body: `₱${Number(pr.totalAmount).toLocaleString()} obligated. Certify cash availability (LGC Sec. 344).`,
      link: "/purchase-requisitions",
      refEntity: "pr",
      refId: pr.id,
      severity: "info",
    });
  }

  if (result.to === "approved") {
    await notifyUsers([pr.requesterId], {
      type: NOTIFICATION_EVENTS.PR_APPROVED,
      title: `${pr.prNumber} approved`,
      body: "Your requisition is approved and ready for procurement.",
      link: "/purchase-requisitions",
      refEntity: "pr",
      refId: pr.id,
      severity: "success",
    });
    // Whoever publishes RFQs needs to know there is something to advertise.
    await notifyByPermission("bidding.publish", {
      type: NOTIFICATION_EVENTS.PR_APPROVED,
      title: `${pr.prNumber} ready for procurement`,
      body: `₱${Number(pr.totalAmount).toLocaleString()} — ready to advertise.`,
      link: "/secretariat/rfq",
      refEntity: "pr",
      refId: pr.id,
      severity: "info",
    });
  }

  res.json(serialize(await PrHeader.findByPk(pr.id, withIncludes)));
};
