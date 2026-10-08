import { assertBacAction, committeeSnapshot } from "../services/procurementGovernance.js";
import { actorAudit, workflowError } from "../services/workflowSupport.js";
import { withAuditTransaction } from "../services/auditLog.js";
import { procurementAmountError } from "../services/procurementThresholds.js";
import { Op } from "sequelize";
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
import { ProjectAllocation } from "../models/budgetControlModel.js";
import { projectFinancialPosition } from "../services/projectFinancials.js";
import { cents, fiscalYearFilter } from "../services/financialCalculations.js";
import { nextSequenceNo, withSequenceRetry } from "../services/sequenceNo.js";
import { suggestProcurementMode } from "../services/procurementThresholds.js";
import {
  evaluateTransition,
  permissionForTransition,
  isEditable,
  LIVE_PR_STATUSES,
} from "../services/prWorkflow.js";
import { notifyUsers, notifyByPermission, NOTIFICATION_EVENTS } from "../services/notifier.js";
import { AUDIT_ACTIONS } from "../services/auditLog.js";
import { parseListParams, pageEnvelope, searchCondition } from "../services/listQuery.js";
import { PR_CENTRAL_PERMISSIONS, activeDepartment, assertDepartmentScope, hasCentralAccess, recordState } from "../services/requisitionRecords.js";
import { procurementAnswer, justificationError, validDateOnly } from "../services/procurementInformation.js";

// ── What a requester may actually write ──────────────────────────────────────
// Everything else on the model — status, the four certification stamps, the
// obligation fields, the determined mode, prNumber, totalAmount, appEntryId —
// is written by the state machine or derived from the line items, and must
// never be settable from a request body.
//
// This list exists because spreading `req.body` into `update()` let a requester
// holding only `pr.create` PATCH their own draft to status "approved" with all
// four signatures forged and the total raised past the APP balance, producing
// no obligation and no audit entry. A whitelist is the fix; a blacklist would
// have to be updated every time a column is added.
const EDITABLE_PR_FIELDS = ["purpose", "dateRequired", "isEmergency", "justification", "justificationStatus"];
const editableHeader = (body, { creating = false } = {}) => {
  const header = pickEditable(body, EDITABLE_PR_FIELDS);
  if (creating || Object.hasOwn(header, "isEmergency")) header.isEmergency = procurementAnswer(header.isEmergency, "Emergency purchase");
  if (header.justificationStatus === "") header.justificationStatus = null;
  return header;
};

const pickEditable = (body, allowed) =>
  Object.fromEntries(Object.entries(body ?? {}).filter(([key]) => allowed.includes(key)));

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
    { model: AppEntry, as: "appEntry", include: [{ model: Appropriation, as: "appropriation", attributes: ["fiscalYear"] }] },
    { model: Department, as: "department" },
    { model: User, as: "requester", attributes: ["id", "name"] },
    { model: User, as: "cashCertifiedBy", attributes: ["id", "name"] },
    { model: User, as: "mayorApprovedBy", attributes: ["id", "name"] },
    { model: User, as: "modeDeterminedBy", attributes: ["id", "name"] },
    { model: User, as: "appropriationCertifiedBy", attributes: ["id", "name"] },
    { model: User, as: "obligatedBy", attributes: ["id", "name"] },
    { model: ProcurementMode, as: "procurementMode" },
  ],
};

const serialize = (pr) => ({
  id: pr.id,
  prNumber: pr.prNumber,
  fiscalYear: pr.appEntry?.appropriation?.fiscalYear ?? pr.appEntry?.fiscalYear ?? null,
  purpose: pr.purpose,
  dateRequired: pr.dateRequired,
  isEmergency: pr.isEmergency,
  justification: pr.justification,
  justificationStatus: pr.justificationStatus,
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
  appropriationCertifiedAt: pr.appropriationCertifiedAt,
  appropriationCertifiedByName: pr.appropriationCertifiedBy?.name ?? null,
  fundsReservedAt: pr.fundsReservedAt,
  obligatedByName: pr.obligatedBy?.name ?? null,
  fundSource: pr.fundSource,
  fundSourceLabel: pr.fundSource ? FUND_LABELS[pr.fundSource] : null,

  procurementModeId: pr.procurementModeId,
  procurementModeKey: pr.procurementMode?.key ?? null,
  procurementModeName: pr.procurementMode?.name ?? null,
  procurementModeCitation: pr.procurementMode?.citation ?? null,
  modeDeterminedAt: pr.modeDeterminedAt,
  modeDeterminedByName: pr.modeDeterminedBy?.name ?? null,
  modeJustification: pr.modeJustification,
  modeJustificationStatus: pr.modeJustificationStatus,
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
  departmentName: pr.department?.name ?? null,
  plannedFundSource: pr.appEntry?.fundSource ?? null,
  requesterName: pr.requester?.name ?? null,
  lineItems: (pr.lineItems ?? []).map((item) => ({
    id: item.id,
    description: item.description,
    technicalSpecifications: item.technicalSpecifications,
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
export const remainingBalanceFor = async (appEntryId, { excludePrId, transaction } = {}) => {
  const appEntry = await AppEntry.findByPk(appEntryId, { transaction });
  if (!appEntry) return null;

  const where = { appEntryId, status: { [Op.in]: LIVE_PR_STATUSES } };
  if (excludePrId) where.id = { [Op.ne]: excludePrId };

  const committed = (await PrHeader.sum("totalAmount", { where, transaction })) ?? 0;

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
  const pr = await PrHeader.findByPk(req.params.id, { include: [{ model: AppEntry, as: "appEntry", attributes: ["category", "procurementMode", "justification"] }] });
  if (!pr) return res.status(404).json({ message: "Requisition not found." });

  const lgu = await getLguProfile();
  const suggestion = suggestProcurementMode(Number(pr.totalAmount), lgu, pr.appEntry?.category ?? "all");

  const modes = await ProcurementMode.findAll({ order: [["sortOrder", "ASC"]] });

  res.json({
    abc: Number(pr.totalAmount),
    plannedMode: pr.appEntry?.procurementMode ?? null,
    plannedJustification: pr.appEntry?.justification ?? null,
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
  const appEntry = await AppEntry.findByPk(Number(req.params.appEntryId));
  if (!appEntry) throw workflowError("APP entry not found.", 404);
  if (!req.permissions.has("audit.viewAll")) assertDepartmentScope(req, appEntry.implementingUnitId, PR_CENTRAL_PERMISSIONS, "requisitions");
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
    if (typeof raw?.description !== "string" || !raw.description.trim()) return { error: "Every line item needs a description." };
    if (raw.description.trim().length > 255) return { error: "Line item descriptions must be at most 255 characters; use technical specifications for longer details." };
    if (raw.technicalSpecifications != null && (typeof raw.technicalSpecifications !== "string" || raw.technicalSpecifications.length > 8000)) return { error: "Technical specifications must be text of at most 8000 characters." };

    const quantity = Number(raw.quantity);
    const unitCost = Number(raw.unitCost);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { error: `Quantity for "${raw.description}" must be greater than 0.` };
    }
    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      return { error: `Unit cost for "${raw.description}" must be greater than 0.` };
    }

    const hasUsefulLifeOverOneYear = procurementAnswer(raw.hasUsefulLifeOverOneYear, `Useful life for ${raw.description}`);

    // Section 5.3: estimated costs are validated and summed automatically —
    // the client never supplies the line total. The asset class is derived the
    // same way and for the same reason: it decides which expense class the
    // purchase may be charged to, so it must not be assertable from the form.
    items.push({
      description: raw.description.trim(),
      technicalSpecifications: raw.technicalSpecifications?.trim() || null,
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

const validateHeader = ({ purpose, dateRequired, isEmergency, justification, justificationStatus }, { submitting }) => {
  if (!validDateOnly(dateRequired)) return "Enter a valid date required.";
  if (submitting && (typeof purpose !== "string" || !purpose.trim())) return "Purchase requisition purpose is required before submission.";
  if (submitting && isEmergency == null) return "Select Yes or No for Emergency purchase before submission.";
  if (justification != null && typeof justification !== "string") return "Emergency justification must be text.";
  const reasonError = justificationError({ status: justificationStatus, text: justification, applicable: isEmergency === true, label: "Emergency justification" });
  if (reasonError) return reasonError;

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

const nextPrNumber = (transaction) =>
  nextSequenceNo(PrHeader, "prNumber", "PR", new Date().getFullYear(), { transaction });

export const listPrs = async (req, res) => {
  const { status, search } = req.query;
  const where = {};
  const year = fiscalYearFilter(req.query.fiscalYear);
  if (year !== null) {
    const fundedEntries = await AppEntry.findAll({
      attributes: ["id"],
      include: [{ model: Appropriation, as: "appropriation", attributes: [] }],
      where: { [Op.or]: [{ "$appropriation.fiscalYear$": year }, { appropriationId: null, fiscalYear: year }] },
      raw: true,
    });
    where.appEntryId = { [Op.in]: fundedEntries.map((entry) => entry.id) };
  }
  if (status) where.status = status;
  if (req.query.isEmergency === "true" || req.query.isEmergency === "false") {
    where.isEmergency = req.query.isEmergency === "true";
  }
  const searched = searchCondition(search, ["prNumber", "purpose"]);
  if (searched) Object.assign(where, searched);

  // A requester without a review permission sees only their department's.
  // Every office that has to act on the chain needs the whole queue: they sit
  // outside the requesting department, so the fallback filter below would
  // otherwise hand them nothing.
  const canSeeAll = [
    "pr.certify",
    "pr.obligate",
    "pr.certifyCash",
    "pr.review",
    "pr.determineMode",
    "pr.approve",
    "audit.viewAll",
  ].some((permission) => req.permissions.has(permission));
  if (!canSeeAll) {
    const departments = await Department.findAll({ where: { headUserId: req.currentUser.id }, attributes: ["id"] });
    where.departmentId = { [Op.in]: [...new Set([req.currentUser.departmentId, ...departments.map((row) => row.id)].filter(Boolean))] };
  }

  const paged = ["page", "pageSize", "sort"].some((key) => req.query[key] !== undefined);
  if (!paged) {
    const prs = await PrHeader.findAll({ where, ...withIncludes, order: [["createdAt", "DESC"]] });
    return res.json(prs.map(serialize));
  }
  const page = parseListParams(req.query, {
    sorts: { prNumber: "prNumber", dateRequired: "dateRequired", totalAmount: "totalAmount", status: "status", createdAt: "createdAt" },
    defaultSort: { field: "createdAt", direction: "desc" },
  });
  const { count, rows } = await PrHeader.findAndCountAll({ where, ...withIncludes, ...page, distinct: true });
  res.json(pageEnvelope({ rows: rows.map(serialize), total: count, page: page.page, pageSize: page.pageSize }));
};

const prState = (pr) => ({ ...recordState(pr), lineItems: (pr.lineItems ?? []).map(recordState) });
const approvedApp = (app) => {
  if (!app || !["approved", "locked"].includes(app.status)) throw workflowError("The linked APP entry must be approved first.", 400);
  if (app.planCycle === "indicative") throw workflowError("Finalise the indicative APP against the enacted appropriation before raising or submitting a requisition. Use the EPA workflow for authorized early procurement.");
};

const lockedApp = async (observed, transaction) => {
  if (!observed) return null;
  if (observed.appropriationId) await Appropriation.findByPk(observed.appropriationId, { transaction, lock: transaction.LOCK.UPDATE });
  const app = await AppEntry.findByPk(observed.id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!app || app.appropriationId !== observed.appropriationId) throw workflowError("The linked plan's funding changed. Reload before continuing.");
  return app;
};

const validateRequisition = async (header, app, items, total, { transaction, excludePrId, submitting = false } = {}) => {
  approvedApp(app);
  const error = validateHeader(header, { submitting });
  if (error) throw workflowError(error, 400);
  if (!items.length || !Number.isFinite(Number(total)) || Number(total) <= 0) throw workflowError("At least one valid requisition line item is required.", 400);
  if (submitting && items.some((item) => item.hasUsefulLifeOverOneYear == null)) throw workflowError("Select Yes or No for useful life on every line item before submission.", 400);
  const appropriation = app.appropriationId ? await Appropriation.findByPk(app.appropriationId, { transaction }) : null;
  const classError = expenseClassMismatch(items, appropriation?.expenseClass);
  if (classError) throw workflowError(classError, 400);
  if (appropriation?.departmentId && Number(appropriation.departmentId) !== Number(app.implementingUnitId)) throw workflowError("The appropriation belongs to another department.", 400);
  const balance = await remainingBalanceFor(app.id, { excludePrId, transaction });
  if (Number(total) > balance.remaining) throw workflowError(`The requisition total exceeds the APP entry's remaining balance of ${balance.remaining.toLocaleString()}.`, 409, { balance });
};

export const createPr = async (req, res) => {
  const observed = await AppEntry.findByPk(req.body?.appEntryId);
  if (!observed) throw workflowError("A linked approved APP entry is required.", 400);
  assertDepartmentScope(req, observed.implementingUnitId, PR_CENTRAL_PERMISSIONS, "requisitions");
  const header = editableHeader(req.body, { creating: true });
  const computed = computeLineItems(req.body.lineItems, await getLguProfile());
  if (computed.error) throw workflowError(computed.error, 400);
  const created = await withSequenceRetry(() => withAuditTransaction(async (transaction, audit) => {
    const app = await lockedApp(observed, transaction);
    assertDepartmentScope(req, app.implementingUnitId, PR_CENTRAL_PERMISSIONS, "requisitions");
    await activeDepartment(app.implementingUnitId, { transaction });
    await validateRequisition(header, app, computed.items, computed.total, { transaction });
    const pr = await PrHeader.create({ ...header, prNumber: await nextPrNumber(transaction), appEntryId: app.id, requesterId: req.currentUser.id,
      departmentId: app.implementingUnitId, totalAmount: computed.total, status: "draft" }, { transaction });
    pr.lineItems = await PrLineItem.bulkCreate(computed.items.map((item) => ({ ...item, prHeaderId: pr.id })), { transaction });
    await audit(actorAudit(req, { actionType: "pr.created", entityRef: "pr", entityId: pr.id, summary: `${pr.prNumber}: requisition created`, beforeState: null, afterState: prState(pr) }));
    return pr;
  }));
  res.status(201).json(serialize(await PrHeader.findByPk(created.id, withIncludes)));
};

export const updatePr = async (req, res) => {
  const observed = await PrHeader.findByPk(req.params.id, withIncludes);
  if (!observed) throw workflowError("Requisition not found.", 404);
  const header = editableHeader(req.body);
  let computed;
  if (Object.hasOwn(req.body, "lineItems")) {
    computed = computeLineItems(req.body.lineItems, await getLguProfile());
    if (computed.error) throw workflowError(computed.error, 400);
  }
  await withAuditTransaction(async (transaction, audit) => {
    const app = await lockedApp(observed.appEntry, transaction);
    const pr = await PrHeader.findByPk(observed.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (pr.appEntryId !== observed.appEntryId) throw workflowError("The linked plan changed. Reload the requisition.");
    if (!isEditable(pr.status)) throw workflowError(`This requisition is in "${pr.status}" and can no longer be edited.`);
    assertDepartmentScope(req, pr.departmentId, PR_CENTRAL_PERMISSIONS, "requisitions");
    if (app) assertDepartmentScope(req, app.implementingUnitId, PR_CENTRAL_PERMISSIONS, "requisitions");
    pr.lineItems = await PrLineItem.findAll({ where: { prHeaderId: pr.id }, transaction });
    const beforeState = prState(pr), merged = { ...beforeState, ...header };
    await validateRequisition(merged, app, computed?.items ?? pr.lineItems, computed?.total ?? pr.totalAmount, { transaction, excludePrId: pr.id });
    await pr.update({ ...header, departmentId: app.implementingUnitId, ...(computed ? { totalAmount: computed.total } : {}) }, { transaction });
    if (computed) {
      await PrLineItem.destroy({ where: { prHeaderId: pr.id }, transaction });
      pr.lineItems = await PrLineItem.bulkCreate(computed.items.map((item) => ({ ...item, prHeaderId: pr.id })), { transaction });
    }
    await audit(actorAudit(req, { actionType: "pr.updated", entityRef: "pr", entityId: pr.id, summary: `${pr.prNumber}: requisition updated`, beforeState, afterState: prState(pr) }));
  });
  res.json(serialize(await PrHeader.findByPk(observed.id, withIncludes)));
};

export const transitionPr = async (req, res) => {
  const { action, remarks } = req.body;
  const observed = await PrHeader.findByPk(req.params.id, withIncludes);
  if (!observed) throw workflowError("Requisition not found.", 404);
  const { pr, result, modeRecord } = await withSequenceRetry(() => withAuditTransaction(async (transaction, audit) => {
    const app = await lockedApp(observed.appEntry, transaction);
    const current = await PrHeader.findByPk(observed.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (current.appEntryId !== observed.appEntryId) throw workflowError("The linked plan changed. Reload the requisition.");
    current.appEntry = app;
    current.lineItems = await PrLineItem.findAll({ where: { prHeaderId: current.id }, transaction });
    const department = current.departmentId ? await Department.findByPk(current.departmentId, { transaction }) : null;
    const isDepartmentAction = action === "endorse" || (action === "return" && current.status === "pendingDepartmentHeadEndorsement");
    const isHead = department?.headUserId === req.currentUser.id;
    const permission = permissionForTransition(action, current.status);
    if (isDepartmentAction) {
      const scopedPermission = req.permissions.has("pr.endorse") && (Number(current.departmentId) === Number(req.currentUser.departmentId) || hasCentralAccess(req, PR_CENTRAL_PERMISSIONS));
      if (!isHead && !scopedPermission) throw workflowError("Only this department's head or an authorized officer may endorse or return its requisitions.", 403);
    } else if (!permission || !req.permissions.has(permission)) throw workflowError("You do not have permission to perform this action.", 403);
    if (action === "submit") assertDepartmentScope(req, current.departmentId, PR_CENTRAL_PERMISSIONS, "requisitions");
    if (["endorse", "certifyCash", "approve", "certify", "obligate", "determineMode"].includes(action) && current.requesterId === req.currentUser.id) throw workflowError("Another authorized officer must review or approve your requisition.", 403);
    const result = evaluateTransition({ action, currentStatus: current.status, remarks });
    if (!result.ok) throw workflowError(result.message);
    const beforeState = prState(current);
    const existingObligations = await Obligation.findAll({ where: { prHeaderId: current.id }, transaction });
    beforeState.obligations = existingObligations.map(recordState);
    if (action === "submit") {
      if (Number(current.departmentId) !== Number(app?.implementingUnitId)) throw workflowError("The requisition and linked APP belong to different departments. Correct the draft before submitting.");
      await validateRequisition(current, app, current.lineItems, current.totalAmount, { transaction, excludePrId: current.id, submitting: true });
    }
    let fundSource = null, obligationNumber = null;
    if (["certify", "obligate"].includes(action)) {
      if (!app?.appropriationId) throw workflowError("The linked APP must identify the appropriation before funds can be certified or obligated.");
      approvedApp(app);
      const appropriation = await Appropriation.findByPk(app.appropriationId, { transaction });
      if (!appropriation || appropriation.status !== "enacted") throw workflowError("Funds can only be certified or obligated against an enacted appropriation.");
      if (appropriation.fiscalYear !== app.fiscalYear) throw workflowError("The procurement project and its appropriation must have the same fiscal year.");
      if (appropriation.departmentId && Number(appropriation.departmentId) !== Number(current.departmentId)) throw workflowError("The appropriation is assigned to another department.");
      const allocation = await ProjectAllocation.findOne({ where: { appEntryId: app.id }, transaction, lock: transaction.LOCK.UPDATE });
      if (!allocation || allocation.status !== "active" || allocation.appropriationId !== appropriation.id || allocation.fiscalYear !== app.fiscalYear) throw workflowError("Approve an active project allocation from this appropriation before certifying or obligating this requisition.");
      const position = await projectFinancialPosition(app.id, { transaction });
      if (cents(current.totalAmount) + Math.max(cents(position.obligated), cents(position.grossExpenses), cents(position.certifiedGross)) > cents(allocation.amount)) throw workflowError("The requisition exceeds the project's approved available allocation. Obtain an authorized allocation adjustment first.", 409, { allocated: Number(allocation.amount), obligated: position.obligated });
      const balance = await availableFor(appropriation.id, { transaction });
      if (Number(current.totalAmount) > balance.available) throw workflowError(`The requisition exceeds the available appropriation balance of ${balance.available.toLocaleString()}.`, 409, { balance });
      const classError = expenseClassMismatch(current.lineItems, appropriation.expenseClass);
      if (classError) throw workflowError(classError, 400);
      fundSource = appropriation.fund;
      if (action === "obligate") {
        if (existingObligations.some((row) => row.status === "obligated")) throw workflowError("This requisition already has an active obligation.");
        obligationNumber = await nextObligationNo(appropriation.fiscalYear, transaction);
      }
    }
    let modeRecord = null, suggestion = null, bac = null;
    if (action === "determineMode") {
      const lgu = await getLguProfile();
      suggestion = suggestProcurementMode(Number(current.totalAmount), lgu, app?.category ?? "all");
      const chosenKey = req.body.procurementModeKey ?? app?.procurementMode ?? suggestion.suggested;
      if (/negotiated/i.test(chosenKey)) throw workflowError("Negotiated Procurement requires approved failures, eligibility review and BAC approval. Start it from procurement attempt history.");
      const amountIssue = procurementAmountError(Number(current.totalAmount), chosenKey, lgu, app?.category ?? "all");
      if (amountIssue) throw workflowError(amountIssue, 400);
      modeRecord = await ProcurementMode.findOne({ where: { key: chosenKey }, transaction });
      if (!modeRecord) throw workflowError(`Unknown procurement mode: ${chosenKey}.`, 400);
      const justificationApplies = Boolean(modeRecord.requiresJustification) || (chosenKey !== "competitiveBidding" && chosenKey !== suggestion.suggested) || (app?.procurementMode && app.procurementMode !== chosenKey);
      const reasonError = justificationError({ status: req.body.justificationStatus, text: req.body.justification, applicable: justificationApplies, label: "BAC mode determination justification" });
      if (reasonError) throw workflowError(reasonError, 400);
      if (modeRecord.requiresHopeApproval && !req.body.hopeApprovalReference?.trim()) throw workflowError("Record the required prior HoPE approval reference for this procurement mode.");
      bac = await assertBacAction(req, { transaction });
    }
    const changes = { status: result.to };
    if (action === "submit") Object.assign(changes, { returnRemarks: null, submittedAt: new Date() });
    if (action === "certifyCash") Object.assign(changes, { cashCertifiedAt: new Date(), cashCertifiedById: req.currentUser.id });
    if (action === "approve") Object.assign(changes, { mayorApprovedAt: new Date(), mayorApprovedById: req.currentUser.id });
    if (action === "certify") Object.assign(changes, { appropriationCertifiedAt: new Date(), appropriationCertifiedById: req.currentUser.id, fundSource });
    if (action === "obligate") Object.assign(changes, { fundsReservedAt: new Date(), obligatedById: req.currentUser.id });
    if (action === "determineMode") Object.assign(changes, { procurementModeId: modeRecord.id, modeDeterminedAt: new Date(), modeDeterminedById: req.currentUser.id,
      suggestedModeKey: suggestion.suggested, modeJustificationStatus: req.body.justificationStatus || null, modeJustification: req.body.justificationStatus === "notApplicable" ? null : req.body.justification?.trim() || `Determined per ${suggestion.citation}: ${suggestion.rationale}` });
    if (action === "return") {
      changes.returnRemarks = remarks.trim();
      for (const key of ["cashCertifiedAt", "cashCertifiedById", "mayorApprovedAt", "mayorApprovedById", "appropriationCertifiedAt", "appropriationCertifiedById", "fundsReservedAt", "obligatedById", "fundSource", "procurementModeId", "modeDeterminedAt", "modeDeterminedById", "suggestedModeKey", "modeJustification", "modeJustificationStatus"]) changes[key] = null;
      for (const obligation of existingObligations.filter((row) => row.status === "obligated")) {
        const before = recordState(obligation);
        await obligation.update({ status: "cancelled", cancelledAt: new Date(), cancellationReason: `${current.prNumber} returned: ${remarks.trim()}` }, { transaction });
        await audit(actorAudit(req, { actionType: "budget.obligation.cancelled", entityRef: "obligation", entityId: obligation.id, summary: `${obligation.obligationNo}: obligation cancelled on return`, beforeState: before, afterState: recordState(obligation) }));
      }
    }
    await current.update(changes, { transaction });
    if (action === "obligate") {
      const obligation = await Obligation.create({ obligationNo: obligationNumber, amount: current.totalAmount, status: "obligated", certifiedAt: new Date(), certifiedById: req.currentUser.id,
        particulars: current.purpose ?? current.prNumber, appropriationId: app.appropriationId, prHeaderId: current.id }, { transaction });
      await audit(actorAudit(req, { actionType: "budget.obligation.created", entityRef: "obligation", entityId: obligation.id, summary: `${obligation.obligationNo}: funds obligated`, beforeState: null, afterState: recordState(obligation) }));
    }
    const afterState = { ...prState(current), obligations: (await Obligation.findAll({ where: { prHeaderId: current.id }, transaction })).map(recordState), action,
      ...(bac ? { members: committeeSnapshot(bac), quorum: bac.quorum, hopeApprovalReference: req.body.hopeApprovalReference?.trim() ?? null } : {}) };
    await audit(actorAudit(req, { actionType: action === "determineMode" ? AUDIT_ACTIONS.PR_MODE_DETERMINED : AUDIT_ACTIONS.PR_TRANSITION, entityRef: "pr", entityId: current.id,
      summary: `${current.prNumber}: ${action}${obligationNumber ? ` (${obligationNumber})` : ""}`, beforeState, afterState }));
    if (bac) await audit(actorAudit(req, { actionType: "bac.modeDetermined", entityRef: "pr", entityId: current.id, summary: `${current.prNumber}: BAC determined procurement mode`, beforeState, afterState }));
    return { pr: current, result, modeRecord };
  }));
  const amount = Number(pr.totalAmount).toLocaleString();

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
    pendingAccountantObligation: {
      permission: "pr.obligate",
      title: `${pr.prNumber} awaiting obligation`,
      body: `₱${amount}, appropriation certified by the Budget Office. Obligate it and raise the ORS.`,
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
