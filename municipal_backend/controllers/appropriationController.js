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
import { buildLedger, availableFor, programmedFor } from "../services/budgetLedger.js";
import { auditFromRequest } from "../services/auditLog.js";

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
  if (Number.isFinite(Number(fiscalYear))) where.fiscalYear = Number(fiscalYear);
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
    const [available, programmed] = await Promise.all([
      availableFor(row.id),
      programmedFor(row.id),
    ]);
    serialized.push(
      serialize(row, {
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

export const createAppropriation = async (req, res) => {
  const error = validate(req.body);
  if (error) return res.status(400).json({ message: error });

  if (req.body.departmentId) {
    const department = await Department.findByPk(Number(req.body.departmentId));
    if (!department) return res.status(400).json({ message: "That office does not exist." });
  }

  const appropriation = await Appropriation.create({
    fiscalYear: Number(req.body.fiscalYear),
    ordinanceNo: req.body.ordinanceNo.trim(),
    ordinanceDate: req.body.ordinanceDate ?? null,
    type: req.body.type ?? "annual",
    fund: req.body.fund ?? "generalFund",
    expenseClass: req.body.expenseClass ?? "mooe",
    papCode: req.body.papCode?.trim() || null,
    uacsCode: req.body.uacsCode?.trim() || null,
    title: req.body.title.trim(),
    amount: Number(req.body.amount),
    status: req.body.status === "enacted" ? "enacted" : "draft",
    remarks: req.body.remarks?.trim() || null,
    departmentId: req.body.departmentId ? Number(req.body.departmentId) : null,
    recordedById: req.currentUser.id,
  });

  await auditFromRequest(req, {
    actionType: "appropriation.recorded",
    entityRef: "appropriation",
    entityId: appropriation.id,
    summary: `${appropriation.ordinanceNo} — ${appropriation.title} (₱${Number(appropriation.amount).toLocaleString()})`,
    afterState: {
      status: appropriation.status,
      amount: Number(appropriation.amount),
      fund: appropriation.fund,
      fiscalYear: appropriation.fiscalYear,
    },
  });

  res.status(201).json(serialize(await Appropriation.findByPk(appropriation.id, withIncludes)));
};

export const updateAppropriation = async (req, res) => {
  const appropriation = await Appropriation.findByPk(req.params.id, withIncludes);
  if (!appropriation) return res.status(404).json({ message: "Appropriation not found." });

  if (appropriation.status === "closed") {
    return res.status(409).json({ message: "A closed appropriation can no longer be amended." });
  }

  const merged = { ...serialize(appropriation), ...req.body };
  const error = validate(merged);
  if (error) return res.status(400).json({ message: error });

  // Reducing an appropriation below what has already been committed against it
  // would create a negative balance that no later transaction could resolve.
  const newAmount = Number(merged.amount);
  const balances = await availableFor(appropriation.id);
  if (newAmount < balances.obligated) {
    return res.status(409).json({
      message:
        `₱${balances.obligated.toLocaleString()} is already obligated against this line. ` +
        `It cannot be reduced to ₱${newAmount.toLocaleString()} without first cancelling those commitments.`,
      obligated: balances.obligated,
    });
  }

  const before = { amount: Number(appropriation.amount), status: appropriation.status };

  await appropriation.update({
    fiscalYear: Number(merged.fiscalYear),
    ordinanceNo: merged.ordinanceNo.trim(),
    ordinanceDate: merged.ordinanceDate ?? null,
    type: merged.type,
    fund: merged.fund,
    expenseClass: merged.expenseClass,
    papCode: merged.papCode?.trim() || null,
    uacsCode: merged.uacsCode?.trim() || null,
    title: merged.title.trim(),
    amount: newAmount,
    status: merged.status,
    remarks: merged.remarks?.trim() || null,
    departmentId: merged.departmentId ? Number(merged.departmentId) : null,
  });

  await auditFromRequest(req, {
    actionType: "appropriation.amended",
    entityRef: "appropriation",
    entityId: appropriation.id,
    summary: `${appropriation.ordinanceNo} amended`,
    beforeState: before,
    afterState: { amount: newAmount, status: merged.status },
  });

  res.json(serialize(await Appropriation.findByPk(appropriation.id, withIncludes)));
};

// Live balances for one line — used by the APP entry form to show what is left
// before the user commits to an amount.
export const getAppropriationBalance = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid appropriation reference." });

  const [available, programmed] = await Promise.all([availableFor(id), programmedFor(id)]);
  if (!available) return res.status(404).json({ message: "Appropriation not found." });

  res.json({ ...available, ...programmed });
};

// ── Budget monitor ───────────────────────────────────────────────────────────
const ALERT_WINDOW_DAYS = 90;
const HIGH_UNOBLIGATED_RATIO = 0.5;

const daysUntilYearEnd = () => {
  const now = new Date();
  return Math.max(0, Math.ceil((new Date(now.getFullYear(), 11, 31) - now) / 86400000));
};

export const getBudgetMonitor = async (req, res) => {
  const fiscalYear = Number(req.query.fiscalYear) || new Date().getFullYear();
  const ledger = await buildLedger({
    fiscalYear,
    fund: req.query.fund,
    departmentId: req.query.departmentId,
  });

  const remainingDays = daysUntilYearEnd();

  // Risk is about maturity: an unobligated balance is unremarkable in February
  // and serious in November, because what is not committed by year-end reverts.
  const withRisk = (row) => {
    const ratio = row.appropriated > 0 ? row.unobligated / row.appropriated : 0;
    const maturing = remainingDays <= ALERT_WINDOW_DAYS && ratio > 0;
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
    fiscalYear,
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
  const { fiscalYear, status } = req.query;

  const where = {};
  if (status) where.status = status;

  const obligations = await Obligation.findAll({
    where,
    include: [
      {
        model: Appropriation,
        as: "appropriation",
        ...(Number.isFinite(Number(fiscalYear)) ? { where: { fiscalYear: Number(fiscalYear) } } : {}),
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
      ordinanceNo: obligation.appropriation?.ordinanceNo ?? null,
      appropriationTitle: obligation.appropriation?.title ?? null,
      departmentName: obligation.appropriation?.office?.name ?? null,
    }))
  );
};

export const dispatchUnexpendedAlerts = async (req, res) => {
  const { notifyByPermission, NOTIFICATION_EVENTS } = await import("../services/notifier.js");
  const fiscalYear = Number(req.query.fiscalYear) || new Date().getFullYear();
  const remainingDays = daysUntilYearEnd();

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
