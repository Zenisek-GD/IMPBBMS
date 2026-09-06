// Express accepts a trailing slash; this reads the normal public controller
// rather than the Worker's exact-path snapshot. Both are anonymous read APIs.
import assert from 'node:assert/strict';
const origin = 'https://procurenance.roxas.workers.dev';
const read = async path => {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(40000) });
  if (!response.ok) throw new Error(`Public consistency check returned HTTP ${response.status}`);
  return response.json();
};
const [snapshot, database] = await Promise.all([read('/api/public/projects'), read('/api/public/projects/')]);
const fields = ['id', 'projectTitle', 'description', 'category', 'phase', 'referenceNo', 'financials', 'contractStatus'];
const publicFacts = projects => projects.map(project => Object.fromEntries(fields.map(field => [field, project[field]]))).sort((a, b) => a.id - b.id);
let agrees = true;
try { assert.deepEqual(publicFacts(snapshot), publicFacts(database)); } catch { agrees = false; }
console.log(JSON.stringify({ snapshotProjects: snapshot.length, databasePublicProjects: database.length, publicFactsAgree: agrees }));
process.exitCode = agrees ? 0 : 1;
