import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import express from "express";

const target = process.env.ACADEMIC_WORKFLOW_DB;
const browserCheck = process.env.RUN_ACADEMIC_BROWSER === "1";

test("the completed procurement is publicly visible, with municipal totals and protected files", { skip: !target, timeout: 120000 }, async (t) => {
  const m = await import("../models/index.js");
  t.after(() => m.sequelize.close());
  assert.equal(m.sequelize.config.database, target, "Verify the requested review database.");
  const c = await import("../scripts/academicWorkflowData.mjs");
  const { documents } = await import("../scripts/academicWorkflowDocuments.mjs");
  const { ACADEMIC_PROJECT_KEY, ACADEMIC_IMPORT_ACTION, CLIENT_STATUS_CONFIRMATION_ACTION } = await import("../services/academicCase.js");
  const { checksumOf } = await import("../services/documentStore.js");
  const { verifyChain } = await import("../services/auditLog.js");
  const { fingerprintOf } = await import("../services/integrityMonitor.js");
  const { credentialStamp } = await import("../services/authPolicy.js");
  const { computeDeductions } = await import("../services/deductions.js");
  const { attemptsForProject } = await import("../services/procurementGovernance.js");
  const { getPublicProject } = await import("../services/projectLifecycle.js");
  const { default: publicRoutes } = await import("../routes/publicRoutes.js");
  const appEntry = await m.AppEntry.findOne({ where: { recoveryKey: ACADEMIC_PROJECT_KEY } });
  assert.ok(appEntry, "The sample project is present in the review database.");
  const projectId = appEntry.id;
  const rfq = await m.Rfq.findOne({ where: { appEntryId: projectId } });
  const notice = await m.Announcement.findOne({ where: { rfqId: rfq.id } });
  const award = await m.Award.findOne({ where: { rfqId: rfq.id } });
  const contract = await m.Contract.findOne({ where: { awardId: award.id } });
  const delivery = await m.Delivery.findOne({ where: { contractId: contract.id } });
  const invoice = await m.Invoice.findOne({ where: { deliveryId: delivery.id } });
  const payment = await m.Payment.findOne({ where: { invoiceId: invoice.id } });
  const vendor = await m.Vendor.findByPk(award.vendorId);
  const receipt = await m.AuditLog.findOne({ where: { entityRef: "appEntry", entityId: projectId, actionType: ACADEMIC_IMPORT_ACTION } });

  await t.test("planning, bids, delivery, payment, and closeout reconcile", async () => {
    const pr = await m.PrHeader.findOne({ where: { appEntryId: projectId } });
    const items = await m.PrLineItem.findAll({ where: { prHeaderId: pr.id } });
    const obligation = await m.Obligation.findOne({ where: { prHeaderId: pr.id } });
    const allocation = await m.ProjectAllocation.findOne({ where: { appEntryId: projectId } });
    const closeout = await m.BudgetControlRequest.findOne({ where: { sourceProjectId: projectId, kind: "closeout" } });
    assert.equal(appEntry.status, "locked");
    assert.equal(appEntry.planStage, "finalApp");
    assert.equal(appEntry.recoveryImport, null);
    assert.equal(pr.status, "approved");
    assert.equal(rfq.prHeaderId, pr.id);
    assert.equal(rfq.status, "awarded");
    const attempts = await attemptsForProject(rfq);
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].status, "awarded");
    assert.equal(notice.referenceNo, c.solicitation);
    assert.equal(notice.status, "archived");
    assert.equal(items.reduce((sum, item) => sum + Number(item.lineTotal), 0), c.abc);
    assert.equal(obligation.appropriationId, appEntry.appropriationId);
    assert.equal(Number(obligation.amount), c.awardAmount);
    assert.equal(allocation.appropriationId, appEntry.appropriationId);
    assert.equal(allocation.status, "closed");
    assert.equal(Number(allocation.amount), c.abc);

    const bids = await m.Bid.findAll({ where: { rfqId: rfq.id }, order: [["totalBidPrice", "ASC"]], include: [{ model: m.Vendor, as: "vendor" }] });
    assert.deepEqual(bids.map((bid) => Number(bid.totalBidPrice)), c.bidders.map((bid) => bid.amount));
    assert.deepEqual(bids.map((bid) => bid.vendor.contactEmail), c.bidders.map((bid) => bid.email));
    assert.ok(bids.every((bid) => bid.vendor.userId === null && bid.submittedAt < rfq.closingDate && !bid.financialSealed));
    assert.deepEqual(bids.map((bid) => bid.status), ["awarded", "lost", "lost"]);
    assert.equal(bids[0].id, award.bidId);
    assert.equal(bids[0].vendorId, award.vendorId);
    assert.equal(award.status, "accepted");
    assert.equal(await m.Evaluation.count({ where: { bidId: bids.map((bid) => bid.id) } }), 6);
    assert.equal((await m.PostQualification.findOne({ where: { bidId: award.bidId } })).result, "passed");
    assert.equal((await m.BacResolution.findOne({ where: { entityRef: "award", entityId: award.id } })).resolutionNo, c.bacResolution);
    assert.equal(contract.status, "completed");
    assert.equal(Number(contract.amountPaid), c.awardAmount);
    assert.equal(delivery.status, "accepted");
    assert.equal(Number(delivery.acceptedValue), c.awardAmount);
    assert.equal(invoice.status, "paid");
    assert.equal(payment.status, "released");
    assert.equal(closeout.status, "approved");
    assert.equal(Number(closeout.amount), c.savings);
    assert.equal(award.supplierReceivedAt, "2026-10-23");
    assert.ok(c.dates.awardReceipt < contract.signedByVendorAt && contract.signedByVendorAt < contract.noticeToProceedAt);
    assert.ok(contract.noticeToProceedAt < delivery.deliveredAt && delivery.deliveredAt < delivery.inspectedAt);
    assert.ok(delivery.inspectedAt < invoice.submittedAt && invoice.submittedAt < payment.preparedAt && payment.preparedAt < payment.releasedAt && payment.releasedAt < closeout.approvedAt);
    const deductions = computeDeductions({ grossAmount: invoice.amount, vendor, contract, asOf: payment.preparedAt });
    assert.equal(Number(payment.amount), deductions.netAmount);
    assert.equal(Number(payment.ewtAmount), deductions.ewtAmount);
    assert.equal(Number(payment.vatWithheldAmount), deductions.vatWithheldAmount);
    assert.equal(Number(payment.liquidatedDamages), 0);
    const detail = await getPublicProject(projectId);
    assert.equal(detail.category, "completed");
    assert.equal(detail.progressPercent, 100);
    assert.equal(detail.financials.grossExpenses, c.awardAmount);
    assert.equal(detail.financials.supplierPaid, deductions.netAmount);
    assert.equal(detail.financials.recognizedSavings, c.savings);
    assert.equal(detail.financials.unpaid, 0);
    for (const [entityRef, row] of [["appEntry", appEntry], ["purchaseRequisition", pr], ["appropriation", await m.Appropriation.findByPk(appEntry.appropriationId)], ["obligation", obligation], ["bid", bids[0]], ["vendor", vendor], ["award", award], ["contract", contract], ["payment", payment]]) {
      const fingerprint = await m.RecordFingerprint.findOne({ where: { entityRef, entityId: row.id } });
      assert.equal(fingerprint?.fingerprint, fingerprintOf(entityRef, row), entityRef + " fingerprint agrees");
    }
  });

  await t.test("case history, document storage, and the new audit segment are accurate", async () => {
    assert.ok(receipt);
    assert.equal(receipt.actorId, null);
    assert.equal(receipt.actorRole, "system");
    assert.equal(receipt.afterState.origin, "syntheticAcademicCase");
    assert.equal(receipt.afterState.recordedStatus, "completed");
    assert.equal(receipt.afterState.historicalUserActionsCreated, false);
    assert.deepEqual(receipt.afterState.businessMilestones, c.milestones);
    assert.ok(receipt.recordedAt > c.dates.closed);
    assert.ok(appEntry.createdAt > c.dates.closed);
    const confirmations = await m.AuditLog.findAll({ where: { actionType: CLIENT_STATUS_CONFIRMATION_ACTION }, order: [["entityId", "ASC"]] });
    assert.deepEqual(confirmations.map((row) => row.entityId), [38, 45, 46, 47]);
    const verification = await verifyChain();
    assert.deepEqual(verification.problems, []);
    assert.equal(verification.archivedHistory.originalHashMismatches, 670);
    const files = await m.Document.findAll({ where: { filename: documents.map((item) => item.filename) } });
    assert.equal(files.length, documents.length);
    for (const file of files) {
      assert.equal(file.content.subarray(0, 5).toString(), "%PDF-");
      assert.equal(file.checksum, checksumOf(file.content));
      assert.equal(file.sizeBytes, file.content.length);
      assert.ok(file.uploadedAt > c.dates.closed, "The document upload timestamp is actual.");
    }
  });

  const users = await m.User.findAll({ where: { status: "active" }, include: [m.Role] });
  const staff = users.find((user) => user.Role?.key === "systemAdministrator");
  const observer = users.find((user) => user.Role?.key === "observer");
  assert.ok(staff && observer, "Existing staff and observer roles are available for access tests.");
  const app = express();
  app.use((req, res, next) => {
    // This fixture supplies local sessions only to this temporary server.
    const cookie = req.headers.cookie;
    const user = cookie === "case-test=staff" ? staff : cookie === "case-test=observer" ? observer : null;
    req.session = user ? { userId: user.id, authAt: Date.now(), loginSessionExpiresAt: Date.now() + 60000, credentialHash: credentialStamp(user) } : {};
    res.set("Cache-Control", "no-store, private");
    next();
  });
  app.use("/api/public", publicRoutes);
  if (browserCheck) {
    const dist = fileURLToPath(new URL("../../municipal-frontend/dist/", import.meta.url));
    app.use(express.static(dist));
    app.get("*", (_req, res) => res.sendFile(dist + "index.html"));
  }
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, "listening");
  const origin = "http://127.0.0.1:" + server.address().port;
  const request = (path, role) => fetch(origin + "/api/public" + path, { headers: role ? { cookie: "case-test=" + role } : {} });
  const get = async (path, role) => {
    const response = await request(path, role);
    assert.equal(response.status, 200, path);
    return response.json();
  };

  await t.test("visitors see the completed project first and supporting files keep their existing access controls", async () => {
    for (const role of [undefined, "observer"]) {
      const rows = await get("/projects", role);
      assert.deepEqual(rows.map((row) => row.id).sort((a, b) => a - b), [38, 45, 46, 47, projectId]);
      assert.deepEqual(rows.map((row) => row.category), ["completed", "ongoing", "ongoing", "ongoing", "ongoing"]);
      assert.equal(rows[0].recordSource, "academic");
      assert.deepEqual((await get("/projects?category=completed", role)).map((row) => row.id), [projectId]);
      assert.deepEqual(await get("/projects/" + projectId + "/documents", role), []);
      assert.equal((await request("/projects/" + projectId + "/documents/1/download", role)).status, 404);
      const summary = await get("/projects/overview", role);
      assert.equal(summary.completed, 1);
      assert.equal(summary.ongoing, 4);
      assert.equal(summary.academicProjects, 1);
      assert.equal(summary.totalBudget, rows.slice(1).reduce((sum, row) => sum + row.financials.plannedAmount, 0));
      assert.equal(summary.totalContracted, 0);
      assert.equal(summary.totalGrossExpenses, 0);
      assert.ok(!(await get("/transparency/app?fiscalYear=2026", role)).some((row) => row.id === projectId));
      assert.ok(!(await get("/transparency/procurements", role)).some((row) => row.id === rfq.id));
      assert.ok(!(await get("/transparency/awards", role)).some((row) => row.id === award.id));
      assert.ok(!(await get("/announcements/archive", role)).some((row) => row.id === notice.id));
      assert.equal((await request("/announcements/" + notice.id + "/attachments", role)).status, 404);
    }
    const rows = await get("/projects", "staff");
    assert.deepEqual(rows.map((row) => row.category), ["completed", "ongoing", "ongoing", "ongoing", "ongoing"]);
    const detail = await get("/projects/" + projectId);
    assert.equal(detail.projectTitle, c.title);
    assert.equal(detail.category, "completed");
    assert.equal(detail.recordSource, "academic");
    assert.equal(detail.entityRefs, undefined);
    const timeline = await get("/projects/" + projectId + "/timeline");
    assert.deepEqual(timeline.events.map((event) => ({ stage: event.stage, action: event.action, occurredAt: event.occurredAt })), c.milestones.map(({ stage, action, occurredAt }) => ({ stage, action, occurredAt })));
    assert.ok(timeline.events.every((event) => event.source === "record" && !event.actorName));
    const attachments = await get("/projects/" + projectId + "/documents", "staff");
    assert.equal(attachments.length, documents.filter((document) => !document.entityRef.startsWith("bid")).length);
    for (const file of attachments) {
      const path = "/projects/" + projectId + "/documents/" + file.id + "/download";
      assert.equal((await request(path)).status, 404);
      const response = await request(path, "staff");
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control"), /no-store/);
      assert.equal(checksumOf(Buffer.from(await response.arrayBuffer())), file.checksum);
    }
  });

  await t.test("signed-out desktop and phone both show the completed case and all eight workflow stages", { skip: !browserCheck }, async () => {
    const { default: puppeteer } = await import("puppeteer-core");
    const { resolveBrowserExecutable } = await import("../services/pdfRenderer.js");
    const browser = await puppeteer.launch({ executablePath: resolveBrowserExecutable(), headless: true, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewport({ width: 1366, height: 900 });
      await page.goto(origin + "/?view=projects", { waitUntil: "networkidle0" });
      const projects = '#records a[href^="/projects/"]';
      await page.waitForFunction((selector) => document.querySelectorAll(selector).length === 5, {}, projects);
      const firstProject = await page.$eval(projects, (link) => link.getAttribute("href"));
      assert.equal(firstProject, "/projects/" + projectId);
      const sourceNote = /\b(academic example|fictional|mock|seeded|simulated|demonstration)\b/i;
      const card = await page.$eval(projects, (link) => link.innerText);
      assert.match(card, /Completed/);
      assert.doesNotMatch(card, sourceNote);
      const clickTab = async (label) => page.evaluate((name) => {
        const control = [...document.querySelectorAll('nav[aria-label="Project sections"] button')]
          .find((button) => button.textContent.trim().startsWith(name));
        if (!control) throw new Error("Missing project tab " + name);
        control.click();
      }, label);
      for (const width of [1366, 390]) {
        await page.setViewport({ width, height: 900 });
        await page.goto(origin + "/projects/" + projectId, { waitUntil: "networkidle0" });
        await page.waitForFunction((title) => document.body.innerText.includes(title), {}, c.title);
        const text = await page.evaluate(() => document.body.innerText);
        assert.match(text, /Completed/);
        assert.doesNotMatch(text, sourceNote);
        await clickTab("Transparency Timeline");
        await page.waitForFunction(() => document.body.innerText.includes("Delivery & Completion"));
        const stages = await page.evaluate(() => document.body.innerText);
        for (const stage of ["Planning", "Requisition", "Solicitation", "Bid Opening", "Evaluation", "Award", "Contract", "Delivery & Completion"]) assert.ok(stages.includes(stage), stage);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      }
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
});
