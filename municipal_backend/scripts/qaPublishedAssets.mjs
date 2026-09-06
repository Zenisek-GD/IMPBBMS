// Verify the deployed build bytes and public disclosure boundary. No UI state,
// account records, credentials or response bodies are printed.
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const origin = 'https://procurenance.roxas.workers.dev';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const files = ['index.html', ...(await readdir('municipal-frontend/dist')).filter(file => /\.(svg|js)$/.test(file)), ...(await readdir('municipal-frontend/dist/assets')).map(file => `assets/${file}`)];
let failures = 0;
for (let i = 0; i < files.length; i += 4) {
  await Promise.all(files.slice(i, i + 4).map(async file => {
    const local = await readFile(`municipal-frontend/dist/${file}`);
    const response = await fetch(`${origin}/${file === 'index.html' ? '' : file}`, { signal: AbortSignal.timeout(20000) });
    const deployed = Buffer.from(await response.arrayBuffer());
    if (!response.ok || hash(local) !== hash(deployed)) {
      failures++;
      console.log(JSON.stringify({ asset: file, status: response.status, matchesBuild: false }));
    }
  }));
}
const projects = await (await fetch(`${origin}/api/public/projects`)).json();
for (const project of projects) {
  const response = await fetch(`${origin}/api/public/projects/${project.id}`);
  const body = await response.json();
  const privateRefsPresent = Object.hasOwn(body, 'entityRefs');
  const headersPresent = ['content-security-policy', 'strict-transport-security', 'x-frame-options', 'referrer-policy'].every(header => response.headers.has(header));
  if (privateRefsPresent || !headersPresent) failures++;
  console.log(JSON.stringify({ projectId: project.id, privateRefsPresent, headersPresent }));
}
console.log(JSON.stringify({ assetsChecked: files.length, projectDetailsChecked: projects.length, failures }));
process.exitCode = failures ? 1 : 0;
