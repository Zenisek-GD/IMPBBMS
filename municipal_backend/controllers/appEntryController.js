import { fiscalYearFilter } from "../services/financialCalculations.js";
import { Op } from "sequelize";
import { AppEntry, QUARTERS, PLAN_STAGE_LABELS, PLAN_CYCLE_LABELS } from "../models/appEntryModel.js";
import { Department } from "../models/departmentModel.js";
import { User } from "../models/userModel.js";
import { getLguProfile } from "../models/systemSettingModel.js";
import { suggestProcurementMode } from "../services/procurementThresholds.js";
import { Appropriation } from "../models/appropriationModel.js";
import { AipEntry, InvestmentProgram } from "../models/investmentProgramModel.js";
import { PrHeader } from "../models/prModel.js";
import { LIVE_PR_STATUSES } from "../services/prWorkflow.js";
import { programmedFor } from "../services/budgetLedger.js";
import {
  evaluateTransition,
  permissionForTransition,
  isEditable,
  RELEASED_APP_STATUSES,
} from "../services/appWorkflow.js";
import { notifyUsers, NOTIFICATION_EVENTS } from "../services/notifier.js";
import { AUDIT_ACTIONS, withAuditTransaction } from "../services/auditLog.js";
import { assertBacAction, committeeSnapshot } from "../services/procurementGovernance.js";
import { actorAudit, workflowError } from "../services/workflowSupport.js";
import { parseListParams, pageEnvelope, searchCondition } from "../services/listQuery.js";
import { APP_CENTRAL_PERMISSIONS, activeDepartment, assertDepartmentScope, recordState } from "../services/requisitionRecords.js";
import { justificationError } from "../services/procurementInformation.js";

// IRR Sec. 7.7 — the lump sum for foreseeable emergencies "shall not be more
// than four percent (4%) of the Procuring Entity's total appropriations for
// MOOE".
const CONTINGENCY_RATE = 0.04;

const serialize = (entry) => ({
  id: entry.id,
  projectTitle: entry.projectTitle,
  description: entry.description,
  categoryDetails: entry.categoryDetails,
  mfoId: entry.mfoId,
  papCode: entry.papCode,
  uacsCode: entry.uacsCode,
  category: entry.category,
  procurementMode: entry.procurementMode,
  abc: Number(entry.abc),
  unit: entry.unit,
  quantity: entry.quantity,
  fundSource: entry.fundSource,
  accountCode: entry.accountCode,
  targetStartQuarter: entry.targetStartQuarter,
  targetCompletionQuarter: entry.targetCompletionQuarter,
  justification: entry.justification,
  justificationStatus: entry.justificationStatus,
  fiscalYear: entry.fiscalYear,
  status: entry.status,
  planStage: entry.planStage,
  planStageLabel: PLAN_STAGE_LABELS[entry.planStage] ?? null,
  planCycle: entry.planCycle,
  planCycleLabel: PLAN_CYCLE_LABELS[entry.planCycle] ?? null,
  // IRR Sec. 7.7.2(i) — whether this project runs as an Early Procurement
  // Activity, i.e. everything short of award before the ordinance is enacted.
  earlyProcurement: entry.earlyProcurement,
  bidEvaluationCriteria: entry.bidEvaluationCriteria,
  procurementStrategy: entry.procurementStrategy,
  modeRecommendedAt: entry.modeRecommendedAt,
  modeRecommendationBasis: entry.modeRecommendationBasis,
  postedAt: entry.postedAt,
  gppbSubmittedAt: entry.gppbSubmittedAt,
  indicativeOriginId: entry.indicativeOriginId ?? null,
  returnRemarks: entry.returnRemarks,
  lockedAt: entry.lockedAt,
  implementingUnitId: entry.implementingUnitId,
  implementingUnitName: entry.implementingUnit?.name ?? null,
  implementingUnitCode: entry.implementingUnit?.code ?? null,
  createdByName: entry.createdBy?.name ?? null,
  editable: isEditable(entry.status),
  // The budget line this plan is charged against.
  appropriationId: entry.appropriationId ?? null,
  appropriationOrdinanceNo: entry.appropriation?.ordinanceNo ?? null,
  appropriationTitle: entry.appropriation?.title ?? null,
  appropriationExpenseClass: entry.appropriation?.expenseClass ?? null,
  // The investment-program project this procurement serves — the other half of
  // the authority: the appropriation says the money exists, this says it was
  // programmed for this purpose.
  aipEntryId: entry.aipEntryId ?? null,
  aipEntryTitle: entry.aipEntry?.title ?? null,
  expectedOutput: entry.aipEntry?.expectedOutput ?? null,
  revisionRemarks: entry.revisionRemarks,
  revisedAt: entry.revisedAt,
  cancelledAt: entry.cancelledAt,
});

const withIncludes = {
  include: [
    { model: Department, as: "implementingUnit" },
    { model: User, as: "createdBy", attributes: ["id", "name"] },
    { model: Appropriation, as: "appropriation" },
    { model: AipEntry, as: "aipEntry" },
  ],
};

// ── What an office may actually write on a plan line ─────────────────────────
// `status`, `planStage`, `lockedAt`, `revisedAt`, `cancelledAt` and the remarks
// fields all belong to the state machine. Spreading the request body let a
// requester holding only `app.create` PATCH a draft straight to
// status "locked" / planStage "finalApp", skipping consolidation, the Budget
// Officer's certification and the Mayor's approval in one call.
const EDITABLE_APP_FIELDS = [
  "projectTitle",
  "description",
  "categoryDetails",
  "mfoId",
  "papCode",
  "uacsCode",
  "category",
  "procurementMode",
  "abc",
  "unit",
  "quantity",
  "fundSource",
  "accountCode",
  "targetStartQuarter",
  "targetCompletionQuarter",
  "justification",
  "justificationStatus",
  "fiscalYear",
  "implementingUnitId",
  "appropriationId",
  "aipEntryId",
  // IRR Sec. 7.7 — the indicative cycle and the fields the Indicative APP is
  // required to carry.
  "planCycle",
  "earlyProcurement",
  "bidEvaluationCriteria",
  "procurementStrategy",
  "indicativeOriginId",
];

const pickEditable = (body, allowed) =>
  Object.fromEntries(Object.entries(body ?? {}).filter(([key]) => allowed.includes(key)));

// An APP entry is a plan to spend appropriated money. Before the appropriation
// register existed there was nothing to check that plan against, so the APP
// could plan more procurement than the LGU had budget for and nothing would
// object. Two things are verified here:
//
//   · the line exists and is enacted — a draft ordinance authorises nothing
//   · the ABC fits in what that line has not already been planned against
//
// Note this is *programmed* against, not *obligated* against. Planning and
// committing are different acts checked at different moments: this one guards
// the plan, and the Budget Officer's certification later guards the commitment.
const validateAppropriation = async (appropriationId, abc, { excludeAppEntryId, cycle = "final", fiscalYear, transaction } = {}) => {
  // ── The indicative cycle (IRR Sec. 7.7.1–7.7.2) ────────────────────────────
  // An indicative PPMP exists precisely because nothing has been appropriated
  // yet: it is prepared to SUPPORT the budget proposal. Requiring an enacted
  // appropriation here is what previously collapsed all three plan stages into
  // the post-enactment one and made the "indicative APP" indicative of nothing.
  //
  // The indicative line is still not unbounded — it is measured against the
  // office's budget proposal instead, one layer up the same chain.
  if (cycle === "indicative") {
    if (appropriationId) {
      return {
        error:
          "An indicative PPMP line is filed before the ordinance exists and must not cite an " +
          "appropriation. Cite the budget proposal line it supports instead.",
      };
    }
    return { balance: null };
  }

  if (!appropriationId) {
    return { error: "An appropriation line is required. A plan cannot be filed against no budget." };
  }

  const balance = await programmedFor(Number(appropriationId), { excludeAppEntryId, transaction });
  if (!balance) return { error: "That appropriation line does not exist." };

  if (balance.status !== "enacted") {
    return {
      error: `Ordinance ${balance.ordinanceNo} is "${balance.status}". Only an enacted appropriation can be planned against.`,
    };
  }

  if (Number(balance.fiscalYear) !== Number(fiscalYear)) {
    return { error: `Ordinance ${balance.ordinanceNo} is for FY ${balance.fiscalYear}, not FY ${fiscalYear}.` };
  }

  if (Number(abc) > balance.unprogrammed) {
    return {
      error:
        `An ABC of ₱${Number(abc).toLocaleString()} exceeds the ₱${balance.unprogrammed.toLocaleString()} ` +
        `still unprogrammed under ${balance.ordinanceNo} (₱${balance.amount.toLocaleString()} appropriated, ` +
        `₱${balance.programmed.toLocaleString()} already planned).`,
      balance,
    };
  }

  return { balance };
};

// The other half of the authority check. The appropriation says the money
// exists; the investment program says the municipality actually planned to
// spend it on this. Without both, an office could file a PPMP line for anything
// at all so long as some budget line had room — which is how an appropriation
// for a health centre ends up buying something else entirely.
const validateAipLink = async (aipEntryId, fiscalYear, { transaction } = {}) => {
  if (!aipEntryId) {
    return {
      error:
        "An investment program entry is required. A PPMP line must procure for a project the LGU programmed.",
    };
  }

  const aipEntry = await AipEntry.findByPk(Number(aipEntryId), {
    include: [{ model: InvestmentProgram, as: "program" }], transaction,
  });
  if (!aipEntry) return { error: "That investment program entry does not exist." };

  if (aipEntry.program?.status !== "adopted") {
    return { error: "That entry belongs to an investment program that has not been adopted." };
  }
  if (aipEntry.status !== "planned") {
    return { error: "That investment program entry has been dropped." };
  }
  if (fiscalYear && aipEntry.program.fiscalYear !== Number(fiscalYear)) {
    return {
      error: `That entry is from the ${aipEntry.program.fiscalYear} investment program, not ${fiscalYear}.`,
    };
  }

  return { aipEntry };
};

// Requisitions that are still live against this plan line. Reopening or
// cancelling a line that money has already been committed against would leave
// those requisitions charged to a plan that no longer exists.
const liveRequisitionsFor = (appEntryId, transaction) =>
  PrHeader.findAll({
    where: { appEntryId, status: { [Op.in]: LIVE_PR_STATUSES } },
    attributes: ["id", "prNumber", "status"], transaction,
  });

// Section 4.3 validation rules, enforced server-side.
const validateEntry = ({ fiscalYear, abc, targetStartQuarter, targetCompletionQuarter, procurementMode, justification, justificationStatus, projectTitle, category, categoryDetails }) => {
  if (typeof projectTitle !== "string" || !projectTitle.trim()) return "Project title is required.";
  if (!["goods", "infrastructure", "consulting"].includes(category)) return "Select a procurement category.";
  if (categoryDetails != null && (typeof categoryDetails !== "string" || categoryDetails.length > 255)) return "Category details must be text of at most 255 characters.";
  if (justification != null && typeof justification !== "string") return "The procurement mode justification must be text.";
  if (fiscalYear !== undefined && (!Number.isInteger(Number(fiscalYear)) || Number(fiscalYear) < 2000 || Number(fiscalYear) > 2100)) {
    return "A valid fiscal year is required.";
  }
  if (abc === undefined || abc === null || abc === "") return "ABC is required.";

  const numericAbc = Number(abc);
  if (!Number.isFinite(numericAbc)) return "ABC must be a finite number.";
  // Section 4.3: "ABC must be greater than 0."
  if (numericAbc <= 0) return "ABC must be greater than 0.";

  if (!QUARTERS.includes(targetStartQuarter)) return "Target start quarter is invalid.";
  if (!QUARTERS.includes(targetCompletionQuarter)) return "Target completion quarter is invalid.";

  // Section 4.3: start quarter must not be after the completion quarter.
  if (QUARTERS.indexOf(targetStartQuarter) > QUARTERS.indexOf(targetCompletionQuarter)) {
    return "Target start quarter must not be after the target completion quarter.";
  }

  // Section 4.3: alternative procurement modes require a justification.
  const reasonError = justificationError({ status: justificationStatus, text: justification, applicable: procurementMode && procurementMode !== "competitiveBidding", label: "Alternative procurement mode justification" });
  if (reasonError) return reasonError;

  return null;
};

// ── The mode on the plan, measured against the ceilings ──────────────────────
// IRR Sec. 7.7.2 makes the mode a required field of the Indicative APP and puts
// the recommendation with the BAC. The requesting office was choosing it here
// with nothing checking it against the Sec. 32/34 ceilings, and the committee
// later determined a mode again on the requisition with nothing reconciling the
// two — so the plan could advertise Competitive Bidding while the requisition
// was determined Small Value Procurement and no one would be told.
//
// This does not overrule the office: an alternative mode may be justified on
// grounds the ABC alone cannot express. It refuses only the silent mismatch.
const validateModeAgainstCeilings = async (entry) => {
  const mode = entry.procurementMode;
  if (!mode) return null;

  const lgu = await getLguProfile();
  const suggestion = suggestProcurementMode(Number(entry.abc), lgu, entry.category);

  if (mode === suggestion.suggested) return null;

  // Competitive Bidding is always lawfully available — it is the default mode
  // and narrowing downward is what the ceilings govern, never upward.
  if (mode === "competitiveBidding") return null;

  if (!entry.justification?.trim()) {
    return (
      `The ceilings indicate ${suggestion.suggested} for an ABC of ` +
      `₱${Number(entry.abc).toLocaleString()} (${suggestion.rationale}) but this line specifies ${mode}. ` +
      `Record why.`
    );
  }

  return null;
};

export const listAppEntries = async (req, res) => {
  const { fiscalYear, status, department, search } = req.query;
  const where = {};

  const year = fiscalYearFilter(fiscalYear);
  if (year !== null) where.fiscalYear = year;
  if (status) where.status = status;
  if (department) where.implementingUnitId = Number(department);
  if (req.query.procurementMode) where.procurementMode = req.query.procurementMode;
  if (req.query.targetStartQuarter) where.targetStartQuarter = req.query.targetStartQuarter;
  const searched = searchCondition(search, ["projectTitle", "description", "fundSource", "accountCode"]);
  if (searched) Object.assign(where, searched);

  // Section 2.2: observers see approved/published entries only.
  if (!req.permissions.has("app.view") && req.permissions.has("app.viewPublished")) {
    where.status = { [Op.in]: ["approved", "locked"] };
  }

  // A requester without a wider view sees only their own department's entries.
  const canSeeAll = ["app.consolidate", "app.certify", "app.approve", "audit.viewAll"].some((permission) =>
    req.permissions.has(permission)
  );
  if (!canSeeAll && req.permissions.has("app.create")) {
    where.implementingUnitId = req.currentUser.departmentId ?? -1;
  }

  const paged = ["page", "pageSize", "sort"].some((key) => req.query[key] !== undefined);
  if (!paged) {
    const entries = await AppEntry.findAll({ where, ...withIncludes, order: [["createdAt", "DESC"]] });
    return res.json(entries.map(serialize));
  }
  const page = parseListParams(req.query, {
    sorts: { projectTitle: "projectTitle", abc: "abc", targetStartQuarter: "targetStartQuarter", status: "status", createdAt: "createdAt" },
    defaultSort: { field: "createdAt", direction: "desc" },
  });
  const { count, rows } = await AppEntry.findAndCountAll({ where, ...withIncludes, ...page, distinct: true });
  res.json(pageEnvelope({ rows: rows.map(serialize), total: count, page: page.page, pageSize: page.pageSize }));
};

// ── Submission of the approved APP to the GPPB (Sec. 7.7.5) ──────────────────
// "The approved final APP shall be posted on the website of the Procuring
// Entity and submitted to the GPPB on or before the end of January of the
// budget year." Posting happens automatically on approval; this records the
// submission, which is a separate act with its own deadline.
export const recordGppbSubmission = async (req, res) => {
  const fiscalYear = Number(req.body?.fiscalYear ?? new Date().getFullYear());
  if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) throw workflowError("A valid fiscal year is required.", 400);
  const reference = req.body?.reference?.trim() || null;
  const submittedAt = new Date(), deadline = new Date(Date.UTC(fiscalYear, 0, 31, 23, 59, 59));
  const result = await withAuditTransaction(async (transaction, audit) => {
    const entries = await AppEntry.findAll({ where: { fiscalYear, planCycle: "final", status: { [Op.in]: ["approved", "locked"] }, gppbSubmittedAt: null }, order: [["id", "ASC"]], transaction, lock: transaction.LOCK.UPDATE });
    if (!entries.length) throw workflowError(`No approved final APP lines for ${fiscalYear} remain awaiting GPPB submission.`);
    const beforeState = { entries: entries.map(recordState) };
    for (const entry of entries) await entry.update({ gppbSubmittedAt: submittedAt }, { transaction });
    await audit(actorAudit(req, { actionType: AUDIT_ACTIONS.APP_TRANSITION, entityRef: "appEntry", entityId: entries[0].id,
      summary: `FY ${fiscalYear} approved APP submitted to the GPPB`, beforeState, afterState: { entries: entries.map(recordState), fiscalYear, reference, submittedAt, late: submittedAt > deadline } }));
    return { fiscalYear, lines: entries.length, submittedAt, deadline, onTime: submittedAt <= deadline,
      notice: submittedAt > deadline ? "Submitted after the end-of-January deadline. The submission date is retained in the record." : "Submitted within the end-of-January deadline." };
  });
  res.json(result);
};

// IRR Sec. 7.7 — the APP "shall include provisions for foreseeable emergencies
// based on historical records", as a lump sum not exceeding four percent of the
// Procuring Entity's total appropriations for MOOE. Reported rather than
// created: the lump sum is an APP line the Secretariat files like any other,
// and what the system owes them is the ceiling and how much of it is used.
export const contingencyStatus = async (req, res) => {
  const fiscalYear = Number(req.query.fiscalYear) || new Date().getFullYear();

  const mooeTotal = Number(
    (await Appropriation.sum("amount", {
      where: { fiscalYear, expenseClass: "mooe", status: "enacted" },
    })) ?? 0
  );

  const contingencyUsed = Number(
    (await AppEntry.sum("abc", {
      where: {
        fiscalYear,
        planCycle: "final",
        category: "contingency",
        status: { [Op.notIn]: RELEASED_APP_STATUSES },
      },
    })) ?? 0
  );

  const ceiling = Math.round(mooeTotal * CONTINGENCY_RATE * 100) / 100;

  res.json({
    fiscalYear,
    mooeAppropriations: mooeTotal,
    rate: CONTINGENCY_RATE,
    ceiling,
    programmed: contingencyUsed,
    remaining: Math.max(0, ceiling - contingencyUsed),
    withinCeiling: contingencyUsed <= ceiling,
    citation: "IRR Sec. 7.7",
  });
};

export const getModeSuggestion = async (req, res) => {
  const abc = Number(req.query.abc);
  if (!abc || Number.isNaN(abc) || abc <= 0) {
    return res.status(400).json({ message: "Provide a positive ABC." });
  }

  const lgu = await getLguProfile();
  const category = ["goods", "infrastructure", "consulting"].includes(req.query.category) ? req.query.category : "all";
  res.json({ lgu, ...suggestProcurementMode(abc, lgu, category) });
};

const lockFundingLines = async (ids, transaction) => {
  for (const id of [...new Set(ids.filter(Boolean).map(Number))].sort((a, b) => a - b)) await Appropriation.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
};

const validatePlanLinks = async (payload, { excludeAppEntryId, transaction } = {}) => {
  await activeDepartment(payload.implementingUnitId, { transaction });
  if (!payload.projectTitle?.trim()) throw workflowError("Project title is required.", 400);
  const error = validateEntry(payload);
  if (error) throw workflowError(error, 400);
  if (!Number.isInteger(Number(payload.fiscalYear)) || Number(payload.fiscalYear) < 2000 || Number(payload.fiscalYear) > 2100) throw workflowError("A valid fiscal year is required.", 400);
  if (!["indicative", "final"].includes(payload.planCycle)) throw workflowError("Choose a valid procurement plan cycle.", 400);
  const funding = await validateAppropriation(payload.appropriationId, payload.abc, { excludeAppEntryId, cycle: payload.planCycle, fiscalYear: payload.fiscalYear, transaction });
  if (funding.error) throw workflowError(funding.error, 400, { balance: funding.balance });
  const programmed = await validateAipLink(payload.aipEntryId, payload.fiscalYear, { transaction });
  if (programmed.error) throw workflowError(programmed.error, 400);
  if (programmed.aipEntry.implementingUnitId && Number(programmed.aipEntry.implementingUnitId) !== Number(payload.implementingUnitId)) throw workflowError("The investment program entry belongs to another implementing department.", 400);
  if (payload.appropriationId) {
    const fundingLine = await Appropriation.findByPk(payload.appropriationId, { transaction });
    if (fundingLine.fiscalYear !== Number(payload.fiscalYear)) throw workflowError("The appropriation and procurement plan must use the same fiscal year.", 400);
    if (fundingLine.departmentId && Number(fundingLine.departmentId) !== Number(payload.implementingUnitId)) throw workflowError("The appropriation is assigned to another department.", 400);
  }
  if (payload.indicativeOriginId) {
    const origin = await AppEntry.findByPk(payload.indicativeOriginId, { transaction });
    if (!origin || origin.planCycle !== "indicative" || origin.fiscalYear !== Number(payload.fiscalYear) || Number(origin.implementingUnitId) !== Number(payload.implementingUnitId)) throw workflowError("The indicative origin must be a plan for the same department and fiscal year.", 400);
  }
  const modeError = await validateModeAgainstCeilings(payload);
  if (modeError) throw workflowError(modeError, 400);
};

export const createAppEntry = async (req, res) => {
  const payload = pickEditable(req.body, EDITABLE_APP_FIELDS);
  if (payload.justificationStatus === "") payload.justificationStatus = null;
  payload.implementingUnitId = Number(payload.implementingUnitId ?? req.currentUser.departmentId);
  payload.fiscalYear = Number(payload.fiscalYear ?? new Date().getFullYear());
  payload.planCycle = payload.planCycle ?? "final";
  assertDepartmentScope(req, payload.implementingUnitId, APP_CENTRAL_PERMISSIONS, "procurement plans");
  const entry = await withAuditTransaction(async (transaction, audit) => {
    await lockFundingLines([payload.appropriationId], transaction);
    await validatePlanLinks(payload, { transaction });
    const created = await AppEntry.create({ ...payload, abc: Number(payload.abc), appropriationId: payload.appropriationId ? Number(payload.appropriationId) : null,
      aipEntryId: Number(payload.aipEntryId), createdById: req.currentUser.id, status: "draft" }, { transaction });
    await audit(actorAudit(req, { actionType: "app.created", entityRef: "appEntry", entityId: created.id, summary: `${created.projectTitle}: procurement plan created`, beforeState: null, afterState: recordState(created) }));
    return created;
  });
  res.status(201).json(serialize(await AppEntry.findByPk(entry.id, withIncludes)));
};

export const updateAppEntry = async (req, res) => {
  const initial = await AppEntry.findByPk(req.params.id);
  if (!initial) throw workflowError("APP entry not found.", 404);
  const body = pickEditable(req.body, EDITABLE_APP_FIELDS);
  if (body.justificationStatus === "") body.justificationStatus = null;
  const entry = await withAuditTransaction(async (transaction, audit) => {
    await lockFundingLines([initial.appropriationId, body.appropriationId], transaction);
    const current = await AppEntry.findByPk(initial.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (current.appropriationId !== initial.appropriationId) throw workflowError("The plan's funding changed. Reload before editing.");
    if (!isEditable(current.status)) throw workflowError(`This entry is in "${current.status}" and can no longer be edited.`);
    assertDepartmentScope(req, current.implementingUnitId, APP_CENTRAL_PERMISSIONS, "procurement plans");
    if (body.planCycle !== undefined && body.planCycle !== current.planCycle) throw workflowError("The plan cycle cannot be changed after creation. Create a new plan line for the other cycle.");
    const beforeState = recordState(current);
    const merged = { ...beforeState, ...body };
    assertDepartmentScope(req, merged.implementingUnitId, APP_CENTRAL_PERMISSIONS, "procurement plans");
    await validatePlanLinks(merged, { excludeAppEntryId: current.id, transaction });
    await current.update({ ...body, abc: Number(merged.abc), fiscalYear: Number(merged.fiscalYear), implementingUnitId: Number(merged.implementingUnitId),
      appropriationId: merged.appropriationId ? Number(merged.appropriationId) : null, aipEntryId: Number(merged.aipEntryId) }, { transaction });
    await audit(actorAudit(req, { actionType: "app.updated", entityRef: "appEntry", entityId: current.id, summary: `${current.projectTitle}: procurement plan updated`, beforeState, afterState: recordState(current) }));
    return current;
  });
  res.json(serialize(await AppEntry.findByPk(entry.id, withIncludes)));
};

// Every status change goes through the state machine — no direct status writes.
export const transitionAppEntry = async (req, res) => {
  const { action, remarks } = req.body;
  const entry = await AppEntry.findByPk(req.params.id, withIncludes);
  if (!entry) return res.status(404).json({ message: "APP entry not found." });

  const requiredPermission = permissionForTransition(action, entry.status);
  if (!requiredPermission || !req.permissions.has(requiredPermission)) {
    return res.status(403).json({ message: "You do not have permission to perform this action." });
  }

  // Captured before the update so the audit entry can show the transition.
  const previousStatus = entry.status;

  const result = evaluateTransition({ action, currentStatus: entry.status, remarks });
  if (!result.ok) return res.status(409).json({ message: result.message });

  // Reopening or dropping a plan line that requisitions are already drawing on
  // would strand them: they would be charged to a plan that no longer says what
  // they are for, and a cancelled line releases its programmed amount while
  // their obligations go on holding the appropriation.
  if (action === "revise" || action === "cancel") {
    const live = await liveRequisitionsFor(entry.id);
    if (live.length > 0) {
      return res.status(409).json({
        message:
          `${live.length} requisition(s) are still live against this entry ` +
          `(${live.map((pr) => pr.prNumber).join(", ")}). Return or complete them before ` +
          `${action === "cancel" ? "cancelling" : "revising"} the plan line.`,
        requisitions: live.map((pr) => ({ prNumber: pr.prNumber, status: pr.status })),
      });
    }
  }

  // Section 13: state-changing operations run inside a transaction.
  await withAuditTransaction(async (transaction, audit) => {
    const fundingId = entry.appropriationId;
    await lockFundingLines([fundingId], transaction);
    await entry.reload({ transaction, lock: transaction.LOCK.UPDATE });
    if (entry.appropriationId !== fundingId) throw workflowError("The plan's funding changed. Reload before continuing.");
    const beforeState = recordState(entry);
    const permission = permissionForTransition(action, entry.status);
    if (!permission || !req.permissions.has(permission)) throw workflowError("You do not have permission to perform this action.", 403);
    if (["submit", "revise", "cancel"].includes(action)) assertDepartmentScope(req, entry.implementingUnitId, APP_CENTRAL_PERMISSIONS, "procurement plans");
    const transition = evaluateTransition({ action, currentStatus: entry.status, remarks });
    if (!transition.ok) throw workflowError(transition.message);
    if (action === "submit") await validatePlanLinks(recordState(entry), { excludeAppEntryId: entry.id, transaction });
    if (["revise", "cancel"].includes(action) && (await liveRequisitionsFor(entry.id, transaction)).length) throw workflowError("Live requisitions still use this plan. Return or complete them before changing it.");
    if (entry.status !== previousStatus) throw workflowError("This plan has already moved to another stage. Refresh before continuing.");
    if (["consolidate", "certify", "approve"].includes(action) && entry.createdById === req.currentUser.id) throw workflowError("Another authorized officer must review your procurement plan.", 403);
    const committee = action === "consolidate" ? await assertBacAction(req, { transaction }) : null;
    const changes = { status: result.to };

    if (action === "return") changes.returnRemarks = remarks.trim();
    if (action === "submit") changes.returnRemarks = null;

    // A revised line goes back to draft and must travel the whole approval
    // chain again — consolidation, certification, approval. That is the point:
    // the plan the Mayor approved is not the plan the office has now.
    if (action === "revise") {
      changes.revisionRemarks = remarks.trim();
      changes.revisedAt = new Date();
      changes.lockedAt = null;
      changes.planStage = "ppmp";
    }

    if (action === "cancel") {
      changes.revisionRemarks = remarks.trim();
      changes.cancelledAt = new Date();
    }

    // ── The plan document advances with the workflow ─────────────────────────
    // Which document a line lands in depends on which cycle it is in. An
    // indicative line consolidates into the Indicative APP and is approved as
    // the updated Indicative APP (IRR Sec. 7.7.4) — the basis for Early
    // Procurement Activities. A final-cycle line consolidates into the Final
    // APP, which still requires funding certification and approval (Sec. 7.7.5).
    if (action === "consolidate") {
      changes.planStage = entry.planCycle === "indicative" ? "indicativeApp" : "finalApp";
    }
    if (result.to === "approved") {
      changes.planStage = entry.planCycle === "indicative" ? "updatedIndicativeApp" : "finalApp";
      // Sec. 7.7.5 — the approved final APP is posted on the website of the
      // Procuring Entity. The indicative APP is posted too, under Sec. 7.7.4.
      changes.postedAt = new Date();
    }

    // Sec. 7.7.2 — "The Indicative APP shall be submitted to the BAC for its
    // final recommendation to the HoPE on the appropriate mode of procurement."
    // The consolidation step is where the Secretariat carries the committee's
    // recommendation, so the basis is stamped there rather than being left as
    // whatever the requesting office happened to type.
    if (action === "consolidate") {
      changes.modeRecommendedAt = new Date();
      changes.modeRecommendationBasis =
        req.body.modeRecommendationBasis?.trim() ||
        `Recommended by the BAC on consolidation of the ${entry.planCycle} APP.`;
    }

    // Section 4.2: an approved APP becomes locked and cannot be edited.
    if (result.to === "approved") {
      changes.status = "locked";
      changes.lockedAt = new Date();
    }

    await entry.update(changes, { transaction });
    await audit(actorAudit(req, {
    actionType: AUDIT_ACTIONS.APP_TRANSITION,
    entityRef: "appEntry",
    entityId: entry.id,
    summary: `${entry.projectTitle}: ${action}`,
    beforeState,
    afterState: { ...recordState(entry), remarks: remarks?.trim() ?? null, ...(committee ? { members: committeeSnapshot(committee), quorum: committee.quorum, presidingMemberId: committee.presidingId } : {}) },
    }));
  });

  if (result.to === "approved") {
    await notifyUsers([entry.createdById], {
      type: NOTIFICATION_EVENTS.APP_APPROVED,
      title: `APP entry approved: ${entry.projectTitle}`,
      body: "The entry is approved and locked. You may now raise a requisition against it.",
      link: "/app-entries",
      refEntity: "appEntry",
      refId: entry.id,
      severity: "success",
    });
  }

  const updated = await AppEntry.findByPk(entry.id, withIncludes);
  res.json(serialize(updated));
};
