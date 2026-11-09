import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import puppeteer from "puppeteer-core";

// The optional snapshot contains read-only output from real list controllers.
// Authentication and shell endpoints are fixtures; no original user is
// impersonated and this test writes no database or procurement events.
test("normal procurement screens render a scoped recovery on desktop and mobile", { timeout: 180000 }, async (t) => {
  const executablePath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((file) => file && fs.existsSync(file));
  assert.ok(executablePath, "An installed browser is required.");
  const fields = [{ label: "Fiscal Year", value: "2026" }, { label: "Item Description", value: "Emergency response equipment and supplies" }];
  const recovery = { source: { filename: "synthetic-form.docx" }, importedAt: new Date().toISOString(), hold: true, blockers: ["Synthetic missing planning evidence"], sourceFields: fields, reconstructedProgression: [{ activityDate: "2026-09-25", sourceFields: [fields[0]] }, { activityDate: "2026-10-09", sourceFields: [fields[1]] }] };
  const fixture = process.env.RECOVERY_BROWSER_SNAPSHOT ? JSON.parse(fs.readFileSync(process.env.RECOVERY_BROWSER_SNAPSHOT, "utf8")) : {
    app: { id: 1, projectTitle: "Synthetic recovery project", description: "Synthetic description", fiscalYear: 2026, status: "draft", planCycle: "final", planStage: "ppmp", procurementMode: "competitiveBidding", abc: 2000, targetStartQuarter: "Q1", targetCompletionQuarter: "Q2", implementingUnitCode: "QA", editable: false, recoveryImport: recovery },
    pr: { id: 1, prNumber: "PR-UI-QA", fiscalYear: 2026, appEntryTitle: "Synthetic recovery project", appEntryAbc: 2000, status: "draft", purpose: "Synthetic purpose", dateRequired: "2026-06-15", requesterName: "Synthetic service officer", departmentName: "Synthetic service office", isEmergency: false, justificationStatus: "notApplicable", totalAmount: null, editable: false, recoveryImport: recovery, assetSummary: {}, lineItems: [{ id: 1, description: fields[1].value, quantity: null, unitCost: null, lineTotal: null, assetClass: null, hasUsefulLifeOverOneYear: null, technicalSpecifications: null }] },
  };
  const app = express(), dist = path.resolve("../municipal-frontend/dist");
  app.use(express.static(dist)); app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  const server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  const browser = await puppeteer.launch({ executablePath, headless: true });
  t.after(async () => { await browser.close(); await new Promise((resolve) => server.close(resolve)); });
  const origin = `http://127.0.0.1:${server.address().port}`, page = await browser.newPage(), errors = [], mutationRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on("request", async (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return url.origin === origin || url.protocol === "data:" ? request.continue() : request.abort();
    if (request.method() !== "GET") mutationRequests.push({ path: url.pathname, method: request.method() });
    const key = url.pathname.slice(4);
    const envelope = (rows) => url.searchParams.has("page") ? { rows, total: rows.length, page: 1, pageSize: 25, totalPages: 1 } : rows;
    let data = {};
    if (key === "/auth/me") data = { id: -1, name: "Read-only UI verification", email: "verification@example.test", departmentId: -1, role: "systemAdministrator", roleName: "System Administrator", permissions: ["app.view", "app.create", "app.submit", "pr.view", "pr.create", "audit.viewAll"], themePreference: "light", loginSessionExpiresAt: Date.now() + 600000, serverTime: Date.now(), mfaVerified: true, mfaEnrollmentRequired: false };
    else if (key === "/settings") data = { lgu: { name: "UI verification", lguType: "municipality", incomeClass: "1st" }, branding: { systemName: "ProcureNance" }, thresholds: {}, options: { lguTypes: ["municipality"], incomeClasses: ["1st"] } };
    else if (key === "/settings/shortcuts") data = {};
    else if (key.includes("notifications")) data = [];
    else if (key === "/reports/pending-counts") data = { counts: {}, queues: {}, generatedAt: new Date().toISOString() };
    else if (key === "/app-entries") data = envelope([fixture.app]);
    else if (key === "/purchase-requisitions") data = envelope([fixture.pr]);
    await request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  const click = async (text) => {
    await page.waitForFunction((label) => [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === label), {}, text);
    await page.evaluate((label) => [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === label).click(), text);
  };
  const capture = async (name) => {
    if (!process.env.RECOVERY_BROWSER_ARTIFACT_DIRECTORY) return;
    fs.mkdirSync(process.env.RECOVERY_BROWSER_ARTIFACT_DIRECTORY, { recursive: true });
    await page.screenshot({ path: path.join(process.env.RECOVERY_BROWSER_ARTIFACT_DIRECTORY, name), fullPage: true });
  };
  for (const [name, width] of [["desktop", 1440], ["mobile", 390]]) {
    await t.test(`${name}: plan details preserve every form response and separate provenance`, async () => {
      await page.setViewport({ width, height: 950 });
      await page.goto(origin + "/app-entries", { waitUntil: "networkidle0" });
      await page.waitForFunction((title) => document.body.innerText.includes(title), {}, fixture.app.projectTitle);
      assert.equal(await page.evaluate(() => [...document.querySelectorAll("button")].some((button) => /^(Edit|Submit)$/.test(button.textContent.trim()))), false);
      await capture(`plan-list-${name}.png`);
      await click("View details");
      await page.waitForSelector('section[aria-label="Recovery provenance"] dl');
      const shown = await page.$$eval('section[aria-label="Recovery provenance"] dl > div', (rows) => rows.map((row) => ({ label: row.querySelector("dt").textContent, value: row.querySelector("dd").textContent })));
      assert.deepEqual(shown, fixture.app.recoveryImport.sourceFields.map(({ label, value }) => ({ label, value })));
      assert.equal(await page.$eval('section[aria-label="Recovery provenance"] details', (detail) => detail.open), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
      await capture(`plan-details-${name}.png`);
      await page.evaluate((description) => [...document.querySelectorAll('section[aria-label="Recovery provenance"] dd')].find((field) => field.textContent === description).scrollIntoView({ block: "center" }), fixture.pr.lineItems[0].description);
      await capture(`plan-checkpoint-${name}.png`);
      await page.$eval('section[aria-label="Recovery provenance"] details > summary', (summary) => summary.click());
      const historyText = await page.$eval('section[aria-label="Recovery provenance"]', (section) => section.innerText);
      assert.match(historyText, /Original entry timestamps: not verified/);
      await page.$eval('section[aria-label="Recovery provenance"] details details > summary', (summary) => summary.click());
      const expanded = await page.$eval('section[aria-label="Recovery provenance"]', (section) => section.innerText);
      assert.match(expanded, /2026-09-25/); assert.match(expanded, /2026-10-09/); assert.match(expanded, /reconstructed dates, not verified historical activity/);
    });
    await t.test(`${name}: requisition displays No, N/A and the item description without invented costs`, async () => {
      await page.goto(origin + "/purchase-requisitions", { waitUntil: "networkidle0" });
      await page.waitForFunction((number) => document.body.innerText.includes(number), {}, fixture.pr.prNumber);
      assert.match(await page.evaluate(() => document.body.innerText), /Pending item costing/);
      await click("View");
      await page.waitForSelector('[role="dialog"]');
      const text = await page.$eval('[role="dialog"]', (dialog) => dialog.innerText);
      assert.ok(text.includes(fixture.pr.lineItems[0].description)); assert.ok(text.includes(fixture.pr.requesterName));
      assert.match(text, /EMERGENCY PURCHASE\s+No/i); assert.match(text, /EMERGENCY JUSTIFICATION\s+Not Applicable/i);
      assert.doesNotMatch(text, /₱0\.00/); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
      await capture(`requisition-${name}.png`);
      await page.evaluate((description) => [...document.querySelectorAll('[role="dialog"] td')].find((field) => field.textContent.trim().startsWith(description)).scrollIntoView({ block: "center" }), fixture.pr.lineItems[0].description);
      await capture(`requisition-item-${name}.png`);
    });
  }
  assert.deepEqual(mutationRequests, []); assert.deepEqual(errors, []);
});
