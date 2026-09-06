// Non-destructive live smoke checks. Response bodies and credentials are never logged.
// Only this script's own temporary login session is logged out.
import { readFile } from 'node:fs/promises';

const origin = 'https://procurenance.roxas.workers.dev';
const headers = { Origin: origin, 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' };
let cookie = '';
let failures = 0;
async function check(path, expected = 200, options = {}) {
  const start = Date.now();
  try {
    const response = await fetch(origin + path, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(40000) });
    const raw = await response.text();
    let body;
    let jsonValid = null;
    if (response.headers.get('content-type')?.includes('application/json')) {
      try { body = JSON.parse(raw); jsonValid = true; } catch { jsonValid = false; }
    }
    const passed = response.status === expected && jsonValid !== false;
    if (!passed) failures++;
    console.log(JSON.stringify({ path, status: response.status, expected, passed, ms: Date.now() - start, jsonValid, bytes: Buffer.byteLength(raw), ...(Array.isArray(body) ? { records: body.length } : {}), noStore: response.headers.get('cache-control')?.includes('no-store') ?? false }));
    return { response, body, raw };
  } catch (error) {
    failures++;
    console.log(JSON.stringify({ path, passed: false, errorType: error.name }));
    return {};
  }
}

if (!process.argv.includes('--session-only')) {
const home = await check('/');
if (home.raw) {
  const assets = [...home.raw.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)].map(match => match[1]);
  for (const asset of new Set(assets)) await check(asset);
  console.log(JSON.stringify({ frontendCsp: Boolean(home.response.headers.get('content-security-policy')), frontendHsts: Boolean(home.response.headers.get('strict-transport-security')) }));
}
for (const path of ['/login', '/home', '/account/two-factor', '/api/public/branding', '/api/public/projects/overview', '/api/public/projects/filters', '/api/public/announcements', '/api/public/announcements/archive', '/api/public/officials', '/api/public/documents', '/api/public/transparency/overview', '/api/public/transparency/app', '/api/public/transparency/procurements', '/api/public/transparency/awards']) await check(path);
const projects = await check('/api/public/projects');
for (const project of projects.body ?? []) {
  for (const suffix of ['', '/timeline', '/documents']) await check(`/api/public/projects/${project.id}${suffix}`);
}
await check('/api/public/projects/999999999', 404);
await check('/api/public/projects?search=qa-no-match-98af', 200);
for (const path of ['/api/auth/me', '/api/settings', '/api/notifications', '/api/users', '/api/contracts', '/api/finance/invoices']) await check(path, 401);
await check('/api/qa-route-does-not-exist', 404);
await check('/api/auth/login', 403, { method: 'POST', headers: { Origin: 'https://example.invalid' }, body: '{}' });
}

if (process.argv.includes('--login') || process.argv.includes('--session-only')) {
  const seed = await readFile(new URL('../seed.js', import.meta.url), 'utf8');
  const password = seed.match(/SEED_PASSWORD\s*=\s*"([^"]+)"/)?.[1];
  if (!password) throw new Error('Local demo credential unavailable.');
  const login = await check('/api/auth/login', 200, { method: 'POST', body: JSON.stringify({ email: 'systemadministrator@procurenance.com', password }) });
  if (login.response?.ok) {
    const cookies = login.response.headers.getSetCookie();
    cookie = cookies.map(value => value.split(';', 1)[0]).join('; ');
    console.log(JSON.stringify({ secureCookie: cookies.some(value => value.startsWith('__Host-') && /;\s*Secure/i.test(value) && /;\s*HttpOnly/i.test(value) && /;\s*SameSite=Lax/i.test(value)), mfaRequired: Boolean(login.body?.mfaRequired), enrollmentRequired: Boolean(login.body?.mfaEnrollmentRequired) }));
    try {
      if (login.body?.mfaEnrollmentRequired) {
        for (let i = 0; i < 3; i++) await check('/api/auth/me', 200, { headers: { Cookie: cookie } });
        await check('/api/auth/mfa', 200, { headers: { Cookie: cookie } });
        for (const path of ['/api/settings', '/api/settings/shortcuts', '/api/notifications', '/api/users']) await check(path, 403, { headers: { Cookie: cookie } });
      }
    } finally {
      await check('/api/auth/logout', 200, { method: 'POST', headers: { Cookie: cookie } });
      await check('/api/auth/me', 401, { headers: { Cookie: cookie } });
    }
  }
}
console.log(JSON.stringify({ failures }));
process.exitCode = failures ? 1 : 0;
