import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { Op } from 'sequelize';
import { sequelize, AppEntry, PrHeader, Department } from '../models/index.js';
import { listAppEntries } from '../controllers/appEntryController.js';
import { listPrs } from '../controllers/prController.js';
import { fiscalYearFilter } from '../services/financialCalculations.js';

after(() => sequelize.close());
const call = async (handler, query, permissions, user = { id: 3, departmentId: 7 }) => {
  let result;
  await handler({ query, permissions: new Set(permissions), currentUser: user }, { json(value) { result = value; } });
  return result;
};

test('APP year filtering validates explicit all and preserves requester department scope', async t => {
  const queries = [];
  t.mock.method(AppEntry, 'findAll', async options => { queries.push(options); return []; });
  await call(listAppEntries, {}, ['app.view', 'app.create']);
  assert.equal(queries.at(-1).where.fiscalYear, fiscalYearFilter());
  assert.equal(queries.at(-1).where.implementingUnitId, 7);
  await call(listAppEntries, { fiscalYear: 'all', department: 9 }, ['app.view', 'app.create']);
  assert.equal(queries.at(-1).where.fiscalYear, undefined);
  assert.equal(queries.at(-1).where.implementingUnitId, 7);
  await call(listAppEntries, { fiscalYear: '2028' }, ['app.view', 'app.consolidate']);
  assert.equal(queries.at(-1).where.fiscalYear, 2028);
  assert.equal(queries.at(-1).where.implementingUnitId, undefined);
  await assert.rejects(call(listAppEntries, { fiscalYear: ['2028'] }, ['app.view']), error => error.status === 400);
});

test('PR lists constrain funding year and department together and serialize the appropriation year', async t => {
  let funded, listed;
  t.mock.method(AppEntry, 'findAll', async options => { funded = options; return [{ id: 42 }]; });
  t.mock.method(Department, 'findAll', async () => [{ id: 8 }]);
  t.mock.method(PrHeader, 'findAll', async options => {
    listed = options;
    return [{ id: 1, prNumber: 'PR-TEST', totalAmount: 10, status: 'draft', appEntry: { fiscalYear: 2029, appropriation: { fiscalYear: 2028 } } }];
  });
  const rows = await call(listPrs, { fiscalYear: '2028', search: 'PR-' }, ['pr.view']);
  assert.equal(funded.where[Op.or][0]['$appropriation.fiscalYear$'], 2028);
  assert.deepEqual(listed.where.appEntryId[Op.in], [42]);
  assert.deepEqual(listed.where.departmentId[Op.in], [7, 8]);
  assert.ok(listed.where[Op.or], 'search remains combined with funding and permission scope');
  assert.equal(rows[0].fiscalYear, 2028);
  await call(listPrs, { fiscalYear: 'all' }, ['pr.obligate']);
  assert.equal(listed.where.appEntryId, undefined);
  assert.equal(listed.where.departmentId, undefined);
});

test('paged PR funding filters do not depend on outer joined aliases', async t => {
  t.mock.method(AppEntry, 'findAll', async () => [{ id: 42 }]);
  t.mock.method(PrHeader, 'findAndCountAll', async options => {
    assert.deepEqual(options.where.appEntryId[Op.in], [42]);
    assert.equal(options.limit, 10);
    assert.equal(options.distinct, true);
    return { rows: [], count: 0 };
  });
  const result = await call(listPrs, { fiscalYear: '2028', page: 1, pageSize: 10 }, ['pr.obligate']);
  assert.deepEqual(result.rows, []);
});

test('paged APP lists preserve year and published-only scope together', async t => {
  t.mock.method(AppEntry, 'findAndCountAll', async options => {
    assert.equal(options.where.fiscalYear, 2029);
    assert.deepEqual(options.where.status[Op.in], ['approved', 'locked']);
    assert.equal(options.limit, 10);
    assert.equal(options.distinct, true);
    return { rows: [], count: 0 };
  });
  const result = await call(listAppEntries, { fiscalYear: '2029', status: 'draft', page: 1, pageSize: 10 }, ['app.viewPublished']);
  assert.deepEqual(result.rows, []);
});

test('PR default year never broadens an empty funding scope and invalid years are rejected', async t => {
  let funded;
  t.mock.method(AppEntry, 'findAll', async options => { funded = options; return []; });
  t.mock.method(PrHeader, 'findAll', async options => {
    assert.deepEqual(options.where.appEntryId[Op.in], []);
    return [];
  });
  await call(listPrs, {}, ['pr.obligate']);
  assert.equal(funded.where[Op.or][0]['$appropriation.fiscalYear$'], fiscalYearFilter());
  assert.deepEqual(funded.where[Op.or][1], { appropriationId: null, fiscalYear: fiscalYearFilter() });
  for (const fiscalYear of ['not-a-year', ['2028'], {}, '1999', '2101']) {
    await assert.rejects(call(listPrs, { fiscalYear }, ['pr.obligate']), error => error.status === 400);
  }
});

test('explicit all-year PR lists retain each record funding year, with a legacy APP fallback', async t => {
  t.mock.method(AppEntry, 'findAll', async () => assert.fail('All years must not apply a hidden funding-year restriction'));
  t.mock.method(PrHeader, 'findAll', async options => {
    assert.equal(options.where.appEntryId, undefined);
    return [
      { id: 1, totalAmount: 10, appEntry: { fiscalYear: 2029, appropriation: { fiscalYear: 2028 } } },
      { id: 2, totalAmount: 20, appEntry: { fiscalYear: 2027 } },
      { id: 3, totalAmount: 30 },
    ];
  });
  const rows = await call(listPrs, { fiscalYear: 'all' }, ['pr.obligate']);
  assert.deepEqual(rows.map(row => row.fiscalYear), [2028, 2027, null]);
});
