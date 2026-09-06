import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const html = await readFile(new URL('../../municipal-frontend/index.html', import.meta.url), 'utf8');
const theme = await readFile(new URL('../../municipal-frontend/public/theme-init.js', import.meta.url), 'utf8');
test('theme startup uses a same-origin asset without relaxing script CSP', async () => {
  assert.match(html, /<script src="\/theme-init\.js"><\/script>/);
  assert.doesNotMatch(html, /<script\s*>/);
  const headers = await readFile(new URL('../../municipal-frontend/public/_headers', import.meta.url), 'utf8');
  assert.match(headers, /script-src 'self';/);
});
test('theme startup applies saved dark preference and survives blocked storage', () => {
  for (const blocked of [false, true]) {
    let dark = false;
    const context = {
      document: { documentElement: { classList: { toggle(_name, value) { dark = value; } }, dataset: {} } },
      window: { matchMedia: () => ({ matches: false }) },
      localStorage: { 'procurenance.theme.public': 'dark', getItem() { if (blocked) throw new Error('Storage blocked'); return 'dark'; } },
    };
    vm.runInNewContext(theme, context);
    assert.equal(dark, !blocked);
  }
});
