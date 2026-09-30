import test from 'node:test';
import assert from 'node:assert/strict';
import { cents, sumMoney, difference, fiscalYearFilter, paymentGross, calculateFinancialPosition } from '../services/financialCalculations.js';

test('financial arithmetic rounds decimal halves consistently without floating point drift', () => {
  assert.equal(cents('1.005'), 101);
  assert.equal(cents('-1.005'), -101);
  assert.equal(cents('10.075'), 1008);
  assert.equal(cents('9999999999999.99'), 999999999999999);
  assert.equal(cents('1e-10000000'), 0);
  assert.equal(sumMoney(['0.10', '0.20', '0.30'], value => value), 0.60);
  assert.equal(difference('1000.01', '999.99'), 0.02);
  assert.throws(() => cents(Infinity));
  assert.throws(() => cents('9007199254740992'));
});

test('fiscal years default to Philippine year and combine only through an explicit all selection', () => {
  const midnight = new Date('2026-12-31T16:00:00Z');
  assert.equal(fiscalYearFilter(undefined, midnight), 2027);
  assert.equal(fiscalYearFilter('', midnight), 2027);
  assert.equal(fiscalYearFilter('2025', midnight), 2025);
  assert.equal(fiscalYearFilter('all', midnight), null);
  for (const invalid of ['2026.5', '20e2', ['2026'], {}, true, 'garbage', 2101]) {
    assert.throws(() => fiscalYearFilter(invalid), error => error.status === 400);
  }
});

test('APP plans do not reserve money or create savings; gross spending includes deductions', () => {
  const payment = { status: 'released', grossAmount: '100.00', amount: '80.00', ewtAmount: 2, vatWithheldAmount: 5, retentionAmount: 10, liquidatedDamages: 1, otherDeductions: 2 };
  const position = calculateFinancialPosition({ plannedAmount: 1000, allocations: [{ status: 'active', amount: 300 }],
    obligations: [{ status: 'obligated', amount: 200 }, { status: 'cancelled', amount: 900 }],
    payments: [payment, { status: 'prepared', grossAmount: 500 }],
    invoices: [{ status: 'paid', amount: 100 }, { status: 'certified', amount: 30 }, { status: 'submitted', amount: 20 }, { status: 'returned', amount: 40 }],
    closeouts: [{ kind: 'closeout', status: 'submitted', classification: 'contractSavings', amount: 700 }] });
  assert.equal(position.allocated, 300);
  assert.equal(position.obligated, 200);
  assert.equal(position.grossExpenses, 100);
  assert.equal(position.supplierPaid, 80);
  assert.equal(position.taxesWithheld, 7);
  assert.equal(position.outstandingRetention, 10);
  assert.equal(position.unpaid, 100);
  assert.equal(position.unpaidCertifiedGross, 30);
  assert.equal(position.unreviewedInvoiceGross, 20);
  assert.equal(position.totalOutstandingLiabilities, 117);
  assert.equal(position.available, 100);
  assert.equal(position.remainingFunds, 200);
  assert.equal(position.recognizedSavings, 0);
  assert.equal(paymentGross({ ...payment, grossAmount: 0 }), 100);
  assert.equal(calculateFinancialPosition({ plannedAmount: 1000 }).allocated, 0);
});

test('paid and certified costs remain reserved after obligation cancellation; only approved contract closeouts count as savings', () => {
  const position = calculateFinancialPosition({ allocations: [{ status: 'closed', amount: 100 }],
    obligations: [{ status: 'cancelled', amount: 100 }], payments: [{ status: 'released', grossAmount: 80, amount: 70, retentionAmount: 10 }],
    invoices: [{ status: 'paid', amount: 80 }, { status: 'certified', amount: 10 }],
    closeouts: [{ kind: 'closeout', status: 'approved', classification: 'contractSavings', amount: 10 }, { kind: 'closeout', status: 'approved', classification: 'outstandingRetention', amount: 10 }] });
  assert.equal(position.available, 10);
  assert.equal(position.recognizedSavings, 10);
  assert.equal(position.outstandingRetention, 10);
  assert.equal(position.unpaidCertifiedGross, 10);
});
