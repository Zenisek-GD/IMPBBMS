import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { protectMutation } from '../middleware/mutationProtection.js';
import { sequelize } from '../models/db.js';
import { createMutationAdapter } from '../../municipal-frontend/src/api/mutationAdapter.js';

after(() => sequelize.close());
const request = (body = { amount: 100 }, overrides = {}) => ({ method: 'POST', originalUrl: '/api/finance/payments/1/release',
  currentUser: { id: 1, departmentId: 2, Role: { id: 3, key: 'treasurer' } }, permissions: new Set(['payment.release']),
  get: () => 'approved_action_reference_123', is: () => true, body, ...overrides });
const response = () => ({ statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; },
  set(key, value) { this.headers[key] = value; return this; }, json(value) { this.body = value; return this; } });
const receipts = () => {
  const rows = new Map();
  return { rows, async create(values) {
    if (rows.has(values.id)) throw Object.assign(new Error('duplicate'), { name: 'SequelizeUniqueConstraintError' });
    const row = { status: 'processing', ...values, async update(next) { Object.assign(this, next); } };
    rows.set(values.id, row); return row;
  }, async findByPk(id) { return rows.get(id); } };
};

test('concurrent clicks and later retries produce one business mutation with a durable replay', async () => {
  const Receipt = receipts(); let release; let writes = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const handler = protectMutation(async (_req, res) => { writes++; await gate; res.status(201).json({ id: 7, status: 'released' }); }, { Receipt });
  const first = response(); const pending = handler(request(), first);
  await Promise.resolve();
  const second = response(); await handler(request(), second);
  assert.equal(second.statusCode, 409); assert.equal(second.body.code, 'ACTION_IN_PROGRESS');
  release(); await pending;
  const retry = response(); await handler(request(), retry);
  assert.equal(writes, 1); assert.equal(retry.statusCode, 201); assert.deepEqual(retry.body, first.body);
  assert.equal(retry.headers['Idempotency-Replayed'], 'true');
});

test('action references cannot be reused with changed amounts, permissions or another account', async () => {
  const Receipt = receipts(); let writes = 0;
  const handler = protectMutation(async (_req, res) => { writes++; res.json({ id: writes }); }, { Receipt });
  await handler(request({ a: 1, b: 2 }), response());
  const same = response(); await handler(request({ b: 2, a: 1 }), same); assert.equal(writes, 1);
  for (const changed of [request({ a: 3 }), request({ a: 1, b: 2 }, { permissions: new Set() })]) {
    const res = response(); await handler(changed, res); assert.equal(res.body.code, 'ACTION_REFERENCE_CONFLICT');
  }
  await handler(request({ a: 1, b: 2 }, { currentUser: { id: 4 } }), response()); assert.equal(writes, 2);
});

test('a failure after a possible commit preserves the claim and never repeats the mutation', async () => {
  const Receipt = receipts(); let writes = 0;
  const handler = protectMutation(async () => { writes++; throw new Error('connection interrupted after save'); }, { Receipt });
  await assert.rejects(handler(request(), response()), /interrupted/);
  const retry = response(); await handler(request(), retry);
  assert.equal(retry.body.code, 'ACTION_OUTCOME_UNCERTAIN'); assert.equal(writes, 1);
});

const config = (data = '{"amount":100}', overrides = {}) => {
  const values = new Map();
  return { method: 'post', url: '/finance/payments/1/release', data, authEpoch: 1,
    headers: { set: (key, value) => values.set(key, value), get: key => values.get(key) }, ...overrides };
};
test('client transport merges concurrent clicks and a short repeated success, but sends changed inputs', async () => {
  let calls = 0, time = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const adapter = createMutationAdapter(async current => { calls++; await gate; return { data: '{"saved":true}', config: current }; }, { now: () => time, makeKey: () => `action-${calls}` });
  const a = adapter(config()), b = adapter(config());
  await Promise.resolve(); assert.equal(calls, 1); release(); await Promise.all([a, b]);
  await adapter(config()); assert.equal(calls, 1);
  await adapter(config('{"amount":200}')); assert.equal(calls, 2);
  time = 2000; await adapter(config()); assert.equal(calls, 3);
});

test('client retries retain their reference after lost responses and separate sign-in sessions', async () => {
  const keys = []; let attempts = 0, key = 0;
  const adapter = createMutationAdapter(async current => {
    keys.push(current.headers.get('Idempotency-Key'));
    if (++attempts === 1) throw new Error('lost response');
    return { data: { saved: true } };
  }, { makeKey: () => `reference-${++key}` });
  await assert.rejects(adapter(config()), /lost response/); await adapter(config());
  assert.equal(keys[0], keys[1]);
  await adapter(config(undefined, { authEpoch: 2 })); assert.notEqual(keys[1], keys[2]);
});

test('a delayed retry and repeated uncertain responses never silently start a new action', async () => {
  let time = 0, key = 0, calls = 0;
  const keys = [];
  const adapter = createMutationAdapter(async current => {
    calls++; keys.push(current.headers.get('Idempotency-Key'));
    if (calls === 1) throw new Error('response lost');
    throw Object.assign(new Error('Check the saved record'), { response: { status: 409, data: { code: 'ACTION_OUTCOME_UNCERTAIN' } } });
  }, { now: () => time, makeKey: () => `reference-${++key}` });
  await assert.rejects(adapter(config()), /lost/);
  time = 300_000;
  await assert.rejects(adapter(config()), /saved record/);
  time = 600_000;
  await assert.rejects(adapter(config()), /saved record/);
  assert.deepEqual(keys, ['reference-1', 'reference-1', 'reference-1']);
  await assert.rejects(adapter(config('{"amount":101}')), /saved record/);
  assert.equal(keys.at(-1), 'reference-2');
});
