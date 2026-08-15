import { Op } from "sequelize";

// ── Official reference numbers ───────────────────────────────────────────────
// PR, Contract, Invoice, Disbursement Voucher, RFQ/ITB and Notice of Award all
// carry a human-facing serial of the form PREFIX-YEAR-NNNN. Two problems with
// deriving that serial from a row COUNT, as the controllers used to:
//
//   1. It is not atomic. Two records created in the same instant both read the
//      same count and generate the same number; the unique index then rejects
//      the second INSERT and the caller sees a 500. `withSequenceRetry` turns
//      that lost race into a transparent retry.
//
//   2. COUNT is not stable under deletion. Remove a row and the next insert
//      reuses a retired number. Deriving the next value from the highest number
//      actually present keeps the series monotonic instead.

// Highest existing serial in a per-year series, plus one, formatted. Pass the
// surrounding transaction (if any) so the read participates in it.
export const nextSequenceNo = async (Model, column, prefix, year, { transaction } = {}) => {
  const rows = await Model.findAll({
    where: { [column]: { [Op.like]: `${prefix}-${year}-%` } },
    attributes: [column],
    transaction,
  });

  const highest = rows.reduce((top, row) => {
    const serial = parseInt(String(row[column]).split("-").pop(), 10);
    return Number.isFinite(serial) && serial > top ? serial : top;
  }, 0);

  return `${prefix}-${year}-${String(highest + 1).padStart(4, "0")}`;
};

// Runs `fn`, retrying only when a concurrent insert claimed the same serial
// first (a unique-constraint violation). Any other error propagates at once.
// `fn` must generate the number AND perform the insert, so a retry produces a
// fresh number — wrap the whole transaction when the insert is transactional.
export const withSequenceRetry = async (fn, attempts = 5) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err?.name === "SequelizeUniqueConstraintError" && attempt < attempts) continue;
      throw err;
    }
  }
};
