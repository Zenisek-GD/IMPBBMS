import { Op } from "sequelize";
import { sequelize } from "../models/db.js";
import {
  ExecutiveBudget,
  BudgetProposal,
  BudgetProposalLine,
  BudgetProceeding,
  EXECUTIVE_BUDGET_STATES,
  EXECUTIVE_BUDGET_STATE_LABELS,
  BUDGET_TYPES,
  PROCEEDING_TYPES,
  PROCEEDING_TYPE_LABELS,
  PROVINCIAL_REVIEW_OUTCOMES,
  PROVINCIAL_REVIEW_LABELS,
} from "../models/budgetPreparationModel.js";
import {
  Appropriation,
  FUNDS,
  FUND_LABELS,
  EXPENSE_CLASSES,
  EXPENSE_CLASS_LABELS,
} from "../models/appropriationModel.js";
import { InvestmentProgram, AipEntry } from "../models/investmentProgramModel.js";
import { Department } from "../models/departmentModel.js";
import { User } from "../models/userModel.js";
import {
  evaluateTransition,
  permissionForTransition,
  proposalsEditableIn,
  PROPOSAL_STAGE_FOR_BUDGET_STATE,
  BUDGET_TRANSITIONS,
  generalLimitationFindings,
} from "../services/budgetPreparationWorkflow.js";
import { getLguProfile } from "../models/systemSettingModel.js";
import { auditFromRequest, AUDIT_ACTIONS } from "../services/auditLog.js";
import { notifyByPermission, notifyUsers, NOTIFICATION_EVENTS } from "../services/notifier.js";

const num = (value) => (value === null || value === undefined ? 0 : Number(value));
const peso = (value) => `₱${num(value).toLocaleString()}`;

// ── Serialisers ──────────────────────────────────────────────────────────────

const serializeLine = (line) => ({
  id: line.id,
  budgetProposalId: line.budgetProposalId,
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

const serializeProposal = (proposal, { ceilingGrowthPct } = {}) => {
  const lines = (proposal.lines ?? []).map(serializeLine);
  const previous = proposal.previousYearAppropriation;

  // The growth ceiling is a flag, not a gate. The municipality's practice is
  // that "in some cases" only a 5% increase is allowed — so an over-ceiling
  // request is surfaced for the hearing to argue, which is exactly what the
  // hearing is for, rather than refused at the keyboard.
  const ceiling =
    previous !== null && previous !== undefined && ceilingGrowthPct !== null && ceilingGrowthPct !== undefined
      ? num(previous) * (1 + num(ceilingGrowthPct) / 100)
      : null;

  return {
    id: proposal.id,
    executiveBudgetId: proposal.executiveBudgetId,
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
    justification: proposal.justification,
    reviewNotes: proposal.reviewNotes,
    returnRemarks: proposal.returnRemarks,
    submittedAt: proposal.submittedAt,
    preparedByName: proposal.preparedBy?.name ?? null,
    lines,
  };
};

const serializeProceeding = (proceeding) => ({
  id: proceeding.id,
  executiveBudgetId: proceeding.executiveBudgetId,
  type: proceeding.type,
  typeLabel: PROCEEDING_TYPE_LABELS[proceeding.type],
  scheduledAt: proceeding.scheduledAt,
  heldAt: proceeding.heldAt,
  venue: proceeding.venue,
  agenda: proceeding.agenda,
  minutes: proceeding.minutes,
  attendees: proceeding.attendees ?? [],
  departmentId: proceeding.departmentId,
  departmentName: proceeding.office?.name ?? null,
  recordedByName: proceeding.recordedBy?.name ?? null,
});

const budgetIncludes = {
  include: [
    {
      model: BudgetProposal,
      as: "proposals",
      include: [
        { model: Department, as: "office" },
        { model: User, as: "preparedBy", attributes: ["id", "name"] },
        { model: BudgetProposalLine, as: "lines", include: [{ model: AipEntry, as: "aipEntry" }] },
      ],
    },
    {
      model: BudgetProceeding,
      as: "proceedings",
      include: [
        { model: Department, as: "office" },
        { model: User, as: "recordedBy", attributes: ["id", "name"] },
      ],
    },
    { model: InvestmentProgram, as: "program", attributes: ["id", "fiscalYear", "title", "status"] },
    { model: User, as: "preparedBy", attributes: ["id", "name"] },
    { model: User, as: "approvedBy", attributes: ["id", "name"] },
  ],
};

const serializeBudget = (budget) => {
  const proposals = (budget.proposals ?? []).map((proposal) =>
    serializeProposal(proposal, { ceilingGrowthPct: budget.ceilingGrowthPct })
  );

  return {
    id: budget.id,
    fiscalYear: budget.fiscalYear,
    type: budget.type,
    title: budget.title,
    status: budget.status,
    statusLabel: EXECUTIVE_BUDGET_STATE_LABELS[budget.status],

    estimatedIncome: budget.estimatedIncome === null ? null : num(budget.estimatedIncome),
    expenditureCeiling: budget.expenditureCeiling === null ? null : num(budget.expenditureCeiling),
    ceilingGrowthPct: budget.ceilingGrowthPct === null ? null : num(budget.ceilingGrowthPct),

    mbcReviewedAt: budget.mbcReviewedAt,
    consolidatedAt: budget.consolidatedAt,
    forumHeldAt: budget.forumHeldAt,
    hearingConcludedAt: budget.hearingConcludedAt,
    finalisedAt: budget.finalisedAt,
    mayorApprovedAt: budget.mayorApprovedAt,
    approvedByName: budget.approvedBy?.name ?? null,

    ordinanceNo: budget.ordinanceNo,
    ordinanceDate: budget.ordinanceDate,
    sanggunianActedAt: budget.sanggunianActedAt,

    provincialReviewOutcome: budget.provincialReviewOutcome,
    provincialReviewLabel: budget.provincialReviewOutcome
      ? PROVINCIAL_REVIEW_LABELS[budget.provincialReviewOutcome]
      : null,
    provincialReviewedAt: budget.provincialReviewedAt,
    provincialRemarks: budget.provincialRemarks,

    enactedAt: budget.enactedAt,
    returnRemarks: budget.returnRemarks,

    investmentProgramId: budget.investmentProgramId,
    programTitle: budget.program?.title ?? null,
    preparedByName: budget.preparedBy?.name ?? null,

    proposalsOpen: proposalsEditableIn(budget.status),
    proposals,
    proceedings: (budget.proceedings ?? []).map(serializeProceeding),

    totals: {
      proposed: proposals.reduce((sum, p) => sum + p.proposedTotal, 0),
      recommended: proposals.reduce((sum, p) => sum + p.recommendedTotal, 0),
      final: proposals.reduce((sum, p) => sum + p.finalTotal, 0),
    },
  };
};

// ── Options ──────────────────────────────────────────────────────────────────
export const getBudgetPreparationOptions = async (req, res) => {
  res.json({
    states: EXECUTIVE_BUDGET_STATES.map((key) => ({ key, label: EXECUTIVE_BUDGET_STATE_LABELS[key] })),
    types: BUDGET_TYPES,
    funds: FUNDS.map((key) => ({ key, label: FUND_LABELS[key] })),
    expenseClasses: EXPENSE_CLASSES.map((key) => ({ key, label: EXPENSE_CLASS_LABELS[key] })),
    proceedingTypes: PROCEEDING_TYPES.map((key) => ({ key, label: PROCEEDING_TYPE_LABELS[key] })),
    provincialOutcomes: PROVINCIAL_REVIEW_OUTCOMES.map((key) => ({
      key,
      label: PROVINCIAL_REVIEW_LABELS[key],
    })),
    transitions: Object.entries(BUDGET_TRANSITIONS).map(([action, config]) => ({
      action,
      label: config.label,
      from: config.from,
      to: config.to,
      permission: config.permission,
    })),
  });
};

// ── Executive budget ─────────────────────────────────────────────────────────
export const listBudgets = async (req, res) => {
  const where = {};
  if (Number.isFinite(Number(req.query.fiscalYear))) where.fiscalYear = Number(req.query.fiscalYear);
  if (req.query.status) where.status = req.query.status;

  const budgets = await ExecutiveBudget.findAll({
    where,
    ...budgetIncludes,
    order: [["fiscalYear", "DESC"], ["createdAt", "DESC"]],
  });

  res.json(budgets.map(serializeBudget));
};

export const getBudget = async (req, res) => {
  const budget = await ExecutiveBudget.findByPk(req.params.id, budgetIncludes);
  if (!budget) return res.status(404).json({ message: "Budget not found." });
  res.json(serializeBudget(budget));
};

export const createBudget = async (req, res) => {
  const fiscalYear = Number(req.body.fiscalYear);
  if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) {
    return res.status(400).json({ message: "A valid fiscal year is required." });
  }

  const type = BUDGET_TYPES.includes(req.body.type) ? req.body.type : "annual";

  // One annual budget per year. Supplemental budgets are deliberately not
  // limited: a year can carry several, which is the whole point of them.
  if (type === "annual") {
    const existing = await ExecutiveBudget.findOne({ where: { fiscalYear, type: "annual" } });
    if (existing) {
      return res.status(409).json({
        message: `An annual budget for ${fiscalYear} already exists. Create a supplemental budget instead.`,
      });
    }
  }

  // The budget is built on the investment program. Without an adopted AIP there
  // is no agreed list of projects to appropriate for, which is the gap that let
  // the old system appropriate for anything at all.
  const program = await InvestmentProgram.findOne({ where: { fiscalYear, status: "adopted" } });
  if (!program) {
    return res.status(409).json({
      message: `No adopted Annual Investment Program for ${fiscalYear}. Adopt one before opening the budget.`,
    });
  }

  const budget = await ExecutiveBudget.create({
    fiscalYear,
    type,
    title: req.body.title?.trim() || `${type === "annual" ? "Annual" : "Supplemental"} Budget ${fiscalYear}`,
    investmentProgramId: program.id,
    ceilingGrowthPct:
      req.body.ceilingGrowthPct === undefined || req.body.ceilingGrowthPct === null
        ? null
        : Number(req.body.ceilingGrowthPct),
    preparedById: req.currentUser.id,
    status: "draft",
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.BUDGET_TRANSITION,
    entityRef: "executiveBudget",
    entityId: budget.id,
    summary: `${budget.title} opened for proposals`,
    afterState: { status: "draft", fiscalYear, type },
  });

  // The budget call: every office that prepares a proposal is told the year is
  // open. Previously this happened by memorandum outside the system, which is
  // why proposals arrived late and incomplete.
  await notifyByPermission("budget.proposeBudget", {
    type: NOTIFICATION_EVENTS.BUDGET_CALL,
    title: `Budget call — FY ${fiscalYear}`,
    body: `${budget.title} is open for departmental proposals.`,
    link: "/budget/preparation",
    refEntity: "executiveBudget",
    refId: budget.id,
    severity: "info",
  });

  res.status(201).json(serializeBudget(await ExecutiveBudget.findByPk(budget.id, budgetIncludes)));
};

// ── Appropriation release ────────────────────────────────────────────────────
// The only place in the system that creates budget authority from the
// preparation chain. It runs once, inside the enacting transaction, and writes
// one Appropriation per finalised proposal line.
//
// Every generated line carries the ordinance number and the ids it came from,
// so the register can answer "who authorised this, and against which request?"
// without a human having retyped anything.
const releaseAppropriations = async (budget, proposals, { userId, transaction }) => {
  const created = [];

  for (const proposal of proposals) {
    for (const line of proposal.lines ?? []) {
      const amount = num(line.finalAmount);
      // A line struck out in deliberation is not appropriated. It stays on the
      // proposal as evidence of what was asked and refused.
      if (amount <= 0) continue;

      const appropriation = await Appropriation.create(
        {
          fiscalYear: budget.fiscalYear,
          ordinanceNo: budget.ordinanceNo,
          ordinanceDate: budget.ordinanceDate,
          type: budget.type === "supplemental" ? "supplemental" : "annual",
          fund: line.fund,
          expenseClass: line.expenseClass,
          papCode: line.papCode,
          uacsCode: line.uacsCode,
          title: line.title,
          amount,
          status: "enacted",
          departmentId: proposal.departmentId,
          recordedById: userId,
          executiveBudgetId: budget.id,
          budgetProposalLineId: line.id,
          remarks: `Released by ${budget.title} under ${budget.ordinanceNo}.`,
        },
        { transaction }
      );
      created.push(appropriation);
    }
  }

  return created;
};

export const transitionBudget = async (req, res) => {
  const { action, remarks } = req.body;
  const budget = await ExecutiveBudget.findByPk(req.params.id, budgetIncludes);
  if (!budget) return res.status(404).json({ message: "Budget not found." });

  const requiredPermission = permissionForTransition(action, budget.status);
  if (!requiredPermission || !req.permissions.has(requiredPermission)) {
    return res.status(403).json({ message: "You do not have permission to perform this action." });
  }

  const result = evaluateTransition({
    action,
    currentStatus: budget.status,
    remarks,
    budget,
    payload: req.body,
  });
  if (!result.ok) return res.status(409).json({ message: result.message });

  const previousStatus = budget.status;
  const changes = { status: result.to };

  // ── Stage-specific rules ───────────────────────────────────────────────────
  if (action === "closeProposals") {
    const submitted = (budget.proposals ?? []).filter((p) => p.status !== "draft");
    if (submitted.length === 0) {
      return res.status(409).json({
        message: "No office has submitted a proposal yet. There is nothing for the Budget Council to review.",
      });
    }
    const stillDraft = (budget.proposals ?? []).filter((p) => p.status === "draft");
    if (stillDraft.length > 0 && !req.body.proceedWithoutAll) {
      return res.status(409).json({
        message: `${stillDraft.length} office(s) have not submitted: ${stillDraft
          .map((p) => p.office?.code ?? p.departmentId)
          .join(", ")}. Resend the call, or confirm proceeding without them.`,
        pendingOffices: stillDraft.map((p) => p.office?.code ?? String(p.departmentId)),
      });
    }
  }

  if (action === "reviewProposals") {
    // The Budget Council's review is only complete when every proposal in front
    // of it carries a recommended figure. Without this the consolidation would
    // silently treat "not yet reviewed" as "recommended at zero".
    const unreviewed = (budget.proposals ?? []).filter(
      (proposal) =>
        proposal.status !== "draft" &&
        (proposal.lines ?? []).some((line) => line.recommendedAmount === null)
    );
    if (unreviewed.length > 0) {
      return res.status(409).json({
        message: `${unreviewed.length} proposal(s) still have unreviewed lines. Record a recommended amount on every line first.`,
        offices: unreviewed.map((p) => p.office?.code ?? String(p.departmentId)),
      });
    }
    changes.mbcReviewedAt = new Date();
  }

  if (action === "consolidate") {
    // Consolidation is the Planning Office checking the requests against the
    // development plan. A capital project that cites no AIP entry is exactly
    // what that check is for.
    const unlinked = [];
    for (const proposal of budget.proposals ?? []) {
      for (const line of proposal.lines ?? []) {
        if (line.expenseClass === "capitalOutlay" && !line.aipEntryId) {
          unlinked.push(`${proposal.office?.code ?? proposal.departmentId}: ${line.title}`);
        }
      }
    }
    if (unlinked.length > 0 && !req.body.acknowledgeUnlinked) {
      return res.status(409).json({
        message:
          "These capital outlay requests cite no investment program entry, so they fund projects the LGU never programmed. Link them, or acknowledge the exception explicitly.",
        unlinked,
      });
    }
    changes.consolidatedAt = new Date();
  }

  if (action === "holdForum") {
    changes.estimatedIncome = Number(req.body.estimatedIncome ?? budget.estimatedIncome);
    changes.expenditureCeiling = Number(req.body.expenditureCeiling ?? budget.expenditureCeiling);
    if (req.body.ceilingGrowthPct !== undefined && req.body.ceilingGrowthPct !== null) {
      changes.ceilingGrowthPct = Number(req.body.ceilingGrowthPct);
    }
    changes.forumHeldAt = new Date();
  }

  if (action === "concludeHearing") {
    // A hearing that left no minutes did not happen as far as the record is
    // concerned, and the record is the point.
    const hearings = (budget.proceedings ?? []).filter((p) => p.type === "hearing" && p.minutes?.trim());
    if (hearings.length === 0) {
      return res.status(409).json({
        message: "Record at least one budget hearing with its minutes before concluding the hearings.",
      });
    }
    changes.hearingConcludedAt = new Date();
  }

  if (action === "finalise") {
    const missing = (budget.proposals ?? []).filter(
      (proposal) =>
        proposal.status !== "draft" && (proposal.lines ?? []).some((line) => line.finalAmount === null)
    );
    if (missing.length > 0) {
      return res.status(409).json({
        message: `${missing.length} proposal(s) still have lines without a final amount. Strike a figure on every line, using 0 for lines that were refused.`,
        offices: missing.map((p) => p.office?.code ?? String(p.departmentId)),
      });
    }

    // LGC Sec. 324(a): appropriations may not exceed the estimated income. The
    // ceiling the forum set is the operative figure here.
    const finalTotal = (budget.proposals ?? []).reduce((sum, p) => sum + num(p.finalTotal), 0);
    const ceiling = num(budget.expenditureCeiling);
    if (ceiling > 0 && finalTotal > ceiling) {
      return res.status(409).json({
        message: `The finalised total of ${peso(finalTotal)} exceeds the expenditure ceiling of ${peso(
          ceiling
        )} set at the budget forum. Reduce the final figures or reconvene the Finance Committee.`,
        finalTotal,
        ceiling,
      });
    }

    // ── The general limitations (LGC Sec. 324(b), 324(d), 325(a)) ────────────
    // The balanced-budget rule above is not the only arithmetic constraint on
    // an LGU budget, and the other three are the ones COA raises findings on.
    // They are reported rather than refused: the figures they need — the prior
    // year's regular income, the National Tax Allotment — are recorded on the
    // budget by the Finance Committee, and a municipality that has not entered
    // them yet should not be blocked from finalising by a check it cannot
    // satisfy. What it should not be able to do is finalise without being told.
    const lgu = await getLguProfile();
    const totalsByClass = (budget.proposals ?? []).reduce(
      (totals, proposal) => {
        for (const line of proposal.lines ?? []) {
          const amount = num(line.finalAmount);
          if (line.expenseClass === "personalServices") totals.personalServices += amount;
          if (line.isDevelopmentFund) totals.developmentFund += amount;
          if (line.isLdrrmf) totals.ldrrmf += amount;
        }
        return totals;
      },
      { personalServices: 0, developmentFund: 0, ldrrmf: 0 }
    );

    const findings = generalLimitationFindings({
      incomeClass: lgu.incomeClass,
      estimatedIncome: num(budget.estimatedIncome),
      regularIncomePriorYear: num(budget.regularIncomePriorYear),
      nationalTaxAllotment: num(budget.nationalTaxAllotment),
      personalServicesTotal: totalsByClass.personalServices,
      developmentFundTotal: totalsByClass.developmentFund,
      ldrrmfTotal: totalsByClass.ldrrmf,
    });

    if (findings.length > 0) {
      // Recorded on the budget so the Mayor and the Sanggunian see them, and in
      // the audit trail so a later reviewer can see they were known about.
      changes.limitationFindings = findings;
      await auditFromRequest(req, {
        actionType: "budget.limitations.flagged",
        entityRef: "executiveBudget",
        entityId: budget.id,
        summary: `FY ${budget.fiscalYear} budget finalised with ${findings.length} statutory limitation finding(s)`,
        afterState: { findings },
      });
    } else {
      changes.limitationFindings = null;
    }

    changes.finalisedAt = new Date();
  }

  if (action === "approveExecutive") {
    changes.mayorApprovedAt = new Date();
    changes.approvedById = req.currentUser.id;
  }

  if (action === "enactOrdinance") {
    changes.ordinanceNo = req.body.ordinanceNo.trim();
    changes.ordinanceDate = req.body.ordinanceDate ?? new Date().toISOString().slice(0, 10);
    changes.sanggunianActedAt = new Date();
  }

  if (action === "recordProvincialReview") {
    const outcome = req.body.provincialReviewOutcome;
    if (!PROVINCIAL_REVIEW_OUTCOMES.includes(outcome)) {
      return res.status(400).json({ message: "Unknown provincial review outcome." });
    }
    if (outcome !== "approved" && outcome !== "deemedApproved" && !req.body.provincialRemarks?.trim()) {
      return res.status(400).json({
        message: "Record what the Sangguniang Panlalawigan declared inoperative and on what ground.",
      });
    }
    // An ordinance declared inoperative in full authorises nothing. Releasing
    // appropriations from it would be the single worst thing this module could
    // do, so it is refused outright rather than flagged.
    if (outcome === "declaredInoperativeInFull") {
      return res.status(409).json({
        message:
          "An ordinance declared inoperative in full releases no appropriations. Return the budget for revision and re-enactment instead.",
      });
    }

    changes.provincialReviewOutcome = outcome;
    changes.provincialReviewedAt = req.body.provincialReviewedAt ?? new Date();
    changes.provincialRemarks = req.body.provincialRemarks?.trim() || null;
    changes.enactedAt = new Date();
  }

  if (action === "return") changes.returnRemarks = remarks.trim();

  // ── Apply ──────────────────────────────────────────────────────────────────
  let released = [];
  await sequelize.transaction(async (transaction) => {
    await budget.update(changes, { transaction });

    // Each office's copy advances with the budget, so a department head can see
    // where their request has got to without reading the budget's own status.
    const proposalStage = PROPOSAL_STAGE_FOR_BUDGET_STATE[result.to];
    if (proposalStage) {
      await BudgetProposal.update(
        { status: proposalStage },
        {
          where: { executiveBudgetId: budget.id, status: { [Op.ne]: "draft" } },
          transaction,
        }
      );
    }

    if (action === "recordProvincialReview") {
      released = await releaseAppropriations(budget, budget.proposals ?? [], {
        userId: req.currentUser.id,
        transaction,
      });
    }
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.BUDGET_TRANSITION,
    entityRef: "executiveBudget",
    entityId: budget.id,
    summary: `${budget.title}: ${action}`,
    beforeState: { status: previousStatus },
    afterState: {
      status: result.to,
      remarks: remarks?.trim() ?? null,
      ...(changes.ordinanceNo ? { ordinanceNo: changes.ordinanceNo } : {}),
      ...(changes.provincialReviewOutcome
        ? { provincialReviewOutcome: changes.provincialReviewOutcome }
        : {}),
    },
  });

  if (released.length > 0) {
    const total = released.reduce((sum, row) => sum + num(row.amount), 0);
    await auditFromRequest(req, {
      actionType: AUDIT_ACTIONS.APPROPRIATIONS_RELEASED,
      entityRef: "executiveBudget",
      entityId: budget.id,
      summary: `${released.length} appropriation line(s) released under ${changes.ordinanceNo ?? budget.ordinanceNo} totalling ${peso(total)}`,
      afterState: { lines: released.length, total, ordinanceNo: budget.ordinanceNo },
    });

    await notifyByPermission("budget.view", {
      type: NOTIFICATION_EVENTS.BUDGET_ENACTED,
      title: `FY ${budget.fiscalYear} budget enacted`,
      body: `${released.length} appropriation line(s) totalling ${peso(total)} are now chargeable.`,
      link: "/budget/appropriations",
      refEntity: "executiveBudget",
      refId: budget.id,
      severity: "success",
    });
  } else if (result.to !== "returned") {
    // Hand the budget to whoever acts next, the same way the requisition chain
    // hands itself along. Without this each body has to go looking for work.
    const nextPermission = permissionForTransition(
      Object.keys(BUDGET_TRANSITIONS).find((key) => BUDGET_TRANSITIONS[key].from.includes(result.to)),
      result.to
    );
    if (nextPermission) {
      await notifyByPermission(nextPermission, {
        type: NOTIFICATION_EVENTS.BUDGET_STATUS,
        title: `${budget.title} — ${EXECUTIVE_BUDGET_STATE_LABELS[result.to]}`,
        body: "The budget has reached your stage.",
        link: "/budget/preparation",
        refEntity: "executiveBudget",
        refId: budget.id,
        severity: "info",
      });
    }
  }

  res.json(serializeBudget(await ExecutiveBudget.findByPk(budget.id, budgetIncludes)));
};

// ── Proceedings ──────────────────────────────────────────────────────────────
export const recordProceeding = async (req, res) => {
  const budget = await ExecutiveBudget.findByPk(req.params.id);
  if (!budget) return res.status(404).json({ message: "Budget not found." });

  const { type } = req.body;
  if (!PROCEEDING_TYPES.includes(type)) {
    return res.status(400).json({ message: "Unknown proceeding type." });
  }
  if (!req.body.scheduledAt) return res.status(400).json({ message: "A schedule is required." });

  // A forum is the Finance Committee's; a hearing is too. Recording one is
  // gated on the permission for that kind of meeting, not on a single
  // "can touch the budget" permission.
  const permission = type === "forum" ? "budget.conductForum" : "budget.conductHearing";
  if (!req.permissions.has(permission)) {
    return res.status(403).json({ message: "You do not have permission to record this proceeding." });
  }

  if (req.body.departmentId) {
    const department = await Department.findByPk(Number(req.body.departmentId));
    if (!department) return res.status(400).json({ message: "That office does not exist." });
  }

  const proceeding = await BudgetProceeding.create({
    executiveBudgetId: budget.id,
    type,
    scheduledAt: req.body.scheduledAt,
    heldAt: req.body.heldAt ?? null,
    venue: req.body.venue?.trim() || null,
    agenda: req.body.agenda?.trim() || null,
    minutes: req.body.minutes?.trim() || null,
    attendees: Array.isArray(req.body.attendees) ? req.body.attendees : null,
    departmentId: req.body.departmentId ? Number(req.body.departmentId) : null,
    recordedById: req.currentUser.id,
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.BUDGET_PROCEEDING_RECORDED,
    entityRef: "executiveBudget",
    entityId: budget.id,
    summary: `${PROCEEDING_TYPE_LABELS[type]} recorded for ${budget.title}`,
    afterState: {
      type,
      scheduledAt: proceeding.scheduledAt,
      attendees: (proceeding.attendees ?? []).length,
      hasMinutes: Boolean(proceeding.minutes),
    },
  });

  res.status(201).json(
    serializeProceeding(
      await BudgetProceeding.findByPk(proceeding.id, {
        include: [
          { model: Department, as: "office" },
          { model: User, as: "recordedBy", attributes: ["id", "name"] },
        ],
      })
    )
  );
};

export const updateProceeding = async (req, res) => {
  const proceeding = await BudgetProceeding.findByPk(req.params.proceedingId);
  if (!proceeding) return res.status(404).json({ message: "Proceeding not found." });

  const permission = proceeding.type === "forum" ? "budget.conductForum" : "budget.conductHearing";
  if (!req.permissions.has(permission)) {
    return res.status(403).json({ message: "You do not have permission to amend this proceeding." });
  }

  await proceeding.update({
    heldAt: req.body.heldAt ?? proceeding.heldAt,
    venue: req.body.venue?.trim() ?? proceeding.venue,
    agenda: req.body.agenda?.trim() ?? proceeding.agenda,
    minutes: req.body.minutes?.trim() ?? proceeding.minutes,
    attendees: Array.isArray(req.body.attendees) ? req.body.attendees : proceeding.attendees,
  });

  res.json(
    serializeProceeding(
      await BudgetProceeding.findByPk(proceeding.id, {
        include: [
          { model: Department, as: "office" },
          { model: User, as: "recordedBy", attributes: ["id", "name"] },
        ],
      })
    )
  );
};
