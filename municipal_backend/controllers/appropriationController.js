import { Op } from "sequelize";
import {
  Appropriation,
  Obligation,
  FUNDS,
  FUND_LABELS,
  EXPENSE_CLASSES,
  EXPENSE_CLASS_LABELS,
  APPROPRIATION_TYPES,
} from "../models/appropriationModel.js";
import { Department } from "../models/departmentModel.js";
import { User } from "../models/userModel.js";
import { PrHeader } from "../models/prModel.js";
import { buildLedger, availableFor, programmedFor, allocationBalanceFor } from "../services/budgetLedger.js";
import { fiscalYearFilter } from "../services/financialCalculations.js";
import { withAuditTransaction } from "../services/auditLog.js";
import { actorAudit, workflowError } from "../services/workflowSupport.js";
import { activeDepartment, recordState, lockAppropriationYear } from "../services/requisitionRecords.js";

// The appropriation register: the ordinance lines the LGU may actually spend
// against. Recorded by the Budget Officer from the enacted Appropriation
// Ordinance — the system does not invent budget, it records what the Sanggunian
// authorised.

const serialize = (appropriation, balances) => ({
  id: appropriation.id,
  fiscalYear: appropriation.fiscalYear,
  ordinanceNo: appropriation.ordinanceNo,
  ordinanceDate: appropriation.ordinanceDate,
  type: appropriation.type,
  fund: appropriation.fund,
  fundLabel: FUND_LABELS[appropriation.fund],
  expenseClass: appropriation.expenseClass,
  expenseClassLabel: EXPENSE_CLASS_LABELS[appropriation.expenseClass],
  papCode: appropriation.papCode,
  uacsCode: appropriation.uacsCode,
  title: appropriation.title,
  amount: Number(appropriation.amount),
  status: appropriation.status,
  remarks: appropriation.remarks,
  departmentId: appropriation.departmentId,
  departmentCode: appropriation.office?.code ?? null,
  departmentName: appropriation.office?.name ?? null,
  recordedByName: appropriation.recordedBy?.name ?? null,
  ...(balances ?? {}),
});

const withIncludes = {
  include: [
    { model: Department, as: "office" },
    { model: User, as: "recordedBy", attributes: ["id", "name"] },
  ],
};

export const getAppropriationOptions = async (req, res) => {
  res.json({
    funds: FUNDS.map((key) => ({ key, label: FUND_LABELS[key] })),
    expenseClasses: EXPENSE_CLASSES.map((key) => ({ key, label: EXPENSE_CLASS_LABELS[key] })),
    types: APPROPRIATION_TYPES,
  });
};

export const listAppropriations = async (req, res) => {
  const { fiscalYear, fund, departmentId, status, chargeable } = req.query;

  const where = {};
  const selectedYear = fiscalYearFilter(fiscalYear);
  if (selectedYear !== null) where.fiscalYear = selectedYear;
  if (fund && FUNDS.includes(fund)) where.fund = fund;
  if (Number.isFinite(Number(departmentId))) where.departmentId = Number(departmentId);
  if (status) where.status = status;
  // The APP form only wants lines it can actually charge against.
  if (chargeable === "true") where.status = "enacted";

  const rows = await Appropriation.findAll({
    where,
    ...withIncludes,
    order: [["fiscalYear", "DESC"], ["ordinanceNo", "ASC"], ["title", "ASC"]],
  });

  // Each line carries its live balances, so the caller never has to compute
  // "how much is left" from a separate endpoint and risk disagreeing.
  const serialized = [];
  for (const row of rows) {
    const [available, programmed, allocated] = await Promise.all([
      availableFor(row.id),
      programmedFor(row.id),
      allocationBalanceFor(row.id),
    ]);
    serialized.push(
      serialize(row, {
        allocated: allocated?.allocated ?? 0,
        reserved: allocated?.reserved ?? 0,
        unallocatedAvailable: allocated?.unallocatedAvailable ?? 0,
        obligated: available?.obligated ?? 0,
        available: available?.available ?? 0,
        programmed: programmed?.programmed ?? 0,
        unprogrammed: programmed?.unprogrammed ?? 0,
      })
    );
  }

  res.json(serialized);
};

const validate = (payload) => {
  if (!payload.ordinanceNo?.trim()) return "An ordinance number is required.";
  if (!payload.title?.trim()) return "A title is required.";

  const amount = Number(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) return "The appropriated amount must be greater than 0.";

  const year = Number(payload.fiscalYear);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return "A valid fiscal year is required.";

  if (payload.fund && !FUNDS.includes(payload.fund)) return "Unknown fund.";
  if (payload.expenseClass && !EXPENSE_CLASSES.includes(payload.expenseClass)) {
    return "Unknown expense class.";
  }
  if (payload.type && !APPROPRIATION_TYPES.includes(payload.type)) return "Unknown appropriation type.";

  return null;
};

// An appropriation's status is the authority behind every peso charged to it,
// so it moves one way only: a line is keyed as a draft, becomes enacted when
// the ordinance behind it is recorded, and is closed at year end. Reverting an
// enacted line to draft would strip the authority from requisitions already
// obligated against it while leaving those obligations standing.
const APPROPRIATION_STATUS_FLOW = {
  draft: ["draft", "enacted"],
  enacted: ["enacted", "closed"],
  closed: ["closed"],
};

const validateStatusChange = (current, next) => {
  if (next === undefined || next === current) return null;
  const allowed = APPROPRIATION_STATUS_FLOW[current] ?? [];
  if (!allowed.includes(next)) {
    return `An appropriation cannot move from "${current}" to "${next}".`;
  }
  return null;
};

// ── LGC Sec. 323 — reenact the preceding year's appropriations ──────────────
// Where the Sanggunian has not passed the annual appropriations by the start of
// the fiscal year, the previous year's are deemed reenacted by operation of law.
// The LGU keeps operating; it does not stop spending. This system had no way to
// express that, so a municipality in that position — which is common — would
// have found every requisition refused for want of an appropriation.
//
// What carries over is limited. Sec. 323 reenacts the appropriations for
// salaries and wages of existing positions, statutory and contractual
// obligations, and essential operating expenses. New appropriations and capital
// outlay do not carry over, which is exactly the constraint that makes an LGU
// under a reenacted budget unable to start new projects.
export const reenactPriorYear = async () => {
  throw workflowError("Reenactment requires a documented budget control request, reviewed recurring income, eligible prior-year lines and independent approval. Use Budget controls to prepare the request.", 403);
};

const appropriationValues = (payload) => ({
  fiscalYear: Number(payload.fiscalYear), ordinanceNo: payload.ordinanceNo.trim(), ordinanceDate: payload.ordinanceDate || null, type: payload.type ?? "annual",
  fund: payload.fund ?? "generalFund", expenseClass: payload.expenseClass ?? "mooe", papCode: payload.papCode?.trim() || null, uacsCode: payload.uacsCode?.trim() || null,
  title: payload.title.trim(), amount: Number(payload.amount), status: payload.status ?? "draft", remarks: payload.remarks?.trim() || null, departmentId: payload.departmentId ? Number(payload.departmentId) : null,
});

export const createAppropriation = async (req, res) => {
  const error = validate(req.body);
  if (error) throw workflowError(error, 400);
  if (req.body.status != null && req.body.status !== "draft") throw workflowError("Direct records must remain drafts. Annual appropriations are released by the existing budget and ordinance workflow; documented corrections or migrations require an independently approved budget control request.", 403);
  if (req.body.type === "reenacted") throw workflowError("Use the prior-year reenactment action to preserve the source appropriation and prevent duplicate authority.", 400);
  const appropriation = await withAuditTransaction(async (transaction, audit) => {
    await lockAppropriationYear(Number(req.body.fiscalYear), transaction);
    if (req.body.departmentId) await activeDepartment(req.body.departmentId, { transaction });
    const created = await Appropriation.create({ ...appropriationValues(req.body), recordedById: req.currentUser.id }, { transaction });
    await audit(actorAudit(req, { actionType: "appropriation.recorded", entityRef: "appropriation", entityId: created.id, summary: `${created.ordinanceNo}: appropriation recorded`, beforeState: null, afterState: recordState(created) }));
    return created;
  });
  res.status(201).json(serialize(await Appropriation.findByPk(appropriation.id, withIncludes)));
};

export const updateAppropriation = async (req, res) => {
  const observed = await Appropriation.findByPk(req.params.id);
  if (!observed) throw workflowError("Appropriation not found.", 404);
  const updated = await withAuditTransaction(async (transaction, audit) => {
    for (const year of [...new Set([observed.fiscalYear, Number(req.body.fiscalYear ?? observed.fiscalYear)])].sort((a, b) => a - b)) await lockAppropriationYear(year, transaction);
    const appropriation = await Appropriation.findByPk(observed.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (appropriation.fiscalYear !== observed.fiscalYear) throw workflowError("The appropriation changed. Reload before amending it.");
    if (appropriation.status === "closed") throw workflowError("A closed appropriation can no longer be amended.");
    if (appropriation.status !== "draft" || (req.body.status && req.body.status !== "draft")) throw workflowError("Enacted appropriations can only be changed through the authorized budget workflow or an independently approved correction or transfer request.", 403);
    const beforeState = recordState(appropriation), merged = { ...beforeState, ...req.body };
    const error = validate(merged);
    if (error) throw workflowError(error, 400);
    const statusError = validateStatusChange(appropriation.status, merged.status);
    if (statusError) throw workflowError(statusError);
    const values = appropriationValues(merged);
    if (values.departmentId && values.departmentId !== appropriation.departmentId) await activeDepartment(values.departmentId, { transaction });
    if (values.type !== appropriation.type && (values.type === "reenacted" || appropriation.type === "reenacted")) throw workflowError("An appropriation's reenactment origin cannot be changed.");
    const balances = await availableFor(appropriation.id, { transaction });
    const planned = await programmedFor(appropriation.id, { transaction });
    if (values.amount < Math.max(balances.obligated, planned.programmed)) throw workflowError("The appropriation cannot be reduced below its existing obligations or programmed procurement plans.", 409, { obligated: balances.obligated, programmed: planned.programmed });
    if (balances.obligated > 0 || planned.programmed > 0) {
      const changedAuthority = ["fiscalYear", "fund", "expenseClass", "departmentId", "type"].filter((key) => values[key] !== beforeState[key]);
      if (changedAuthority.length) throw workflowError(`This appropriation already supports records. Its ${changedAuthority.join(", ")} cannot be reassigned while those records remain active.`);
    }
    await appropriation.update(values, { transaction });
    await audit(actorAudit(req, { actionType: "appropriation.amended", entityRef: "appropriation", entityId: appropriation.id, summary: `${appropriation.ordinanceNo}: appropriation amended`, beforeState, afterState: recordState(appropriation) }));
    return appropriation;
  });
  res.json(serialize(await Appropriation.findByPk(updated.id, withIncludes)));
};

// Live balances for one line — used by the APP entry form to show what is left
// before the user commits to an amount.
export const getAppropriationBalance = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid appropriation reference." });

  const [available, programmed, allocated] = await Promise.all([availableFor(id), programmedFor(id), allocationBalanceFor(id)]);
  if (!available) return res.status(404).json({ message: "Appropriation not found." });

  res.json({ ...available, ...programmed, ...allocated });
};

// ── Budget monitor ───────────────────────────────────────────────────────────
const ALERT_WINDOW_DAYS = 90;
const HIGH_UNOBLIGATED_RATIO = 0.5;

const daysUntilYearEnd = (year) => year === null ? null : Math.max(0, Math.ceil((Date.UTC(year + 1, 0, 1) - 8 * 3600000 - Date.now()) / 86400000));

export const getBudgetMonitor = async (req, res) => {
  const fiscalYear = fiscalYearFilter(req.query.fiscalYear);
  const ledger = await buildLedger({
    fiscalYear: fiscalYear ?? "all",
    fund: req.query.fund,
    departmentId: req.query.departmentId,
  });

  const remainingDays = daysUntilYearEnd(fiscalYear);

  // Risk is about maturity: an unobligated balance is unremarkable in February
  // and serious in November, because what is not committed by year-end reverts.
  const withRisk = (row) => {
    const ratio = row.appropriated > 0 ? row.unobligated / row.appropriated : 0;
    const maturing = remainingDays !== null && remainingDays <= ALERT_WINDOW_DAYS && ratio > 0;
    return {
      ...row,
      unobligatedRatio: Number(ratio.toFixed(4)),
      severity:
        maturing && ratio >= HIGH_UNOBLIGATED_RATIO
          ? "high"
          : maturing || ratio >= HIGH_UNOBLIGATED_RATIO
            ? "medium"
            : "low",
    };
  };

  res.json({
    fiscalYear: fiscalYear ?? "all",
    daysToYearEnd: remainingDays,
    alertWindowDays: ALERT_WINDOW_DAYS,
    totals: ledger.totals,
    offices: ledger.offices.map(withRisk),
    lines: ledger.lines.map(withRisk),
  });
};

// The obligation register — every ORS raised, with its status. This is the
// document trail COA asks for, and it did not exist before.
export const listObligations = async (req, res) => {
  const { status } = req.query;
  const fiscalYear = fiscalYearFilter(req.query.fiscalYear);

  const where = {};
  if (status) where.status = status;

  const obligations = await Obligation.findAll({
    where,
    include: [
      {
        model: Appropriation,
        as: "appropriation",
        ...(fiscalYear !== null ? { where: { fiscalYear } } : {}),
        include: [{ model: Department, as: "office" }],
      },
      { model: PrHeader, as: "requisition", attributes: ["id", "prNumber", "status"] },
      { model: User, as: "certifiedBy", attributes: ["id", "name"] },
    ],
    order: [["certifiedAt", "DESC"]],
  });

  res.json(
    obligations.map((obligation) => ({
      id: obligation.id,
      obligationNo: obligation.obligationNo,
      amount: Number(obligation.amount),
      status: obligation.status,
      certifiedAt: obligation.certifiedAt,
      certifiedByName: obligation.certifiedBy?.name ?? null,
      cancelledAt: obligation.cancelledAt,
      cancellationReason: obligation.cancellationReason,
      particulars: obligation.particulars,
      prNumber: obligation.requisition?.prNumber ?? null,
      prStatus: obligation.requisition?.status ?? null,
      fiscalYear: obligation.appropriation?.fiscalYear ?? null,
      ordinanceNo: obligation.appropriation?.ordinanceNo ?? null,
      appropriationTitle: obligation.appropriation?.title ?? null,
      departmentName: obligation.appropriation?.office?.name ?? null,
    }))
  );
};

export const dispatchUnexpendedAlerts = async (req, res) => {
  const { notifyByPermission, NOTIFICATION_EVENTS } = await import("../services/notifier.js");
  const fiscalYear = fiscalYearFilter(req.query.fiscalYear);
  const remainingDays = daysUntilYearEnd(fiscalYear);

  if (fiscalYear !== fiscalYearFilter(undefined)) throw workflowError("Year-end reminders may only be dispatched for the current fiscal year.", 400);

  if (remainingDays > ALERT_WINDOW_DAYS) {
    return res.json({
      dispatched: 0,
      message: `Year-end is ${remainingDays} days away; alerts begin at ${ALERT_WINDOW_DAYS} days.`,
    });
  }

  const ledger = await buildLedger({ fiscalYear });

  let dispatched = 0;
  for (const line of ledger.lines) {
    if (line.unobligated <= 0) continue;

    await notifyByPermission("budget.certify", {
      type: NOTIFICATION_EVENTS.PAYMENT_STATUS,
      title: `Unobligated appropriation maturing — ${line.title}`,
      body:
        `₱${line.unobligated.toLocaleString()} of the ₱${line.appropriated.toLocaleString()} appropriated under ` +
        `${line.ordinanceNo} is still unobligated, with ${remainingDays} days to year-end.`,
      link: "/budget/unexpended",
      refEntity: "appropriation",
      refId: line.id,
      severity: "warning",
    });
    dispatched += 1;
  }

  res.json({ dispatched, daysToYearEnd: remainingDays });
};
