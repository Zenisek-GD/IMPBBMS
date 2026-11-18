import test from 'node:test';
import assert from 'node:assert/strict';
import { isUnavailable, prepareWorkflowInformation, checkWorkflowInformation } from '../services/workflowInformation.js';
import { createInformationAdapter } from '../../municipal-frontend/src/api/incompleteInformation.js';
import { createMutationAdapter } from '../../municipal-frontend/src/api/mutationAdapter.js';

test('None / N/A normalizes without conflating false, zero, No or actual text', () => {
  for (const value of [null, undefined, '', '  ', 'None', ' N/A ', 'NA', 'Not applicable', 'not available', 'not provided']) assert.equal(isUnavailable(value), true);
  for (const value of [0, false, '0', 'No', 'None remaining after review', {}, []]) assert.equal(isUnavailable(value), false);
});

test('create enumerates omitted fields and identifies each nested line, without mutating the caller', () => {
  const input = { title: 'Plan', vision: 'N/A', goals: [{ title: 'Goal 1', description: '' }, { title: 'Goal 2', description: 'Known' }] };
  const result = prepareWorkflowInformation('/api/planning/plans?test=1', 'POST', input);
  assert.equal(result.body.vision, null);
  assert.equal(input.vision, 'N/A');
  assert.ok(result.missing.some(field => field.field === 'goals.0.description' && field.label === 'Goal 1: Description'));
  assert.ok(!result.missing.some(field => field.field === 'goals.1.description'));
  assert.ok(!Object.hasOwn(result.body, 'remarks'));
});

test('PATCH omissions preserve stored values while explicit placeholders clear them', () => {
  const result = prepareWorkflowInformation('/planning/plans/3', 'PATCH', { vision: 'None', title: 'Updated title' });
  assert.deepEqual(result.body, { vision: null, title: 'Updated title' });
  assert.deepEqual(result.missing.map(field => field.field), ['vision']);
  assert.deepEqual(prepareWorkflowInformation('/planning/plans/3', 'PATCH', { title: 'Update' }).missing, []);
});

test('account, registration, vendor onboarding, settings and security requests are excluded', () => {
  for (const path of ['/auth/login', '/auth/register', '/auth/reset-password', '/users', '/users/1', '/activation/setup', '/vendors/counter-submission', '/settings', '/security/mfa', '/public/messages']) {
    assert.equal(prepareWorkflowInformation('/api' + path, 'POST', { email: '', password: 'N/A', contactEmail: '', description: '' }), null, path);
  }
});

test('read and delete operations never ask for confirmation', () => {
  for (const method of ['GET', 'DELETE', 'HEAD']) assert.equal(prepareWorkflowInformation('/planning/plans', method, { vision: '' }), null);
});

test('conditional reasons remain mandatory for rejection and dropping records', () => {
  assert.equal(prepareWorkflowInformation('/finance/pending-items/1/resolve', 'POST', { resolution: 'dropped', notes: 'N/A' }), null);
  assert.equal(prepareWorkflowInformation('/finance/pending-items/1/resolve', 'POST', { resolution: 'carriedForward', notes: 'N/A' }).body.notes, null);
  const rejected = prepareWorkflowInformation('/contracts/deliveries/1/inspect', 'POST', { result: 'rejected', remarks: '' });
  assert.equal(rejected.body.remarks, '');
  assert.equal(rejected.missing.length, 0);
  assert.equal(prepareWorkflowInformation('/contracts/deliveries/1/inspect', 'POST', { result: 'accepted', remarks: '' }).body.remarks, null);
});

test('budget lines and financial numeric values stay separate', () => {
  const result = prepareWorkflowInformation('/budget-preparation/proposals', 'POST', { justification: 'None', lines: [{ title: 'Service', proposedAmount: 200, papCode: 'N/A', uacsCode: '' }] });
  assert.equal(result.body.lines[0].proposedAmount, 200);
  assert.equal(result.body.lines[0].papCode, null);
  assert.ok(result.missing.some(field => field.label === 'Budget line 1: UACS code'));
});

test('draft requisition zero and No are never rewritten as missing', () => {
  const result = prepareWorkflowInformation('/purchase-requisitions', 'POST', { isEmergency: false, lineItems: [{ description: 'Item', quantity: 'N/A', unitCost: 0, hasUsefulLifeOverOneYear: false }] });
  assert.equal(result.body.isEmergency, false);
  assert.equal(result.body.lineItems[0].quantity, null);
  assert.equal(result.body.lineItems[0].unitCost, 0);
  assert.equal(result.body.lineItems[0].hasUsefulLifeOverOneYear, false);
  assert.ok(!result.missing.some(field => /unitCost|isEmergency|hasUsefulLife/.test(field.field)));
});

test('app drafts prompt for missing values but indicative plans do not ask for an appropriation', () => {
  const result = prepareWorkflowInformation('/app-entries', 'POST', { planCycle: 'indicative', abc: '', category: '' });
  assert.equal(result.body.abc, null);
  assert.ok(result.missing.some(field => field.field === 'abc'));
  assert.ok(!result.missing.some(field => field.field === 'appropriationId'));
});

test('None in dates, email and optional foreign keys becomes null, never an invalid date or zero ID', () => {
  for (const [url, body] of [
    ['/contracts', { deliveryDeadline: 'N/A', contractDays: '' }],
    ['/bidding/rfqs/1/information', { procurementContactEmail: 'None' }],
    ['/planning/aip-entries/1', { implementingUnitId: 'N/A' }],
    ['/budget-preparation/proceedings/1', { heldAt: 'None', departmentId: '' }],
    ['/finance/budget-controls/1', { payload: { papCode: 'N/A', departmentId: '' } }],
  ]) {
    const result = prepareWorkflowInformation(url, 'PATCH', body);
    assert.ok(result.missing.length);
    const values = Object.values(result.body.payload ?? result.body);
    assert.ok(values.every(value => value === null));
  }
});

test('approval and mandatory decision fields are never bypassed by this policy', () => {
  for (const url of ['/planning/plans/1/adopt', '/bidding/bids/1/post-qualification', '/contracts/1/issue', '/contracts/1/sign', '/finance/budget-controls/1/transition']) {
    assert.equal(prepareWorkflowInformation(url, 'POST', { resolutionNo: 'N/A', checklist: null, action: 'approve' }), null);
  }
});

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
test('server stops before mutation until explicit confirmation and then supplies audit metadata', () => {
  const req = { originalUrl: '/api/planning/plans', method: 'POST', body: { title: 'Plan', vision: 'N/A' }, get: () => undefined };
  const res = response();
  assert.equal(checkWorkflowInformation(req, res), false);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'INCOMPLETE_INFORMATION_CONFIRMATION_REQUIRED');
  assert.equal(req.body.vision, 'N/A');
  req.get = name => name === 'X-Confirm-Incomplete-Information' ? 'true' : undefined;
  assert.equal(checkWorkflowInformation(req, response()), true);
  assert.equal(req.body.vision, null);
  assert.ok(req.incompleteInformation.some(field => field.field === 'vision'));
});

const config = () => {
  const headers = new Map();
  return { method: 'post', url: '/planning/plans', data: '{"vision":""}', headers, authEpoch: 1 };
};
const challenge = () => Object.assign(new Error('Confirm incomplete'), { response: { status: 409, data: JSON.stringify({ code: 'INCOMPLETE_INFORMATION_CONFIRMATION_REQUIRED', missingFields: [{ field: 'vision', label: 'Long-term direction' }] }) } });

test('Axios raw JSON challenge waits for consent and preserves idempotency across retry', async () => {
  let calls = 0, decisions = 0;
  const keys = [];
  const adapter = createMutationAdapter(createInformationAdapter(async cfg => {
    calls++; keys.push(cfg.headers.get('Idempotency-Key'));
    if (cfg.headers.get('X-Confirm-Incomplete-Information') !== 'true') throw challenge();
    return { data: '{"id":1}', config: cfg };
  }, async details => { decisions++; assert.equal(details.missingFields[0].field, 'vision'); return true; }), { makeKey: () => 'test-workflow-key-1234' });
  const result = await adapter(config());
  assert.equal(result.data, '{"id":1}');
  assert.equal(calls, 2); assert.equal(decisions, 1); assert.equal(keys[0], keys[1]);
});

test('cancel and expired sessions never retry a write', async () => {
  for (const [accept, current] of [[false, true], [true, false]]) {
    let calls = 0;
    const adapter = createInformationAdapter(async () => { calls++; throw challenge(); }, async () => accept, () => current);
    await assert.rejects(adapter(config()), error => error.response.data.message.includes('Nothing was saved'));
    assert.equal(calls, 1);
  }
});

test('ordinary validation errors and repeated challenges do not retry indefinitely', async () => {
  let asks = 0;
  const bad = Object.assign(new Error('Invalid amount'), { response: { status: 400, data: { message: 'Invalid amount' } } });
  await assert.rejects(createInformationAdapter(async () => { throw bad; }, async () => { asks++; return true; })(config()), /Invalid amount/);
  assert.equal(asks, 0);
  let calls = 0;
  await assert.rejects(createInformationAdapter(async () => { calls++; throw challenge(); }, async () => true)(config()));
  assert.equal(calls, 2);
});
