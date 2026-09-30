// Money is added in centavos, so the same voucher produces the same balances
// in the ledger, project page, closeout review and reports.
export const cents = (value) => {
  const text = String(value ?? 0).trim();
  if (!text || !Number.isFinite(Number(text))) throw new TypeError("A financial amount must be finite.");
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match) throw new TypeError("A financial amount must be a decimal number.");
  const [, sign, whole, fraction = "", exponent = "0"] = match;
  const digits = BigInt(whole + fraction);
  const scale = fraction.length - Number(exponent) - 2;
  if (scale > whole.length + fraction.length + 1) return 0;
  const divisor = scale > 0 ? 10n ** BigInt(scale) : 1n;
  const absolute = scale > 0 ? (digits + divisor / 2n) / divisor : digits * 10n ** BigInt(-scale);
  const amount = Number(sign === "-" ? -absolute : absolute);
  if (!Number.isSafeInteger(amount)) throw new RangeError("A financial amount exceeds supported precision.");
  return amount;
};
export const money = (value) => cents(value) / 100;
export const sumMoney = (rows, select) => {
  const total = rows.reduce((sum, row) => sum + BigInt(cents(select(row))), 0n);
  if (!Number.isSafeInteger(Number(total))) throw new RangeError("The financial total exceeds supported precision.");
  return Number(total) / 100;
};
export const difference = (left, right) => (cents(left) - cents(right)) / 100;

export function fiscalYearFilter(value, now = new Date()) {
  if (value === "all") return null;
  if (value != null && typeof value !== "number" && (typeof value !== "string" || !/^\d{4}$/.test(value) && value !== "")) {
    throw Object.assign(new Error("Choose a valid fiscal year, or explicitly choose all years."), { status: 400 });
  }
  const year = value == null || value === "" ? Number(new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 4)) : Number(value);
  if (!Number.isInteger(year) || year < 2001 || year > 2100) {
    throw Object.assign(new Error("Choose a valid fiscal year, or explicitly choose all years."), { status: 400 });
  }
  return year;
}

export function paymentGross(payment) {
  if (Number(payment.grossAmount) > 0) return money(payment.grossAmount);
  // Legacy vouchers predate the gross column. Reconstruct only from their
  // recorded net and deductions; never substitute a project's APP estimate.
  return sumMoney(["amount", "ewtAmount", "vatWithheldAmount", "retentionAmount", "liquidatedDamages", "otherDeductions"], (key) => payment[key]);
}

export function calculateFinancialPosition({ plannedAmount = 0, allocations = [], obligations = [], invoices = [], payments = [], closeouts = [] } = {}) {
  const released = payments.filter((row) => row.status === "released");
  const approvedCloseouts = closeouts.filter((row) => row.kind === "closeout" && row.status === "approved");
  const allocated = sumMoney(allocations.filter((row) => ["active", "closed"].includes(row.status)), (row) => row.amount);
  const obligated = sumMoney(obligations.filter((row) => row.status === "obligated"), (row) => row.amount);
  const grossExpenses = sumMoney(released, paymentGross);
  const supplierPaid = sumMoney(released, (row) => row.amount);
  const taxesWithheld = sumMoney(released, (row) => sumMoney([row.ewtAmount, row.vatWithheldAmount], (value) => value));
  const retention = sumMoney(released, (row) => row.retentionAmount);
  const liquidatedDamages = sumMoney(released, (row) => row.liquidatedDamages);
  const otherDeductions = sumMoney(released, (row) => row.otherDeductions);
  const invoicedGross = sumMoney(invoices.filter((row) => ["submitted", "certified", "paid"].includes(row.status)), (row) => row.amount);
  const certifiedGross = sumMoney(invoices.filter((row) => ["certified", "paid"].includes(row.status)), (row) => row.amount);
  const recognizedSavings = sumMoney(approvedCloseouts.filter((row) => row.classification === "contractSavings"), (row) => row.amount);
  const unpaid = Math.max(0, difference(obligated, grossExpenses));
  const unreleasedInvoices = invoices.filter((row) => ["submitted", "certified"].includes(row.status));
  const unreviewedInvoiceGross = sumMoney(invoices.filter((row) => row.status === "submitted"), (row) => row.amount);
  const unpaidCertifiedGross = sumMoney(invoices.filter((row) => row.status === "certified"), (row) => row.amount);
  const reserved = Math.max(obligated, grossExpenses, certifiedGross);
  return {
    plannedAmount: money(plannedAmount), allocated, obligated, invoicedGross, certifiedGross,
    grossExpenses, supplierPaid, taxesWithheld, retention, liquidatedDamages, otherDeductions,
    unpaid, unpaidCertifiedGross, unreviewedInvoiceGross,
    unsettledInvoiceCount: unreleasedInvoices.length,
    // These deductions remain liabilities until a separate remittance or
    // retention-release record proves settlement. They are not savings.
    outstandingRetention: retention, taxesAwaitingRemittance: taxesWithheld,
    remainingFunds: difference(allocated, grossExpenses), available: difference(allocated, reserved),
    approvedAvailable: Math.max(0, difference(allocated, reserved)),
    totalOutstandingLiabilities: sumMoney([Math.max(unpaid, unpaidCertifiedGross), retention, taxesWithheld], (value) => value),
    recognizedSavings, financialCloseoutApproved: approvedCloseouts.length > 0,
  };
}
