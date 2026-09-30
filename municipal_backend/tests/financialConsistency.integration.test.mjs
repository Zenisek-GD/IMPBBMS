import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';

test('ledger, project, reports and financial lists use gross expenses and the funding fiscal year', { skip: process.env.RUN_PROCUREMENT_DB_TESTS !== '1', timeout: 180000 }, async t => {
  const scratch = `impbbms_financial_${crypto.randomBytes(8).toString('hex')}`;
  const port = Number(process.env.PROCUREMENT_TEST_DB_PORT ?? 33317);
  Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: scratch, DB_USER: 'root', DB_PASSWORD: '', NODE_ENV: 'test' });
  const admin = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: '' });
  await admin.query(`CREATE DATABASE \`${scratch}\``);
  let db;
  t.after(async () => { await db?.close(); assert.match(scratch, /^impbbms_financial_[a-f0-9]{16}$/); await admin.query(`DROP DATABASE \`${scratch}\``); await admin.end(); });
  const m = await import('../models/index.js'); db = m.sequelize; await db.sync();
  const { buildLedger, allocationBalanceFor } = await import('../services/budgetLedger.js');
  const { projectFinancialPosition } = await import('../services/projectFinancials.js');
  const { getPublicProject, getPublicSummary } = await import('../services/projectLifecycle.js');
  const { getReport } = await import('../controllers/reportController.js');
  const { getDssOverview } = await import('../controllers/dssController.js');
  const { listInvoices } = await import('../controllers/paymentController.js');
  const { listContracts } = await import('../controllers/contractController.js');
  const year = new Date().getFullYear() - 1;
  const office = await m.Department.create({ code: 'FINS', name: 'Financial test office' });
  const appropriation = await m.Appropriation.create({ fiscalYear: year, ordinanceNo: 'ORD-FIN-1', title: 'Computers', amount: '1000.01', status: 'enacted', departmentId: office.id });
  const entry = await m.AppEntry.create({ projectTitle: 'Computers', abc: '900.00', targetStartQuarter: 'Q1', targetCompletionQuarter: 'Q4', fiscalYear: year, status: 'approved', appropriationId: appropriation.id, implementingUnitId: office.id });
  const pr = await m.PrHeader.create({ prNumber: 'PR-FIN-1', dateRequired: `${year}-12-31`, totalAmount: '300.01', status: 'approved', appEntryId: entry.id, departmentId: office.id });
  const obligation = await m.Obligation.create({ obligationNo: 'ORS-FIN-1', amount: '300.01', certifiedAt: new Date(), appropriationId: appropriation.id, prHeaderId: pr.id });
  await m.ProjectAllocation.create({ appEntryId: entry.id, appropriationId: appropriation.id, fiscalYear: year, amount: '400.01', status: 'active' });
  const rfq = await m.Rfq.create({ referenceNo: 'RFQ-FIN-1', title: 'Computers', abc: 900, closingDate: new Date(), status: 'awarded', prHeaderId: pr.id });
  const award = await m.Award.create({ noaNumber: 'NOA-FIN-1', noaDate: `${year}-01-01`, amount: 300.01, status: 'issued', rfqId: rfq.id });
  const contract = await m.Contract.create({ contractNo: 'CON-FIN-1', amount: 300.01, status: 'active', awardId: award.id });
  const invoice = await m.Invoice.create({ invoiceNo: 'INV-FIN-1', amount: '100.01', status: 'paid', submittedAt: new Date(), contractId: contract.id });
  await m.Payment.create({ disbursementNo: 'DV-FIN-1', invoiceId: invoice.id, status: 'released', releasedAt: new Date(), grossAmount: '100.01', amount: '83.01', ewtAmount: 2, vatWithheldAmount: 5, retentionAmount: 10 });
  const permissions = new Set(['budget.view', 'payment.view', 'contract.view', 'bidding.view']);
  const call = async (handler, query = {}, params = {}) => {
    const res = { statusCode: 200, status(value) { this.statusCode = value; return this; }, setHeader() {}, json(value) { this.body = value; return this; } };
    await handler({ query, params, currentUser: { id: 1 }, permissions }, res);
    assert.equal(res.statusCode, 200, res.body?.message); return res.body;
  };

  await t.test('same gross/net/deductions and approved allocations across every surface', async () => {
    const position = await projectFinancialPosition(entry.id);
    const ledger = await buildLedger({ fiscalYear: year });
    const project = await getPublicProject(entry.id);
    const publicSummary = await getPublicSummary({ fiscalYear: year });
    const dss = await call(getDssOverview, { fiscalYear: year });
    const report = await call(getReport, { year }, { type: 'budget-ledger' });
    for (const financial of [position, ledger.totals, project.financials, report.rows[0]]) {
      assert.equal(financial.allocated, 400.01);
      assert.equal(financial.grossExpenses, 100.01);
      assert.equal(financial.supplierPaid, 83.01);
      assert.equal(financial.taxesWithheld, 7);
      assert.equal(financial.retention, 10);
      assert.equal(financial.recognizedSavings, 0);
    }
    assert.equal(position.remainingFunds, 300);
    assert.equal(position.unpaid, 200);
    assert.equal(ledger.totals.unallocated, 600);
    assert.equal(publicSummary.totalGrossExpenses, 100.01);
    assert.equal(dss.headline.totalGrossExpenses, 100.01);
  });

  await t.test('a payment made today remains in its prior-year appropriation across filters and exports', async () => {
    const oldInvoices = await call(listInvoices, { fiscalYear: year, page: 1, pageSize: 10, search: 'INV-FIN' });
    assert.equal(oldInvoices.rows.length, 1); assert.equal(oldInvoices.rows[0].fiscalYear, year);
    assert.equal((await call(listInvoices, { fiscalYear: year + 1 })).length, 0);
    assert.equal((await call(listInvoices, { fiscalYear: 'all' })).length, 1);
    assert.equal((await call(listContracts, { fiscalYear: year, search: 'CON-FIN' }))[0].fiscalYear, year);
    assert.equal((await call(listContracts, { fiscalYear: year + 1 })).length, 0);
    assert.equal((await buildLedger({ fiscalYear: year + 1 })).totals.grossExpenses, 0);
    assert.equal((await call(getReport, { year: year + 1 }, { type: 'budget-ledger' })).total, 0);
    assert.equal((await call(getReport, { year: 'all' }, { type: 'awarded-contracts' })).rows[0].year, year);
  });

  await t.test('legacy direct APP solicitations stay visible and a cancelled ORS cannot free money already spent', async () => {
    await rfq.update({ prHeaderId: null, appEntryId: entry.id });
    await obligation.update({ status: 'cancelled' });
    await m.ProjectAllocation.update({ amount: 0 }, { where: { appEntryId: entry.id } });
    assert.equal((await projectFinancialPosition(entry.id)).grossExpenses, 100.01);
    assert.equal((await getPublicProject(entry.id)).financials.grossExpenses, 100.01);
    assert.equal((await call(listInvoices, { fiscalYear: year }))[0].fiscalYear, year);
    const reservation = await allocationBalanceFor(appropriation.id);
    assert.equal(reservation.reserved, 100.01);
    assert.equal(reservation.unallocatedAvailable, 900);
  });
});
