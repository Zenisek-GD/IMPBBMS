import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';

test('budget preparation preserves audited records, stage ownership and one appropriation release', { skip: process.env.RUN_PROCUREMENT_DB_TESTS !== '1', timeout: 180000 }, async t => {
  const scratch = `impbbms_budget_records_${crypto.randomBytes(8).toString('hex')}`;
  const port = Number(process.env.PROCUREMENT_TEST_DB_PORT ?? 33317);
  Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: scratch, DB_USER: 'root', DB_PASSWORD: '', NODE_ENV: 'test' });
  const admin = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: '' });
  await admin.query(`CREATE DATABASE \`${scratch}\``);
  let m;
  t.after(async () => { if (m) await m.sequelize.close(); assert.match(scratch, /^impbbms_budget_records_[a-f0-9]{16}$/); await admin.query(`DROP DATABASE \`${scratch}\``); await admin.end(); });
  m = await import('../models/index.js'); await m.sequelize.sync();
  const api = await import('../controllers/budgetPreparationController.js');
  const proposalApi = await import('../controllers/budgetProposalController.js');
  const { attachRecordChangeAudit, withRecordChangeAudit } = await import('../services/recordChangeAudit.js');
  const { verifyChain } = await import('../services/auditLog.js');
  attachRecordChangeAudit();
  const office = await m.Department.create({ code: 'BUD', name: 'Budget Office' });
  const role = await m.Role.create({ key: 'budgetRecordsTest', name: 'Budget test role' });
  const user = await m.User.create({ name: 'Budget Officer', email: 'budget@example.test', password: 'ExamplePassword123!', roleId: role.id, departmentId: office.id }); user.Role = role;
  const all = new Set(['budget.view', 'budget.prepareExecutive', 'budget.proposeBudget', 'budget.reviewProposal', 'budget.consolidateProposals', 'budget.conductForum', 'budget.conductHearing', 'budget.finaliseExecutive', 'budget.approveExecutive', 'budget.enactOrdinance', 'budget.recordProvincialReview']);
  const call = async (handler, params = {}, body = {}, permissions = all) => {
    const req = { currentUser: user, permissions, params, body, query: {}, ip: '127.0.0.1' };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    await withRecordChangeAudit(req, () => handler(req, res));
    assert.ok(res.statusCode < 400, res.body?.message); return res.body;
  };
  await m.InvestmentProgram.create({ fiscalYear: 2030, title: 'Adopted AIP', status: 'adopted' });
  let budget, proposal, proceeding;
  const transition = (action, payload = {}) => call(api.transitionBudget, { id: budget.id }, { action, ...payload });
  const amounts = (amount) => ({ amounts: proposal.lines.map(line => ({ lineId: line.id, amount })) });

  await t.test('concurrent opening creates one budget; creation and proceedings capture actor and full history', async () => {
    const attempts = await Promise.allSettled([1, 2].map(() => call(api.createBudget, {}, { fiscalYear: 2030 })));
    assert.equal(attempts.filter(row => row.status === 'fulfilled').length, 1);
    budget = attempts.find(row => row.status === 'fulfilled').value;
    proposal = await call(proposalApi.createProposal, {}, { executiveBudgetId: budget.id, departmentId: office.id, lines: [{ title: 'Office supplies', expenseClass: 'mooe', fund: 'generalFund', proposedAmount: 1000 }] });
    const originalDate = new Date(Date.now() - 60000).toISOString();
    proceeding = await call(api.recordProceeding, { id: budget.id }, { type: 'deliberation', scheduledAt: originalDate, heldAt: originalDate, minutes: 'Initial minutes', attendees: ['Budget Officer'] }, new Set(['budget.finaliseExecutive']));
    await call(api.updateProceeding, { proceedingId: proceeding.id }, { minutes: 'Corrected minutes' }, new Set(['budget.finaliseExecutive']));
    const audit = await m.AuditLog.findOne({ where: { entityRef: 'budgetProceeding', entityId: proceeding.id, actionType: 'budget.proceeding.updated' } });
    assert.equal(audit.actorId, user.id); assert.equal(audit.beforeState.minutes, 'Initial minutes'); assert.equal(audit.afterState.minutes, 'Corrected minutes'); assert.ok(audit.recordedAt);
    await assert.rejects(call(api.updateProceeding, { proceedingId: proceeding.id }, { minutes: 'Unauthorized' }, new Set(['budget.proposeBudget'])), /permission/);
    await assert.rejects(call(api.recordProceeding, { id: budget.id }, { type: 'deliberation', scheduledAt: originalDate }), /already scheduled/);
  });
  await t.test('returns reopen proposals, discard obsolete approvals, and preserve their audit evidence', async () => {
    await call(proposalApi.submitProposal, { id: proposal.id }); await transition('closeProposals');
    await assert.rejects(call(proposalApi.updateProposal, { id: proposal.id }, { justification: 'Late edit' }), /no longer editable/);
    await call(proposalApi.reviewProposal, { id: proposal.id }, amounts(900));
    await call(proposalApi.returnProposal, { id: proposal.id }, { remarks: 'Revise the quantities' }, new Set(['budget.reviewProposal']));
    assert.equal((await m.ExecutiveBudget.findByPk(budget.id)).status, 'returned');
    assert.equal((await m.BudgetProposal.findByPk(proposal.id)).status, 'draft');
    assert.equal((await m.BudgetProposalLine.findByPk(proposal.lines[0].id)).recommendedAmount, null);
    await call(proposalApi.updateProposal, { id: proposal.id }, { justification: 'Revised and justified' });
    await call(proposalApi.submitProposal, { id: proposal.id }); await transition('closeProposals');
    await assert.rejects(transition('reviewProposals'), /unreviewed/);
    await call(proposalApi.reviewProposal, { id: proposal.id }, amounts(900)); await transition('reviewProposals');
    await assert.rejects(call(proposalApi.reviewProposal, { id: proposal.id }, amounts(800)), /only allowed/);
    await transition('consolidate'); await transition('holdForum', { estimatedIncome: 1500, expenditureCeiling: 1200 });
    await assert.rejects(transition('concludeHearing'), /held budget hearing/);
    const held = new Date().toISOString();
    await call(api.recordProceeding, { id: budget.id }, { type: 'hearing', scheduledAt: held, heldAt: held, minutes: 'The office justified its proposal.' });
    await transition('concludeHearing');
    await call(proposalApi.finaliseProposal, { id: proposal.id }, amounts(850)); await transition('finalise');
    await assert.rejects(call(api.updateProceeding, { proceedingId: proceeding.id }, { minutes: 'Rewrite approval evidence' }), /sent for approval/);
    await transition('approveExecutive'); await transition('enactOrdinance', { ordinanceNo: 'ORD-2030-001', ordinanceDate: '2030-01-01' });
    await assert.rejects(transition('recordProvincialReview', { provincialReviewOutcome: 'declaredInoperativeInPart', provincialRemarks: 'One line is invalid.' }), /Return for revision/);
  });
  await t.test('failed audit rolls back release; competing approvals enact only once and freeze the proposal', async () => {
    m.AuditLog.addHook('beforeCreate', 'rejectBudgetRelease', row => { if (row.actionType === 'budget.appropriations.released') throw new Error('Audit storage unavailable'); });
    try { await assert.rejects(transition('recordProvincialReview', { provincialReviewOutcome: 'approved' }), /Audit storage unavailable/); }
    finally { m.AuditLog.removeHook('beforeCreate', 'rejectBudgetRelease'); }
    assert.equal(await m.Appropriation.count(), 0);
    const attempts = await Promise.allSettled([1, 2].map(() => transition('recordProvincialReview', { provincialReviewOutcome: 'approved' })));
    assert.equal(attempts.filter(row => row.status === 'fulfilled').length, 1);
    assert.equal(await m.Appropriation.count(), 1);
    assert.equal(Number((await m.Appropriation.findOne()).amount), 850);
    await assert.rejects(call(proposalApi.finaliseProposal, { id: proposal.id }, amounts(1000)), /only allowed/);
    await assert.rejects(transition('return', { remarks: 'Try to reopen authority' }), /permission/);
    const chain = await verifyChain({}); assert.equal(chain.intact, true, JSON.stringify(chain.problems));
    assert.ok(await m.AuditLog.count({ where: { actionType: 'record.created', entityRef: 'budgetProposalLine' } }));
  });
});
