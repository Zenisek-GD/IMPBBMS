import { Op, fn, col } from "sequelize";
import { Appropriation, Obligation } from "../models/appropriationModel.js";
import { AppEntry } from "../models/appEntryModel.js";
import { PrHeader } from "../models/prModel.js";
import { Department } from "../models/departmentModel.js";
import { Invoice, Payment } from "../models/paymentModel.js";
import { Contract } from "../models/contractModel.js";
import { Award, Rfq } from "../models/biddingModel.js";
// A cancelled plan line releases the amount it had programmed, exactly as a
// returned one does. Before cancellation existed the ledger only knew about
// "returned", so a dropped project would have gone on consuming its
// appropriation's programmed balance forever.
import { RELEASED_APP_STATUSES } from "./appWorkflow.js";

// ── THE BUDGET LEDGER ────────────────────────────────────────────────────────
// Every balance the system reports is computed here, from one set of
// definitions, so the Budget dashboard and the enforcement checks can never
// disagree about how much money is left.
//
// The four positions, in the order money moves through them:
//
//   appropriated  what the Sanggunian authorised (enacted ordinance lines)
//   programmed    what the APP plans to buy against it   — a plan, not a claim
//   obligated     what certified requisitions committed  — a claim on the money
//   disbursed     what the Treasurer actually released   — money gone
//
// And the balances that matter operationally:
//
//   unobligated  = appropriated − obligated
//                  Still free. Near year-end this is the number that hurts:
//                  what is not committed by December cannot realistically be
//                  spent, and reverts.
//   unexpended   = appropriated − disbursed
//                  Authorised but not yet paid out. Includes money already
//                  committed, so it always reads higher than unobligated.
//   unpaid       = obligated − disbursed
//                  Committed but not yet paid — the LGU's forward liability.
//
// The previous implementation had none of this: it read "allocated" off the sum
// of APP entry ABCs, which is the *plan*, and called it the appropriation.

const num = (value) => (value === null || value === undefined ? 0 : Number(value));

// Only an enacted ordinance authorises spending. A draft is a proposal.
const CHARGEABLE = ["enacted"];

// Obligations that still hold money. A cancelled ORS has released its
// reservation and must not count against the balance.
const LIVE_OBLIGATION = { status: "obligated" };

// Disbursement has to be traced from the payment back to the appropriation it
// was authorised under:
//
//   Payment → Invoice → Contract → Award → Rfq → PrHeader → Obligation
//                                                        └→ Appropriation
//
// Walking that per row would be one query per payment per level. This resolves
// it in a fixed number of queries regardless of volume.
const disbursedByObligation = async () => {
  const payments = await Payment.findAll({
    where: { status: "released" },
    include: [
      {
        model: Invoice,
        as: "invoice",
        required: true,
        include: [
          {
            model: Contract,
            as: "contract",
            required: true,
            include: [
              {
                model: Award,
                as: "award",
                required: true,
                include: [{ model: Rfq, as: "rfq", required: true, attributes: ["id", "prHeaderId"] }],
              },
            ],
          },
        ],
      },
    ],
  });

  const byPr = new Map();
  for (const payment of payments) {
    const prHeaderId = payment.invoice?.contract?.award?.rfq?.prHeaderId;
    if (!prHeaderId) continue;
    byPr.set(prHeaderId, (byPr.get(prHeaderId) ?? 0) + num(payment.amount));
  }

  if (byPr.size === 0) return { byObligation: new Map(), byAppropriation: new Map() };

  const obligations = await Obligation.findAll({
    where: { prHeaderId: { [Op.in]: [...byPr.keys()] }, ...LIVE_OBLIGATION },
  });

  const byObligation = new Map();
  const byAppropriation = new Map();
  for (const obligation of obligations) {
    const amount = byPr.get(obligation.prHeaderId) ?? 0;
    if (!amount) continue;
    byObligation.set(obligation.id, amount);
    byAppropriation.set(
      obligation.appropriationId,
      (byAppropriation.get(obligation.appropriationId) ?? 0) + amount
    );
  }

  return { byObligation, byAppropriation };
};

// Grouped SUM as a Map. The column to total is passed in rather than inferred
// from the model, so adding a third caller cannot silently sum the wrong field.
const sumBy = async (model, { groupColumn, sumColumn, where }) => {
  const rows = await model.findAll({
    attributes: [groupColumn, [fn("SUM", col(sumColumn)), "total"]],
    where,
    group: [groupColumn],
    raw: true,
  });
  return new Map(rows.map((row) => [row[groupColumn], num(row.total)]));
};

// How much of an appropriation is still free to commit. This is the number the
// Budget Officer's certification is checked against.
export const availableFor = async (appropriationId, { excludeObligationId } = {}) => {
  const appropriation = await Appropriation.findByPk(appropriationId);
  if (!appropriation) return null;

  const where = { appropriationId, ...LIVE_OBLIGATION };
  if (excludeObligationId) where.id = { [Op.ne]: excludeObligationId };

  const obligated = num(await Obligation.sum("amount", { where }));

  return {
    appropriationId,
    ordinanceNo: appropriation.ordinanceNo,
    title: appropriation.title,
    status: appropriation.status,
    amount: num(appropriation.amount),
    obligated,
    available: num(appropriation.amount) - obligated,
  };
};

// How much of an appropriation the APP has already planned against it. Separate
// from `availableFor` on purpose: planning more than was appropriated is a
// different error from committing more than was appropriated, and they are
// caught at different moments.
export const programmedFor = async (appropriationId, { excludeAppEntryId } = {}) => {
  const appropriation = await Appropriation.findByPk(appropriationId);
  if (!appropriation) return null;

  const where = { appropriationId, status: { [Op.notIn]: RELEASED_APP_STATUSES } };
  if (excludeAppEntryId) where.id = { [Op.ne]: excludeAppEntryId };

  const programmed = num(await AppEntry.sum("abc", { where }));

  return {
    appropriationId,
    ordinanceNo: appropriation.ordinanceNo,
    title: appropriation.title,
    status: appropriation.status,
    amount: num(appropriation.amount),
    programmed,
    unprogrammed: num(appropriation.amount) - programmed,
  };
};

// The full ledger for a fiscal year, per appropriation line and rolled up per
// office. This is what the Budget dashboard reads.
export const buildLedger = async ({ fiscalYear, fund, departmentId } = {}) => {
  const where = { status: { [Op.in]: CHARGEABLE } };
  if (Number.isFinite(Number(fiscalYear))) where.fiscalYear = Number(fiscalYear);
  if (fund) where.fund = fund;
  if (Number.isFinite(Number(departmentId))) where.departmentId = Number(departmentId);

  const appropriations = await Appropriation.findAll({
    where,
    include: [{ model: Department, as: "office" }],
    order: [["ordinanceNo", "ASC"], ["title", "ASC"]],
  });

  const ids = appropriations.map((row) => row.id);
  if (ids.length === 0) {
    return { lines: [], offices: [], totals: emptyTotals() };
  }

  const scoped = { appropriationId: { [Op.in]: ids } };

  const [obligatedMap, programmedMap, disbursement] = await Promise.all([
    sumBy(Obligation, {
      groupColumn: "appropriationId",
      sumColumn: "amount",
      where: { ...scoped, ...LIVE_OBLIGATION },
    }),
    sumBy(AppEntry, {
      groupColumn: "appropriationId",
      sumColumn: "abc",
      where: { ...scoped, status: { [Op.notIn]: RELEASED_APP_STATUSES } },
    }),
    disbursedByObligation(),
  ]);

  const lines = appropriations.map((appropriation) => {
    const amount = num(appropriation.amount);
    const obligated = obligatedMap.get(appropriation.id) ?? 0;
    const programmed = programmedMap.get(appropriation.id) ?? 0;
    const disbursed = disbursement.byAppropriation.get(appropriation.id) ?? 0;

    return {
      id: appropriation.id,
      fiscalYear: appropriation.fiscalYear,
      ordinanceNo: appropriation.ordinanceNo,
      ordinanceDate: appropriation.ordinanceDate,
      type: appropriation.type,
      fund: appropriation.fund,
      expenseClass: appropriation.expenseClass,
      papCode: appropriation.papCode,
      uacsCode: appropriation.uacsCode,
      title: appropriation.title,
      departmentId: appropriation.departmentId,
      departmentCode: appropriation.office?.code ?? "—",
      departmentName: appropriation.office?.name ?? "Unassigned",

      appropriated: amount,
      programmed,
      obligated,
      disbursed,
      unprogrammed: amount - programmed,
      unobligated: amount - obligated,
      unexpended: amount - disbursed,
      unpaid: obligated - disbursed,

      obligationRate: amount > 0 ? Number((obligated / amount).toFixed(4)) : 0,
      utilisationRate: amount > 0 ? Number((disbursed / amount).toFixed(4)) : 0,
    };
  });

  // Roll up per office — budget accountability in an LGU is per office.
  const offices = new Map();
  for (const line of lines) {
    const key = line.departmentId ?? 0;
    if (!offices.has(key)) {
      offices.set(key, {
        departmentId: key,
        departmentCode: line.departmentCode,
        departmentName: line.departmentName,
        lineCount: 0,
        appropriated: 0,
        programmed: 0,
        obligated: 0,
        disbursed: 0,
      });
    }
    const office = offices.get(key);
    office.lineCount += 1;
    office.appropriated += line.appropriated;
    office.programmed += line.programmed;
    office.obligated += line.obligated;
    office.disbursed += line.disbursed;
  }

  const officeRows = [...offices.values()].map((office) => ({
    ...office,
    unobligated: office.appropriated - office.obligated,
    unexpended: office.appropriated - office.disbursed,
    unpaid: office.obligated - office.disbursed,
    obligationRate: office.appropriated > 0 ? Number((office.obligated / office.appropriated).toFixed(4)) : 0,
    utilisationRate: office.appropriated > 0 ? Number((office.disbursed / office.appropriated).toFixed(4)) : 0,
  }));

  const totals = lines.reduce(
    (sum, line) => ({
      appropriated: sum.appropriated + line.appropriated,
      programmed: sum.programmed + line.programmed,
      obligated: sum.obligated + line.obligated,
      disbursed: sum.disbursed + line.disbursed,
      unobligated: sum.unobligated + line.unobligated,
      unexpended: sum.unexpended + line.unexpended,
      unpaid: sum.unpaid + line.unpaid,
    }),
    emptyTotals()
  );

  return {
    lines,
    offices: officeRows.sort((a, b) => b.unobligated - a.unobligated),
    totals,
  };
};

function emptyTotals() {
  return {
    appropriated: 0,
    programmed: 0,
    obligated: 0,
    disbursed: 0,
    unobligated: 0,
    unexpended: 0,
    unpaid: 0,
  };
}

// ── Obligation register ──────────────────────────────────────────────────────
// Issues the ORS number. Sequential per fiscal year, which is how the register
// is kept on paper.
export const nextObligationNo = async (fiscalYear) => {
  const count = await Obligation.count({
    where: { obligationNo: { [Op.like]: `ORS-${fiscalYear}-%` } },
  });
  return `ORS-${fiscalYear}-${String(count + 1).padStart(4, "0")}`;
};

// Resolves the appropriation a requisition draws on, via its APP entry. A
// requisition inherits the budget line its plan was charged against — it cannot
// nominate a different one, or the plan and the spending would diverge.
export const appropriationForRequisition = async (prHeaderId) => {
  const pr = await PrHeader.findByPk(prHeaderId, {
    include: [{ model: AppEntry, as: "appEntry" }],
  });
  return pr?.appEntry?.appropriationId ?? null;
};
