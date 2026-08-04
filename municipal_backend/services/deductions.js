// ── DISBURSEMENT VOUCHER DEDUCTIONS ──────────────────────────────────────────
// A government disbursement voucher is `gross − deductions = net`. The system
// previously paid the invoice amount in full, which handed the supplier four
// separate categories of money the LGU is legally obliged to withhold:
//
//   · Expanded withholding tax  — remitted to the BIR
//   · Final VAT withholding     — remitted to the BIR
//   · Retention money           — held, then released after final acceptance
//   · Liquidated damages        — the LGU's, as compensation for delay
//
// Everything here is computed from stored facts (the supplier's tax profile,
// the contract's category and time record) rather than typed in, so the same
// invoice always produces the same voucher and a reviewer can reproduce it.

// Expanded withholding tax. The rate turns on what is being supplied.
const EWT_RATE = { goods: 0.01, services: 0.02 };

// Final VAT withheld on government purchases, applied to the VAT-exclusive
// price and only where the supplier is VAT-registered.
const GOVERNMENT_VAT_WITHHOLDING_RATE = 0.05;

// The VAT rate embedded in a VAT-registered supplier's quoted price.
const VAT_RATE = 0.12;

// Retention on infrastructure progress billings, released after final
// acceptance and the lapse of the warranty period.
const INFRASTRUCTURE_RETENTION_RATE = 0.1;

// Liquidated damages accrue at one tenth of one percent of the cost of the
// unperformed portion, per day of delay.
const LD_DAILY_RATE = 0.001;

// Once liquidated damages reach ten percent of the contract price the LGU may
// rescind. The system does not rescind automatically — that is a decision, not
// an arithmetic result — but it flags the threshold.
const LD_RESCISSION_THRESHOLD = 0.1;

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

// Day zero is the Notice to Proceed. Contract time is counted in calendar days
// from the NTP, extended by any approved time extension. A contract with no NTP
// has not started, so it cannot be late.
export const contractTimeStatus = (contract, asOf = new Date()) => {
  if (!contract?.noticeToProceedAt || !contract?.contractDays) {
    return { started: false, daysOfDelay: 0, dueAt: null, reason: "No Notice to Proceed on record." };
  }

  const ntp = new Date(contract.noticeToProceedAt);
  const allowedDays = Number(contract.contractDays) + Number(contract.timeExtensionDays ?? 0);

  const dueAt = new Date(ntp);
  dueAt.setDate(dueAt.getDate() + allowedDays);

  // Delay stops accruing on actual completion; until then it runs to today.
  const endPoint = contract.actualCompletionAt ? new Date(contract.actualCompletionAt) : new Date(asOf);
  const msLate = endPoint - dueAt;
  const daysOfDelay = msLate > 0 ? Math.floor(msLate / 86400000) : 0;

  return {
    started: true,
    ntp,
    allowedDays,
    dueAt,
    completedAt: contract.actualCompletionAt ?? null,
    daysOfDelay,
  };
};

// `unperformedValue` is the cost of the portion not delivered on time. For a
// single-delivery contract that is the whole contract; for progress billing it
// is what remained outstanding when the deadline passed. Passed in rather than
// inferred, because only the caller knows which billing is being computed.
export const liquidatedDamagesFor = (contract, { unperformedValue, asOf } = {}) => {
  const time = contractTimeStatus(contract, asOf);
  if (!time.started || time.daysOfDelay <= 0) {
    return { amount: 0, daysOfDelay: 0, rescindable: false, note: null };
  }

  const base = Number(unperformedValue ?? contract.amount);
  const amount = round2(base * LD_DAILY_RATE * time.daysOfDelay);
  const ceiling = Number(contract.amount) * LD_RESCISSION_THRESHOLD;

  return {
    amount: Math.min(amount, ceiling),
    daysOfDelay: time.daysOfDelay,
    dueAt: time.dueAt,
    // At 10% of the contract price the LGU acquires the right to rescind.
    rescindable: amount >= ceiling,
    note:
      `${time.daysOfDelay} day(s) beyond the ${time.allowedDays}-day contract period` +
      (amount >= ceiling ? " — liquidated damages have reached the 10% rescission threshold." : "."),
  };
};

// The full voucher computation for one invoice.
//
//   vendor   — supplies the tax profile (VAT registration, goods vs services)
//   contract — supplies the category (retention) and the time record (LD)
export const computeDeductions = ({ grossAmount, vendor, contract, asOf } = {}) => {
  const gross = round2(grossAmount);

  // A VAT-registered supplier's price includes 12% VAT, and both the EWT and
  // the withheld VAT are computed on the VAT-exclusive amount. Treating the
  // gross as the tax base would over-withhold on every voucher.
  const isVatRegistered = vendor?.isVatRegistered ?? false;
  const netOfVat = isVatRegistered ? round2(gross / (1 + VAT_RATE)) : gross;
  const vatComponent = round2(gross - netOfVat);

  const classification = vendor?.taxClassification ?? "goods";
  const ewtRate = EWT_RATE[classification] ?? EWT_RATE.goods;
  const ewtAmount = round2(netOfVat * ewtRate);

  const vatWithheldAmount = isVatRegistered
    ? round2(netOfVat * GOVERNMENT_VAT_WITHHOLDING_RATE)
    : 0;

  // Retention applies to infrastructure only. Goods are covered by a warranty
  // security instead, so withholding retention on them would be double-securing.
  const isInfrastructure = contract?.category === "infrastructure";
  const retentionAmount = isInfrastructure ? round2(gross * INFRASTRUCTURE_RETENTION_RATE) : 0;

  const ld = contract
    ? liquidatedDamagesFor(contract, { unperformedValue: gross, asOf })
    : { amount: 0, daysOfDelay: 0, rescindable: false, note: null };

  const totalDeductions = round2(ewtAmount + vatWithheldAmount + retentionAmount + ld.amount);
  const netAmount = round2(gross - totalDeductions);

  return {
    grossAmount: gross,
    ewtAmount,
    vatWithheldAmount,
    retentionAmount,
    liquidatedDamages: ld.amount,
    otherDeductions: 0,
    totalDeductions,
    netAmount,
    rescindable: ld.rescindable,

    // Written onto the voucher so the arithmetic is auditable without rerunning
    // this function — the rates in force at the time are part of the record.
    breakdown: {
      vatRegistered: isVatRegistered,
      taxClassification: classification,
      vatExclusiveBase: netOfVat,
      vatComponent,
      lines: [
        {
          label: `Expanded withholding tax (${(ewtRate * 100).toFixed(0)}% on ${classification})`,
          base: netOfVat,
          rate: ewtRate,
          amount: ewtAmount,
        },
        ...(isVatRegistered
          ? [
              {
                label: "Final VAT withheld on government purchase (5%)",
                base: netOfVat,
                rate: GOVERNMENT_VAT_WITHHOLDING_RATE,
                amount: vatWithheldAmount,
              },
            ]
          : []),
        ...(isInfrastructure
          ? [
              {
                label: "Retention money (10% — released after final acceptance)",
                base: gross,
                rate: INFRASTRUCTURE_RETENTION_RATE,
                amount: retentionAmount,
              },
            ]
          : []),
        ...(ld.amount > 0
          ? [
              {
                label: `Liquidated damages (${ld.daysOfDelay} day(s) delay)`,
                base: gross,
                rate: LD_DAILY_RATE * ld.daysOfDelay,
                amount: ld.amount,
                note: ld.note,
              },
            ]
          : []),
      ],
    },
  };
};

export const RATES = {
  EWT_RATE,
  GOVERNMENT_VAT_WITHHOLDING_RATE,
  VAT_RATE,
  INFRASTRUCTURE_RETENTION_RATE,
  LD_DAILY_RATE,
  LD_RESCISSION_THRESHOLD,
};
