import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import puppeteer from 'puppeteer-core';

test('shared queue badges, fiscal scope and session recovery stay consistent in the browser', { timeout: 180000 }, async (t) => {
  const executablePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((file) => file && fs.existsSync(file));
  assert.ok(executablePath, 'An installed Chrome or Edge is required.');
  const app = express(), dist = path.resolve('../municipal-frontend/dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  let browser;
  t.after(async () => { await browser?.close(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
  browser = await puppeteer.launch({ executablePath, headless: true });
  const page = await browser.newPage(), origin = `http://127.0.0.1:${server.address().port}`, errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let userId = 7, role = 'budgetOfficer', permissions = ['budget.view', 'budget.requestControl'], unread = 1;
  let deadline = Date.now() + 600000, complete = false;
  const year = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date()));
  const invoice = { id: 71, invoiceNo: 'INV-071', contractId: 81, deliveryId: 91, contractNo: 'CON-081', fiscalYear: year, amount: 500, supplierInvoiceRef: 'OLD-REF', remarks: 'Correct reference', status: 'returned' };
  const tasks = [
    { id: 'budgetControl-1', recordId: 1, title: 'Transfer request #1', fiscalYear: year, href: '/budget/controls?request=1', action: 'Review the transfer authority', actionLabel: 'Open request', stage: 'Submitted', responsibleRole: 'Budget Officer', urgency: 'overdue' },
    { id: 'budgetControl-2', recordId: 2, title: 'Allocation request #2', fiscalYear: year, href: '/budget/controls?request=2', action: 'Complete supporting documents', actionLabel: 'Open request', stage: 'Draft', responsibleRole: 'Budget Officer', urgency: 'normal' },
    { id: 'budgetControl-3', recordId: 3, title: 'Previous year request', fiscalYear: year - 1, href: '/budget/controls?request=3', action: 'Review the previous year transfer', actionLabel: 'Open request', stage: 'Submitted', responsibleRole: 'Budget Officer', urgency: 'normal' },
  ];
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return url.origin === origin || url.protocol === 'data:' ? request.continue() : request.abort();
    const key = url.pathname.slice(4), method = request.method();
    let data = [];
    if (key === '/auth/me') data = { id: userId, name: 'Budget QA', role, roleName: role, departmentId: 1, permissions, themePreference: 'light', loginSessionExpiresAt: deadline, serverTime: Date.now(), mfaVerified: true, mfaEnrollmentRequired: false };
    else if (key === '/settings') data = { lgu: { name: 'QA Municipality' }, branding: { systemName: 'ProcureNance' }, thresholds: {}, options: {} };
    else if (key === '/settings/shortcuts') data = {};
    else if (key === '/my-work') {
      const fiscalYear = url.searchParams.get('fiscalYear');
      const items = tasks.filter((item) => (!complete || item.id !== 'budgetControl-1') && (fiscalYear === 'all' || item.fiscalYear === Number(fiscalYear)));
      data = { items, total: items.length, counts: { '/budget/controls': items.length }, queues: {}, fiscalYear: fiscalYear === 'all' ? 'all' : Number(fiscalYear), generatedAt: new Date().toISOString() };
    } else if (key === '/notifications') data = { unreadCount: unread, notifications: [{ id: 9, title: 'Transfer submitted', body: 'Review supporting authority.', readAt: unread ? null : new Date().toISOString(), link: '/budget/controls' }] };
    else if (key.startsWith('/notifications/') && method === 'POST') { unread = 0; data = { unreadCount: 0 }; }
    else if (key === '/finance/budget-monitor') data = { fiscalYear: url.searchParams.get('fiscalYear'), totals: { appropriated: 1000, obligated: 0, unobligated: 1000 } };
    else if (key === '/finance/invoices') data = url.searchParams.has('page') ? { rows: [invoice], total: 1, page: 1, pageSize: 10, totalPages: 1 } : [invoice];
    else if (key === '/public/projects/overview') data = { totalProjects: 0 };
    await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const waitText = (value) => page.waitForFunction((value) => document.body.innerText.includes(value), {}, value);
  const clickText = (value) => page.evaluate((value) => {
    const button = [...document.querySelectorAll('button')].find((element) => element.getClientRects().length && element.textContent.trim() === value);
    if (!button) throw new Error(`Missing button ${value}`);
    button.click();
  }, value);
  const bellCount = (value) => page.waitForSelector(`button[aria-label^="Notifications (${value} items"]`);
  const sidebarCount = (value) => page.waitForSelector(`aside a[href="/budget/controls"][aria-label$=", ${value} pending items"]`);
  await page.setViewport({ width: 1300, height: 1000 });
  await page.goto(origin + '/budget', { waitUntil: 'networkidle0' });
  await waitText('Items Waiting for Your Action');
  await bellCount(2); await sidebarCount(2);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('main a')].filter((element) => element.textContent.includes('Transfer request #1')).length), 1, 'a task appears once, without client supplemental copies');
  await page.click('button[aria-label^="Notifications ("]');
  await clickText('Updates (1)'); await clickText('Mark updates read');
  await waitText('Updates (0)'); await bellCount(2); await sidebarCount(2);
  await page.click('button[aria-label^="Notifications ("]');
  await page.select('main select[aria-label="Fiscal year"]', String(year - 1));
  await waitText('Previous year request'); await bellCount(1); await sidebarCount(1);
  await page.select('main select[aria-label="Fiscal year"]', 'all');
  await bellCount(3); await sidebarCount(3);
  complete = true;
  await page.evaluate(() => window.dispatchEvent(new Event('procurement:changed')));
  await bellCount(2); await sidebarCount(2);
  await page.waitForFunction(() => !document.querySelector('main').innerText.includes('Transfer request #1'));

  // The actual auth-expiry event flushes a form before the page redirects. A
  // short delay keeps this faster than the normal 500 ms autosave debounce.
  role = 'vendor'; permissions = ['delivery.submitInvoice']; deadline = Date.now() + 90000;
  await page.goto(origin + '/invoices', { waitUntil: 'networkidle0' });
  await waitText('Session ending soon'); await clickText('Continue working');
  await clickText('CORRECT AND RESUBMIT'); await waitText('Correct INV-071');
  await page.evaluate(() => {
    const label = [...document.querySelectorAll('[role="dialog"] label')].find((node) => node.textContent.includes('Your invoice ref.'));
    const input = label.parentElement.querySelector('input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'UNSAVED-RECOVERY-REF');
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await new Promise((resolve) => setTimeout(resolve, 60));
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('auth:unauthorized', { detail: { code: 'SESSION_EXPIRED' } })));
  await page.waitForFunction(() => location.pathname === '/login');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('procurenance.form-draft.v1.7.invoice-71')));
  assert.equal(stored.value.supplierInvoiceRef, 'UNSAVED-RECOVERY-REF');
  deadline = Date.now() + 600000;
  await page.goto(origin + '/invoices', { waitUntil: 'networkidle0' });
  await clickText('CORRECT AND RESUBMIT'); await waitText('Restore form'); await clickText('Restore form');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] input')].find((node) => node.type === 'text').value), 'UNSAVED-RECOVERY-REF');
  userId = 8;
  await page.goto(origin + '/invoices', { waitUntil: 'networkidle0' });
  await clickText('CORRECT AND RESUBMIT');
  assert.equal(await page.evaluate(() => document.querySelector('[role="dialog"]').innerText.includes('Restore form')), false, 'another account cannot restore this account\'s work');
  assert.deepEqual(errors, []);
});
