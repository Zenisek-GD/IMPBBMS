import { Op } from "sequelize";
import { sequelize } from "../models/db.js";
import { AppEntry, QUARTERS, PLAN_STAGE_LABELS } from "../models/appEntryModel.js";
import { Department } from "../models/departmentModel.js";
import { User } from "../models/userModel.js";
import { getLguProfile } from "../models/systemSettingModel.js";
import { suggestProcurementMode } from "../services/procurementThresholds.js";
import { Appropriation } from "../models/appropriationModel.js";
import { AipEntry, InvestmentProgram } from "../models/investmentProgramModel.js";
import { PrHeader } from "../models/prModel.js";
import { LIVE_PR_STATUSES } from "../services/prWorkflow.js";
import { programmedFor } from "../services/budgetLedger.js";
import { evaluateTransition, permissionForTransition, isEditable } from "../services/appWorkflow.js";
import { notifyUsers, NOTIFICATION_EVENTS } from "../services/notifier.js";
import { auditFromRequest, AUDIT_ACTIONS } from "../services/auditLog.js";

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
const validateAppropriation = async (appropriationId, abc, { excludeAppEntryId } = {}) => {
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

export const getModeSuggestion = async (req, res) => {
  const abc = Number(req.query.abc);
  if (!abc || Number.isNaN(abc) || abc <= 0) {
    return res.status(400).json({ message: "Provide a positive ABC." });
  }

  const lgu = await getLguProfile();
  res.json({ lgu, ...suggestProcurementMode(abc, lgu) });
};

export const createAppEntry = async (req, res) => {
  const payload = req.body;

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

  const funding = await validateAppropriation(payload.appropriationId, payload.abc);
  if (funding.error) return res.status(400).json({ message: funding.error, balance: funding.balance });

  const programmed = await validateAipLink(payload.aipEntryId, fiscalYear);
  if (programmed.error) return res.status(400).json({ message: programmed.error });

  const entry = await AppEntry.create({
    ...payload,
    abc: Number(payload.abc),
    appropriationId: Number(payload.appropriationId),
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

  const merged = { ...serialize(entry), ...req.body };
  const validationError = validateEntry(merged);
  if (validationError) return res.status(400).json({ message: validationError });

  // Re-checked on every edit: raising the ABC, or moving the entry to a
  // different budget line, can both overrun an appropriation that was fine a
  // moment ago. The entry excludes itself so its own current ABC does not count
  // against the balance it is being measured against.
  const funding = await validateAppropriation(merged.appropriationId, merged.abc, {
    excludeAppEntryId: entry.id,
  });
  if (funding.error) return res.status(400).json({ message: funding.error, balance: funding.balance });

  if (req.body.aipEntryId !== undefined) {
    const programmed = await validateAipLink(req.body.aipEntryId, merged.fiscalYear);
    if (programmed.error) return res.status(400).json({ message: programmed.error });
  }

  await entry.update({
    ...req.body,
    ...(req.body.abc !== undefined ? { abc: Number(req.body.abc) } : {}),
    ...(req.body.appropriationId !== undefined
      ? { appropriationId: Number(req.body.appropriationId) }
      : {}),
    ...(req.body.aipEntryId !== undefined ? { aipEntryId: Number(req.body.aipEntryId) } : {}),
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

    // The plan document advances with the workflow: an office's PPMP line
    // becomes part of the consolidated indicative APP, and is marked final once
    // approved against an enacted appropriation.
    if (action === "consolidate") changes.planStage = "indicativeApp";
    if (result.to === "approved") changes.planStage = "finalApp";

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
