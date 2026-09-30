import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import puppeteer from "puppeteer-core";

// Exercise real rendered forms against deterministic API responses. These
// fixtures never authenticate to the municipal server or change its records.
test("planning records expose authorized corrections and preserve proceeding and invoice workflow details", { timeout: 180000 }, async (t) => {
  const executablePath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((file) => file && fs.existsSync(file));
  assert.ok(executablePath, "Set CHROME_PATH to an installed browser.");
  const app = express(), dist = path.resolve("../municipal-frontend/dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  const server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const browser = await puppeteer.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const origin = `http://127.0.0.1:${server.address().port}`, page = await browser.newPage(), errors = [], writes = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let role = "planningDeputy", permissions = ["planning.view", "planning.manageCdp", "planning.manageAip"];
  const goal = { id: 11, title: "Improve municipal services", sector: "social", subsector: "Health", description: "Original goal detail", status: "active" };
  const plan = { id: 1, title: "Draft development plan", startYear: 2026, endYear: 2028, horizonYears: 3, status: "draft", goals: [goal] };
  const adoptedGoal = { ...goal, id: 12, title: "Adopted health goal" };
  const adoptedPlan = { ...plan, id: 2, title: "Adopted development plan", status: "adopted", goals: [adoptedGoal] };
  const entry = { id: 31, title: "Health equipment", developmentGoalId: 12, goalTitle: adoptedGoal.title, implementingUnitId: 1,
    implementingUnitCode: "HEALTH", expenseClass: "mooe", expenseClassLabel: "MOOE", fund: "generalFund", fundLabel: "General fund",
    estimatedCost: 1000, startQuarter: "Q1", endQuarter: "Q4", status: "planned", remarks: "Initial project" };
  const program = { id: 21, title: "Returned investment program", fiscalYear: 2026, developmentPlanId: 2, status: "returned", editable: true,
    totalEstimatedCost: 1000, returnRemarks: "Clarify the project description.", entries: [entry] };
  const options = { sectors: [{ key: "social", label: "Social" }], expenseClasses: [{ key: "mooe", label: "MOOE" }],
    funds: [{ key: "generalFund", label: "General fund" }], quarters: ["Q1", "Q2", "Q3", "Q4"] };
  const proposals = [1, 2].map((id) => ({ id: 40 + id, departmentId: id, departmentName: id === 1 ? "Health office" : "Engineering office",
    status: "draft", proposedTotal: 1000, recommendedTotal: null, finalTotal: null, lines: [] }));
  const budget = { id: 51, title: "Municipal budget 2026", fiscalYear: 2026, status: "draft", statusLabel: "Draft", proposalsOpen: true,
    estimatedIncome: 10000, expenditureCeiling: 10000, totals: { proposed: 2000, final: 0 }, proposals, proceedings: [] };
  const invoice = { id: 71, invoiceNo: "INV-RETURNED-071", contractId: 81, contractNo: "CON-081", deliveryId: 91,
    vendorName: "Fixture supplier", status: "returned", remarks: "Correct the invoice reference.", amount: 500,
    supplierInvoiceRef: "OLD-REF", payment: null };
  const envelope = (rows) => ({ rows, total: rows.length, page: 1, pageSize: 25, totalPages: 1 });
  await page.setRequestInterception(true);
  page.on("request", async (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return url.origin === origin || url.protocol === "data:" ? request.continue() : request.abort();
    const key = url.pathname.slice(4), method = request.method(), body = request.postData() ? JSON.parse(request.postData()) : null;
    let data = {};
    if (method !== "GET" && method !== "OPTIONS") writes.push({ key, method, body, idempotencyKey: request.headers()["idempotency-key"] });
    if (key === "/auth/me") data = { id: 9, name: "Planning QA", email: "qa@example.test", role, roleName: role, departmentId: 1,
      permissions, themePreference: "light", loginSessionExpiresAt: Date.now() + 600000, serverTime: Date.now(), mfaVerified: true, mfaEnrollmentRequired: false };
    else if (key === "/settings") data = { lgu: { name: "QA Municipality", lguType: "municipality", incomeClass: "1st" }, branding: { systemName: "ProcureNance" }, thresholds: {}, options: {} };
    else if (key === "/settings/shortcuts") data = {};
    else if (key.includes("notifications")) data = [];
    else if (key === "/reports/pending-counts") data = { counts: {}, queues: {}, generatedAt: new Date().toISOString() };
    else if (key === "/my-work") data = { items: [], total: 0, counts: {} };
    else if (key === "/departments/directory") data = [{ id: 1, name: "Health office", code: "HEALTH" }, { id: 2, name: "Engineering office", code: "ENG" }];
    else if (key === "/planning/options") data = options;
    else if (key === "/planning/plans") data = [plan, adoptedPlan];
    else if (key === "/planning/plans/1" && method === "PATCH") { Object.assign(plan, body); data = plan; }
    else if (key === "/planning/goals/11" && method === "PATCH") { Object.assign(goal, body); data = goal; }
    else if (key === "/planning/investment-programs") data = [program];
    else if (key === "/planning/investment-programs/21" && method === "PATCH") { Object.assign(program, body); data = program; }
    else if (key === "/planning/aip-entries") data = [entry];
    else if (key === "/planning/aip-entries/31" && method === "PATCH") { Object.assign(entry, body); data = entry; }
    else if (key === "/budget-preparation/options") data = options;
    else if (key === "/budget-preparation/budgets") data = [budget];
    else if (key === "/budget-preparation/budgets/51/proceedings" && method === "POST") {
      data = { id: 61, typeLabel: "Budget forum", attendees: [], recordedByName: "Planning QA", ...body }; budget.proceedings.push(data);
    } else if (key === "/budget-preparation/proceedings/61" && method === "PATCH") { Object.assign(budget.proceedings[0], body); data = budget.proceedings[0]; }
    else if (key === "/finance/invoices/71/resubmit" && method === "POST") {
      Object.assign(invoice, body, { status: "submitted", remarks: null });
      // Keep the response pending briefly so the form has to suppress a repeated click.
      await new Promise((resolve) => setTimeout(resolve, 150)); data = invoice;
    } else if (key === "/finance/invoices") data = envelope([invoice]);
    await request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  const text = () => page.evaluate(() => document.body.innerText);
  const click = (label, prefix = false) => page.evaluate((label, prefix) => {
    const button = [...document.querySelectorAll("button")].find((button) => button.getClientRects().length > 0 && (prefix ? button.textContent.trim().toLowerCase().startsWith(label.toLowerCase()) : button.textContent.trim().toLowerCase() === label.toLowerCase()));
    if (!button) throw new Error(`Missing button: ${label}`); button.click();
  }, label, prefix);
  const waitForText = (text) => page.waitForFunction((value) => document.body.innerText.includes(value), {}, text);
  const fillLabel = (name, value, scope = "body") => page.evaluate((name, value, scope) => {
    const label = [...document.querySelector(scope).querySelectorAll("label")].find((label) => label.textContent.trim().startsWith(name));
    const field = label?.querySelector("input,textarea") ?? label?.parentElement.querySelector("input,textarea");
    if (!field) throw new Error(`Missing field: ${name}`);
    const prototype = field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true })); field.dispatchEvent(new Event("change", { bubbles: true }));
  }, name, value, scope);
  const writesFor = (key) => writes.filter((write) => write.key === key);
  await page.setViewport({ width: 1280, height: 950 });

  await page.goto(origin + "/planning", { waitUntil: "networkidle0" });
  await waitForText("Draft development plan");
  assert.ok(await page.$('a[href="/planning"]'), "custom planning roles can find the page in the sidebar");
  await click("Edit plan"); await waitForText("Edit development plan");
  await fillLabel("Title", "Corrected development plan"); await click("Save plan");
  await waitForText("Corrected development plan");
  assert.equal(writesFor("/planning/plans/1").length, 1);
  assert.equal(writesFor("/planning/plans/1")[0].body.title, "Corrected development plan");
  await page.evaluate(() => [...document.querySelectorAll("tr")].find((row) => row.innerText.includes("Corrected development plan"))
    .querySelector('button[aria-expanded]').click());
  await click("Edit goal"); await waitForText("Edit development goal");
  await fillLabel("Goal", "Corrected service goal", '[role="dialog"]'); await click("SAVE GOAL");
  await waitForText("Corrected service goal");
  assert.equal(writesFor("/planning/goals/11")[0].body.title, "Corrected service goal");
  await click("Investment Program", true); await click("Edit AIP");
  await fillLabel("Title", "Corrected investment program", '[role="dialog"]'); await click("Save AIP");
  await waitForText("Corrected investment program");
  assert.equal(writesFor("/planning/investment-programs/21").length, 1);
  await click("Edit project"); await waitForText("Edit project in AIP");
  await fillLabel("Project", "Corrected health equipment"); await click("Save project");
  await waitForText("Corrected health equipment");
  assert.equal(writesFor("/planning/aip-entries/31")[0].body.title, "Corrected health equipment");
  program.status = "pendingMayorEndorsement"; program.editable = false;
  await page.goto(origin + "/planning", { waitUntil: "networkidle0" }); await click("Investment Program", true);
  assert.doesNotMatch(await text(), /Edit AIP|Edit project|Add project/i);

  // Responsive plan cards must expose the same authorized work as the table.
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(origin + "/planning", { waitUntil: "networkidle0" });
  await click("Edit plan"); await waitForText("Edit development plan"); await click("Cancel");
  await click("Details"); await click("Edit goal"); await waitForText("Edit development goal"); await click("CANCEL");
  await click("Update progress"); await waitForText("Goal progress");
  await fillLabel("Progress update / reason", "Mobile progress record.", '[role="dialog"]');
  await click("Record progress"); await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  assert.equal(writesFor("/planning/goals/11").length, 2);
  assert.equal(writesFor("/planning/goals/11")[1].body.progressRemarks, "Mobile progress record.");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "mobile planning remains within the viewport");

  await page.goto(origin + "/help-guide", { waitUntil: "networkidle0" });
  await page.waitForSelector('button[aria-label^="Open guide:"]');
  await page.click('button[aria-label^="Open guide:"]');
  await page.waitForSelector("video");
  await page.waitForFunction(() => {
    const video = document.querySelector("video");
    return video && video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0;
  });
  const guideVideo = await page.$eval("video", (video) => ({ source: video.currentSrc, width: video.videoWidth, duration: video.duration, error: video.error?.code ?? null }));
  assert.match(guideVideo.source, /guide-videos\/development-planning\.mp4$/);
  assert.ok(guideVideo.width > 0, "hydrated guide video is decoded by the browser");
  assert.equal(guideVideo.error, null);
  await page.$eval("video", async (video) => { video.muted = true; await video.play(); });
  await page.waitForFunction(() => document.querySelector("video")?.currentTime > 0);
  await page.$eval("video", (video) => video.pause());
  await page.setViewport({ width: 1280, height: 950 });

  role = "departmentRequester"; permissions = ["budget.view", "budget.proposeBudget"];
  await page.goto(origin + "/budget/preparation", { waitUntil: "networkidle0" }); await waitForText("Engineering office");
  const actions = await page.evaluate(() => Object.fromEntries(["Health office", "Engineering office"].map((office) => {
    const row = [...document.querySelectorAll("tbody tr")].find((row) => row.innerText.includes(office));
    return [office, [...row.querySelectorAll("button")].map((button) => button.textContent.trim().toUpperCase())];
  })));
  assert.ok(actions["Health office"].includes("EDIT")); assert.ok(actions["Health office"].includes("SUBMIT PROPOSAL"));
  assert.deepEqual(actions["Engineering office"], []);

  role = "budgetOfficer"; permissions = ["budget.view", "budget.conductForum"];
  budget.status = "pendingBudgetForum"; budget.statusLabel = "Budget forum"; budget.proposalsOpen = false;
  await page.goto(origin + "/budget/preparation", { waitUntil: "networkidle0" }); await click("RECORD PROCEEDING");
  await fillLabel("Scheduled for", "2026-09-21T09:00", '[role="dialog"]');
  await fillLabel("Venue", "Municipal session hall", '[role="dialog"]'); await click("RECORD");
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  const recording = writesFor("/budget-preparation/budgets/51/proceedings")[0];
  assert.equal(recording.body.heldAt, null, "scheduling must not assert that a proceeding actually happened");
  assert.ok(recording.body.scheduledAt.endsWith("Z"));
  await click("Amend record"); await waitForText("Amend proceeding record");
  assert.equal(await page.$eval('[role="dialog"] select', (select) => select.disabled), true);
  await fillLabel("Actually held on", "2026-09-21T10:00", '[role="dialog"]');
  await fillLabel("Minutes", "The completed forum reviewed the departmental proposals.", '[role="dialog"]'); await click("SAVE AMENDMENT");
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  const amendment = writesFor("/budget-preparation/proceedings/61")[0];
  assert.equal(amendment.method, "PATCH"); assert.equal(amendment.body.scheduledAt, recording.body.scheduledAt);
  assert.equal(new Date(amendment.body.heldAt) - new Date(amendment.body.scheduledAt), 3600000);
  assert.equal(amendment.body.minutes, "The completed forum reviewed the departmental proposals.");

  role = "supplier"; permissions = ["delivery.submitInvoice"];
  await page.goto(origin + "/invoices", { waitUntil: "networkidle0" }); await click("CORRECT AND RESUBMIT");
  await waitForText("Correct INV-RETURNED-071");
  assert.equal(await page.$('[role="dialog"] select'), null, "correction retains the existing contract and delivery");
  await fillLabel("Amount", "450", '[role="dialog"]'); await fillLabel("Your invoice ref.", "FIXED-REF", '[role="dialog"]');
  await page.evaluate(() => { const button = [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.getClientRects().length > 0 && button.textContent.trim().toLowerCase() === "resubmit invoice"); button.click(); button.click(); });
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  const corrections = writesFor("/finance/invoices/71/resubmit");
  assert.equal(corrections.length, 1); assert.equal(corrections[0].body.amount, 450); assert.equal(corrections[0].body.supplierInvoiceRef, "FIXED-REF");
  assert.equal(corrections[0].body.contractId, 81); assert.equal(corrections[0].body.deliveryId, 91);
  assert.ok(corrections[0].idempotencyKey, "business mutation carries a durable retry reference");
  assert.equal(writesFor("/finance/invoices").length, 0, "correction does not create another invoice");
  assert.doesNotMatch(await text(), /CORRECT AND RESUBMIT/);
  assert.deepEqual(errors, []);
});
