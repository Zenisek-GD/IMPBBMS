import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import puppeteer from 'puppeteer-core';

// Use isolated HTTP fixtures, never the municipal database or saved browser session.
test('budget opening uses the selected fiscal year and requires one concrete year', { timeout: 120000 }, async t => {
  const executablePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(file => file && fs.existsSync(file));
  assert.ok(executablePath, 'Set CHROME_PATH to an installed browser.');
  const app = express(), dist = path.resolve('../municipal-frontend/dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  let browser;
  t.after(async () => { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  browser = await puppeteer.launch({ executablePath, headless: true });
  const page = await browser.newPage(), origin = `http://127.0.0.1:${server.address().port}`, writes = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', async request => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return url.origin === origin || url.protocol === 'data:' ? request.continue() : request.abort();
    const key = url.pathname.slice(4), method = request.method();
    let data = {};
    if (key === '/auth/me') data = { id: 1, name: 'Budget test officer', role: 'budgetOfficer', roleName: 'Budget Officer', departmentId: 1, permissions: ['budget.prepareExecutive', 'budget.view'], themePreference: 'light', mfaVerified: true, mfaEnrollmentRequired: false, serverTime: Date.now(), loginSessionExpiresAt: Date.now() + 600000 };
    else if (key === '/settings') data = { lgu: { name: 'Test municipality' }, branding: { systemName: 'ProcureNance' }, options: {} };
    else if (key === '/my-work') data = { items: [], counts: {}, total: 0 };
    else if (key === '/notifications') data = { notifications: [], unreadCount: 0 };
    else if (key === '/budget-preparation/options') data = {};
    else if (key === '/budget-preparation/budgets' && method === 'GET') data = [];
    else if (key === '/budget-preparation/budgets' && method === 'POST') {
      const body = JSON.parse(request.postData());
      writes.push(body);
      await new Promise(resolve => setTimeout(resolve, 80));
      data = { id: writes.length, fiscalYear: body.fiscalYear };
    }
    await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto(origin + '/budget/preparation', { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.body.innerText.includes('No budget opened yet.'));
  const openingButton = () => page.evaluateHandle(() => [...document.querySelectorAll('main button')].find(button => /^(OPEN|SELECT A FISCAL YEAR)/.test(button.textContent.trim())));
  for (const fiscalYear of ['2026', '2025', '2027']) {
    await page.select('main select[aria-label="Fiscal year"]', fiscalYear);
    await page.waitForNetworkIdle();
    const button = await openingButton();
    assert.ok(button.asElement(), 'A budget-opening action is available.');
    await button.asElement().click();
    await page.waitForNetworkIdle();
    assert.equal(writes.at(-1)?.fiscalYear, Number(fiscalYear), 'The submitted budget year must match the year selected by the officer.');
    assert.equal(await page.$eval('main select[aria-label="Fiscal year"]', select => select.value), fiscalYear);
  }
  await page.select('main select[aria-label="Fiscal year"]', 'all');
  await page.waitForNetworkIdle();
  const button = await openingButton();
  assert.equal(await button.evaluate(element => element.disabled), true, 'Combined years cannot create a budget for an arbitrary year.');
  assert.equal(writes.length, 3);
  assert.deepEqual(errors, []);
});
