import { Op } from "sequelize";
import { sequelize } from "../models/db.js";
import {
  ExecutiveBudget,
  BudgetProposal,
  BudgetProposalLine,
} from "../models/budgetPreparationModel.js";
import {
  Appropriation,
  FUNDS,
  FUND_LABELS,
  EXPENSE_CLASSES,
  EXPENSE_CLASS_LABELS,
} from "../models/appropriationModel.js";
import { AipEntry, InvestmentProgram } from "../models/investmentProgramModel.js";
import { Department } from "../models/departmentModel.js";
import { User } from "../models/userModel.js";
import { proposalsEditableIn } from "../services/budgetPreparationWorkflow.js";
import { auditFromRequest, AUDIT_ACTIONS } from "../services/auditLog.js";
import { notifyByPermission, notifyUsers, NOTIFICATION_EVENTS } from "../services/notifier.js";

// Step 6 of the municipal process: each office prepares what it is asking for,
// built from its slice of the investment program. Steps 7 and 11 also live
// here, because reviewing and finalising a proposal is work done *on* the
// proposal — the executive budget's own state machine moves the whole set.

const num = (value) => (value === null || value === undefined ? 0 : Number(value));
const peso = (value) => `₱${num(value).toLocaleString()}`;

const proposalIncludes = {
  include: [
    { model: Department, as: "office" },
    { model: User, as: "preparedBy", attributes: ["id", "name"] },
    {
      model: BudgetProposalLine,
      as: "lines",
      include: [{ model: AipEntry, as: "aipEntry" }],
    },
    { model: ExecutiveBudget, as: "budget" },
  ],
};

const serializeLine = (line) => ({
  id: line.id,
  title: line.title,
  expenseClass: line.expenseClass,
  expenseClassLabel: EXPENSE_CLASS_LABELS[line.expenseClass],
  fund: line.fund,
  fundLabel: FUND_LABELS[line.fund],
  papCode: line.papCode,
  uacsCode: line.uacsCode,
  proposedAmount: num(line.proposedAmount),
  recommendedAmount: line.recommendedAmount === null ? null : num(line.recommendedAmount),
  finalAmount: line.finalAmount === null ? null : num(line.finalAmount),
  remarks: line.remarks,
  aipEntryId: line.aipEntryId,
  aipEntryTitle: line.aipEntry?.title ?? null,
  aipEstimatedCost: line.aipEntry ? num(line.aipEntry.estimatedCost) : null,
});

const serialize = (proposal) => {
  const lines = (proposal.lines ?? []).map(serializeLine);
  const pct = proposal.budget?.ceilingGrowthPct;
  const previous = proposal.previousYearAppropriation;
  const ceiling =
    previous !== null && previous !== undefined && pct !== null && pct !== undefined
      ? num(previous) * (1 + num(pct) / 100)
      : null;

  return {
    id: proposal.id,
    executiveBudgetId: proposal.executiveBudgetId,
    budgetTitle: proposal.budget?.title ?? null,
    budgetStatus: proposal.budget?.status ?? null,
    fiscalYear: proposal.fiscalYear,
    status: proposal.status,
    departmentId: proposal.departmentId,
    departmentCode: proposal.office?.code ?? null,
    departmentName: proposal.office?.name ?? null,
    proposedTotal: num(proposal.proposedTotal),
    recommendedTotal: num(proposal.recommendedTotal),
    finalTotal: num(proposal.finalTotal),
    previousYearAppropriation: previous === null || previous === undefined ? null : num(previous),
    growthCeiling: ceiling === null ? null : Number(ceiling.toFixed(2)),
    exceedsCeiling: ceiling !== null && num(proposal.proposedTotal) > ceiling,
    ceilingGrowthPct: pct === null || pct === undefined ? null : num(pct),
    justification: proposal.justification,
    reviewNotes: proposal.reviewNotes,
    returnRemarks: proposal.returnRemarks,
    submittedAt: proposal.submittedAt,
    preparedByName: proposal.preparedBy?.name ?? null,
    editable: proposal.status === "draft" && proposalsEditableIn(proposal.budget?.status),
    lines,
  };
};

// What this office was appropriated in the previous fiscal year. Looked up
// rather than typed, because the growth ceiling is only credible if the base
// figure comes from the register rather than from the office asking for more.
const previousAppropriationFor = async (departmentId, fiscalYear) => {
  const total = await Appropriation.sum("amount", {
    where: { departmentId, fiscalYear: fiscalYear - 1, status: { [Op.in]: ["enacted", "closed"] } },
  });
  return total === null || total === undefined ? null : Number(total);
};

const computeLines = async (rawLines, { fiscalYear }) => {
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    return { error: "A proposal needs at least one line." };
  }

  const lines = [];
  for (const raw of rawLines) {
    if (!raw.title?.trim()) return { error: "Every line needs a title." };

    const amount = Number(raw.proposedAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { error: `The amount for "${raw.title}" must be greater than 0.` };
    }
    if (raw.expenseClass && !EXPENSE_CLASSES.includes(raw.expenseClass)) {
      return { error: `Unknown expense class on "${raw.title}".` };
    }
    if (raw.fund && !FUNDS.includes(raw.fund)) return { error: `Unknown fund on "${raw.title}".` };

    let aipEntryId = null;
    if (raw.aipEntryId) {
      const entry = await AipEntry.findByPk(Number(raw.aipEntryId), {
        include: [{ model: InvestmentProgram, as: "program" }],
      });
      if (!entry) return { error: `The investment program entry cited by "${raw.title}" does not exist.` };
      if (entry.program?.fiscalYear !== fiscalYear) {
        return {
          error: `"${raw.title}" cites an investment program entry from ${entry.program?.fiscalYear}, not ${fiscalYear}.`,
        };
      }
      if (entry.program?.status !== "adopted") {
        return { error: `"${raw.title}" cites an entry from an investment program that has not been adopted.` };
      }
      if (entry.status !== "planned") {
        return { error: `"${raw.title}" cites an investment program entry that has been dropped.` };
      }
      aipEntryId = entry.id;
    }

    lines.push({
      title: raw.title.trim(),
      expenseClass: raw.expenseClass ?? "mooe",
      fund: raw.fund ?? "generalFund",
      papCode: raw.papCode?.trim() || null,
      uacsCode: raw.uacsCode?.trim() || null,
      proposedAmount: amount,
      remarks: raw.remarks?.trim() || null,
      aipEntryId,
    });
  }

  return { lines, total: Number(lines.reduce((sum, line) => sum + line.proposedAmount, 0).toFixed(2)) };
};

export const listProposals = async (req, res) => {
  const where = {};
  if (Number.isFinite(Number(req.query.executiveBudgetId))) {
    where.executiveBudgetId = Number(req.query.executiveBudgetId);
  }
  if (Number.isFinite(Number(req.query.fiscalYear))) where.fiscalYear = Number(req.query.fiscalYear);
  if (req.query.status) where.status = req.query.status;

  // An office sees its own proposal; the bodies that act on the whole set see
  // all of them. Same shape as the requisition queue.
  const canSeeAll = [
    "budget.reviewProposal",
    "budget.consolidateProposals",
    "budget.conductForum",
    "budget.conductHearing",
    "budget.finaliseExecutive",
    "budget.approveExecutive",
    "budget.enactOrdinance",
    "audit.viewAll",
  ].some((permission) => req.permissions.has(permission));

  if (!canSeeAll && req.currentUser.departmentId) {
    where.departmentId = req.currentUser.departmentId;
  }

  const proposals = await BudgetProposal.findAll({
    where,
    ...proposalIncludes,
    order: [["fiscalYear", "DESC"], ["id", "ASC"]],
  });

  res.json(proposals.map(serialize));
};

export const createProposal = async (req, res) => {
  const budget = await ExecutiveBudget.findByPk(Number(req.body.executiveBudgetId));
  if (!budget) return res.status(400).json({ message: "That budget does not exist." });

  if (!proposalsEditableIn(budget.status)) {
    return res.status(409).json({
      message: `${budget.title} is no longer open for proposals — it is at "${budget.status}".`,
    });
  }

  // An office proposes for itself. A Budget Officer preparing on behalf of an
  // office may name the department explicitly; everyone else gets their own.
  const departmentId = req.permissions.has("budget.prepareExecutive")
    ? Number(req.body.departmentId ?? req.currentUser.departmentId)
    : req.currentUser.departmentId;

  if (!departmentId) {
    return res.status(400).json({ message: "You are not assigned to an office, so there is nothing to propose for." });
  }
  const department = await Department.findByPk(departmentId);
  if (!department) return res.status(400).json({ message: "That office does not exist." });

  const existing = await BudgetProposal.findOne({
    where: { executiveBudgetId: budget.id, departmentId },
  });
  if (existing) {
    return res.status(409).json({
      message: `${department.name} already has a proposal for ${budget.title}. Edit it instead of creating a second one.`,
      proposalId: existing.id,
    });
  }

  const computed = await computeLines(req.body.lines, { fiscalYear: budget.fiscalYear });
  if (computed.error) return res.status(400).json({ message: computed.error });

  const created = await sequelize.transaction(async (transaction) => {
    const proposal = await BudgetProposal.create(
      {
        executiveBudgetId: budget.id,
        departmentId,
        fiscalYear: budget.fiscalYear,
        status: "draft",
        proposedTotal: computed.total,
        previousYearAppropriation: await previousAppropriationFor(departmentId, budget.fiscalYear),
        justification: req.body.justification?.trim() || null,
        preparedById: req.currentUser.id,
      },
      { transaction }
    );

    await BudgetProposalLine.bulkCreate(
      computed.lines.map((line) => ({ ...line, budgetProposalId: proposal.id })),
      { transaction }
    );

    return proposal;
  });

  res.status(201).json(serialize(await BudgetProposal.findByPk(created.id, proposalIncludes)));
};

export const updateProposal = async (req, res) => {
  const proposal = await BudgetProposal.findByPk(req.params.id, proposalIncludes);
  if (!proposal) return res.status(404).json({ message: "Proposal not found." });

  if (proposal.status !== "draft" || !proposalsEditableIn(proposal.budget?.status)) {
    return res.status(409).json({
      message: "This proposal has been submitted and can no longer be edited by the office.",
    });
  }
  if (
    proposal.departmentId !== req.currentUser.departmentId &&
    !req.permissions.has("budget.prepareExecutive")
  ) {
    return res.status(403).json({ message: "You may only edit your own office's proposal." });
  }

  let computed = null;
  if (req.body.lines) {
    computed = await computeLines(req.body.lines, { fiscalYear: proposal.fiscalYear });
    if (computed.error) return res.status(400).json({ message: computed.error });
  }

  await sequelize.transaction(async (transaction) => {
    await proposal.update(
      {
        justification: req.body.justification?.trim() ?? proposal.justification,
        ...(computed ? { proposedTotal: computed.total } : {}),
      },
      { transaction }
    );

    if (computed) {
      await BudgetProposalLine.destroy({ where: { budgetProposalId: proposal.id }, transaction });
      await BudgetProposalLine.bulkCreate(
        computed.lines.map((line) => ({ ...line, budgetProposalId: proposal.id })),
        { transaction }
      );
    }
  });

  res.json(serialize(await BudgetProposal.findByPk(proposal.id, proposalIncludes)));
};

export const submitProposal = async (req, res) => {
  const proposal = await BudgetProposal.findByPk(req.params.id, proposalIncludes);
  if (!proposal) return res.status(404).json({ message: "Proposal not found." });

  if (proposal.status !== "draft") {
    return res.status(409).json({ message: `This proposal is already "${proposal.status}".` });
  }
  if (!proposalsEditableIn(proposal.budget?.status)) {
    return res.status(409).json({ message: "The budget is no longer accepting proposals." });
  }
  if (
    proposal.departmentId !== req.currentUser.departmentId &&
    !req.permissions.has("budget.prepareExecutive")
  ) {
    return res.status(403).json({ message: "You may only submit your own office's proposal." });
  }
  if ((proposal.lines ?? []).length === 0) {
    return res.status(409).json({ message: "An empty proposal cannot be submitted." });
  }

  // Over-ceiling requests are allowed through, but not silently: the office has
  // to say why, because the hearing will ask and the answer belongs on the
  // record rather than in the room.
  const pct = proposal.budget?.ceilingGrowthPct;
  if (pct !== null && pct !== undefined && proposal.previousYearAppropriation) {
    const ceiling = num(proposal.previousYearAppropriation) * (1 + num(pct) / 100);
    if (num(proposal.proposedTotal) > ceiling && !proposal.justification?.trim()) {
      return res.status(409).json({
        message: `${peso(proposal.proposedTotal)} exceeds the ${pct}% growth ceiling of ${peso(
          ceiling
        )} over last year's ${peso(
          proposal.previousYearAppropriation
        )}. Record a justification before submitting.`,
        ceiling: Number(ceiling.toFixed(2)),
      });
    }
  }

  await proposal.update({ status: "submitted", submittedAt: new Date(), returnRemarks: null });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.BUDGET_PROPOSAL_SUBMITTED,
    entityRef: "budgetProposal",
    entityId: proposal.id,
    summary: `${proposal.office?.code ?? proposal.departmentId} submitted ${peso(
      proposal.proposedTotal
    )} for FY ${proposal.fiscalYear}`,
    afterState: {
      status: "submitted",
      proposedTotal: num(proposal.proposedTotal),
      lines: (proposal.lines ?? []).length,
    },
  });

  await notifyByPermission("budget.reviewProposal", {
    type: NOTIFICATION_EVENTS.BUDGET_STATUS,
    title: `Budget proposal received — ${proposal.office?.name ?? "an office"}`,
    body: `${peso(proposal.proposedTotal)} proposed for FY ${proposal.fiscalYear}.`,
    link: "/budget/preparation",
    refEntity: "budgetProposal",
    refId: proposal.id,
    severity: "info",
  });

  res.json(serialize(await BudgetProposal.findByPk(proposal.id, proposalIncludes)));
};

// ── Step 7: the Municipal Budget Council's recommendation ────────────────────
// Amounts are recorded per line, not as a single total, because the council's
// decision is line by line and a lump-sum recommendation cannot be traced to
// what was actually cut.
const applyAmounts = async (req, res, { field, totalField, permission, actionLabel }) => {
  const proposal = await BudgetProposal.findByPk(req.params.id, proposalIncludes);
  if (!proposal) return res.status(404).json({ message: "Proposal not found." });

  if (!req.permissions.has(permission)) {
    return res.status(403).json({ message: "You do not have permission to perform this action." });
  }
  if (proposal.status === "draft") {
    return res.status(409).json({ message: "This proposal has not been submitted yet." });
  }

  const amounts = req.body.amounts;
  if (!Array.isArray(amounts) || amounts.length === 0) {
    return res.status(400).json({ message: "Provide an amount for each line." });
  }

  const byId = new Map((proposal.lines ?? []).map((line) => [line.id, line]));
  const updates = [];

  for (const entry of amounts) {
    const line = byId.get(Number(entry.lineId));
    if (!line) return res.status(400).json({ message: `Line ${entry.lineId} is not on this proposal.` });

    const amount = Number(entry.amount);
    // Zero is a real decision — it is how a line is refused — so the floor is 0
    // rather than 1, and only a negative or non-numeric value is rejected.
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ message: `The amount for "${line.title}" must be zero or more.` });
    }
    if (amount > num(line.proposedAmount)) {
      return res.status(400).json({
        message: `${peso(amount)} for "${line.title}" is more than the ${peso(
          line.proposedAmount
        )} the office asked for. A budget review may reduce a request, not enlarge it.`,
      });
    }

    updates.push({ line, amount, remarks: entry.remarks?.trim() || null });
  }

  const missing = (proposal.lines ?? []).filter((line) => !amounts.some((a) => Number(a.lineId) === line.id));
  if (missing.length > 0) {
    return res.status(400).json({
      message: `No amount given for ${missing.length} line(s): ${missing.map((l) => l.title).join(", ")}.`,
    });
  }

  const total = Number(updates.reduce((sum, update) => sum + update.amount, 0).toFixed(2));

  await sequelize.transaction(async (transaction) => {
    for (const update of updates) {
      await update.line.update(
        { [field]: update.amount, ...(update.remarks ? { remarks: update.remarks } : {}) },
        { transaction }
      );
    }
    await proposal.update(
      {
        [totalField]: total,
        ...(req.body.notes ? { reviewNotes: req.body.notes.trim() } : {}),
        // A review that only recommends leaves the proposal where it is in the
        // budget's own sequence; the executive budget's transition is what moves
        // every proposal on. Recording the status here too would let one
        // proposal run ahead of the budget it belongs to.
      },
      { transaction }
    );
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.BUDGET_PROPOSAL_REVIEWED,
    entityRef: "budgetProposal",
    entityId: proposal.id,
    summary: `${actionLabel} for ${proposal.office?.code ?? proposal.departmentId}: ${peso(
      proposal.proposedTotal
    )} proposed → ${peso(total)}`,
    beforeState: { proposedTotal: num(proposal.proposedTotal) },
    afterState: { [totalField]: total, notes: req.body.notes?.trim() ?? null },
  });

  // The office is told what happened to its request rather than discovering it
  // when the ordinance appears.
  if (proposal.preparedById) {
    await notifyUsers([proposal.preparedById], {
      type: NOTIFICATION_EVENTS.BUDGET_STATUS,
      title: `${actionLabel} — FY ${proposal.fiscalYear} proposal`,
      body: `${peso(proposal.proposedTotal)} proposed, ${peso(total)} carried forward.`,
      link: "/budget/preparation",
      refEntity: "budgetProposal",
      refId: proposal.id,
      severity: total < num(proposal.proposedTotal) ? "warning" : "info",
    });
  }

  res.json(serialize(await BudgetProposal.findByPk(proposal.id, proposalIncludes)));
};

export const reviewProposal = (req, res) =>
  applyAmounts(req, res, {
    field: "recommendedAmount",
    totalField: "recommendedTotal",
    permission: "budget.reviewProposal",
    actionLabel: "Budget Council recommendation",
  });

// ── Step 11: deliberation strikes the final figures ──────────────────────────
export const finaliseProposal = (req, res) =>
  applyAmounts(req, res, {
    field: "finalAmount",
    totalField: "finalTotal",
    permission: "budget.finaliseExecutive",
    actionLabel: "Final appropriation figure",
  });

export const returnProposal = async (req, res) => {
  const proposal = await BudgetProposal.findByPk(req.params.id, proposalIncludes);
  if (!proposal) return res.status(404).json({ message: "Proposal not found." });

  if (!req.permissions.has("budget.reviewProposal") && !req.permissions.has("budget.consolidateProposals")) {
    return res.status(403).json({ message: "You do not have permission to return a proposal." });
  }
  if (!req.body.remarks?.trim()) {
    return res.status(400).json({ message: "Remarks are required when returning a proposal." });
  }
  if (proposal.status === "draft") {
    return res.status(409).json({ message: "This proposal has not been submitted." });
  }

  await proposal.update({
    status: "draft",
    returnRemarks: req.body.remarks.trim(),
    submittedAt: null,
  });

  if (proposal.preparedById) {
    await notifyUsers([proposal.preparedById], {
      type: NOTIFICATION_EVENTS.BUDGET_STATUS,
      title: `FY ${proposal.fiscalYear} budget proposal returned`,
      body: req.body.remarks.trim(),
      link: "/budget/preparation",
      refEntity: "budgetProposal",
      refId: proposal.id,
      severity: "danger",
    });
  }

  res.json(serialize(await BudgetProposal.findByPk(proposal.id, proposalIncludes)));
};
