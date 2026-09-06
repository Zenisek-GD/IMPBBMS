// Exact-value scan of configured local secrets. Only counts and file paths
// are reported; matching lines, values and environment contents stay private.
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';
const env = dotenv.parse(await readFile('municipal_backend/.env', 'utf8'));
const secrets = Object.entries(env).filter(([key, value]) => /PASSWORD|SECRET|ENCRYPTION_KEY|API_TOKEN/.test(key) && value.length >= 8).map(([, value]) => value);
async function filesIn(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => entry.isDirectory() ? filesIn(`${folder}/${entry.name}`) : [`${folder}/${entry.name}`]));
  return nested.flat();
}
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean);
const candidates = [...new Set([...tracked.filter(file => /\.(js|jsx|mjs|json|html|css|md|toml|jsonc)$/.test(file)), ...await filesIn('municipal-frontend/dist')])];
const matches = [];
for (const file of candidates) {
  try {
    const contents = await readFile(file, 'utf8');
    if (secrets.some(secret => contents.includes(secret) || contents.includes(encodeURIComponent(secret)))) matches.push(file);
  } catch { /* Pre-existing tracked deletions are not restored. */ }
}
console.log(JSON.stringify({ configuredSecretsChecked: secrets.length, filesChecked: candidates.length, matchingFiles: matches, trackedEnvironmentFiles: tracked.filter(file => /(?:^|\/)\.env(?:$|\.(?!example|production))/.test(file)) }));
process.exitCode = matches.length ? 1 : 0;
