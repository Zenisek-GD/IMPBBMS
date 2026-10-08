import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import puppeteer from "puppeteer-core";

// Real React routes with synthetic, persistent API fixtures. Separate MySQL
// tests exercise the actual controllers, transactions and approval guards.
test("procurement information forms retain explicit answers and conditional fields after reopening", { timeout: 180000 }, async (t) => {
  const executablePath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((file) => file && fs.existsSync(file));
  assert.ok(executablePath, "Set CHROME_PATH to an installed browser.");
  const app = express(), dist = path.resolve("../municipal-frontend/dist");
  app.use(express.static(dist)); app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  const server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  const browser = await puppeteer.launch({ executablePath, headless: true });
  t.after(async () => { await browser.close(); await new Promise((resolve) => server.close(resolve)); });
  const origin = `http://127.0.0.1:${server.address().port}`, page = await browser.newPage(), errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let role = "departmentRequester", savedApp = null, savedPr = null, savedVendor = null, postQualification = null, appWrites = 0, informationWrites = 0, receiptWrites = 0;
  const year = new Date(Date.now() + 8 * 3600000).getUTCFullYear(), today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const planned = { id: 10, fiscalYear: year, projectTitle: "Existing synthetic plan", category: "goods", abc: 1000, status: "locked", planCycle: "final", appropriationId: 1, procurementMode: "competitiveBidding", implementingUnitCode: "QA", editable: false };
  const rfq = { id: 1, referenceNo: "ITB-UI-QA", title: "Synthetic solicitation", category: "goods", status: "draft", abc: 1000, modeKey: "competitiveBidding", modeName: "Competitive Bidding", closingDate: new Date(Date.now() + 30 * 864e5).toISOString(), openingDate: new Date(Date.now() + 31 * 864e5).toISOString(), prebidRequired: false, openingVenue: "", procurementContactPerson: "", procurementContactEmail: "", requiredSupplierDocuments: "", scheduleApprovedAt: null, twgRequired: true };
  const award = { id: 1, noaNumber: "NOA-UI-QA", noaDate: today, externalNoaNumber: "QA-EXISTING-NOA", amount: 900, status: "issued", projectTitle: "Synthetic solicitation", vendorName: "Synthetic supplier", recommendedById: 3, recommendedByName: "Test chair", awardBasis: "LCRB", resolutionNo: "QA-BAC", supplierReceivedAt: null };
  const envelope = (rows, url) => url.searchParams.has("page") ? { rows, total: rows.length, page: 1, pageSize: 25, totalPages: 1 } : rows;
  await page.setRequestInterception(true);
  page.on("request", async (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return url.origin === origin || url.protocol === "data:" ? request.continue() : request.abort();
    const key = url.pathname.slice(4), method = request.method();
    let data = {};
    if (key === "/auth/me") data = { id: 9, name: "Test officer", email: "officer@example.test", departmentId: 1, role, roleName: role, permissions: ["app.view", "app.create", "app.submit", "pr.view", "pr.create", "bidding.view", "bidding.publish", "bidding.evaluate", "bidding.technicalInput", "vendor.view", "vendor.manage", "announcements.manage"], themePreference: "light", loginSessionExpiresAt: Date.now() + 600000, serverTime: Date.now(), mfaVerified: true, mfaEnrollmentRequired: false };
    else if (key === "/settings") data = { lgu: { name: "Test municipality", lguType: "municipality", incomeClass: "1st", capitalizationThreshold: 50000 }, branding: { systemName: "ProcureNance" }, thresholds: {}, options: { lguTypes: ["municipality"], incomeClasses: ["1st"] } };
    else if (key === "/settings/shortcuts") data = {};
    else if (key === "/settings/procurement" || key === "/bidding/bac-committee") data = { committee: [], policy: { membershipCount: 5, quorumCount: 3, memberIds: [] }, committeeCandidates: [], compositionWarnings: [] };
    else if (key.includes("notifications")) data = [];
    else if (key === "/reports/pending-counts") data = { counts: {}, queues: {}, generatedAt: new Date().toISOString() };
    else if (key === "/planning/aip-entries") data = [{ id: 1, fiscalYear: year, title: "Synthetic adopted project", goalTitle: "Test development goal", expectedOutput: "Test expected output", implementingUnitId: 1, status: "adopted" }];
    else if (key === "/finance/appropriations") data = [{ id: 1, fiscalYear: year, title: "Synthetic appropriation", ordinanceNo: "QA-ORD", fundLabel: "General fund", expenseClassLabel: "MOOE", amount: 20000, programmed: 1000, unprogrammed: 19000 }];
    else if (key === "/app-entries/mode-suggestion") data = { suggested: "directAcquisition", rationale: "Synthetic configured threshold", citation: "QA policy" };
    else if (key === "/app-entries" && method === "POST") { savedApp = { ...JSON.parse(request.postData()), id: 1, status: "draft", editable: true, implementingUnitCode: "QA" }; appWrites++; data = savedApp; }
    else if (key === "/app-entries") data = envelope([planned, ...(savedApp ? [savedApp] : [])], url);
    else if (key === "/purchase-requisitions/app-balance/10") data = { abc: 1000, committed: 0, remaining: 1000 };
    else if (key === "/purchase-requisitions" && method === "POST") { const payload = JSON.parse(request.postData()); savedPr = { ...payload, id: 1, prNumber: "PR-UI-QA", fiscalYear: year, status: "draft", editable: true, allowedAction: "submit", totalAmount: 1000, requesterName: "Test officer", departmentName: "Test office", appProjectTitle: planned.projectTitle, lineItems: payload.lineItems.map((item, index) => ({ ...item, id: index + 1, assetClass: "expense", lineTotal: item.quantity * item.unitCost })) }; data = savedPr; }
    else if (key === "/purchase-requisitions") data = envelope(savedPr ? [savedPr] : [], url);
    else if (key === "/bidding/rfqs") data = envelope([rfq], url);
    else if (key === "/bidding/rfqs/1/information") { Object.assign(rfq, JSON.parse(request.postData())); informationWrites++; data = { message: "Solicitation details saved." }; }
    else if (key === "/bidding/rfqs/1/schedule") data = { ...rfq, rfqId: 1, locked: rfq.status !== "draft", approvedAt: null, preparedById: 9, amendments: [] };
    else if (key === "/bidding/rfqs/1/evaluation-plan") data = { plan: null, amendments: [], canAmend: false };
    else if (key === "/bidding/rfqs/1/bids") data = { blind: false, complianceRequirements: [], bids: [{ id: 1, vendorName: "Synthetic supplier", vendorId: 1, totalBidPrice: 900, status: postQualification ? "postQualified" : "technicalPassed", evaluations: [{ id: 1, score: 100, status: "submitted", noConflictDeclared: true, declaredAt: new Date().toISOString(), submittedAt: new Date().toISOString(), failureReason: "none", criteriaBreakdown: {} }], postQualifications: postQualification ? [postQualification] : [], evidence: [{ id: 1, docType: "signedBidDocument", filename: "signed-test.pdf" }] }] };
    else if (key === "/bidding/rfqs/1/twg") data = { required: true, assessments: [] };
    else if (key === "/bidding/rfqs/1/evaluation-administration") data = { declaration: { noConflictDeclared: true }, conflicts: [], returns: [] };
    else if (key === "/bidding/bids/1/post-qualification") { postQualification = { ...JSON.parse(request.postData()), id: 1 }; data = { message: "Verification recorded." }; }
    else if (key === "/bidding/awards/1/receipt") { assert.equal(award.status, "issued"); award.supplierReceivedAt = JSON.parse(request.postData()).supplierReceivedAt; receiptWrites++; data = { message: "Supplier receipt recorded." }; }
    else if (key === "/bidding/awards") data = envelope([award], url);
    else if (key === "/vendors" && method === "POST") { savedVendor = { ...JSON.parse(request.postData()), id: 1, referenceCode: "VENDOR-UI-QA", registrationStatus: "submitted", documents: [], hasAccount: false }; data = savedVendor; }
    else if (key === "/vendors") data = envelope(savedVendor ? [savedVendor] : [], url);
    else if (key === "/vendors/me") data = { ...savedVendor, canBid: false };
    else if (key === "/bidding/my-quotations") data = [];
    else if (key === "/documents" || key.includes("announcements")) data = [];
    await request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  const body = () => page.evaluate(() => document.body.innerText);
  const click = async (text) => {
    await page.waitForFunction((text) => [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === text), {}, text);
    await page.evaluate((text) => [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === text).click(), text);
  };
  const field = async (label, tag = "input") => {
    const handle = await page.evaluateHandle((label, tag) => {
      const named = [...document.querySelectorAll(tag)].find((element) => element.getAttribute("aria-label") === label);
      if (named) return named;
      const row = [...document.querySelectorAll("label")].find((row) => row.textContent.trim().startsWith(label));
      if (!row) throw new Error(`Missing field ${label}`);
      return row.htmlFor ? document.getElementById(row.htmlFor) : row.querySelector(tag) || [...row.parentElement.children].find((element) => element.tagName.toLowerCase() === tag) || row.parentElement.querySelector(tag);
    }, label, tag);
    const element = handle.asElement(); assert.ok(element, `Missing control ${label}`); return element;
  };
  const setValue = async (label, value, tag = "input") => {
    const control = await field(label, tag);
    if (tag === "select") await control.select(value);
    else await control.evaluate((element, value) => { Object.getOwnPropertyDescriptor(element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value").set.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true })); }, value);
  };
  await page.setViewport({ width: 1280, height: 900 });
  await t.test("APP N/A clears the reason, saves explicitly, and reopens without inventing project details", async () => {
    await page.goto(origin + "/app-entries", { waitUntil: "networkidle0" }); await click("NEW PLAN LINE");
    await page.waitForSelector('input[name="projectTitle"]');
    assert.equal(await page.$eval('input[name="projectTitle"]', (element) => element.value), "");
    await page.select('select[name="aipEntryId"]', "1"); await page.select('select[name="appropriationId"]', "1");
    await setValue("Project title", "QA procurement plan"); await setValue("Category details", "QA equipment"); await setValue("ABC (", "1000");
    await setValue("Reason for alternative procurement mode response", "notApplicable", "select");
    assert.equal(await page.$('textarea[name="justification"]'), null); assert.match(await body(), /Test expected output/);
    await page.select('select[name="procurementMode"]', "directAcquisition");
    assert.ok(await page.$('textarea[name="justification"]')); await click("Save draft");
    assert.equal(appWrites, 0, "Alternative procurement still requires a justification");
    await page.select('select[name="procurementMode"]', "competitiveBidding"); await setValue("Reason for alternative procurement mode response", "notApplicable", "select");
    await click("Save draft"); await page.waitForFunction(() => !document.querySelector('input[name="projectTitle"]'));
    assert.equal(savedApp.justificationStatus, "notApplicable"); assert.equal(savedApp.justification, ""); assert.equal(savedApp.categoryDetails, "QA equipment");
    await page.reload({ waitUntil: "networkidle0" }); await click("Edit"); await page.waitForSelector('input[name="projectTitle"]');
    assert.equal(await page.$eval('select[aria-label="Reason for alternative procurement mode response"]', (element) => element.value), "notApplicable"); assert.equal(await page.$('textarea[name="justification"]'), null);
    await click("Cancel");
  });
  await t.test("PR unanswered, Yes, No and conditional N/A behave correctly with specifications and useful life", async () => {
    await page.goto(origin + "/purchase-requisitions", { waitUntil: "networkidle0" }); await click("NEW REQUISITION");
    await page.waitForFunction(() => document.body.innerText.includes("Useful life not answered"));
    assert.equal(await (await field("Emergency purchase", "select")).evaluate((element) => element.value), "");
    await setValue("Linked final Annual Procurement Plan", "10", "select"); await setValue("Purpose", "Test office purpose", "textarea");
    await setValue("Date required", new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10));
    await setValue("Emergency purchase", "yes", "select"); assert.match(await body(), /Emergency justification \(minimum 30 characters\)/);
    await setValue("Emergency purchase", "no", "select"); assert.doesNotMatch(await body(), /Emergency justification \(minimum 30 characters\)/);
    await setValue("Emergency justification response", "notApplicable", "select");
    await page.type('input[placeholder="Description"]', "Synthetic item"); await page.type('input[placeholder="Unit"]', "piece");
    await page.$eval('input[placeholder="Qty"]', (element) => element.select()); await page.type('input[placeholder="Qty"]', "1");
    await page.$eval('input[placeholder="Unit cost"]', (element) => element.select()); await page.type('input[placeholder="Unit cost"]', "1000");
    await setValue("Useful life exceeds one year", "yes", "select");
    await page.waitForFunction(() => document.body.innerText.toLowerCase().includes("semi-expendable"));
    await setValue("Useful life exceeds one year", "no", "select"); await setValue("Technical specifications", "Synthetic technical specification", "textarea");
    await click("Save draft"); await page.waitForFunction(() => !document.body.innerText.includes("New purchase requisition"));
    assert.equal(savedPr.isEmergency, false); assert.equal(savedPr.justificationStatus, "notApplicable"); assert.equal(savedPr.lineItems[0].hasUsefulLifeOverOneYear, false);
    await page.reload({ waitUntil: "networkidle0" }); await click("View"); await page.waitForSelector('[role="dialog"]');
    assert.match(await body(), /Synthetic technical specification/); assert.match(await body(), /Not Applicable/); assert.match(await body(), /Useful life over one year: No/); await click("Close");
    await click("Edit"); assert.equal(await (await field("Emergency purchase", "select")).evaluate((element) => element.value), "no"); assert.equal(await (await field("Emergency justification response", "select")).evaluate((element) => element.value), "notApplicable"); await click("Cancel");
  });
  await t.test("solicitation particulars persist and are locked after publication", async () => {
    role = "bacSecretariat"; await page.goto(origin + "/secretariat/rfq", { waitUntil: "networkidle0" }); await click("Schedule / criteria");
    await page.waitForFunction(() => document.body.innerText.includes("Save solicitation details"));
    await setValue("Bid opening venue", "QA meeting room"); await setValue("Procurement contact person", "Test contact"); await setValue("Procurement contact email", "contact@example.test"); await setValue("Required supplier documents", "Applicable synthetic documents", "textarea");
    await click("Save solicitation details"); await page.waitForFunction(() => document.body.innerText.includes("Solicitation details saved.")); assert.equal(informationWrites, 1); await click("Close");
    await page.reload({ waitUntil: "networkidle0" }); await click("Schedule / criteria"); await page.waitForFunction(() => [...document.querySelectorAll("input")].some((element) => element.value === "QA meeting room"));
    assert.equal(await (await field("Procurement contact email")).evaluate((element) => element.value), "contact@example.test"); await click("Close");
    rfq.status = "published"; await page.reload({ waitUntil: "networkidle0" }); await click("Schedule / criteria"); await page.waitForFunction(() => document.body.innerText.includes("Published dates are protected"));
    assert.equal(await (await field("Bid opening venue")).evaluate((element) => element.disabled), true); assert.doesNotMatch(await body(), /Save solicitation details/); await click("Close");
  });
  await t.test("Secretariat records and reopens supplier receipt without conflating receipt and acceptance", async () => {
    await click("Record supplier receipt"); await page.waitForSelector('[role="dialog"]'); await setValue("Supplier receipt date", today); await click("Record award decision");
    await page.waitForFunction(() => document.body.innerText.includes("Supplier receipt recorded.")); assert.equal(receiptWrites, 1); assert.equal(award.status, "issued");
    await page.reload({ waitUntil: "networkidle0" }); assert.match(await body(), /QA-EXISTING-NOA/); assert.match(await body(), /QA-BAC/); assert.match(await body(), new RegExp(`Supplier receipt: ${today}`)); assert.doesNotMatch(await body(), /Record supplier receipt/);
    await page.setViewport({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Tables scroll within the current page layout on mobile");
  });
  await t.test("supplier category is entered manually and persists through the existing counter submission form", async () => {
    await page.setViewport({ width: 1280, height: 900 }); await page.goto(origin + "/secretariat/vendors", { waitUntil: "networkidle0" }); await click("RECORD COUNTER SUBMISSION"); await page.waitForSelector('input[name="businessName"]');
    assert.equal(await page.$eval('input[name="businessName"]', (element) => element.value), "");
    for (const [name, value] of Object.entries({ businessName: "Synthetic supplier", supplierCategory: "QA service category", philgepsRegistrationNo: "QA-REG", philgepsExpiry: `${year + 1}-12-31`, contactPerson: "Test representative", contactEmail: "vendor@example.test", confirmEmail: "vendor@example.test" })) {
      await page.$eval(`input[name="${name}"]`, (element, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true })); }, value);
    }
    await page.click('input[name="receiptConfirmed"]'); await page.click('li input[type="checkbox"]'); await click("Record submission"); await page.waitForFunction(() => !document.querySelector('input[name="businessName"]'));
    assert.equal(savedVendor.supplierCategory, "QA service category"); await page.reload({ waitUntil: "networkidle0" }); assert.match(await body(), /QA service category/);
  });
  await t.test("post-qualification enforces every applicable check, makes failure findings conditional and reopens the result", async () => {
    role = "bacMember"; rfq.status = "evaluated"; await page.goto(origin + "/evaluation", { waitUntil: "networkidle0" }); await click("Verify supplier"); await page.waitForSelector('[role="dialog"]');
    const legal = await field("legal verification", "select"); assert.equal(await legal.evaluate((element) => element.required), true);
    assert.deepEqual(await legal.evaluate((element) => [...element.options].map((option) => option.value)), ["", "ok", "failed"]);
    await setValue("legal verification", "ok", "select"); await setValue("technical verification", "failed", "select"); await setValue("financial verification", "ok", "select");
    await page.waitForFunction(() => document.querySelector('[role="dialog"] textarea').required); await setValue("technical verification", "ok", "select"); await page.waitForFunction(() => !document.querySelector('[role="dialog"] textarea').required);
    await click("Record verification"); await page.waitForFunction(() => document.body.innerText.includes("Verification recorded.")); assert.equal(postQualification.result, "passed"); assert.equal(postQualification.remarks, "");
    await page.reload({ waitUntil: "networkidle0" }); await page.click('details summary'); assert.match(await body(), /Post-qualification: passed/); assert.match(await body(), /Failure reason: None/); assert.match(await body(), /signed-test.pdf/);
  });
  await t.test("suppliers can read venue, contacts, document requirements and specifications before becoming eligible to bid", async () => {
    role = "vendor"; rfq.status = "published"; rfq.technicalSpecifications = [{ description: "Synthetic item", specifications: "Synthetic technical specification" }];
    await page.goto(origin + "/supplier/opportunities", { waitUntil: "networkidle0" }); await click("View solicitation details"); await page.waitForSelector('[role="dialog"]');
    assert.match(await body(), /QA meeting room/); assert.match(await body(), /contact@example.test/); assert.match(await body(), /Applicable synthetic documents/); assert.match(await body(), /Synthetic technical specification/);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll("button")].filter((button) => button.textContent.trim() === "Submit bid").length), 0, "Reading requirements must not grant bidding eligibility");
    await page.setViewport({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await click("Close");
  });
  assert.deepEqual(errors, []);
});
