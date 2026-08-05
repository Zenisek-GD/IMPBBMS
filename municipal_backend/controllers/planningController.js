import { Op } from "sequelize";
import {
  DevelopmentPlan,
  DevelopmentGoal,
  SECTORS,
  SECTOR_LABELS,
} from "../models/developmentPlanModel.js";
import { InvestmentProgram, AipEntry } from "../models/investmentProgramModel.js";
import { Department } from "../models/departmentModel.js";
import { User } from "../models/userModel.js";
import { FUNDS, FUND_LABELS, EXPENSE_CLASSES, EXPENSE_CLASS_LABELS } from "../models/appropriationModel.js";
import {
  evaluateTransition,
  permissionForTransition,
  isEditable,
  AIP_TRANSITIONS,
} from "../services/aipWorkflow.js";
import { auditFromRequest, AUDIT_ACTIONS } from "../services/auditLog.js";
import { notifyByPermission, NOTIFICATION_EVENTS } from "../services/notifier.js";

// ── Development planning ─────────────────────────────────────────────────────
// Step 1 of the municipal process (the Comprehensive Development Plan), step 2
// (the Mayor's priorities) and step 3 (the Annual Investment Program).
//
// Everything here is upstream of money. Nothing in this file can authorise a
// peso — its job is to give the budget and the procurement plan something to be
// checked against.

const num = (value) => (value === null || value === undefined ? 0 : Number(value));

const serializeGoal = (goal) => ({
  id: goal.id,
  developmentPlanId: goal.developmentPlanId,
  sector: goal.sector,
  sectorLabel: SECTOR_LABELS[goal.sector],
  subsector: goal.subsector,
  title: goal.title,
  description: goal.description,
  isMayorPriority: goal.isMayorPriority,
  priorityRank: goal.priorityRank,
  priorityFiscalYear: goal.priorityFiscalYear,
  prioritisedAt: goal.prioritisedAt,
  prioritisedByName: goal.prioritisedBy?.name ?? null,
  status: goal.status,
});

const serializePlan = (plan) => ({
  id: plan.id,
  title: plan.title,
  startYear: plan.startYear,
  endYear: plan.endYear,
  // The horizon is derived, not stored, so it can never contradict the years.
  horizonYears: plan.endYear - plan.startYear + 1,
  resolutionNo: plan.resolutionNo,
  adoptedAt: plan.adoptedAt,
  status: plan.status,
  vision: plan.vision,
  remarks: plan.remarks,
  preparedByName: plan.preparedBy?.name ?? null,
  goals: (plan.goals ?? []).map(serializeGoal),
});

const planIncludes = {
  include: [
    {
      model: DevelopmentGoal,
      as: "goals",
      include: [{ model: User, as: "prioritisedBy", attributes: ["id", "name"] }],
    },
    { model: User, as: "preparedBy", attributes: ["id", "name"] },
  ],
  order: [
    [{ model: DevelopmentGoal, as: "goals" }, "priorityRank", "ASC"],
    [{ model: DevelopmentGoal, as: "goals" }, "id", "ASC"],
  ],
};

export const getPlanningOptions = async (req, res) => {
  res.json({
    sectors: SECTORS.map((key) => ({ key, label: SECTOR_LABELS[key] })),
    funds: FUNDS.map((key) => ({ key, label: FUND_LABELS[key] })),
    expenseClasses: EXPENSE_CLASSES.map((key) => ({ key, label: EXPENSE_CLASS_LABELS[key] })),
    quarters: ["Q1", "Q2", "Q3", "Q4"],
    transitions: Object.entries(AIP_TRANSITIONS).map(([action, config]) => ({
      action,
      label: config.label,
      from: config.from,
      to: config.to,
    })),
  });
};

export const listPlans = async (req, res) => {
  const where = {};
  if (req.query.status) where.status = req.query.status;

  // `?activeFor=2026` — the plan whose horizon covers that year. This is how
  // every downstream form finds the plan it should be citing without the user
  // having to know which one is current.
  if (Number.isFinite(Number(req.query.activeFor))) {
    const year = Number(req.query.activeFor);
    where.startYear = { [Op.lte]: year };
    where.endYear = { [Op.gte]: year };
  }

  const plans = await DevelopmentPlan.findAll({
    where,
    ...planIncludes,
    order: [["startYear", "DESC"], ...planIncludes.order],
  });

  res.json(plans.map(serializePlan));
};

const validatePlan = (payload) => {
  if (!payload.title?.trim()) return "A title is required.";

  const start = Number(payload.startYear);
  const end = Number(payload.endYear);
  if (!Number.isInteger(start) || start < 2000 || start > 2100) return "A valid start year is required.";
  if (!Number.isInteger(end) || end < start) return "The end year must not be earlier than the start year.";
  // A "development plan" covering a single year is an investment program by
  // another name, and one covering a decade is not a plan anybody executes.
  if (end - start + 1 > 10) return "A development plan may not span more than ten years.";

  return null;
};

export const createPlan = async (req, res) => {
  const error = validatePlan(req.body);
  if (error) return res.status(400).json({ message: error });

  const plan = await DevelopmentPlan.create({
    title: req.body.title.trim(),
    startYear: Number(req.body.startYear),
    endYear: Number(req.body.endYear),
    vision: req.body.vision?.trim() || null,
    remarks: req.body.remarks?.trim() || null,
    status: "draft",
    preparedById: req.currentUser.id,
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.CDP_RECORDED,
    entityRef: "developmentPlan",
    entityId: plan.id,
    summary: `${plan.title} (${plan.startYear}–${plan.endYear})`,
    afterState: { status: plan.status, startYear: plan.startYear, endYear: plan.endYear },
  });

  res.status(201).json(serializePlan(await DevelopmentPlan.findByPk(plan.id, planIncludes)));
};

export const updatePlan = async (req, res) => {
  const plan = await DevelopmentPlan.findByPk(req.params.id, planIncludes);
  if (!plan) return res.status(404).json({ message: "Development plan not found." });

  if (plan.status !== "draft") {
    return res.status(409).json({
      message: `This plan is "${plan.status}" and can no longer be edited. Supersede it with a new plan instead.`,
    });
  }

  const merged = { ...serializePlan(plan), ...req.body };
  const error = validatePlan(merged);
  if (error) return res.status(400).json({ message: error });

  await plan.update({
    title: merged.title.trim(),
    startYear: Number(merged.startYear),
    endYear: Number(merged.endYear),
    vision: merged.vision?.trim() || null,
    remarks: merged.remarks?.trim() || null,
  });

  res.json(serializePlan(await DevelopmentPlan.findByPk(plan.id, planIncludes)));
};

// Adoption is what turns a drafted plan into the document everything else
// cites. It supersedes any other plan whose horizon overlaps, because two
// simultaneously adopted plans covering the same year would give a budget line
// two different authorities to trace to.
export const adoptPlan = async (req, res) => {
  const plan = await DevelopmentPlan.findByPk(req.params.id, planIncludes);
  if (!plan) return res.status(404).json({ message: "Development plan not found." });

  if (plan.status !== "draft") {
    return res.status(409).json({ message: `This plan is already "${plan.status}".` });
  }
  if (!req.body.resolutionNo?.trim()) {
    return res.status(400).json({ message: "The adopting resolution number is required." });
  }
  if ((plan.goals ?? []).length === 0) {
    return res.status(409).json({ message: "A plan with no goals cannot be adopted." });
  }

  await DevelopmentPlan.update(
    { status: "superseded" },
    {
      where: {
        id: { [Op.ne]: plan.id },
        status: "adopted",
        startYear: { [Op.lte]: plan.endYear },
        endYear: { [Op.gte]: plan.startYear },
      },
    }
  );

  await plan.update({
    status: "adopted",
    resolutionNo: req.body.resolutionNo.trim(),
    adoptedAt: req.body.adoptedAt ?? new Date().toISOString().slice(0, 10),
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.CDP_ADOPTED,
    entityRef: "developmentPlan",
    entityId: plan.id,
    summary: `${plan.title} adopted under ${plan.resolutionNo}`,
    afterState: { status: "adopted", resolutionNo: plan.resolutionNo, goals: plan.goals.length },
  });

  res.json(serializePlan(await DevelopmentPlan.findByPk(plan.id, planIncludes)));
};

// ── Goals ────────────────────────────────────────────────────────────────────
const validateGoal = (payload) => {
  if (!payload.title?.trim()) return "A goal title is required.";
  if (!SECTORS.includes(payload.sector)) return "A valid development sector is required.";
  return null;
};

export const createGoal = async (req, res) => {
  const plan = await DevelopmentPlan.findByPk(req.params.id);
  if (!plan) return res.status(404).json({ message: "Development plan not found." });
  if (plan.status === "superseded") {
    return res.status(409).json({ message: "A superseded plan cannot take new goals." });
  }

  const error = validateGoal(req.body);
  if (error) return res.status(400).json({ message: error });

  const goal = await DevelopmentGoal.create({
    developmentPlanId: plan.id,
    sector: req.body.sector,
    subsector: req.body.subsector?.trim() || null,
    title: req.body.title.trim(),
    description: req.body.description?.trim() || null,
  });

  res.status(201).json(serializeGoal(goal));
};

export const updateGoal = async (req, res) => {
  const goal = await DevelopmentGoal.findByPk(req.params.goalId);
  if (!goal) return res.status(404).json({ message: "Goal not found." });

  const merged = { ...serializeGoal(goal), ...req.body };
  const error = validateGoal(merged);
  if (error) return res.status(400).json({ message: error });

  await goal.update({
    sector: merged.sector,
    subsector: merged.subsector?.trim() || null,
    title: merged.title.trim(),
    description: merged.description?.trim() || null,
    status: ["active", "achieved", "dropped"].includes(merged.status) ? merged.status : goal.status,
  });

  res.json(serializeGoal(goal));
};

// ── The Mayor's priorities (step 2) ──────────────────────────────────────────
// Set as a whole list for a fiscal year rather than one goal at a time. The
// ranking is only meaningful as a set, and a per-goal toggle would let two
// goals hold rank 1 — which is the kind of quiet inconsistency that makes a
// "top three priorities" report untrustworthy.
export const setPriorities = async (req, res) => {
  const fiscalYear = Number(req.body.fiscalYear);
  if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) {
    return res.status(400).json({ message: "A valid fiscal year is required." });
  }

  const goalIds = Array.isArray(req.body.goalIds) ? req.body.goalIds.map(Number).filter(Boolean) : [];
  if (goalIds.length === 0) {
    return res.status(400).json({ message: "Select at least one goal to prioritise." });
  }
  if (new Set(goalIds).size !== goalIds.length) {
    return res.status(400).json({ message: "The same goal appears more than once in the priority list." });
  }

  const goals = await DevelopmentGoal.findAll({
    where: { id: { [Op.in]: goalIds } },
    include: [{ model: DevelopmentPlan, as: "plan" }],
  });
  if (goals.length !== goalIds.length) {
    return res.status(400).json({ message: "One or more of those goals does not exist." });
  }

  // Priorities are set against an adopted plan. Prioritising goals in a draft
  // would let the executive commit the year to objectives the Sanggunian has
  // not adopted.
  const notAdopted = goals.find((goal) => goal.plan?.status !== "adopted");
  if (notAdopted) {
    return res.status(409).json({
      message: `"${notAdopted.title}" belongs to a plan that has not been adopted. Priorities are set against an adopted development plan.`,
    });
  }

  // Clear the previous year's set first, so re-running this is a replacement
  // rather than an accumulation.
  await DevelopmentGoal.update(
    { isMayorPriority: false, priorityRank: null, priorityFiscalYear: null },
    { where: { priorityFiscalYear: fiscalYear } }
  );

  for (const [index, goalId] of goalIds.entries()) {
    await DevelopmentGoal.update(
      {
        isMayorPriority: true,
        priorityRank: index + 1,
        priorityFiscalYear: fiscalYear,
        prioritisedAt: new Date(),
        prioritisedById: req.currentUser.id,
      },
      { where: { id: goalId } }
    );
  }

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.PRIORITIES_SET,
    entityRef: "developmentPlan",
    entityId: goals[0].developmentPlanId,
    summary: `${goalIds.length} priority goal(s) set for FY ${fiscalYear}`,
    afterState: {
      fiscalYear,
      priorities: goalIds.map((id, index) => ({
        rank: index + 1,
        title: goals.find((goal) => goal.id === id)?.title ?? null,
      })),
    },
  });

  // The Planning Office builds the investment program from these, so it is told
  // rather than left to check.
  await notifyByPermission("planning.manageAip", {
    type: NOTIFICATION_EVENTS.AIP_STATUS,
    title: `Mayor's priorities set for FY ${fiscalYear}`,
    body: `${goalIds.length} goal(s) prioritised. The investment program can now be prepared against them.`,
    link: "/planning/investment-program",
    refEntity: "developmentPlan",
    refId: goals[0].developmentPlanId,
    severity: "info",
  });

  const refreshed = await DevelopmentGoal.findAll({
    where: { priorityFiscalYear: fiscalYear },
    include: [{ model: User, as: "prioritisedBy", attributes: ["id", "name"] }],
    order: [["priorityRank", "ASC"]],
  });

  res.json(refreshed.map(serializeGoal));
};

// ── Annual Investment Program (step 3) ───────────────────────────────────────
const serializeAipEntry = (entry) => ({
  id: entry.id,
  investmentProgramId: entry.investmentProgramId,
  reference: entry.reference,
  title: entry.title,
  description: entry.description,
  expectedOutput: entry.expectedOutput,
  expenseClass: entry.expenseClass,
  expenseClassLabel: EXPENSE_CLASS_LABELS[entry.expenseClass],
  fund: entry.fund,
  fundLabel: FUND_LABELS[entry.fund],
  papCode: entry.papCode,
  estimatedCost: num(entry.estimatedCost),
  startQuarter: entry.startQuarter,
  endQuarter: entry.endQuarter,
  status: entry.status,
  remarks: entry.remarks,
  developmentGoalId: entry.developmentGoalId,
  goalTitle: entry.goal?.title ?? null,
  goalSector: entry.goal?.sector ?? null,
  isMayorPriority: entry.goal?.isMayorPriority ?? false,
  priorityRank: entry.goal?.priorityRank ?? null,
  implementingUnitId: entry.implementingUnitId,
  implementingUnitCode: entry.implementingUnit?.code ?? null,
  implementingUnitName: entry.implementingUnit?.name ?? null,
});

const aipIncludes = {
  include: [
    {
      model: AipEntry,
      as: "entries",
      include: [
        { model: DevelopmentGoal, as: "goal" },
        { model: Department, as: "implementingUnit" },
      ],
    },
    { model: DevelopmentPlan, as: "plan", attributes: ["id", "title", "status"] },
    { model: User, as: "preparedBy", attributes: ["id", "name"] },
  ],
};

const serializeProgram = (program) => {
  const entries = (program.entries ?? []).map(serializeAipEntry);
  return {
    id: program.id,
    fiscalYear: program.fiscalYear,
    title: program.title,
    status: program.status,
    endorsedAt: program.endorsedAt,
    adoptedAt: program.adoptedAt,
    resolutionNo: program.resolutionNo,
    returnRemarks: program.returnRemarks,
    remarks: program.remarks,
    developmentPlanId: program.developmentPlanId,
    planTitle: program.plan?.title ?? null,
    preparedByName: program.preparedBy?.name ?? null,
    editable: isEditable(program.status),
    entries,
    totalEstimatedCost: entries
      .filter((entry) => entry.status === "planned")
      .reduce((sum, entry) => sum + entry.estimatedCost, 0),
  };
};

export const listPrograms = async (req, res) => {
  const where = {};
  if (Number.isFinite(Number(req.query.fiscalYear))) where.fiscalYear = Number(req.query.fiscalYear);
  if (req.query.status) where.status = req.query.status;

  const programs = await InvestmentProgram.findAll({
    where,
    ...aipIncludes,
    order: [["fiscalYear", "DESC"]],
  });

  res.json(programs.map(serializeProgram));
};

export const createProgram = async (req, res) => {
  const fiscalYear = Number(req.body.fiscalYear);
  if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) {
    return res.status(400).json({ message: "A valid fiscal year is required." });
  }

  const existing = await InvestmentProgram.findOne({ where: { fiscalYear } });
  if (existing) {
    return res.status(409).json({ message: `An investment program for ${fiscalYear} already exists.` });
  }

  // The AIP is the year's slice of a development plan; without one there is
  // nothing for its projects to pursue.
  const plan = await DevelopmentPlan.findOne({
    where: {
      status: "adopted",
      startYear: { [Op.lte]: fiscalYear },
      endYear: { [Op.gte]: fiscalYear },
    },
  });
  if (!plan) {
    return res.status(409).json({
      message: `No adopted development plan covers ${fiscalYear}. Adopt one before preparing the investment program.`,
    });
  }

  const program = await InvestmentProgram.create({
    fiscalYear,
    title: req.body.title?.trim() || `Annual Investment Program ${fiscalYear}`,
    developmentPlanId: plan.id,
    remarks: req.body.remarks?.trim() || null,
    preparedById: req.currentUser.id,
    status: "draft",
  });

  res.status(201).json(serializeProgram(await InvestmentProgram.findByPk(program.id, aipIncludes)));
};

const validateAipEntry = (payload) => {
  if (!payload.title?.trim()) return "A project title is required.";

  const cost = Number(payload.estimatedCost);
  if (!Number.isFinite(cost) || cost <= 0) return "The estimated cost must be greater than 0.";

  if (payload.expenseClass && !EXPENSE_CLASSES.includes(payload.expenseClass)) {
    return "Unknown expense class.";
  }
  if (payload.fund && !FUNDS.includes(payload.fund)) return "Unknown fund.";

  const quarters = ["Q1", "Q2", "Q3", "Q4"];
  if (payload.startQuarter && payload.endQuarter) {
    if (quarters.indexOf(payload.endQuarter) < quarters.indexOf(payload.startQuarter)) {
      return "The end quarter cannot fall before the start quarter.";
    }
  }
  return null;
};

export const createAipEntry = async (req, res) => {
  const program = await InvestmentProgram.findByPk(req.params.id);
  if (!program) return res.status(404).json({ message: "Investment program not found." });
  if (!isEditable(program.status)) {
    return res.status(409).json({
      message: `This investment program is "${program.status}" and can no longer take new entries.`,
    });
  }

  const error = validateAipEntry(req.body);
  if (error) return res.status(400).json({ message: error });

  // The traceability rule the whole module exists for: a project has to pursue
  // a goal, and that goal has to belong to the plan this program implements.
  // The id is checked for being a number before the lookup — `findByPk(NaN)`
  // reaches the database and comes back as a 500, which reads to the user as a
  // system fault rather than a missing field.
  const goalId = Number(req.body.developmentGoalId);
  if (!Number.isInteger(goalId) || goalId <= 0) {
    return res.status(400).json({ message: "Select the development goal this project pursues." });
  }

  const goal = await DevelopmentGoal.findByPk(goalId);
  if (!goal) {
    return res.status(400).json({ message: "That development goal does not exist." });
  }
  if (goal.developmentPlanId !== program.developmentPlanId) {
    return res.status(400).json({
      message: "That goal belongs to a different development plan from the one this program implements.",
    });
  }

  if (req.body.implementingUnitId) {
    const department = await Department.findByPk(Number(req.body.implementingUnitId));
    if (!department) return res.status(400).json({ message: "That implementing office does not exist." });
  }

  const entry = await AipEntry.create({
    investmentProgramId: program.id,
    developmentGoalId: goal.id,
    reference: req.body.reference?.trim() || null,
    title: req.body.title.trim(),
    description: req.body.description?.trim() || null,
    expectedOutput: req.body.expectedOutput?.trim() || null,
    expenseClass: req.body.expenseClass ?? "mooe",
    fund: req.body.fund ?? "generalFund",
    papCode: req.body.papCode?.trim() || null,
    estimatedCost: Number(req.body.estimatedCost),
    startQuarter: req.body.startQuarter ?? "Q1",
    endQuarter: req.body.endQuarter ?? "Q4",
    implementingUnitId: req.body.implementingUnitId ? Number(req.body.implementingUnitId) : null,
    remarks: req.body.remarks?.trim() || null,
  });

  res.status(201).json(
    serializeAipEntry(
      await AipEntry.findByPk(entry.id, {
        include: [
          { model: DevelopmentGoal, as: "goal" },
          { model: Department, as: "implementingUnit" },
        ],
      })
    )
  );
};

export const updateAipEntry = async (req, res) => {
  const entry = await AipEntry.findByPk(req.params.entryId, {
    include: [
      { model: InvestmentProgram, as: "program" },
      { model: DevelopmentGoal, as: "goal" },
      { model: Department, as: "implementingUnit" },
    ],
  });
  if (!entry) return res.status(404).json({ message: "Investment program entry not found." });

  // Dropping a project after adoption is legitimate and has to stay possible —
  // that is what a supplemental or a re-programming does. Rewriting its cost
  // after adoption is not, because the budget was built on the old figure.
  const adopted = entry.program?.status === "adopted";
  if (adopted && Object.keys(req.body).some((key) => key !== "status" && key !== "remarks")) {
    return res.status(409).json({
      message:
        "This program has been adopted. An adopted entry may only be dropped or annotated, not re-costed.",
    });
  }

  const merged = { ...serializeAipEntry(entry), ...req.body };
  if (!adopted) {
    const error = validateAipEntry(merged);
    if (error) return res.status(400).json({ message: error });
  }

  await entry.update({
    ...(adopted
      ? {}
      : {
          reference: merged.reference?.trim() || null,
          title: merged.title.trim(),
          description: merged.description?.trim() || null,
          expectedOutput: merged.expectedOutput?.trim() || null,
          expenseClass: merged.expenseClass,
          fund: merged.fund,
          papCode: merged.papCode?.trim() || null,
          estimatedCost: Number(merged.estimatedCost),
          startQuarter: merged.startQuarter,
          endQuarter: merged.endQuarter,
          implementingUnitId: merged.implementingUnitId ? Number(merged.implementingUnitId) : null,
        }),
    status: ["planned", "dropped"].includes(merged.status) ? merged.status : entry.status,
    remarks: merged.remarks?.trim() || null,
  });

  res.json(
    serializeAipEntry(
      await AipEntry.findByPk(entry.id, {
        include: [
          { model: DevelopmentGoal, as: "goal" },
          { model: Department, as: "implementingUnit" },
        ],
      })
    )
  );
};

export const deleteAipEntry = async (req, res) => {
  const entry = await AipEntry.findByPk(req.params.entryId, {
    include: [{ model: InvestmentProgram, as: "program" }],
  });
  if (!entry) return res.status(404).json({ message: "Investment program entry not found." });

  if (!isEditable(entry.program?.status)) {
    return res.status(409).json({
      message: "This program is no longer a draft. Drop the entry instead of deleting it, so the record survives.",
    });
  }

  await entry.destroy();
  res.json({ deleted: true });
};

export const transitionProgram = async (req, res) => {
  const { action, remarks } = req.body;
  const program = await InvestmentProgram.findByPk(req.params.id, aipIncludes);
  if (!program) return res.status(404).json({ message: "Investment program not found." });

  const requiredPermission = permissionForTransition(action, program.status);
  if (!requiredPermission || !req.permissions.has(requiredPermission)) {
    return res.status(403).json({ message: "You do not have permission to perform this action." });
  }

  const result = evaluateTransition({ action, currentStatus: program.status, remarks });
  if (!result.ok) return res.status(409).json({ message: result.message });

  const previousStatus = program.status;

  if (action === "submit" && (program.entries ?? []).filter((e) => e.status === "planned").length === 0) {
    return res.status(409).json({ message: "An investment program with no live projects cannot be submitted." });
  }

  if (action === "adopt" && !req.body.resolutionNo?.trim()) {
    return res.status(400).json({ message: "The adopting resolution number is required." });
  }

  const changes = { status: result.to };
  if (action === "return") changes.returnRemarks = remarks.trim();
  if (action === "submit") changes.returnRemarks = null;
  if (action === "endorse") {
    changes.endorsedAt = new Date();
    changes.endorsedById = req.currentUser.id;
  }
  if (action === "adopt") {
    changes.adoptedAt = new Date();
    changes.resolutionNo = req.body.resolutionNo.trim();
  }

  await program.update(changes);

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.AIP_TRANSITION,
    entityRef: "investmentProgram",
    entityId: program.id,
    summary: `AIP ${program.fiscalYear}: ${action}`,
    beforeState: { status: previousStatus },
    afterState: {
      status: result.to,
      remarks: remarks?.trim() ?? null,
      ...(action === "adopt" ? { resolutionNo: changes.resolutionNo } : {}),
    },
  });

  // Once adopted, the offices that build budget proposals and PPMP lines from
  // it need to know it is available.
  if (result.to === "adopted") {
    await notifyByPermission("budget.proposeBudget", {
      type: NOTIFICATION_EVENTS.AIP_STATUS,
      title: `Investment program adopted for FY ${program.fiscalYear}`,
      body: "Budget proposals and PPMP lines may now be prepared against it.",
      link: "/planning/investment-program",
      refEntity: "investmentProgram",
      refId: program.id,
      severity: "success",
    });
  }

  res.json(serializeProgram(await InvestmentProgram.findByPk(program.id, aipIncludes)));
};

// Flat list of AIP entries, for the budget proposal and APP entry forms. Both
// need "which projects may I cite for this year?", and neither should have to
// walk the program object to answer it.
export const listAipEntries = async (req, res) => {
  const programWhere = {};
  if (Number.isFinite(Number(req.query.fiscalYear))) {
    programWhere.fiscalYear = Number(req.query.fiscalYear);
  }
  // Only an adopted program's projects may be cited downstream.
  if (req.query.adoptedOnly !== "false") programWhere.status = "adopted";

  const where = { status: "planned" };
  if (Number.isFinite(Number(req.query.implementingUnitId))) {
    where.implementingUnitId = Number(req.query.implementingUnitId);
  }

  const entries = await AipEntry.findAll({
    where,
    include: [
      { model: InvestmentProgram, as: "program", where: programWhere, required: true },
      { model: DevelopmentGoal, as: "goal" },
      { model: Department, as: "implementingUnit" },
    ],
    order: [["title", "ASC"]],
  });

  res.json(
    entries.map((entry) => ({
      ...serializeAipEntry(entry),
      fiscalYear: entry.program?.fiscalYear ?? null,
    }))
  );
};
