import test from 'node:test';
import assert from 'node:assert/strict';
import { Op } from 'sequelize';
import { createDocumentFiscalYearResolver } from '../services/documentFiscalYear.js';
import { fundingYearCondition } from '../services/fundingYear.js';
import { AppEntry } from '../models/appEntryModel.js';
import { Rfq } from '../models/biddingModel.js';
import { GeneratedDocument } from '../models/generatedDocumentModel.js';
import { listDocuments } from '../controllers/generatedDocumentController.js';
import { listRfqs } from '../controllers/biddingController.js';

test('document funding year resolves the appropriation and reuses repeated references', async (t) => {
  let reads = 0;
  t.mock.method(AppEntry, 'findByPk', async () => { reads += 1; return { fiscalYear: 2026, appropriation: { fiscalYear: 2025 } }; });
  const resolve = createDocumentFiscalYearResolver();
  assert.equal(await resolve({ entityRef: 'appEntry', entityId: 9 }), 2025);
  assert.equal(await resolve({ entityRef: 'appEntry', entityId: 9 }), 2025);
  assert.equal(reads, 1);
  assert.equal(await resolve({ entityRef: 'unknown', entityId: 9 }), null);
});

test('document list filters fiscal origin before applying pagination', async (t) => {
  const docs = [{ id: 1, entityRef: 'appEntry', entityId: 1 }, { id: 2, entityRef: 'appEntry', entityId: 2 }];
  t.mock.method(AppEntry, 'findByPk', async id => ({ fiscalYear: id === 1 ? 2025 : 2026 }));
  t.mock.method(GeneratedDocument, 'findAll', async () => docs);
  t.mock.method(GeneratedDocument, 'findAndCountAll', async ({ where }) => {
    assert.deepEqual(where.id[Op.in], [1]);
    return { rows: [docs[0]], count: 1 };
  });
  let result;
  await listDocuments({ query: { fiscalYear: '2025', page: '1', pageSize: '10' } }, { json: value => { result = value; } });
  assert.equal(result.total, 1);
  assert.equal(result.rows[0].fiscalYear, 2025);
});

test('solicitation year filter keeps search and supplier visibility and returns funding year', async (t) => {
  t.mock.method(Rfq, 'findAll', async ({ where, include }) => {
    assert.ok(where[Op.and], 'year predicate present');
    assert.ok(where[Op.or], 'search preserved');
    assert.deepEqual(where.status[Op.in], ['published', 'closed']);
    assert.ok(include.find(row => row.as === 'purchaseRequisition').include.find(row => row.as === 'appEntry').include);
    return [{ id: 1, abc: 100, purchaseRequisition: { appEntry: { fiscalYear: 2026, appropriation: { fiscalYear: 2025 } } } }];
  });
  let result;
  await listRfqs({ query: { fiscalYear: '2025', search: 'supplies' }, permissions: new Set(['bidding.submitBid']) }, { json: value => { result = value; } });
  assert.equal(result[0].fiscalYear, 2025);
  const condition = fundingYearCondition('2025', '');
  const paths = [];
  const visit = value => { if (value && typeof value === 'object') for (const key of Reflect.ownKeys(value)) { if (typeof key === 'string') paths.push(key); visit(value[key]); } };
  visit(condition);
  assert.ok(paths.some(key => key === '$purchaseRequisition.appEntry.appropriation.fiscalYear$'));
  assert.ok(paths.every(key => !key.startsWith('$.')));
});
