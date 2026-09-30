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
import { withAuditTransaction, AUDIT_ACTIONS } from "../services/auditLog.js";
import { actorAudit, workflowError } from "../services/workflowSupport.js";
import { assertPlanningPermission, planningSnapshot, lockPlanningCycle, lockPlan, lockProgram, lockEntry, goalProgressError, validateGoalLink, validateImplementingUnit } from "../services/planningRecords.js";
import { notifyByPermission, NOTIFICATION_EVENTS } from "../services/notifier.js";

// ── Development planning ─────────────────────────────────────────────────────
// Step 1 of the municipal process (the Comprehensive Development Plan), step 2
// (the Mayor's priorities) and step 3 (the Annual Investment Program).
//
// Everything here is upstream of money. Nothing in this file can authorise a
// peso — its job is to give the budget and the procurement plan something to be
// checked against.

const num = (value) => (value === null || value === undefined ? 0 : Number(value));
const textError = (payload, fields) => fields.find((key) => payload[key] != null && typeof payload[key] !== "string");
const nonempty = (value) => typeof value === "string" && Boolean(value.trim());
const auditPlanning = (req, audit, actionType, entityRef, row, before, summary, extra = {}) => audit(actorAudit(req, { actionType, entityRef, entityId: row.id, summary, beforeState: before, afterState: { ...planningSnapshot(row), ...extra } }));

// Every role with planning visibility reads the same development-plan record.
// The notification is supplementary to that shared source of truth: the
// frontend refreshes the planning screen while open, and the notification
// tells an off-page user that there is something new to review.
const notifyPlanningViewers = (plan, { type = NOTIFICATION_EVENTS.CDP_UPDATED, title, body }) =>
  notifyByPermission("planning.view", {
    type,
    title,
    body,
    link: "/planning",
    refEntity: "developmentPlan",
    refId: plan.id,
  });

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
  if (!nonempty(payload.title)) return "A title is required.";
  if (textError(payload, ["vision", "remarks"])) return "Plan vision and remarks must be text.";

  const start = Number(payload.startYear);
  const end = Number(payload.endYear);
  if (!Number.isInteger(start) || start < 2000 || start > 2100) return "A valid start year is required.";
  if (!Number.isInteger(end) || end < start || end > 2100) return "The end year must be between the start year and 2100.";
  // A "development plan" covering a single year is an investment program by
  // another name, and one covering a decade is not a plan anybody executes.
  if (end - start + 1 > 10) return "A development plan may not span more than ten years.";

  return null;
};

export const createPlan = async (req, res) => {
  assertPlanningPermission(req, "planning.manageCdp");
  const error = validatePlan(req.body);
  if (error) throw workflowError(error, 400);
  const initialGoals = normaliseInitialGoals(req.body.goals);
  if (initialGoals.error) throw workflowError(initialGoals.error, 400);
  const plan = await withAuditTransaction(async (transaction, audit) => {
    const created = await DevelopmentPlan.create({ title: req.body.title.trim(), startYear: Number(req.body.startYear), endYear: Number(req.body.endYear), vision: req.body.vision?.trim() || null, remarks: req.body.remarks?.trim() || null, status: "draft", preparedById: req.currentUser.id }, { transaction });
    await auditPlanning(req, audit, AUDIT_ACTIONS.CDP_RECORDED, "developmentPlan", created, null, "Development plan created as a draft.");
    for (const values of initialGoals.goals) {
      const goal = await DevelopmentGoal.create({ ...values, developmentPlanId: created.id }, { transaction });
      await auditPlanning(req, audit, "planning.goal.created", "developmentGoal", goal, null, "Development goal created with the draft plan.");
    }
    return created;
  });
  await notifyPlanningViewers(plan, { title: "New development plan recorded", body: `${plan.title} is available for planning review.` });
  res.status(201).json(serializePlan(await DevelopmentPlan.findByPk(plan.id, planIncludes)));
};

export const updatePlan = async (req, res) => {
  assertPlanningPermission(req, "planning.manageCdp");
  if (Object.hasOwn(req.body, "status") || Object.hasOwn(req.body, "goals")) throw workflowError("Use the plan adoption or goal actions to change workflow records.", 400);
  const plan = await withAuditTransaction(async (transaction, audit) => {
    const row = await lockPlan(req.params.id, transaction);
    if (row.status !== "draft") throw workflowError(`This plan is "${row.status}" and can no longer be edited. Supersede it with a new plan instead.`);
    const before = planningSnapshot(row), merged = { ...before, ...req.body };
    const error = validatePlan(merged);
    if (error) throw workflowError(error, 400);
    await row.update({ title: merged.title.trim(), startYear: Number(merged.startYear), endYear: Number(merged.endYear), vision: merged.vision?.trim() || null, remarks: merged.remarks?.trim() || null }, { transaction });
    if (row.changed() || JSON.stringify(before) !== JSON.stringify(planningSnapshot(row))) await auditPlanning(req, audit, "planning.cdp.updated", "developmentPlan", row, before, "Draft development plan updated.");
    return row;
  });
  await notifyPlanningViewers(plan, { title: "Development plan updated", body: `${plan.title} was updated and is available for review.` });
  res.json(serializePlan(await DevelopmentPlan.findByPk(plan.id, planIncludes)));
};

// Adoption is what turns a drafted plan into the document everything else
// cites. It supersedes any other plan whose horizon overlaps, because two
// simultaneously adopted plans covering the same year would give a budget line
// two different authorities to trace to.
export const adoptPlan = async (req, res) => {
  assertPlanningPermission(req, "planning.adoptAip");
  if (!nonempty(req.body.resolutionNo)) throw workflowError("The adopting resolution number is required.", 400);
  const adoptedAt = req.body.adoptedAt ?? new Date().toISOString().slice(0, 10);
  if (typeof adoptedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(adoptedAt) || !Number.isFinite(new Date(adoptedAt).getTime()) || new Date(adoptedAt).toISOString().slice(0, 10) !== adoptedAt) throw workflowError("Enter a valid adoption date.", 400);
  const plan = await withAuditTransaction(async (transaction, audit) => {
    await lockPlanningCycle(transaction);
    const row = await lockPlan(req.params.id, transaction);
    if (row.status !== "draft") throw workflowError(`This plan is already "${row.status}".`);
    if (!await DevelopmentGoal.count({ where: { developmentPlanId: row.id, status: "active" }, transaction })) throw workflowError("A plan with no active goals cannot be adopted.");
    const previous = await DevelopmentPlan.findAll({ where: { id: { [Op.ne]: row.id }, status: "adopted", startYear: { [Op.lte]: row.endYear }, endYear: { [Op.gte]: row.startYear } }, order: [["id", "ASC"]], transaction, lock: transaction.LOCK.UPDATE });
    for (const prior of previous) {
      const before = planningSnapshot(prior);
      await prior.update({ status: "superseded" }, { transaction });
      await auditPlanning(req, audit, "planning.cdp.superseded", "developmentPlan", prior, before, `Development plan superseded by adoption of ${row.title}.`, { supersededByPlanId: row.id, adoptingResolutionNo: req.body.resolutionNo.trim() });
    }
    const before = planningSnapshot(row);
    await row.update({ status: "adopted", resolutionNo: req.body.resolutionNo.trim(), adoptedAt }, { transaction });
    await auditPlanning(req, audit, AUDIT_ACTIONS.CDP_ADOPTED, "developmentPlan", row, before, "Development plan adoption recorded.", { supersededPlanIds: previous.map((prior) => prior.id) });
    return row;
  });
  await notifyPlanningViewers(plan, { type: NOTIFICATION_EVENTS.CDP_APPROVED, title: "Development plan approval recorded", body: `${plan.title} was recorded under Resolution No. ${plan.resolutionNo}.` });
  res.json(serializePlan(await DevelopmentPlan.findByPk(plan.id, planIncludes)));
};

// ── Goals ────────────────────────────────────────────────────────────────────
const validateGoal = (payload) => {
  if (!payload || typeof payload !== "object") return "A development goal is required.";
  if (typeof payload.title !== "string" || !payload.title.trim()) return "A goal title is required.";
  if (!SECTORS.includes(payload.sector)) return "A valid development sector is required.";
  if (payload.subsector != null && typeof payload.subsector !== "string") return "A goal programme must be text.";
  if (payload.description != null && typeof payload.description !== "string") return "A goal description must be text.";
  return null;
};

const normaliseInitialGoals = (payload) => {
  // Keep the existing add-goal endpoint and old API clients compatible: an
  // omitted `goals` property means an empty draft. Once a caller chooses to
  // send goals, though, an empty or invalid list is an actionable form error.
  if (payload === undefined) return { goals: [] };
  if (!Array.isArray(payload) || payload.length === 0) {
    return { error: "Add at least one development goal before creating the plan." };
  }

  const goals = [];
  for (const [index, goal] of payload.entries()) {
    const error = validateGoal(goal);
    if (error) return { error: `Goal ${index + 1}: ${error}` };
    goals.push({
      sector: goal.sector,
      subsector: goal.subsector?.trim() || null,
      title: goal.title.trim(),
      description: goal.description?.trim() || null,
    });
  }
  return { goals };
};

export const createGoal = async (req, res) => {
  assertPlanningPermission(req, "planning.manageCdp");
  const error = validateGoal(req.body);
  if (error) throw workflowError(error, 400);
  const result = await withAuditTransaction(async (transaction, audit) => {
    const plan = await lockPlan(req.params.id, transaction);
    if (plan.status !== "draft") throw workflowError("Goals may be added only to a draft development plan. An adopted or superseded plan's approved content is retained.");
    const goal = await DevelopmentGoal.create({ developmentPlanId: plan.id, sector: req.body.sector, subsector: req.body.subsector?.trim() || null, title: req.body.title.trim(), description: req.body.description?.trim() || null }, { transaction });
    await auditPlanning(req, audit, "planning.goal.created", "developmentGoal", goal, null, "Development goal added to the draft plan.");
    return { plan, goal };
  });
  await notifyPlanningViewers(result.plan, { title: "Development plan goal added", body: `A goal was added to ${result.plan.title}.` });
  res.status(201).json(serializeGoal(result.goal));
};

export const updateGoal = async (req, res) => {
  assertPlanningPermission(req, "planning.manageCdp");
  if (textError(req.body, ["progressRemarks", "remarks"])) throw workflowError("Goal progress remarks must be text.", 400);
  const result = await withAuditTransaction(async (transaction, audit) => {
    const found = await DevelopmentGoal.findByPk(req.params.goalId, { attributes: ["id", "developmentPlanId"], transaction });
    if (!found) throw workflowError("Goal not found.", 404);
    const plan = await lockPlan(found.developmentPlanId, transaction);
    const goal = await DevelopmentGoal.findByPk(found.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (plan.status === "superseded") throw workflowError("A superseded plan's goals are retained as historical records.");
    if (["isMayorPriority", "priorityRank", "priorityFiscalYear", "developmentPlanId"].some((key) => Object.hasOwn(req.body, key))) throw workflowError("Use the Mayor's priority action to change priority records; a goal cannot be moved to another plan.", 400);
    const before = planningSnapshot(goal), merged = { ...before, ...req.body };
    if (plan.status === "draft" && merged.status === "achieved") throw workflowError("Adopt the development plan before recording a goal as achieved.");
    const error = validateGoal(merged) || goalProgressError({ currentStatus: goal.status, nextStatus: merged.status, reason: req.body.progressRemarks ?? req.body.remarks });
    if (error) throw workflowError(error, 400);
    if (plan.status === "adopted" && ["sector", "subsector", "title", "description"].some((key) => Object.hasOwn(req.body, key) && (req.body[key] ?? null) !== (before[key] ?? null))) throw workflowError("An adopted goal's approved content cannot be rewritten. Record its progress status with a reason instead.");
    await goal.update({ sector: merged.sector, subsector: merged.subsector?.trim() || null, title: merged.title.trim(), description: merged.description?.trim() || null, status: merged.status }, { transaction });
    const progressRemarks = (req.body.progressRemarks ?? req.body.remarks)?.trim() || null;
    const progress = before.status !== goal.status || Boolean(progressRemarks);
    if (progress || JSON.stringify(before) !== JSON.stringify(planningSnapshot(goal))) await auditPlanning(req, audit, progress ? "planning.goal.progressUpdated" : "planning.goal.updated", "developmentGoal", goal, before, progress ? "Development goal progress recorded." : "Development goal updated.", { progressRemarks });
    return { plan, goal };
  });
  await notifyPlanningViewers(result.plan, { title: "Development plan goal updated", body: `A goal in ${result.plan.title} was updated.` });
  res.json(serializeGoal(result.goal));
};

// ── The Mayor's priorities (step 2) ──────────────────────────────────────────
// Set as a whole list for a fiscal year rather than one goal at a time. The
// ranking is only meaningful as a set, and a per-goal toggle would let two
// goals hold rank 1 — which is the kind of quiet inconsistency that makes a
// "top three priorities" report untrustworthy.
export const setPriorities = async (req, res) => {
  assertPlanningPermission(req, "planning.setPriorities");
  const fiscalYear = Number(req.body.fiscalYear);
  if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) throw workflowError("A valid fiscal year is required.", 400);
  const goalIds = Array.isArray(req.body.goalIds) ? req.body.goalIds.map(Number) : [];
  if (!goalIds.length || goalIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw workflowError("Select at least one valid goal to prioritise.", 400);
  if (new Set(goalIds).size !== goalIds.length) throw workflowError("The same goal appears more than once in the priority list.", 400);
  const planId = await withAuditTransaction(async (transaction, audit) => {
    await lockPlanningCycle(transaction);
    const goals = await DevelopmentGoal.findAll({ where: { id: { [Op.in]: goalIds } }, transaction, lock: transaction.LOCK.UPDATE });
    if (goals.length !== goalIds.length) throw workflowError("One or more selected goals does not exist.", 400);
    for (const goal of goals) {
      const plan = await lockPlan(goal.developmentPlanId, transaction);
      if (plan.status !== "adopted" || plan.startYear > fiscalYear || plan.endYear < fiscalYear || goal.status !== "active") throw workflowError("Priorities must be active goals from an adopted development plan that covers the selected fiscal year.");
    }
    const previous = await DevelopmentGoal.findAll({ where: { priorityFiscalYear: fiscalYear }, order: [["priorityRank", "ASC"]], transaction, lock: transaction.LOCK.UPDATE });
    if (previous.length === goalIds.length && previous.every((goal, index) => goal.id === goalIds[index] && goal.isMayorPriority && goal.priorityRank === index + 1)) return goals[0].developmentPlanId;
    const affected = new Map([...previous, ...goals].map((goal) => [goal.id, goal]));
    const before = [...affected.values()].map(planningSnapshot);
    for (const goal of affected.values()) {
      const prior = planningSnapshot(goal), index = goalIds.indexOf(goal.id);
      await goal.update(index < 0 ? { isMayorPriority: false, priorityRank: null, priorityFiscalYear: null, prioritisedAt: null, prioritisedById: null } : { isMayorPriority: true, priorityRank: index + 1, priorityFiscalYear: fiscalYear, prioritisedAt: new Date(), prioritisedById: req.currentUser.id }, { transaction });
      await auditPlanning(req, audit, "planning.goal.priorityChanged", "developmentGoal", goal, prior, index < 0 ? "Goal removed from the fiscal year's priority list." : "Mayor's priority and rank recorded.", { fiscalYear });
    }
    await audit(actorAudit(req, { actionType: AUDIT_ACTIONS.PRIORITIES_SET, entityRef: "developmentPlan", entityId: goals[0].developmentPlanId, summary: `Mayor's priorities set for FY ${fiscalYear}.`, beforeState: { fiscalYear, goals: before }, afterState: { fiscalYear, goals: [...affected.values()].map(planningSnapshot), goalIds } }));
    return goals[0].developmentPlanId;
  });
  await notifyByPermission("planning.manageAip", { type: NOTIFICATION_EVENTS.AIP_STATUS, title: `Mayor's priorities set for FY ${fiscalYear}`, body: `${goalIds.length} goal(s) prioritised. The investment program can now be prepared against them.`, link: "/planning/investment-program", refEntity: "developmentPlan", refId: planId, severity: "info" });
  const refreshed = await DevelopmentGoal.findAll({ where: { priorityFiscalYear: fiscalYear }, include: [{ model: User, as: "prioritisedBy", attributes: ["id", "name"] }], order: [["priorityRank", "ASC"]] });
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
  assertPlanningPermission(req, "planning.manageAip");
  const fiscalYear = Number(req.body.fiscalYear);
  if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) throw workflowError("A valid fiscal year is required.", 400);
  if (textError(req.body, ["title", "remarks"])) throw workflowError("The investment program title and remarks must be text.", 400);
  const program = await withAuditTransaction(async (transaction, audit) => {
    await lockPlanningCycle(transaction);
    if (await InvestmentProgram.findOne({ where: { fiscalYear }, transaction, lock: transaction.LOCK.UPDATE })) throw workflowError(`An investment program for ${fiscalYear} already exists.`);
    const plan = await DevelopmentPlan.findOne({ where: { status: "adopted", startYear: { [Op.lte]: fiscalYear }, endYear: { [Op.gte]: fiscalYear } }, transaction, lock: transaction.LOCK.UPDATE });
    if (!plan) throw workflowError(`No adopted development plan covers ${fiscalYear}. Adopt one before preparing the investment program.`);
    const row = await InvestmentProgram.create({ fiscalYear, title: req.body.title?.trim() || `Annual Investment Program ${fiscalYear}`, developmentPlanId: plan.id, remarks: req.body.remarks?.trim() || null, preparedById: req.currentUser.id, status: "draft" }, { transaction });
    await auditPlanning(req, audit, "planning.aip.created", "investmentProgram", row, null, "Annual Investment Program created as a draft.");
    return row;
  });
  res.status(201).json(serializeProgram(await InvestmentProgram.findByPk(program.id, aipIncludes)));
};

export const updateProgram = async (req, res) => {
  assertPlanningPermission(req, "planning.manageAip");
  if (Object.keys(req.body).some((key) => !["title", "remarks"].includes(key))) throw workflowError("Only the draft program title and remarks may be edited. Use the workflow actions to change status.", 400);
  const program = await withAuditTransaction(async (transaction, audit) => {
    const { program: row } = await lockProgram(req.params.id, transaction);
    if (!isEditable(row.status)) throw workflowError("The investment program must be a draft or returned for correction before its header can be edited.");
    const before = planningSnapshot(row), values = { title: req.body.title ?? row.title, remarks: Object.hasOwn(req.body, "remarks") ? req.body.remarks : row.remarks };
    if (!nonempty(values.title) || textError(values, ["remarks"])) throw workflowError("Enter a program title and text remarks.", 400);
    await row.update({ title: values.title.trim(), remarks: values.remarks?.trim() || null }, { transaction });
    if (JSON.stringify(before) !== JSON.stringify(planningSnapshot(row))) await auditPlanning(req, audit, "planning.aip.updated", "investmentProgram", row, before, "Draft Annual Investment Program header updated.");
    return row;
  });
  res.json(serializeProgram(await InvestmentProgram.findByPk(program.id, aipIncludes)));
};

const validateAipEntry = (payload) => {
  if (!nonempty(payload.title)) return "A project title is required.";
  if (textError(payload, ["reference", "description", "expectedOutput", "papCode", "remarks"])) return "Project descriptions, references and remarks must be text.";

  const cost = Number(payload.estimatedCost);
  if (typeof payload.estimatedCost === "boolean" || !Number.isFinite(cost) || cost <= 0 || cost > 9999999999999.99) return "The estimated cost must be a positive amount within the supported limit.";

  if (payload.expenseClass && !EXPENSE_CLASSES.includes(payload.expenseClass)) {
    return "Unknown expense class.";
  }
  if (payload.fund && !FUNDS.includes(payload.fund)) return "Unknown fund.";

  const quarters = ["Q1", "Q2", "Q3", "Q4"];
  if ([payload.startQuarter, payload.endQuarter].some((value) => value != null && !quarters.includes(value))) return "Choose a valid start and end quarter (Q1 to Q4).";
  if (payload.startQuarter && payload.endQuarter) {
    if (quarters.indexOf(payload.endQuarter) < quarters.indexOf(payload.startQuarter)) {
      return "The end quarter cannot fall before the start quarter.";
    }
  }
  return null;
};

export const createAipEntry = async (req, res) => {
  assertPlanningPermission(req, "planning.manageAip");
  const error = validateAipEntry(req.body);
  if (error) throw workflowError(error, 400);
  if (req.body.status != null && req.body.status !== "planned") throw workflowError("A new investment project starts as Planned.", 400);
  const entry = await withAuditTransaction(async (transaction, audit) => {
    const { program } = await lockProgram(req.params.id, transaction);
    if (!isEditable(program.status)) throw workflowError(`This investment program is "${program.status}" and cannot take new entries.`);
    const goal = await validateGoalLink(req.body.developmentGoalId, program, { transaction });
    const implementingUnitId = await validateImplementingUnit(req.body.implementingUnitId, { transaction });
    const reference = req.body.reference?.trim() || null;
    if (reference && await AipEntry.findOne({ where: { investmentProgramId: program.id, reference }, transaction })) throw workflowError("That project reference already exists in this investment program.");
    const row = await AipEntry.create({ investmentProgramId: program.id, developmentGoalId: goal.id, reference, title: req.body.title.trim(), description: req.body.description?.trim() || null, expectedOutput: req.body.expectedOutput?.trim() || null, expenseClass: req.body.expenseClass ?? "mooe", fund: req.body.fund ?? "generalFund", papCode: req.body.papCode?.trim() || null, estimatedCost: Number(req.body.estimatedCost), startQuarter: req.body.startQuarter ?? "Q1", endQuarter: req.body.endQuarter ?? "Q4", implementingUnitId, remarks: req.body.remarks?.trim() || null }, { transaction });
    await auditPlanning(req, audit, "planning.aipEntry.created", "aipEntry", row, null, "Investment project added to the draft Annual Investment Program.", { fiscalYear: program.fiscalYear });
    return row;
  });
  res.status(201).json(serializeAipEntry(await AipEntry.findByPk(entry.id, { include: [{ model: DevelopmentGoal, as: "goal" }, { model: Department, as: "implementingUnit" }] })));
};

export const updateAipEntry = async (req, res) => {
  assertPlanningPermission(req, "planning.manageAip");
  const entry = await withAuditTransaction(async (transaction, audit) => {
    const { entry: row, program } = await lockEntry(req.params.entryId, transaction);
    const adopted = program.status === "adopted";
    if (!adopted && !isEditable(program.status)) throw workflowError("This investment program is under review. Return it to the Planning Office before changing its projects.");
    if (adopted && Object.keys(req.body).some((key) => !["status", "remarks"].includes(key))) throw workflowError("An adopted entry may only be dropped or annotated; its approved cost and content are locked.");
    if (Object.hasOwn(req.body, "investmentProgramId")) throw workflowError("An investment project cannot be moved to another program.", 400);
    const before = planningSnapshot(row), merged = { ...before, ...req.body };
    if (!["planned", "dropped"].includes(merged.status)) throw workflowError("Choose Planned or Dropped for the investment project.", 400);
    if (merged.status !== row.status && !nonempty(req.body.remarks)) throw workflowError("Record the reason for changing the investment project's status.", 400);
    if (adopted && row.status === "dropped" && merged.status === "planned") throw workflowError("A dropped adopted project cannot be silently reinstated. Record it through an authorized reprogramming process.");
    if (textError(merged, ["remarks"])) throw workflowError("Project remarks must be text.", 400);
    const values = { status: merged.status, remarks: merged.remarks?.trim() || null };
    if (!adopted) {
      const error = validateAipEntry(merged);
      if (error) throw workflowError(error, 400);
      const goal = await validateGoalLink(merged.developmentGoalId, program, { transaction, allowInactive: merged.status === "dropped" });
      const implementingUnitId = await validateImplementingUnit(merged.implementingUnitId, { transaction });
      const reference = merged.reference?.trim() || null;
      if (reference && await AipEntry.findOne({ where: { investmentProgramId: program.id, reference, id: { [Op.ne]: row.id } }, transaction })) throw workflowError("That project reference already exists in this investment program.");
      Object.assign(values, { developmentGoalId: goal.id, reference, title: merged.title.trim(), description: merged.description?.trim() || null, expectedOutput: merged.expectedOutput?.trim() || null, expenseClass: merged.expenseClass, fund: merged.fund, papCode: merged.papCode?.trim() || null, estimatedCost: Number(merged.estimatedCost), startQuarter: merged.startQuarter, endQuarter: merged.endQuarter, implementingUnitId });
    }
    await row.update(values, { transaction });
    if (JSON.stringify(before) !== JSON.stringify(planningSnapshot(row))) await auditPlanning(req, audit, before.status !== row.status ? "planning.aipEntry.statusChanged" : "planning.aipEntry.updated", "aipEntry", row, before, before.status !== row.status ? "Investment project status changed with a recorded reason." : "Investment project updated.", { fiscalYear: program.fiscalYear, programStatus: program.status });
    return row;
  });
  res.json(serializeAipEntry(await AipEntry.findByPk(entry.id, { include: [{ model: DevelopmentGoal, as: "goal" }, { model: Department, as: "implementingUnit" }] })));
};

export const deleteAipEntry = async (req, res) => {
  assertPlanningPermission(req, "planning.manageAip");
  await withAuditTransaction(async (transaction, audit) => {
    const { entry, program } = await lockEntry(req.params.entryId, transaction);
    if (!isEditable(program.status)) throw workflowError("This program is no longer a draft. Drop the entry instead of deleting it, so the record survives.");
    const before = planningSnapshot(entry);
    try { await entry.destroy({ transaction }); } catch (error) { if (error.name === "SequelizeForeignKeyConstraintError") throw workflowError("This investment project is linked to other records. Drop it instead of deleting it."); throw error; }
    await audit(actorAudit(req, { actionType: "planning.aipEntry.deleted", entityRef: "aipEntry", entityId: entry.id, summary: "Draft investment project deleted; its full previous record remains in the audit history.", beforeState: before, afterState: { deleted: true, deletedAt: new Date(), investmentProgramId: program.id, fiscalYear: program.fiscalYear } }));
  });
  res.json({ deleted: true });
};

export const transitionProgram = async (req, res) => {
  const { action, remarks } = req.body;
  const program = await withAuditTransaction(async (transaction, audit) => {
    const { program: row, plan } = await lockProgram(req.params.id, transaction);
    const requiredPermission = permissionForTransition(action, row.status);
    if (!requiredPermission) throw workflowError("This action is unavailable at the current investment-program stage.", 409);
    assertPlanningPermission(req, requiredPermission);
    const result = evaluateTransition({ action, currentStatus: row.status, remarks });
    if (!result.ok) throw workflowError(result.message);
    if (textError(req.body, ["remarks", "resolutionNo"])) throw workflowError("Remarks and resolution references must be text.", 400);
    if (action === "adopt" && !nonempty(req.body.resolutionNo)) throw workflowError("The adopting resolution number is required.", 400);
    if (action !== "return") {
      if (plan.status === "draft" || plan.startYear > row.fiscalYear || plan.endYear < row.fiscalYear) throw workflowError("This investment program must cite an adopted development plan covering its fiscal year.");
      const entries = await AipEntry.findAll({ where: { investmentProgramId: row.id, status: "planned" }, transaction, lock: transaction.LOCK.UPDATE });
      if (!entries.length) throw workflowError("An investment program with no live projects cannot advance.");
      for (const entry of entries) {
        const error = validateAipEntry(planningSnapshot(entry));
        if (error) throw workflowError(`${entry.title}: ${error}`, 400);
        await validateGoalLink(entry.developmentGoalId, row, { transaction });
        await validateImplementingUnit(entry.implementingUnitId, { transaction });
      }
    }
    const before = planningSnapshot(row), changes = { status: result.to };
    if (action === "return") Object.assign(changes, { returnRemarks: remarks.trim(), endorsedAt: null, endorsedById: null });
    if (action === "submit") changes.returnRemarks = null;
    if (action === "endorse") Object.assign(changes, { endorsedAt: new Date(), endorsedById: req.currentUser.id });
    if (action === "adopt") Object.assign(changes, { adoptedAt: new Date(), resolutionNo: req.body.resolutionNo.trim() });
    await row.update(changes, { transaction });
    await auditPlanning(req, audit, AUDIT_ACTIONS.AIP_TRANSITION, "investmentProgram", row, before, `AIP ${row.fiscalYear}: ${action}.`, { action, transitionRemarks: remarks?.trim() || null });
    return row;
  });
  if (program.status === "adopted") await notifyByPermission("budget.proposeBudget", { type: NOTIFICATION_EVENTS.AIP_STATUS, title: `Investment program adopted for FY ${program.fiscalYear}`, body: "Budget proposals and PPMP lines may now be prepared against it.", link: "/planning/investment-program", refEntity: "investmentProgram", refId: program.id, severity: "success" });
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
