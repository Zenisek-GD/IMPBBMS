import { Op } from "sequelize";
import { sequelize } from "../models/db.js";
import {
  PrHeader,
  PrLineItem,
  ASSET_CLASS_LABELS,
  classifyLineItem,
} from "../models/prModel.js";
import { AppEntry } from "../models/appEntryModel.js";
import { Department } from "../models/departmentModel.js";
import { User } from "../models/userModel.js";
import { Appropriation, Obligation, FUND_LABELS } from "../models/appropriationModel.js";
import { ProcurementMode } from "../models/procurementModeModel.js";
import { getLguProfile } from "../models/systemSettingModel.js";
import { availableFor, nextObligationNo } from "../services/budgetLedger.js";
import { suggestProcurementMode } from "../services/procurementThresholds.js";
import {
  evaluateTransition,
  permissionForTransition,
  isEditable,
  LIVE_PR_STATUSES,
} from "../services/prWorkflow.js";
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
    { model: User, as: "mayorApprovedBy", attributes: ["id", "name"] },
    { model: User, as: "modeDeterminedBy", attributes: ["id", "name"] },
    { model: ProcurementMode, as: "procurementMode" },
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

  // ── The signatures on the form, in the order they are collected ────────────
  // Treasurer certifies cash, the Mayor approves, the Budget Office certifies
  // the appropriation and obligates it, the BAC determines the mode.
  cashCertifiedAt: pr.cashCertifiedAt,
  cashCertifiedByName: pr.cashCertifiedBy?.name ?? null,
  mayorApprovedAt: pr.mayorApprovedAt,
  mayorApprovedByName: pr.mayorApprovedBy?.name ?? null,
  fundsReservedAt: pr.fundsReservedAt,
  fundSource: pr.fundSource,
  fundSourceLabel: pr.fundSource ? FUND_LABELS[pr.fundSource] : null,

  procurementModeId: pr.procurementModeId,
  procurementModeKey: pr.procurementMode?.key ?? null,
  procurementModeName: pr.procurementMode?.name ?? null,
  procurementModeCitation: pr.procurementMode?.citation ?? null,
  modeDeterminedAt: pr.modeDeterminedAt,
  modeDeterminedByName: pr.modeDeterminedBy?.name ?? null,
  modeJustification: pr.modeJustification,
  suggestedModeKey: pr.suggestedModeKey,
  // True where the committee chose something other than what the thresholds
  // indicated. Surfaced rather than left to be worked out by comparing two
  // fields, because it is the flag an auditor scans for.
  modeDepartedFromSuggestion: Boolean(
    pr.suggestedModeKey && pr.procurementMode?.key && pr.suggestedModeKey !== pr.procurementMode.key
  ),

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
    hasUsefulLifeOverOneYear: item.hasUsefulLifeOverOneYear,
    assetClass: item.assetClass,
    assetClassLabel: ASSET_CLASS_LABELS[item.assetClass],
  })),
  // Rolled up so a reviewer can see at a glance whether the requisition is
  // buying supplies or assets — which decides whether it may be charged to MOOE
  // or must come out of Capital Outlay.
  assetSummary: (pr.lineItems ?? []).reduce(
    (summary, item) => {
      summary[item.assetClass] = (summary[item.assetClass] ?? 0) + Number(item.lineTotal);
      return summary;
    },
    { expense: 0, semiExpendable: 0, capitalOutlay: 0 }
  ),
  editable: isEditable(pr.status),
});

// Section 5.3: "PR total cannot exceed the remaining ABC balance from the
// linked APP entry." Everything already committed against the entry counts,
// except requisitions that were returned or are still drafts.
//
// The list comes from the state machine rather than being retyped here. It was
// retyped once, and when a new stage was added to the chain it was not updated
// — a requisition sitting at that stage stopped counting against the balance,
// so two requisitions could each pass this check for the same money.
export const remainingBalanceFor = async (appEntryId, { excludePrId } = {}) => {
  const appEntry = await AppEntry.findByPk(appEntryId);
  if (!appEntry) return null;

  const where = { appEntryId, status: { [Op.in]: LIVE_PR_STATUSES } };
  if (excludePrId) where.id = { [Op.ne]: excludePrId };

  const committed = (await PrHeader.sum("totalAmount", { where })) ?? 0;

  return {
    abc: Number(appEntry.abc),
    committed: Number(committed),
    remaining: Number(appEntry.abc) - Number(committed),
  };
};

// What the IRR thresholds indicate for this requisition, and what else the
// committee may lawfully choose. Returned as data rather than enforced, because
// the determination is the BAC's — the system's job is to make sure the
// committee cannot say it did not know the rule.
export const getModeSuggestion = async (req, res) => {
  const pr = await PrHeader.findByPk(req.params.id);
  if (!pr) return res.status(404).json({ message: "Requisition not found." });

  const lgu = await getLguProfile();
  const suggestion = suggestProcurementMode(Number(pr.totalAmount), lgu);

  const modes = await ProcurementMode.findAll({ order: [["sortOrder", "ASC"]] });

  res.json({
    abc: Number(pr.totalAmount),
    lgu: { type: lgu.lguType, incomeClass: lgu.incomeClass },
    ...suggestion,
    modes: modes.map((mode) => ({
      key: mode.key,
      name: mode.name,
      citation: mode.citation,
      requiresJustification: mode.requiresJustification,
      requiresHopeApproval: mode.requiresHopeApproval,
      isSuggested: mode.key === suggestion.suggested,
    })),
  });
};

export const getAppBalance = async (req, res) => {
  const balance = await remainingBalanceFor(Number(req.params.appEntryId), {
    excludePrId: req.query.excludePrId ? Number(req.query.excludePrId) : undefined,
  });
  if (!balance) return res.status(404).json({ message: "APP entry not found." });
  res.json(balance);
};

const computeLineItems = (rawItems, { capitalizationThreshold }) => {
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

    const hasUsefulLifeOverOneYear = Boolean(raw.hasUsefulLifeOverOneYear);

    // Section 5.3: estimated costs are validated and summed automatically —
    // the client never supplies the line total. The asset class is derived the
    // same way and for the same reason: it decides which expense class the
    // purchase may be charged to, so it must not be assertable from the form.
    items.push({
      description: raw.description.trim(),
      unit: raw.unit ?? null,
      quantity,
      unitCost,
      lineTotal: Number((quantity * unitCost).toFixed(2)),
      hasUsefulLifeOverOneYear,
      assetClass: classifyLineItem({ hasUsefulLifeOverOneYear, unitCost }, capitalizationThreshold),
    });
  }

  const total = Number(items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));
  return { items, total };
};

// The expense class an APP entry's appropriation carries has to be able to bear
// what the requisition actually buys. Capital assets cannot be charged to MOOE,
// and this is the first point in the chain where the individual items — rather
// than a single project cost — are known.
const expenseClassMismatch = (items, expenseClass) => {
  if (!expenseClass) return null;

  const capital = items.filter((item) => item.assetClass === "capitalOutlay");
  if (capital.length > 0 && expenseClass !== "capitalOutlay") {
    return (
      `${capital.length} item(s) are Capital Outlay (unit cost at or above the capitalisation threshold, ` +
      `useful life over a year) but the appropriation behind this requisition is ` +
      `${EXPENSE_CLASS_HINT[expenseClass] ?? expenseClass}. Charge them to a Capital Outlay line instead.`
    );
  }
  return null;
};

const EXPENSE_CLASS_HINT = {
  personalServices: "Personal Services",
  mooe: "MOOE",
  capitalOutlay: "Capital Outlay",
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
  // Every office that has to act on the chain needs the whole queue: they sit
  // outside the requesting department, so the fallback filter below would
  // otherwise hand them nothing.
  const canSeeAll = [
    "pr.endorse",
    "pr.certify",
    "pr.certifyCash",
    "pr.review",
    "pr.determineMode",
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

  const { capitalizationThreshold } = await getLguProfile();
  const computed = computeLineItems(lineItems, { capitalizationThreshold });
  if (computed.error) return res.status(400).json({ message: computed.error });

  // Checked at creation rather than at certification so the requester finds out
  // while they can still change the requisition, not three signatures later.
  const appropriation = appEntry.appropriationId
    ? await Appropriation.findByPk(appEntry.appropriationId)
    : null;
  const classError = expenseClassMismatch(computed.items, appropriation?.expenseClass);
  if (classError) return res.status(400).json({ message: classError });

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
    const { capitalizationThreshold } = await getLguProfile();
    computed = computeLineItems(lineItems, { capitalizationThreshold });
    if (computed.error) return res.status(400).json({ message: computed.error });

    const appropriation = pr.appEntry?.appropriationId
      ? await Appropriation.findByPk(pr.appEntry.appropriationId)
      : null;
    const classError = expenseClassMismatch(computed.items, appropriation?.expenseClass);
    if (classError) return res.status(400).json({ message: classError });

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

  // ── Obligation (step 18) ───────────────────────────────────────────────────
  // The Budget Office's certification *is* the obligation. From that moment the
  // amount is committed and unavailable to anything else, whether or not a peso
  // has moved, which is why it writes an Obligation Request rather than only
  // stamping a date on the requisition.
  //
  // This now happens after the Mayor has approved the request, so an
  // appropriation is only ever encumbered for requests the executive has agreed
  // to — see the note at the top of services/prWorkflow.js.
  //
  // Checked before the transaction opens so a failure here returns a clean 409
  // rather than rolling back a partially applied transition.
  let obligationNumber = null;
  let fundSource = null;
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

    // "Identifies the funding source" — the second half of step 18. Read from
    // the appropriation rather than asked for, so the requisition can never
    // name a fund different from the one it is charged against.
    const appropriation = await Appropriation.findByPk(appropriationId);
    fundSource = appropriation?.fund ?? null;

    obligationNumber = await nextObligationNo(new Date().getFullYear());
  }

  // ── Mode determination (step 19) ───────────────────────────────────────────
  // The committee's decision on how this requisition will be procured, checked
  // against the IRR ceilings for this LGU. Resolved before the transaction for
  // the same reason as the obligation.
  let modeRecord = null;
  let suggestion = null;
  if (action === "determineMode") {
    const lgu = await getLguProfile();
    suggestion = suggestProcurementMode(Number(pr.totalAmount), lgu);

    const chosenKey = req.body.procurementModeKey ?? suggestion.suggested;
    modeRecord = await ProcurementMode.findOne({ where: { key: chosenKey } });
    if (!modeRecord) {
      return res.status(400).json({ message: `Unknown procurement mode: ${chosenKey}.` });
    }

    // Departing from what the thresholds indicate is allowed — the committee
    // may always fall back to Competitive Bidding, and an alternative mode may
    // be justified on grounds the ABC alone cannot express. What is not allowed
    // is departing silently.
    if (chosenKey !== suggestion.suggested && !req.body.justification?.trim()) {
      return res.status(400).json({
        message:
          `The thresholds indicate ${suggestion.suggested} for ₱${Number(pr.totalAmount).toLocaleString()} ` +
          `(${suggestion.rationale}). Record why the committee determined ${modeRecord.name} instead.`,
        suggestion,
      });
    }

    // An alternative mode that the IRR conditions on prior approval by the Head
    // of the Procuring Entity cannot be settled by the committee alone. The
    // approval is recorded against the requisition rather than assumed.
    if (modeRecord.requiresHopeApproval && !req.body.hopeApprovalReference?.trim()) {
      return res.status(409).json({
        message:
          `${modeRecord.name} (${modeRecord.citation}) requires the prior approval of the Head of the ` +
          `Procuring Entity. Record the approval reference before determining this mode.`,
      });
    }
  }

  await sequelize.transaction(async (transaction) => {
    const changes = { status: result.to };

    if (action === "return") changes.returnRemarks = remarks.trim();
    if (action === "submit") {
      changes.returnRemarks = null;
      changes.submittedAt = new Date();
    }

    // Step 16 — the Treasurer. Recorded against the officer personally: the
    // statement that the money is there is a personal accountability, not an
    // office-level one.
    if (action === "certifyCash") {
      changes.cashCertifiedAt = new Date();
      changes.cashCertifiedById = req.currentUser.id;
    }

    // Step 17 — the Mayor approves the request itself.
    if (action === "approve") {
      changes.mayorApprovedAt = new Date();
      changes.mayorApprovedById = req.currentUser.id;
    }

    // Step 18 — the Budget Office.
    if (action === "certify") {
      changes.fundsReservedAt = new Date();
      changes.fundSource = fundSource;
    }

    // Step 19 — the BAC.
    if (action === "determineMode") {
      changes.procurementModeId = modeRecord.id;
      changes.modeDeterminedAt = new Date();
      changes.modeDeterminedById = req.currentUser.id;
      changes.suggestedModeKey = suggestion.suggested;
      changes.modeJustification =
        req.body.justification?.trim() ||
        `Determined per ${suggestion.citation}: ${suggestion.rationale}`;
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

  const amount = Number(pr.totalAmount).toLocaleString();

  await auditFromRequest(req, {
    actionType:
      action === "determineMode" ? AUDIT_ACTIONS.PR_MODE_DETERMINED : AUDIT_ACTIONS.PR_TRANSITION,
    entityRef: "pr",
    entityId: pr.id,
    summary: obligationNumber
      ? `${pr.prNumber}: appropriation certified — ${obligationNumber} obligated ₱${amount} against the ${FUND_LABELS[fundSource] ?? "fund"}`
      : action === "certifyCash"
        ? `${pr.prNumber}: treasury certified funds available for ₱${amount}`
        : action === "approve"
          ? `${pr.prNumber}: approved by the Local Chief Executive`
          : action === "determineMode"
            ? `${pr.prNumber}: mode determined — ${modeRecord.name} (${modeRecord.citation})`
            : `${pr.prNumber}: ${action}`,
    beforeState: { status: previousStatus },
    afterState: {
      status: result.to,
      remarks: remarks?.trim() ?? null,
      ...(obligationNumber ? { obligationNo: obligationNumber, fundSource } : {}),
      // Each certification on the record, so the whole signature chain is
      // reconstructable from the log alone.
      ...(action === "certifyCash" ? { cashCertified: true, amountCertified: Number(pr.totalAmount) } : {}),
      ...(action === "approve" ? { mayorApproved: true } : {}),
      ...(action === "determineMode"
        ? {
            mode: modeRecord.key,
            suggestedMode: suggestion.suggested,
            departedFromSuggestion: modeRecord.key !== suggestion.suggested,
            citation: modeRecord.citation,
          }
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

  // ── Handoffs ───────────────────────────────────────────────────────────────
  // Each office is told when the requisition reaches its desk. Without this an
  // officer has to go looking for work that arrived in their queue, which is
  // how requisitions stall between signatures.
  const HANDOFF = {
    pendingCashCertification: {
      permission: "pr.certifyCash",
      title: `${pr.prNumber} awaiting certification of funds`,
      body: `₱${amount} requested. Certify that the funds are available.`,
    },
    pendingMayorApproval: {
      permission: "pr.approve",
      title: `${pr.prNumber} awaiting approval`,
      body: `₱${amount}, funds certified available by the Treasurer.`,
    },
    pendingBudgetCertification: {
      permission: "pr.certify",
      title: `${pr.prNumber} awaiting appropriation certification`,
      body: `₱${amount}, approved by the Mayor. Certify the appropriation and identify the funding source.`,
    },
    pendingModeDetermination: {
      permission: "pr.determineMode",
      title: `${pr.prNumber} awaiting mode determination`,
      body: `₱${amount} obligated. Determine the mode of procurement.`,
    },
  };

  const handoff = HANDOFF[result.to];
  if (handoff) {
    await notifyByPermission(handoff.permission, {
      type: NOTIFICATION_EVENTS.PR_APPROVED,
      title: handoff.title,
      body: handoff.body,
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
      body: `Cleared for procurement by ${modeRecord?.name ?? "the determined mode"}.`,
      link: "/purchase-requisitions",
      refEntity: "pr",
      refId: pr.id,
      severity: "success",
    });
    // Whoever publishes RFQs needs to know there is something to advertise —
    // and now also which mode the committee determined, since the solicitation
    // no longer chooses one.
    await notifyByPermission("bidding.publish", {
      type: NOTIFICATION_EVENTS.PR_APPROVED,
      title: `${pr.prNumber} ready for procurement`,
      body: `₱${amount} — ${modeRecord?.name ?? "mode determined"} (${modeRecord?.citation ?? ""}).`,
      link: "/secretariat/rfq",
      refEntity: "pr",
      refId: pr.id,
      severity: "info",
    });
  }

  res.json(serialize(await PrHeader.findByPk(pr.id, withIncludes)));
};
