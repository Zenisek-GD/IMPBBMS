import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { publicProjectView, assertPublicSnapshot } from '../services/publicSnapshotSafety.js';

test('public snapshot drops internal relationships without changing approved figures', () => {
  const project = { id: 1, projectTitle: 'Demo project', financials: { budget: 100 }, entityRefs: { bid: [8], invoice: [9] } };
  assert.deepEqual(publicProjectView(project), { id: 1, projectTitle: 'Demo project', financials: { budget: 100 } });
  assert.ok(project.entityRefs, 'server-side relationships must remain usable');
});
test('snapshot guard rejects nested authentication and internal fields', () => {
  for (const field of ['entityRefs', 'encryptedSecret', 'password', 'email', 'session', 'qrDataUri', 'internalRemarks']) {
    assert.throws(() => assertPublicSnapshot({ detailedProjects: [{ records: { [field]: 'private fixture' } }] }), /prohibited field/);
  }
});
test('bundled snapshot is safe and summary counts agree with its public records', async () => {
  const snapshot = JSON.parse(await readFile(new URL('../public-demo-snapshot.json', import.meta.url), 'utf8'));
  assertPublicSnapshot(snapshot);
  assert.equal(snapshot.overview.totalProjects, snapshot.projects.length);
  for (const category of ['completed', 'ongoing', 'upcoming']) assert.equal(snapshot.overview[category], snapshot.projects.filter(project => project.category === category).length);
  assert.deepEqual(snapshot.detailedProjects.map(project => project.id).sort(), snapshot.projects.map(project => project.id).sort());
});
