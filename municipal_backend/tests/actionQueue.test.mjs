import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeActionQueue, selectedActionYear, actionUrgency, buildActionQueue, projectBudgetTasks } from '../services/actionQueue.js';
import { AppEntry } from '../models/appEntryModel.js';
import { ExecutiveBudget, BudgetProposal } from '../models/budgetPreparationModel.js';
import { BudgetControlRequest } from '../models/budgetControlModel.js';
import { Rfq } from '../models/biddingModel.js';
import { Vendor } from '../models/vendorModel.js';
import { FailureRecord, ProcurementAttempt, NegotiatedReview } from '../models/procurementAttemptModel.js';
import { GeneratedDocument } from '../models/generatedDocumentModel.js';
import { getPendingCounts } from '../controllers/pendingCountsController.js';
import { getMyWork } from '../controllers/myWorkController.js';

const user = { id: 7, departmentId: 2, Role: { key: 'budgetOfficer', name: 'Budget Officer' } };
const now = new Date('2026-09-28T06:00:00Z');
const item = (id, year, href = '/budget/controls') => ({ id, fiscalYear: year, href, title: id, type: 'budgetControl' });

test('queue defaults to municipal year and rejects ambiguous year inputs', () => {
  assert.equal(selectedActionYear(undefined, new Date('2026-12-31T16:01:00Z')), 2027);
  assert.equal(selectedActionYear('all', now), 'all');
  for (const value of ['2026oops', 26, 0, 'null', 10000]) assert.throws(() => selectedActionYear(value), { status: 400 });
});

test('canonical counts cover all filtered tasks, deduplicate IDs, and precede pagination', () => {
  const rows = [item('current', 2026), item('old', 2025), item('unknown-finance', null),
    { ...item('general', null, '/secretariat/vendors'), yearScope: 'general' },
    { ...item('cdp', null, '/planning'), startYear: 2025, endYear: 2027 },
    item('current', 2026), { ...item('overdue', 2026, '/invoices'), dueAt: '2026-09-27' }];
  const result = finalizeActionQueue(rows, { user, query: { fiscalYear: 2026, limit: 1 }, now, initialCounts: { '/budget/controls': 99 } });
  assert.equal(result.total, 4);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, 'overdue');
  assert.equal(result.items[0].responsibleUserId, user.id);
  assert.equal(result.items[0].responsibleRole, 'Budget Officer');
  assert.deepEqual(result.counts, { '/budget/controls': 1, '/invoices': 1, '/planning': 1, '/secretariat/vendors': 1 });
  assert.equal(finalizeActionQueue(rows, { user, query: { fiscalYear: 'all' }, now }).total, 6);
});

test('date-only deadlines remain open until the end of their Philippine calendar day', () => {
  assert.equal(actionUrgency('2026-09-28', Date.parse('2026-09-28T15:59:59Z')), 'urgent');
  assert.equal(actionUrgency('2026-09-28', Date.parse('2026-09-28T16:00:00Z')), 'overdue');
  assert.equal(actionUrgency(null), 'normal');
});

test('proposal permission matches the workflow and bell-compatible counts equal my-work counts', async (t) => {
  t.mock.method(ExecutiveBudget, 'findAll', async () => []);
  t.mock.method(BudgetProposal, 'findAll', async ({ where }) => {
    assert.equal(where.departmentId, user.departmentId);
    return [{ id: 1, fiscalYear: 2026, status: 'draft', budget: { title: 'Annual budget', status: 'draft' } }];
  });
  const req = { currentUser: user, permissions: new Set(['budget.view', 'budget.proposeBudget']), query: { fiscalYear: 2026 } };
  const outputs = [];
  const res = { setHeader() {}, json(value) { outputs.push(value); } };
  await getMyWork(req, res, (error) => { throw error; });
  await getPendingCounts(req, res);
  assert.equal(outputs[0].items[0].type, 'proposal');
  assert.deepEqual(outputs[1].counts, outputs[0].counts);
  assert.equal(outputs[1].total, outputs[0].total);
  assert.equal((await buildActionQueue({ user, permissions: new Set(), query: { fiscalYear: 2026 } })).total, 0);
});

test('budget approval work excludes self-approval and scopes drafts to the requester', async (t) => {
  t.mock.method(AppEntry, 'findAll', async () => []);
  t.mock.method(ExecutiveBudget, 'findAll', async () => []);
  t.mock.method(BudgetControlRequest, 'findAll', async ({ where }) => {
    const filters = Object.values(where)[0] ?? Object.getOwnPropertySymbols(where).map((symbol) => where[symbol])[0];
    assert.equal(filters[0].requesterId, user.id);
    assert.equal(filters[1].status, 'submitted');
    assert.equal(Object.values(filters[1].requesterId).length, 0);
    const symbol = Object.getOwnPropertySymbols(filters[1].requesterId)[0];
    assert.equal(filters[1].requesterId[symbol], user.id);
    return [{ id: 8, kind: 'transfer', fiscalYear: 2026, amount: 100, status: 'submitted', reason: 'Approved authority' }];
  });
  const result = await buildActionQueue({ user, permissions: new Set(['budget.view', 'budget.requestControl', 'budget.approveControl']), query: { fiscalYear: 2026 } });
  assert.equal(result.total, 1);
  assert.equal(result.counts['/budget/controls'], 1);
  assert.match(result.items[0].action, /Review the transfer/);
});

test('failed bidding and approved rebids share the solicitation count and retain fiscal year', async (t) => {
  const rfq = { id: 2, referenceNo: 'RFQ-2', title: 'Health supplies', appEntry: { fiscalYear: 2026 } };
  t.mock.method(Rfq, 'findAll', async () => []);
  t.mock.method(Vendor, 'findAll', async () => []);
  t.mock.method(FailureRecord, 'findAll', async () => [{ id: 1, failureNumber: 'FAIL-1', status: 'draft', attempt: { rfq } }]);
  t.mock.method(ProcurementAttempt, 'findAll', async () => [{ id: 3, projectKey: 'app-2', status: 'failed', rfq, bacResolutionId: 12, failureRecords: [{ status: 'approved', approvedById: 8, approvedAt: now, bacResolutionId: 12 }] }]);
  t.mock.method(NegotiatedReview, 'findOne', async () => ({ status: 'approved' }));
  const result = await buildActionQueue({ user, permissions: new Set(['bidding.view', 'bidding.publish']), query: { fiscalYear: 2026 } });
  assert.deepEqual(new Set(result.items.map((row) => row.type)), new Set(['failure', 'negotiatedStart']));
  assert.equal(result.counts['/secretariat/rfq'], 2);
  assert.ok(result.items.every((row) => row.fiscalYear === 2026));
});

test('document publication tasks use the financial record fiscal year and approval independence', async (t) => {
  t.mock.method(GeneratedDocument, 'findAll', async () => [{ id: 1, documentNo: 'DOC-1', title: 'Plan', status: 'draft', generatedById: user.id, entityRef: 'appEntry', entityId: 4 }, { id: 2, documentNo: 'DOC-2', title: 'Plan review', status: 'draft', generatedById: 8, entityRef: 'appEntry', entityId: 4 }]);
  t.mock.method(AppEntry, 'findByPk', async () => ({ fiscalYear: 2026 }));
  const result = await buildActionQueue({ user, permissions: new Set(['document.approve']), query: { fiscalYear: 2026 } });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].recordId, 2);
  assert.equal(result.items[0].fiscalYear, 2026);
});


test('approved projects get allocation and closeout owners without duplicating pending requests', () => {
  const projects = [1, 2, 3, 4, 5].map(id => ({ id, projectTitle: `Project ${id}`, fiscalYear: 2026, abc: 1000, status: id === 5 ? 'cancelled' : 'approved' }));
  const allocations = [2, 3, 4, 5].map(id => ({ appEntryId: id, status: 'active' }));
  const requests = [{ kind: 'closeout', sourceProjectId: 4, status: 'submitted' }];
  const contracts = [2, 3, 4].map(id => ({ status: id === 3 ? 'active' : 'completed', award: { rfq: { appEntryId: id } } }));
  const rows = projectBudgetTasks({ projects, allocations, requests, contracts });
  assert.deepEqual(rows.map(row => row.id), ['projectAllocation-1', 'projectCloseout-2', 'projectCloseout-5']);
  assert.ok(rows.every(row => row.responsibleRole === 'Requesting Budget Officer'));
  requests.push({ kind: 'allocation', sourceProjectId: 1, status: 'draft' });
  assert.equal(projectBudgetTasks({ projects, allocations, requests, contracts }).some(row => row.id === 'projectAllocation-1'), false);
});
