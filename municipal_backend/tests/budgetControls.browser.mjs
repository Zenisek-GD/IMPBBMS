import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import puppeteer from "puppeteer-core";

// Render the production bundle against isolated HTTP fixtures. No municipal
// records or credentials are used by this browser regression.
test("budget requests recover input, retain evidence and require a separate approval", { timeout: 180000 }, async t => {
  const executablePath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(file => file && fs.existsSync(file));
  assert.ok(executablePath, "Set CHROME_PATH to an installed browser.");
  const app = express(), dist = path.resolve("../municipal-frontend/dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  const server = await new Promise(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  let browser;
  t.after(async () => { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  browser = await puppeteer.launch({ executablePath, headless: true });
  const origin = `http://127.0.0.1:${server.address().port}`, page = await browser.newPage(), errors = [], writes = [], reads = [];
  page.on("pageerror", error => errors.push(error.message));
  let actor = 9, permissions = ["budget.view", "budget.requestControl"];
  const fiscalYear = Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Manila" }).format(new Date()));
  const financials = { allocated: 1000, obligated: 800, grossExpenses: 700, supplierPaid: 650, taxesWithheld: 30, retention: 20, unpaid: 100, remainingFunds: 300, recognizedSavings: 200 };
  const projects = [1, 2].map(id => ({ id, projectTitle: id === 1 ? "Completed health project" : "Health equipment expansion", fiscalYear, appropriationId: id, departmentName: "Health office", fund: "generalFund", expenseClass: "mooe", sector: "social", financials, approvedTransferable: id === 1 ? 200 : 0 }));
  const records = [], documents = [];
  const appropriation = { id: 1, fiscalYear, title: "Health budget", amount: 100000, status: "enacted", type: "annual", ordinanceNo: "ORD-1", ordinanceDate: `${fiscalYear}-01-01`, fund: "generalFund", expenseClass: "mooe", departmentId: 1 };
  await page.setRequestInterception(true);
  page.on("request", async request => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return url.origin === origin || url.protocol === "data:" ? request.continue() : request.abort();
    const key = url.pathname.slice(4), method = request.method();
    const body = request.postData() && request.headers()["content-type"]?.includes("application/json") ? JSON.parse(request.postData()) : null;
    if (method === "GET") reads.push({ key, year: url.searchParams.get("fiscalYear") });
    else if (method !== "OPTIONS") writes.push({ key, method, body, idempotencyKey: request.headers()["idempotency-key"] });
    let data = {};
    if (key === "/auth/me") data = { id: actor, name: actor === 9 ? "Budget QA" : "Mayor QA", role: actor === 9 ? "budgetOfficer" : "hope", roleName: "Budget QA", permissions, departmentId: 1, themePreference: "light", loginSessionExpiresAt: Date.now() + 600000, serverTime: Date.now(), mfaVerified: true, mfaEnrollmentRequired: false };
    else if (key === "/settings") data = { lgu: { name: "QA Municipality", lguType: "municipality", incomeClass: "1st" }, branding: { systemName: "ProcureNance" }, thresholds: {}, options: {} };
    else if (key === "/my-work" || key === "/reports/my-work") data = { items: [], total: 0, counts: {}, queues: {} };
    else if (key === "/notifications") data = { notifications: [], unreadCount: 0 };
    else if (key === "/departments/directory") data = [{ id: 1, name: "Health office", code: "HEALTH" }];
    else if (key === "/finance/appropriations/options") data = { funds: [{ key: "generalFund", label: "General fund" }], expenseClasses: [{ key: "mooe", label: "MOOE" }], types: ["annual", "supplemental"] };
    else if (key === "/finance/budget-controls" && method === "GET") {
      const year = url.searchParams.get("fiscalYear") === "all" ? "all" : Number(url.searchParams.get("fiscalYear"));
      data = { fiscalYear: year, requests: records.filter(row => year === "all" || row.fiscalYear === year).map(row => ({ ...row, canEdit: row.status === "draft" && actor === row.requesterId, canApprove: row.status === "submitted" && actor !== row.requesterId && permissions.includes("budget.approveControl") })), projects: year === fiscalYear || year === "all" ? projects : [], appropriations: [appropriation], priorYearAppropriations: [], allocations: [] };
    } else if (key === "/finance/budget-controls" && method === "POST") {
      await new Promise(resolve => setTimeout(resolve, 120));
      data = { ...body, id: 71, status: "draft", requesterId: actor, requesterName: "Budget QA", responsibleRole: "Requesting Budget Officer" }; records.push(data);
    } else if (key === "/finance/budget-controls/71/transition") {
      const row = records[0];
      if (body.action === "submit") Object.assign(row, { status: "submitted", requestedAt: new Date().toISOString(), responsibleRole: "Head of Procuring Entity / Mayor" });
      else Object.assign(row, { status: "approved", approverId: actor, approverName: "Mayor QA", approvedAt: new Date().toISOString(), decisionRemarks: body.remarks, responsibleRole: null, beforeBalances: { source: financials, destination: financials, approvedAvailable: 200 }, afterBalances: { source: { ...financials, allocated: 900 }, destination: { ...financials, allocated: 1100 }, approvedAvailable: 100 } });
      await new Promise(resolve => setTimeout(resolve, 120)); data = row;
    } else if (key === "/documents" && method === "GET") data = documents;
    else if (key === "/documents" && method === "POST") { data = { id: 81, docType: "budgetAuthority", filename: "authority.pdf", sizeBytes: 100, checksum: "a".repeat(64) }; documents.push(data); }
    await request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  const click = (label, twice = false) => page.evaluate((label, twice) => {
    const button = [...document.querySelectorAll("button")].find(row => row.getClientRects().length && row.textContent.trim().toLowerCase() === label.toLowerCase());
    if (!button) throw new Error(`Missing button: ${label}`);
    button.click(); if (twice) button.click();
  }, label, twice);
  const fill = (name, value) => page.evaluate((name, value) => {
    const label = [...document.querySelectorAll("label")].find(row => row.textContent.trim().startsWith(name));
    const input = label?.querySelector("input,select,textarea");
    if (!input) throw new Error(`Missing input: ${name}`);
    if (input.type === "checkbox") { if (input.checked !== value) input.click(); return; }
    const prototype = input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : input.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
  }, name, value);
  const waitText = text => page.waitForFunction(text => document.body.innerText.includes(text), {}, text);
  const text = () => page.evaluate(() => document.body.innerText);
  await page.setViewport({ width: 1280, height: 950 });
  await page.goto(origin + "/budget/controls", { waitUntil: "networkidle0" });
  await waitText("Allocations, closeout and transfers");
  assert.ok(await page.$('a[href="/budget/appropriations"]'));
  await click("New budget request"); await fill("Action", "transfer");
  await fill("Source project", "1"); await fill("Destination project", "2"); await fill("Amount (PHP)", "100");
  await fill("Reason for the request", "Transfer approved health project savings to equipment.");
  await fill("Authority or ordinance reference", "ORD-QA-101");
  await fill("The supporting authority permits", true);
  // Simulate the synchronous event dispatched immediately before session loss.
  await page.evaluate(() => window.dispatchEvent(new Event("auth:before-clear")));
  await page.reload({ waitUntil: "networkidle0" }); await click("New budget request");
  await waitText("Restore form"); await click("Restore form");
  assert.ok((await text()).includes("Completed health project"));
  await click("Save draft", true); await waitText("Request #71");
  assert.equal(writes.filter(row => row.key === "/finance/budget-controls").length, 1);
  const creation = writes.find(row => row.key === "/finance/budget-controls");
  assert.equal(creation.body.amount, 100); assert.equal(creation.body.kind, "transfer");
  assert.equal(creation.body.payload.savingsAuthorityConfirmed, true); assert.ok(creation.idempotencyKey);
  assert.equal(await page.evaluate(() => localStorage.getItem("procurenance.form-draft.v1.9.budget-control-new")), null);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll("button")].find(row => row.textContent.includes("Submit for approval"))?.disabled), true);
  const evidence = path.join(os.tmpdir(), `impbbms-budget-authority-${process.pid}.pdf`);
  fs.writeFileSync(evidence, "%PDF-1.4\nBudget authority fixture\n%%EOF");
  t.after(() => fs.rmSync(evidence, { force: true }));
  await (await page.$('input[type="file"]')).uploadFile(evidence); await waitText("authority.pdf");
  await click("Submit for approval", true); await waitText("Head of Procuring Entity / Mayor");
  assert.equal(writes.filter(row => row.body?.action === "submit").length, 1);
  assert.doesNotMatch(await text(), /Edit draft|Review and approve|Replace/);
  actor = 20; permissions = ["budget.view", "budget.approveControl"];
  await page.reload({ waitUntil: "networkidle0" }); await waitText("Review and approve");
  assert.match(await text(), /Authority permits savings augmentation: Yes/);
  assert.match(await text(), /Gross expenses/); assert.match(await text(), /Supplier payments/);
  await click("Review and approve"); await fill("Decision basis", "Supporting authority and final balances have been verified.");
  await click("Approve request", true); await waitText("Permanent approval record");
  assert.equal(writes.filter(row => row.body?.action === "approve").length, 1);
  assert.match(await text(), /Mayor QA/); assert.doesNotMatch(await text(), /Review and approve/);
  await fill("Fiscal year", String(fiscalYear - 1)); await waitText("No requests match this fiscal year");
  assert.doesNotMatch(await text(), /Request #71|Completed health project/);
  assert.ok(reads.some(row => row.key === "/finance/budget-controls" && row.year === String(fiscalYear - 1)));
  await fill("Fiscal year", "all"); await waitText("Health equipment expansion");
  await page.setViewport({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
});
