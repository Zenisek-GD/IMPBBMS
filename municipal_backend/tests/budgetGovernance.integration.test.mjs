import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';

test('documented budget controls reserve funds, govern reuse and preserve annual authority', { skip: process.env.RUN_PROCUREMENT_DB_TESTS !== '1', timeout: 240000 }, async t => {
  const scratch = `impbbms_budget_governance_${crypto.randomBytes(8).toString('hex')}`;
  const port = Number(process.env.PROCUREMENT_TEST_DB_PORT ?? 33317);
  Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: scratch, DB_USER: 'root', DB_PASSWORD: '', NODE_ENV: 'test' });
  const admin = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: '' });
  await admin.query(`CREATE DATABASE \`${scratch}\``);
  let m;
  t.after(async () => { if (m) await m.sequelize.close(); assert.match(scratch, /^impbbms_budget_governance_[a-f0-9]{16}$/); await admin.query(`DROP DATABASE \`${scratch}\``); await admin.end(); });
  m = await import('../models/index.js'); await m.sequelize.sync();
  const api = await import('../controllers/budgetControlController.js');
  const appropriationApi = await import('../controllers/appropriationController.js');
  const prApi = await import('../controllers/prController.js');
  const documentApi = await import('../controllers/documentController.js');
  const { reconcileReenactedAppropriations, transferableProjectBalance } = await import('../services/budgetControls.js');
  const { withAuditTransaction, verifyChain } = await import('../services/auditLog.js');
  const { buildLedger } = await import('../services/budgetLedger.js');
  const { projectFinancialPosition } = await import('../services/projectFinancials.js');
  const { attachRecordChangeAudit, withRecordChangeAudit } = await import('../services/recordChangeAudit.js');
  attachRecordChangeAudit();
  const office = await m.Department.create({ name: 'Health', code: 'HLTH' });
  const role = await m.Role.create({ key: 'budgetTest', name: 'Budget test' });
  const actor = async name => {
    const row = await m.User.create({ name, email: `${name}@example.test`, password: 'ExamplePassword123!', departmentId: office.id, roleId: role.id }); row.Role = role; return row;
  };
  const requester = await actor('requester'), approver = await actor('approver');
  const perms = new Set(['budget.view', 'budget.requestControl', 'budget.approveControl', 'budget.manageAppropriations', 'pr.obligate', 'pr.certify']);
  const call = async (handler, user = requester, params = {}, body = {}, query = {}) => {
    const req = { currentUser: user, permissions: perms, params, body, query, ip: '127.0.0.1' };
    const res = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
    await withRecordChangeAudit(req, () => handler(req, res));
    if (res.code >= 400) throw new Error(res.body?.message);
    return res.body;
  };
  let serial = 0;
  const fund = (amount = 1000, extra = {}) => m.Appropriation.create({ fiscalYear: 2026, title: `Appropriation ${++serial}`, ordinanceNo: `ORD-${serial}`, ordinanceDate: '2026-01-01', amount, status: 'enacted', departmentId: office.id, ...extra });
  const project = async (appropriation, abc = 200, sector = 'social') => {
    const goal = await m.DevelopmentGoal.create({ title: `Goal ${++serial}`, sector });
    const aip = await m.AipEntry.create({ title: `Investment ${serial}`, estimatedCost: abc, developmentGoalId: goal.id, implementingUnitId: office.id });
    return m.AppEntry.create({ projectTitle: `Project ${serial}`, abc, fiscalYear: appropriation.fiscalYear, planCycle: 'final', planStage: 'finalApp', status: 'approved', implementingUnitId: office.id, appropriationId: appropriation.id, aipEntryId: aip.id, category: 'goods', targetStartQuarter: 'Q1', targetCompletionQuarter: 'Q4' });
  };
  const draft = (kind, source, amount, extra = {}) => call(api.createBudgetControl, requester, {}, { kind, fiscalYear: source?.fiscalYear ?? 2026, sourceProjectId: source?.id, amount, reason: 'Documented project funding action.', authorityReference: 'ORD-AUG-2026-01', ...extra });
  const evidence = row => m.Document.create({ entityRef: 'budgetControlRequest', entityId: row.id, filename: `authority-${row.id}.pdf`, mimeType: 'application/pdf', sizeBytes: 16, content: Buffer.from('%PDF-authority'), checksum: `document-${row.id}`, uploadedAt: new Date(), uploadedById: requester.id });
  const submit = row => call(api.transitionBudgetControl, requester, { id: row.id }, { action: 'submit' });
  const approve = (row, user = approver) => call(api.transitionBudgetControl, user, { id: row.id }, { action: 'approve', remarks: 'Authority and final balances independently verified.' });
  const prepare = async (...args) => { const row = await draft(...args); await evidence(row); await submit(row); return row; };
  const allocate = async (entry, amount) => approve(await prepare('allocation', entry, amount));
  const closeout = (entry, amount, extra = {}) => prepare('closeout', entry, amount, { classification: 'unusedAppropriation', payload: { finalAccountsConfirmed: true, liabilitiesReviewed: true, reuseAuthorized: true }, ...extra });
  const makePr = async (entry, amount, status = 'pendingAccountantObligation') => {
    const row = await m.PrHeader.create({ prNumber: `PR-${++serial}`, dateRequired: '2026-12-31', appEntryId: entry.id, departmentId: office.id, requesterId: requester.id, totalAmount: amount, status });
    await m.PrLineItem.create({ prHeaderId: row.id, description: 'Office supplies', quantity: 1, unit: 'lot', unitCost: amount, lineTotal: amount }); return row;
  };

  await t.test('enacted authority and reenactment cannot bypass documented independent approval', async () => {
    await assert.rejects(call(appropriationApi.createAppropriation, requester, {}, { fiscalYear: 2026, title: 'Unauthorized', amount: 100, ordinanceNo: 'FAKE', status: 'enacted' }), /Direct records must remain drafts/);
    await assert.rejects(call(appropriationApi.reenactPriorYear, requester, {}, { fiscalYear: 2026 }), /documented budget control request/);
    const entry = await project(await fund());
    const row = await draft('allocation', entry, 100);
    await assert.rejects(submit(row), /Attach the supporting/);
    const document = await evidence(row); await submit(row);
    await assert.rejects(approve(row, requester), /independent authorized/);
    await assert.rejects(call(api.updateBudgetControl, requester, { id: row.id }, { amount: 200 }), /unsubmitted draft/);
    await assert.rejects(call(documentApi.deleteDocument, requester, { id: document.id }), /permanently preserved/);
    const races = await Promise.allSettled([approve(row), approve(row)]);
    assert.equal(races.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal(await m.ProjectAllocation.count({ where: { appEntryId: entry.id } }), 1);
    const changedProject = await project(await fund());
    const submitted = await prepare('allocation', changedProject, 50);
    await changedProject.update({ appropriationId: (await fund()).id });
    await assert.rejects(approve(submitted), /funding authority changed after submission/);
  });

  await t.test('competing allocations and PR obligations cannot spend another project reservation', async () => {
    const appropriation = await fund(100);
    const first = await project(appropriation, 100), second = await project(appropriation, 100);
    const rows = await Promise.all([prepare('allocation', first, 80), prepare('allocation', second, 80)]);
    const races = await Promise.allSettled(rows.map(row => approve(row)));
    assert.equal(races.filter(row => row.status === 'fulfilled').length, 1);
    const loserProject = races[0].status === 'rejected' ? first : second;
    const deniedPr = await makePr(loserProject, 10);
    await assert.rejects(call(prApi.transitionPr, approver, { id: deniedPr.id }, { action: 'obligate' }), /active project allocation/);
    const winnerProject = races[0].status === 'fulfilled' ? first : second;
    const prs = await Promise.all([makePr(winnerProject, 60), makePr(winnerProject, 60)]);
    const obligations = await Promise.allSettled(prs.map(pr => call(prApi.transitionPr, approver, { id: pr.id }, { action: 'obligate' })));
    assert.equal(obligations.filter(row => row.status === 'fulfilled').length, 1);
    assert.equal(Number(await m.Obligation.sum('amount', { where: { appropriationId: appropriation.id } })), 60);
  });

  let source, destination;
  await t.test('unused funds require approved closeout and explicit reuse authority', async () => {
    const appropriation = await fund(1000);
    source = await project(appropriation, 200); destination = await project(appropriation, 200);
    await allocate(source, 80); await allocate(destination, 20);
    assert.equal((await projectFinancialPosition(source.id)).recognizedSavings, 0);
    const premature = await prepare('transfer', source, 10, { destinationProjectId: destination.id, payload: { savingsAuthorityConfirmed: true } });
    await assert.rejects(approve(premature), /financial closeout/);
    const wrongClass = await closeout(source, 80, { classification: 'contractSavings' });
    await assert.rejects(approve(wrongClass), /completed contract/);
    const ordinary = await project(appropriation, 200); await allocate(ordinary, 10);
    await approve(await closeout(ordinary, 10, { payload: { finalAccountsConfirmed: true, liabilitiesReviewed: true } }));
    assert.equal(await transferableProjectBalance(ordinary.id), 0);
    const unusedApproved = await approve(await closeout(source, 80));
    assert.equal(unusedApproved.beforeBalances.project.financialCloseoutApproved, false);
    assert.equal(unusedApproved.afterBalances.project.recognizedSavings, 0);
    assert.deepEqual(unusedApproved.afterBalances.project, await projectFinancialPosition(source.id));
    assert.equal(await transferableProjectBalance(source.id), 80);
  });

  await t.test('cross-sector/fund transfers are refused; concurrent reuse preserves before and after balances', async () => {
    const foreignSector = await project(await fund(), 200, 'infrastructure'); await allocate(foreignSector, 20);
    const foreignFund = await project(await fund(1000, { fund: 'specialEducationFund' }), 200); await allocate(foreignFund, 20);
    for (const target of [foreignSector, foreignFund]) {
      const row = await prepare('transfer', source, 10, { destinationProjectId: target.id, payload: { savingsAuthorityConfirmed: true } });
      await assert.rejects(approve(row), /permitted fiscal year|verified development sector/);
    }
    const rows = await Promise.all([1, 2].map(() => prepare('transfer', source, 60, { destinationProjectId: destination.id, payload: { savingsAuthorityConfirmed: true } })));
    const races = await Promise.allSettled(rows.map(row => approve(row)));
    assert.equal(races.filter(row => row.status === 'fulfilled').length, 1);
    const winner = races.find(row => row.status === 'fulfilled').value;
    assert.equal(winner.beforeBalances.source.allocated, 80);
    assert.equal(winner.afterBalances.source.allocated, 20);
    assert.equal(winner.afterBalances.destination.allocated, 80);
    assert.equal(await transferableProjectBalance(source.id), 20);
    const audit = await m.AuditLog.findOne({ where: { actionType: 'budget.control.approve', entityId: winner.id } });
    assert.equal(audit.actorId, approver.id); assert.equal(audit.afterState.authorityReference, 'ORD-AUG-2026-01');
  });

  await t.test('failed approval audit rolls back all reservations and preserves the submitted request', async () => {
    const entry = await project(await fund()); const row = await prepare('allocation', entry, 99.99);
    m.AuditLog.addHook('beforeCreate', 'failBudgetDecision', log => { if (log.actionType === 'budget.control.approve') throw new Error('Audit storage unavailable'); });
    try { await assert.rejects(approve(row), /Audit storage unavailable/); } finally { m.AuditLog.removeHook('beforeCreate', 'failBudgetDecision'); }
    assert.equal(await m.ProjectAllocation.count({ where: { appEntryId: entry.id } }), 0);
    assert.equal((await m.BudgetControlRequest.findByPk(row.id)).status, 'submitted');
  });

  await t.test('final closeout releases only excess ORS and keeps gross expense, tax and retention distinct', async () => {
    const entry = await project(await fund()); await allocate(entry, 100);
    const pr = await makePr(entry, 100, 'approved');
    const obligation = await m.Obligation.create({ obligationNo: `ORS-${++serial}`, amount: 100, status: 'obligated', certifiedAt: new Date(), appropriationId: entry.appropriationId, prHeaderId: pr.id });
    const rfq = await m.Rfq.create({ referenceNo: `RFQ-${serial}`, title: 'Completed purchase', abc: 100, closingDate: new Date(), status: 'awarded', prHeaderId: pr.id });
    const award = await m.Award.create({ noaNumber: `NOA-${serial}`, noaDate: '2026-01-01', amount: 60, status: 'accepted', rfqId: rfq.id });
    const contract = await m.Contract.create({ contractNo: `CON-${serial}`, amount: 60, status: 'active', awardId: award.id });
    const invoice = await m.Invoice.create({ invoiceNo: `INV-${serial}`, amount: 60, submittedAt: new Date(), status: 'submitted', contractId: contract.id });
    const row = await closeout(entry, 40, { classification: 'contractSavings', payload: { finalAccountsConfirmed: true, liabilitiesReviewed: true, cancelExcessObligations: true } });
    await assert.rejects(approve(row), /every contract/);
    await contract.update({ status: 'completed' }); await assert.rejects(approve(row), /unpaid supplier invoices/);
    await invoice.update({ status: 'paid' });
    await m.Payment.create({ disbursementNo: `DV-${serial}`, invoiceId: invoice.id, grossAmount: 60, amount: 50, ewtAmount: 4, retentionAmount: 6, status: 'released' });
    const approved = await approve(row);
    assert.equal(Number((await obligation.reload()).amount), 60);
    assert.equal(approved.afterBalances.project.grossExpenses, 60);
    assert.equal(approved.afterBalances.project.supplierPaid, 50);
    assert.equal(approved.afterBalances.retainedLiabilities.taxesAwaitingRemittance, 4);
    assert.equal(approved.afterBalances.retainedLiabilities.outstandingRetention, 6);
    assert.equal(approved.beforeBalances.project.recognizedSavings, 0);
    assert.equal(approved.beforeBalances.project.financialCloseoutApproved, false);
    assert.equal(approved.afterBalances.project.recognizedSavings, 40);
    assert.equal(approved.afterBalances.project.financialCloseoutApproved, true);
    const persisted = await m.BudgetControlRequest.findByPk(approved.id);
    assert.deepEqual(persisted.afterBalances.project, await projectFinancialPosition(entry.id));
    const closeoutAudit = await m.AuditLog.findOne({ where: { actionType: 'budget.control.approve', entityId: approved.id } });
    assert.deepEqual(closeoutAudit.afterState.afterBalances.project, persisted.afterBalances.project);
    assert.equal(await transferableProjectBalance(entry.id), 40);
    const incomplete = await project(await fund()); await allocate(incomplete, 100);
    const incompleteRfq = await m.Rfq.create({ referenceNo: `RFQ-UNSETTLED-${++serial}`, title: 'Missing final billing', abc: 100, closingDate: new Date(), status: 'awarded', appEntryId: incomplete.id });
    const incompleteAward = await m.Award.create({ noaNumber: `NOA-UNSETTLED-${serial}`, noaDate: '2026-01-01', amount: 60, status: 'accepted', rfqId: incompleteRfq.id });
    await m.Contract.create({ contractNo: `CON-UNSETTLED-${serial}`, amount: 60, status: 'completed', awardId: incompleteAward.id });
    await assert.rejects(approve(await closeout(incomplete, 100, { classification: 'contractSavings' })), /fully accounted for/);
  });

  await t.test('correction cannot remove committed authority and approved correction records both values', async () => {
    const appropriation = await fund(100); const entry = await project(appropriation); await allocate(entry, 80);
    const low = await prepare('correction', null, 70, { sourceAppropriationId: appropriation.id });
    await assert.rejects(approve(low), /allocated or obligated/);
    const valid = await prepare('correction', null, 110, { sourceAppropriationId: appropriation.id });
    const updated = await approve(valid);
    assert.equal(Number(updated.beforeBalances.appropriation.amount), 100);
    assert.equal(Number(updated.afterBalances.appropriation.amount), 110);
    const migration = await prepare('migration', null, 110, { payload: { title: appropriation.title, ordinanceNo: appropriation.ordinanceNo, ordinanceDate: '2026-01-01', fund: appropriation.fund, expenseClass: appropriation.expenseClass, type: appropriation.type, departmentId: office.id } });
    await assert.rejects(approve(migration), /already recorded/);
  });

  await t.test('reenactment selects eligible lines and respects recurring income; final annual authority replaces it', async () => {
    const preceding = await fund(100, { fiscalYear: 2024, title: 'Essential operations', type: 'annual' });
    const options = { fiscalYear: 2025, payload: { reenactmentLines: [{ sourceAppropriationId: preceding.id, amount: 80, eligibility: 'essentialOperations' }], incomeEstimatesReviewed: true, recurringIncomeAmount: 70 } };
    const insufficient = await prepare('reenactment', null, 0, options);
    await assert.rejects(approve(insufficient), /recurring income/);
    assert.equal(await m.Appropriation.count({ where: { fiscalYear: 2025, type: 'reenacted' } }), 0);
    const valid = await prepare('reenactment', null, 0, { ...options, payload: { ...options.payload, recurringIncomeAmount: 80 } });
    await approve(valid);
    const reenacted = await m.Appropriation.findOne({ where: { fiscalYear: 2025, type: 'reenacted' } });
    const entry = await project(reenacted); await allocate(entry, 50);
    const budget = { id: 12345, fiscalYear: 2025, type: 'annual', ordinanceNo: 'ANNUAL-2025' };
    const final = await fund(40, { fiscalYear: 2025, title: 'Essential operations', type: 'annual', ordinanceNo: 'ANNUAL-2025' });
    await assert.rejects(withAuditTransaction(transaction => reconcileReenactedAppropriations(budget, [final], transaction)), /cannot cover/);
    assert.equal((await entry.reload()).appropriationId, reenacted.id);
    await final.update({ amount: 100 });
    await withAuditTransaction(transaction => reconcileReenactedAppropriations(budget, [final], transaction));
    assert.equal((await reenacted.reload()).status, 'closed');
    assert.equal((await entry.reload()).appropriationId, final.id);
    assert.equal((await m.ProjectAllocation.findOne({ where: { appEntryId: entry.id } })).appropriationId, final.id);
    const ledger = await buildLedger({ fiscalYear: 2025 });
    assert.equal(ledger.totals.appropriated, 100);
  });

  await t.test('budget list exposes scoped financial balances and actor-specific next actions', async () => {
    const data = await call(api.listBudgetControls, requester, {}, {}, { fiscalYear: 2026 });
    assert.ok(data.projects.every(row => row.fiscalYear === 2026));
    assert.equal(data.projects.find(row => row.id === source.id).approvedTransferable, 20);
    assert.ok(data.requests.filter(row => row.status === 'submitted').every(row => !row.canApprove));
    const all = await call(api.listBudgetControls, approver, {}, {}, { fiscalYear: 'all' });
    assert.equal(all.fiscalYear, 'all'); assert.ok(all.requests.some(row => row.canApprove));
    assert.equal((await verifyChain({})).intact, true);
  });
});
