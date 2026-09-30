import { Op } from "sequelize";
import { BudgetControlRequest, ProjectAllocation, BUDGET_CONTROL_KINDS, CLOSEOUT_CLASSIFICATIONS } from "../models/budgetControlModel.js";
import { Appropriation } from "../models/appropriationModel.js";
import { AppEntry } from "../models/appEntryModel.js";
import { User } from "../models/userModel.js";
import { withAuditTransaction } from "../services/auditLog.js";
import { actorAudit, workflowError } from "../services/workflowSupport.js";
import { lockAppropriationYear, recordState } from "../services/requisitionRecords.js";
import { executeBudgetControl, validateBudgetEvidence, validateBudgetIntent, money } from "../services/budgetControls.js";
import { transferableProjectBalance } from "../services/budgetControls.js";
import { projectFinancialPositions } from "../services/projectFinancials.js";
import { fiscalYearFilter } from "../services/financialCalculations.js";
import { Department } from "../models/departmentModel.js";
import { AipEntry } from "../models/investmentProgramModel.js";
import { DevelopmentGoal } from "../models/developmentPlanModel.js";
import { allocationBalanceFor } from "../services/budgetLedger.js";

const permission = (req, key) => { if (!req.permissions?.has(key)) throw workflowError("You do not have permission for this budget action.", 403); };
const values = (input) => {
  if (!BUDGET_CONTROL_KINDS.includes(input.kind)) throw workflowError("Choose a valid budget action.", 400);
  const fiscalYear = Number(input.fiscalYear);
  if (!["number", "string"].includes(typeof input.amount) || !Number.isFinite(Number(input.amount)) || Math.abs(Number(input.amount)) > 9999999999999.99) throw workflowError("Enter a valid financial amount.", 400);
  const amount = money(Number(input.amount));
  if (!Number.isInteger(fiscalYear) || fiscalYear < 2001 || fiscalYear > 2100) throw workflowError("Choose a valid fiscal year.", 400);
  if (!Number.isFinite(amount) || amount < 0 || (amount === 0 && !["closeout", "reenactment"].includes(input.kind))) throw workflowError("Enter a positive amount.", 400);
  const id = (value) => { if (value == null || value === "") return null; if (!Number.isSafeInteger(Number(value)) || Number(value) <= 0) throw workflowError("A valid record reference is required.", 400); return Number(value); };
  return { kind: input.kind, fiscalYear, amount, sourceProjectId: id(input.sourceProjectId), destinationProjectId: id(input.destinationProjectId), sourceAppropriationId: id(input.sourceAppropriationId), destinationAppropriationId: null,
    classification: input.classification || null, reason: String(input.reason ?? "").trim(), authorityReference: String(input.authorityReference ?? "").trim(), payload: input.payload && typeof input.payload === "object" && !Array.isArray(input.payload) ? input.payload : {} };
};

export const listBudgetControls = async (req, res) => {
  permission(req, "budget.view");
  const fiscalYear = fiscalYearFilter(req.query.fiscalYear);
  const where = fiscalYear === null ? {} : { fiscalYear };
  const [requests, allocations, projects, people, appropriations, departments, priorYearAppropriations] = await Promise.all([
    BudgetControlRequest.findAll({ where, order: [["createdAt", "DESC"]] }), ProjectAllocation.findAll({ where }),
    AppEntry.findAll({ where: { ...where, planCycle: "final", status: { [Op.in]: ["approved", "locked", "cancelled"] } }, attributes: ["id", "projectTitle", "fiscalYear", "appropriationId", "implementingUnitId", "status", "abc", "aipEntryId"] }),
    User.findAll({ attributes: ["id", "name"] }),
    Appropriation.findAll({ where, order: [["id", "ASC"]] }),
    Department.findAll({ attributes: ["id", "name"] }),
    fiscalYear === null ? [] : Appropriation.findAll({ where: { fiscalYear: fiscalYear - 1, status: "enacted", type: { [Op.in]: ["annual", "supplemental"] } }, order: [["id", "ASC"]] }),
  ]);
  const names = new Map(people.map((user) => [user.id, user.name]));
  const departmentNames = new Map(departments.map(row => [row.id, row.name]));
  const positions = await projectFinancialPositions(projects.map(row => row.id));
  const sourceById = new Map(appropriations.map(row => [row.id, row]));
  const enriched = [];
  for (const row of projects) {
    const source = sourceById.get(row.appropriationId);
    const aip = row.aipEntryId ? await AipEntry.findByPk(row.aipEntryId) : null;
    const goal = aip?.developmentGoalId ? await DevelopmentGoal.findByPk(aip.developmentGoalId) : null;
    enriched.push({ ...row.toJSON(), fund: source?.fund, expenseClass: source?.expenseClass, sector: goal?.sector ?? null, departmentId: source?.departmentId, departmentName: departmentNames.get(source?.departmentId), appropriationTitle: source?.title, appropriationStatus: source?.status, financials: positions.get(row.id), approvedTransferable: await transferableProjectBalance(row.id) });
  }
  const lines = [];
  for (const row of appropriations) lines.push({ ...row.toJSON(), departmentName: departmentNames.get(row.departmentId), ...await allocationBalanceFor(row.id) });
  res.json({ fiscalYear: fiscalYear ?? "all", kinds: BUDGET_CONTROL_KINDS, classifications: CLOSEOUT_CLASSIFICATIONS, requests: requests.map((row) => {
    const ownDraft = row.status === "draft" && row.requesterId === req.currentUser.id && req.permissions.has("budget.requestControl");
    const canDecide = row.status === "submitted" && row.requesterId !== req.currentUser.id && req.permissions.has("budget.approveControl");
    return { ...row.toJSON(), canEdit: ownDraft, canSubmit: ownDraft, canApprove: canDecide, canReject: canDecide, allowedActions: [...(ownDraft ? ["edit", "submit"] : []), ...(canDecide ? ["approve", "reject"] : [])], requesterName: names.get(row.requesterId), approverName: names.get(row.approverId), nextAction: row.status === "submitted" ? "Review documented budget action" : row.status === "draft" ? "Attach evidence and submit budget action" : null, responsibleRole: row.status === "submitted" ? "Head of Procuring Entity / Mayor" : row.status === "draft" ? "Requesting Budget Officer" : null };
  }), allocations, projects: enriched, appropriations: lines, priorYearAppropriations });
};

export const createBudgetControl = async (req, res) => {
  permission(req, "budget.requestControl");
  const payload = values(req.body);
  const created = await withAuditTransaction(async (transaction, audit) => {
    const row = await BudgetControlRequest.create({ ...payload, requesterId: req.currentUser.id }, { transaction });
    await audit(actorAudit(req, { actionType: "budget.control.created", entityRef: "budgetControlRequest", entityId: row.id, summary: `Draft ${row.kind} request created`, afterState: recordState(row) }));
    return row;
  });
  res.status(201).json(created);
};

export const updateBudgetControl = async (req, res) => {
  permission(req, "budget.requestControl");
  const updated = await withAuditTransaction(async (transaction, audit) => {
    const row = await BudgetControlRequest.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!row) throw workflowError("Budget action not found.", 404);
    if (row.status !== "draft" || row.requesterId !== req.currentUser.id) throw workflowError("Only the requester may edit an unsubmitted draft.", 403);
    const beforeState = recordState(row);
    await row.update(values({ ...beforeState, ...req.body }), { transaction });
    await audit(actorAudit(req, { actionType: "budget.control.updated", entityRef: "budgetControlRequest", entityId: row.id, summary: `Draft ${row.kind} request updated`, beforeState, afterState: recordState(row) }));
    return row;
  });
  res.json(updated);
};

export const transitionBudgetControl = async (req, res) => {
  const action = req.body.action;
  if (!["submit", "approve", "reject"].includes(action)) throw workflowError("Unknown budget action.", 400);
  permission(req, action === "submit" ? "budget.requestControl" : "budget.approveControl");
  const observed = await BudgetControlRequest.findByPk(req.params.id);
  if (!observed) throw workflowError("Budget action not found.", 404);
  const updated = await withAuditTransaction(async (transaction, audit) => {
    const originalSource = observed.sourceAppropriationId ? await Appropriation.findByPk(observed.sourceAppropriationId, { attributes: ["fiscalYear"], transaction }) : null;
    const years = [...new Set([observed.fiscalYear, ...(observed.kind === "reenactment" ? [observed.fiscalYear - 1] : []), ...(originalSource ? [originalSource.fiscalYear] : [])])].sort((a, b) => a - b);
    for (const year of years) await lockAppropriationYear(year, transaction);
    // Financial mutations share appropriation -> project ordering with PRs.
    const projectIds = [observed.sourceProjectId, observed.destinationProjectId].filter(Boolean).sort((a, b) => a - b);
    const projects = projectIds.length ? await AppEntry.findAll({ where: { id: projectIds }, transaction }) : [];
    const appropriationIds = [...new Set([observed.sourceAppropriationId, ...projects.map((entry) => entry.appropriationId)].filter(Boolean))].sort((a, b) => a - b);
    if (appropriationIds.length) await Appropriation.findAll({ where: { id: appropriationIds }, order: [["id", "ASC"]], transaction, lock: transaction.LOCK.UPDATE });
    if (projectIds.length) await AppEntry.findAll({ where: { id: projectIds }, order: [["id", "ASC"]], transaction, lock: transaction.LOCK.UPDATE });
    const row = await BudgetControlRequest.findByPk(observed.id, { transaction, lock: transaction.LOCK.UPDATE });
    const beforeState = recordState(row);
    if (row.updatedAt.getTime() !== observed.updatedAt.getTime() || ["fiscalYear", "kind", "sourceProjectId", "destinationProjectId", "sourceAppropriationId"].some(key => row[key] !== observed[key])) throw workflowError("The request changed; reload it before acting.");
    if (action === "submit") {
      if (row.status !== "draft" || row.requesterId !== req.currentUser.id) throw workflowError("Only the requester may submit this draft.", 403);
      const evidence = await validateBudgetEvidence(row, transaction);
      if (["allocation", "closeout", "transfer"].includes(row.kind) && !row.sourceProjectId) throw workflowError("Select a source project.", 400);
      if (row.kind === "transfer" && !row.destinationProjectId) throw workflowError("Select a destination project.", 400);
      if (row.kind === "correction" && !row.sourceAppropriationId) throw workflowError("Select the appropriation to correct.", 400);
      await validateBudgetIntent(row, transaction);
      await row.update({ status: "submitted", requestedAt: new Date(), supportingDocumentIds: evidence.map((doc) => doc.id), payload: { ...row.payload, evidence } }, { transaction });
    } else {
      if (row.status !== "submitted") throw workflowError("Only a submitted request can receive a decision.");
      if (row.requesterId === req.currentUser.id) throw workflowError("An independent authorized officer must decide this request.", 403);
      const remarks = String(req.body.remarks ?? "").trim();
      if (remarks.length < 10) throw workflowError("Record the approval or rejection basis (at least 10 characters).", 400);
      if (action === "approve") {
        const evidence = await validateBudgetEvidence(row, transaction);
        if (JSON.stringify(evidence) !== JSON.stringify(row.payload.evidence)) throw workflowError("The supporting evidence changed after submission.");
        const balances = await executeBudgetControl(row, req.currentUser, transaction);
        await row.update({ beforeBalances: balances.before, afterBalances: balances.after }, { transaction });
      }
      await row.update({ status: action === "approve" ? "approved" : "rejected", approverId: req.currentUser.id, approvedAt: new Date(), decisionRemarks: remarks }, { transaction });
    }
    await audit(actorAudit(req, { actionType: `budget.control.${action}`, entityRef: "budgetControlRequest", entityId: row.id, summary: `${row.kind} request ${row.status}`, beforeState, afterState: recordState(row) }));
    return row;
  });
  res.json(updated);
};
