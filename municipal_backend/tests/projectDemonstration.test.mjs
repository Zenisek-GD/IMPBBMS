import test from 'node:test';
import assert from 'node:assert/strict';
import { applyProjectDemonstration } from '../services/projectDemonstration.js';

const project = () => ({ id: 1, projectTitle: 'Procurement of Disaster Response and Emergency Preparedness Equipment', fiscalYear: 2026, category: 'upcoming', phase: 'requisition', progressPercent: 25, financials: { budget: 1500000, disbursed: 0 }, records: { payments: [] } });
test('completed scenario preserves official state, money and records without mutation', () => {
  const original = project(); const before = structuredClone(original);
  const result = applyProjectDemonstration(original);
  assert.equal(result.category, 'completed');
  assert.equal(result.demonstration.actualClientStatus, 'Awarded / For implementation');
  assert.equal(result.demonstration.officialCategory, 'upcoming');
  assert.equal(result.demonstration.milestones.length, 8);
  assert.deepEqual(result.financials, before.financials);
  assert.deepEqual(result.records, before.records);
  assert.deepEqual(original, before);
});
test('unrelated identity or budget cannot receive the scenario', () => {
  for (const changes of [{ id: 2 }, { projectTitle: 'Another project' }, { fiscalYear: 2027 }, { financials: { budget: 10 } }]) {
    const original = { ...project(), ...changes };
    assert.equal(applyProjectDemonstration(original), original);
  }
});
