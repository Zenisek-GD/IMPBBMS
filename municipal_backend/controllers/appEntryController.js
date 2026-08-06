import { Op } from "sequelize";
import { sequelize } from "../models/db.js";
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
import { auditFromRequest, AUDIT_ACTIONS } from "../services/auditLog.js";

// IRR Sec. 7.7 — the lump sum for foreseeable emergencies "shall not be more
// than four percent (4%) of the Procuring Entity's total appropriations for
// MOOE".
const CONTINGENCY_RATE = 0.04;

const serialize = (entry) => ({
  id: entry.id,
  projectTitle: entry.projectTitle,
  description: entry.description,
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
const validateAppropriation = async (appropriationId, abc, { excludeAppEntryId, cycle = "final" } = {}) => {
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

  const balance = await programmedFor(Number(appropriationId), { excludeAppEntryId });
  if (!balance) return { error: "That appropriation line does not exist." };

  if (balance.status !== "enacted") {
    return {
      error: `Ordinance ${balance.ordinanceNo} is "${balance.status}". Only an enacted appropriation can be planned against.`,
    };
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
const validateAipLink = async (aipEntryId, fiscalYear) => {
  if (!aipEntryId) {
    return {
      error:
        "An investment program entry is required. A PPMP line must procure for a project the LGU programmed.",
    };
  }

  const aipEntry = await AipEntry.findByPk(Number(aipEntryId), {
    include: [{ model: InvestmentProgram, as: "program" }],
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
const liveRequisitionsFor = (appEntryId) =>
  PrHeader.findAll({
    where: { appEntryId, status: { [Op.in]: LIVE_PR_STATUSES } },
    attributes: ["id", "prNumber", "status"],
  });

// Section 4.3 validation rules, enforced server-side.
const validateEntry = ({ abc, targetStartQuarter, targetCompletionQuarter, procurementMode, justification }) => {
  if (abc === undefined || abc === null || abc === "") return "ABC is required.";

  const numericAbc = Number(abc);
  if (Number.isNaN(numericAbc)) return "ABC must be a number.";
  // Section 4.3: "ABC must be greater than 0."
  if (numericAbc <= 0) return "ABC must be greater than 0.";

  if (!QUARTERS.includes(targetStartQuarter)) return "Target start quarter is invalid.";
  if (!QUARTERS.includes(targetCompletionQuarter)) return "Target completion quarter is invalid.";

  // Section 4.3: start quarter must not be after the completion quarter.
  if (QUARTERS.indexOf(targetStartQuarter) > QUARTERS.indexOf(targetCompletionQuarter)) {
    return "Target start quarter must not be after the target completion quarter.";
  }

  // Section 4.3: alternative procurement modes require a justification.
  if (procurementMode && procurementMode !== "competitiveBidding" && !justification?.trim()) {
    return "A justification is required when using an alternative procurement mode.";
  }

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
  const suggestion = suggestProcurementMode(Number(entry.abc), lgu);

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

  if (fiscalYear) where.fiscalYear = Number(fiscalYear);
  if (status) where.status = status;
  if (department) where.implementingUnitId = Number(department);
  if (search) where.projectTitle = { [Op.like]: `%${search}%` };

  // Section 2.2: observers see approved/published entries only.
  if (!req.permissions.has("app.view") && req.permissions.has("app.viewPublished")) {
    where.status = { [Op.in]: ["approved", "locked"] };
  }

  // A requester without a wider view sees only their own department's entries.
  const canSeeAll = ["app.consolidate", "app.certify", "app.approve", "audit.viewAll"].some((permission) =>
    req.permissions.has(permission)
  );
  if (!canSeeAll && req.permissions.has("app.create") && req.currentUser.departmentId) {
    where.implementingUnitId = req.currentUser.departmentId;
  }

  const entries = await AppEntry.findAll({ where, ...withIncludes, order: [["createdAt", "DESC"]] });
  res.json(entries.map(serialize));
};

// ── Submission of the approved APP to the GPPB (Sec. 7.7.5) ──────────────────
// "The approved final APP shall be posted on the website of the Procuring
// Entity and submitted to the GPPB on or before the end of January of the
// budget year." Posting happens automatically on approval; this records the
// submission, which is a separate act with its own deadline.
export const recordGppbSubmission = async (req, res) => {
  const fiscalYear = Number(req.body?.fiscalYear) || new Date().getFullYear();
  const reference = req.body?.reference?.trim() || null;

  const entries = await AppEntry.findAll({
    where: { fiscalYear, planCycle: "final", status: { [Op.in]: ["approved", "locked"] } },
  });

  if (entries.length === 0) {
    return res.status(409).json({
      message: `No approved final APP lines for ${fiscalYear}. There is nothing to submit.`,
    });
  }

  const submittedAt = new Date();
  const deadline = new Date(Date.UTC(fiscalYear, 0, 31, 23, 59, 59));
  const late = submittedAt > deadline;

  await AppEntry.update(
    { gppbSubmittedAt: submittedAt },
    { where: { id: { [Op.in]: entries.map((entry) => entry.id) } } }
  );

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.APP_TRANSITION,
    entityRef: "appEntry",
    entityId: entries[0].id,
    summary:
      `FY ${fiscalYear} approved APP submitted to the GPPB — ${entries.length} line(s)` +
      (late ? " (AFTER the end-of-January deadline)" : ""),
    afterState: { fiscalYear, lines: entries.length, submittedAt, reference, late },
  });

  res.json({
    fiscalYear,
    lines: entries.length,
    submittedAt,
    deadline,
    onTime: !late,
    notice: late
      ? "Submitted after the end-of-January deadline in IRR Sec. 7.7.5. The submission stands; the delay is on the record."
      : "Submitted within the Sec. 7.7.5 deadline.",
  });
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
  res.json({ lgu, ...suggestProcurementMode(abc, lgu) });
};

export const createAppEntry = async (req, res) => {
  const payload = pickEditable(req.body, EDITABLE_APP_FIELDS);

  const validationError = validateEntry(payload);
  if (validationError) return res.status(400).json({ message: validationError });

  if (!payload.projectTitle?.trim()) {
    return res.status(400).json({ message: "Project title is required." });
  }

  // Requesters file against their own office; reviewers may nominate one.
  const implementingUnitId = payload.implementingUnitId ?? req.currentUser.departmentId;
  if (!implementingUnitId) {
    return res.status(400).json({ message: "An implementing unit is required." });
  }

  const department = await Department.findByPk(implementingUnitId);
  if (!department || department.status !== "active") {
    return res.status(400).json({ message: "That implementing unit is not available." });
  }

  const fiscalYear = payload.fiscalYear ?? new Date().getFullYear();

  // Which of the two cycles this line belongs to. Indicative lines support the
  // budget proposal; final lines are charged against the enacted ordinance.
  const planCycle = payload.planCycle === "indicative" ? "indicative" : "final";

  const funding = await validateAppropriation(payload.appropriationId, payload.abc, {
    cycle: planCycle,
  });
  if (funding.error) return res.status(400).json({ message: funding.error, balance: funding.balance });

  const programmed = await validateAipLink(payload.aipEntryId, fiscalYear);
  if (programmed.error) return res.status(400).json({ message: programmed.error });

  const modeError = await validateModeAgainstCeilings(payload);
  if (modeError) return res.status(400).json({ message: modeError });

  const entry = await AppEntry.create({
    ...payload,
    abc: Number(payload.abc),
    planCycle,
    appropriationId: payload.appropriationId ? Number(payload.appropriationId) : null,
    aipEntryId: Number(payload.aipEntryId),
    implementingUnitId,
    createdById: req.currentUser.id,
    fiscalYear,
    status: "draft",
  });

  const created = await AppEntry.findByPk(entry.id, withIncludes);
  res.status(201).json(serialize(created));
};

export const updateAppEntry = async (req, res) => {
  const entry = await AppEntry.findByPk(req.params.id, withIncludes);
  if (!entry) return res.status(404).json({ message: "APP entry not found." });

  // Section 4.3: an approved APP entry is locked and cannot be edited.
  if (!isEditable(entry.status)) {
    return res.status(409).json({
      message: `This entry is in "${entry.status}" and can no longer be edited.`,
    });
  }

  // An office files its own PPMP lines. `app.create` is not a licence to edit
  // another office's plan — including its ABC, which is what the appropriation
  // and AIP balance checks are measured against.
  const canEditAnyUnit = ["app.consolidate", "app.certify", "app.approve"].some((permission) =>
    req.permissions.has(permission)
  );
  if (!canEditAnyUnit && entry.implementingUnitId !== req.currentUser.departmentId) {
    return res.status(403).json({ message: "This plan line belongs to another office." });
  }

  const body = pickEditable(req.body, EDITABLE_APP_FIELDS);
  const merged = { ...serialize(entry), ...body };
  const validationError = validateEntry(merged);
  if (validationError) return res.status(400).json({ message: validationError });

  // Re-checked on every edit: raising the ABC, or moving the entry to a
  // different budget line, can both overrun an appropriation that was fine a
  // moment ago. The entry excludes itself so its own current ABC does not count
  // against the balance it is being measured against.
  const funding = await validateAppropriation(merged.appropriationId, merged.abc, {
    excludeAppEntryId: entry.id,
    cycle: entry.planCycle,
  });
  if (funding.error) return res.status(400).json({ message: funding.error, balance: funding.balance });

  if (body.aipEntryId !== undefined) {
    const programmed = await validateAipLink(body.aipEntryId, merged.fiscalYear);
    if (programmed.error) return res.status(400).json({ message: programmed.error });
  }

  await entry.update({
    ...body,
    ...(body.abc !== undefined ? { abc: Number(body.abc) } : {}),
    ...(body.appropriationId !== undefined ? { appropriationId: Number(body.appropriationId) } : {}),
    ...(body.aipEntryId !== undefined ? { aipEntryId: Number(body.aipEntryId) } : {}),
  });

  const updated = await AppEntry.findByPk(entry.id, withIncludes);
  res.json(serialize(updated));
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
  await sequelize.transaction(async (transaction) => {
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
    // Procurement Activities. A final line consolidates into the same working
    // document but is approved as the Final APP (Sec. 7.7.5).
    if (action === "consolidate") changes.planStage = "indicativeApp";
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
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.APP_TRANSITION,
    entityRef: "appEntry",
    entityId: entry.id,
    summary: `${entry.projectTitle}: ${action}`,
    beforeState: { status: previousStatus },
    afterState: { status: result.to, remarks: remarks?.trim() ?? null },
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
