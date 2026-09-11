import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mysql from "mysql2/promise";

test("reports and pending queues preserve source permissions and sealed procurement records", { skip: process.env.RUN_PROCUREMENT_DB_TESTS !== "1", timeout: 180000 }, async (t) => {
  const scratch = `impbbms_reports_test_${crypto.randomBytes(8).toString("hex")}`;
  const port = Number(process.env.PROCUREMENT_TEST_DB_PORT ?? 33317);
  Object.assign(process.env, { DB_HOST: "127.0.0.1", DB_PORT: String(port), DB_NAME: scratch, DB_USER: "root", DB_PASSWORD: "", NODE_ENV: "test" });
  const admin = await mysql.createConnection({ host: "127.0.0.1", port, user: "root", password: "" });
  assert.match(scratch, /^impbbms_reports_test_[a-f0-9]{16}$/);
  await admin.query(`CREATE DATABASE \`${scratch}\``);
  const m = await import("../models/index.js");
  const { TwgAssessment } = await import("../models/twgModel.js");
  const { ProcurementAttempt } = await import("../models/procurementAttemptModel.js");
  const { getReport, listReportCatalog } = await import("../controllers/reportController.js");
  const { getPendingCounts } = await import("../controllers/pendingCountsController.js");
  t.after(async () => { await m.sequelize.close(); assert.match(scratch, /^impbbms_reports_test_[a-f0-9]{16}$/); await admin.query(`DROP DATABASE \`${scratch}\``); await admin.end(); });
  await m.sequelize.sync();
  const [deptA, deptB] = await Promise.all([m.Department.create({ name: "Health", code: "HEALTH" }), m.Department.create({ name: "Engineering", code: "ENG" })]);
  const role = await m.Role.create({ key: "reportTester", name: "Report tester" });
  const makeUser = async (name, departmentId) => {
    const user = await m.User.create({ name, email: `${name}@example.test`, password: "TestReportPassword123!", status: "active", roleId: role.id, departmentId });
    user.Role = role; return user;
  };
  const [requester, other, member, twg, supplier, otherSupplier] = await Promise.all([makeUser("requester", deptA.id), makeUser("other", deptB.id), makeUser("member"), makeUser("twg"), makeUser("supplier"), makeUser("otherSupplier")]);
  const call = async (handler, user, permissions, type, query = {}) => {
    const req = { currentUser: user, permissions: new Set(permissions), params: { type }, query, ip: "127.0.0.1", headers: {} };
    const res = { statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; }, setHeader(key, value) { this.headers[key] = value; }, json(value) { this.body = value; return this; }, send(value) { this.body = value; return this; } };
    await handler(req, res); return res;
  };
  const makePlan = (projectTitle, department, user, status) => m.AppEntry.create({ projectTitle, implementingUnitId: department.id, createdById: user.id, status, category: "goods", abc: 100000, fiscalYear: 2026, targetStartQuarter: "Q1", targetCompletionQuarter: "Q4" });
  const plan = await makePlan("Public clinic supplies", deptA, requester, "draft");
  await makePlan("Restricted engineering draft", deptB, other, "returned");
  await makePlan("Published clinic procurement", deptA, requester, "approved");
  const mode = await m.ProcurementMode.create({ key: "competitiveBidding", name: "Competitive Bidding" });
  const makeRfq = (referenceNo, status) => m.Rfq.create({ referenceNo, title: referenceNo, category: "consulting", abc: 100000, status, closingDate: "2026-09-15T02:00:00Z", openingDate: "2026-09-15T05:00:00Z", appEntryId: plan.id, procurementModeId: mode.id, twgRequired: true });
  const opened = await makeRfq("OPENED-1", "opened");
  const evaluated = await makeRfq("EVALUATED-2", "evaluated");
  const failed = await makeRfq("FAILED-3", "failed");
  await ProcurementAttempt.create({ projectKey: `app:${plan.id}`, rfqId: failed.id, attemptNumber: 2, status: "failed", failureReason: "All bidders non-responsive", nextAction: "Negotiated review", responsibleUserId: member.id, startedAt: new Date(), completedAt: new Date() });
  const vendor = await m.Vendor.create({ businessName: "CONFIDENTIAL Supplier Identity", userId: supplier.id, registrationStatus: "verified" });
  const vendor2 = await m.Vendor.create({ businessName: "Other company", userId: otherSupplier.id, registrationStatus: "verified" });
  const bid = await m.Bid.create({ rfqId: opened.id, vendorId: vendor.id, blindLabel: "Bidder A", totalBidPrice: 54321, status: "opened", technicalSubmitted: true, financialSealed: true, submittedAt: new Date() });
  const visibleBid = await m.Bid.create({ rfqId: evaluated.id, vendorId: vendor2.id, blindLabel: "Bidder B", totalBidPrice: 20000, status: "financialOpened", technicalSubmitted: true, financialSealed: false, submittedAt: new Date() });
  await m.Evaluation.create({ bidId: bid.id, evaluatorId: member.id, criteriaBreakdown: { quality: 80 }, score: 80, submittedAt: new Date(), remarks: "CONFIDENTIAL Supplier Identity" });
  await TwgAssessment.create({ bidId: bid.id, memberId: twg.id, status: "draft", requirements: [{ requirement: "CONFIDENTIAL Supplier Identity", complianceStatus: "compliant" }], remarks: "CONFIDENTIAL Supplier Identity", noConflictDeclared: true, declaredAt: new Date() });
  await m.BacResolution.create({ resolutionNo: "2026-001", type: "failureOfBidding", title: "Resolution", entityRef: "rfq", entityId: opened.id, resolvedAt: new Date(), members: [{ userId: member.id, name: member.name, position: "Chairperson", present: true }], quorumMet: true, recitals: "CONFIDENTIAL Supplier Identity" });
  for (const [index, company, offer] of [[1, vendor, bid], [2, vendor2, visibleBid]]) {
    const award = await m.Award.create({ rfqId: evaluated.id, bidId: offer.id, vendorId: company.id, noaNumber: `NOA-${index}`, noaDate: "2026-09-10", amount: 10000, status: "issued" });
    await m.Contract.create({ contractNo: `CONTRACT-${index}`, awardId: award.id, vendorId: company.id, amount: 10000, status: "active" });
  }

  await t.test("report catalog and direct access require source grants", async () => {
    const catalog = await call(listReportCatalog, supplier, ["delivery.submitInvoice"]);
    assert.deepEqual(catalog.body.map((entry) => entry.key), ["awarded-contracts"]);
    assert.equal((await call(getReport, supplier, ["delivery.submitInvoice"], "bidder-participation")).statusCode, 403);
    assert.equal((await call(getReport, member, ["bidding.view"], "audit-trail")).statusCode, 403);
  });
  await t.test("department restrictions apply to search, counts, CSV and filter options", async () => {
    const permissions = ["app.view", "app.create", "app.submit"];
    const result = await call(getReport, requester, permissions, "procurement-plans");
    assert.equal(result.body.total, 2);
    assert.deepEqual(result.body.filters.department, ["Health"]);
    assert.equal((await call(getReport, requester, permissions, "procurement-plans", { search: "Restricted" })).body.total, 0);
    const csv = await call(getReport, requester, permissions, "procurement-plans", { format: "csv" });
    assert.doesNotMatch(csv.body, /Restricted engineering/);
    const counts = await call(getPendingCounts, requester, permissions);
    assert.equal(counts.body.counts["/app-entries"], 1);
    assert.deepEqual((await call(getPendingCounts, requester, ["app.view"])).body.counts, {});
    requester.departmentId = null;
    assert.equal((await call(getReport, requester, permissions, "procurement-plans")).body.total, 0);
    requester.departmentId = deptA.id;
  });
  await t.test("published plans and supplier contracts cannot reveal other records", async () => {
    const plans = await call(getReport, supplier, ["app.viewPublished"], "procurement-plans", { status: "draft" });
    assert.equal(plans.body.total, 0);
    const contracts = await call(getReport, supplier, ["delivery.submitInvoice"], "awarded-contracts");
    assert.equal(contracts.body.total, 1); assert.equal(contracts.body.rows[0].contract, "CONTRACT-1");
    assert.deepEqual(contracts.body.filters.bidder, [vendor.businessName]);
  });
  await t.test("blind identity and sealed prices cannot leak through reports, search, options, CSV, or print", async () => {
    for (const type of ["bidder-participation", "bid-evaluation", "bac-actions"]) {
      for (const format of ["json", "csv", "print"]) {
        const result = await call(getReport, member, ["bidding.view"], type, { format });
        assert.doesNotMatch(JSON.stringify(result.body), /CONFIDENTIAL Supplier Identity|54321/);
      }
      assert.equal((await call(getReport, member, ["bidding.view"], type, { search: "CONFIDENTIAL" })).body.total, 0);
    }
    const rows = (await call(getReport, member, ["bidding.view"], "bidder-participation")).body.rows;
    assert.equal(rows.find((row) => row.reference === opened.referenceNo).amount, null);
    assert.equal(rows.find((row) => row.reference === evaluated.referenceNo).amount, 20000);
  });
  await t.test("TWG draft visibility and pending badges change after submission", async () => {
    const before = await call(getPendingCounts, twg, ["bidding.view", "bidding.technicalInput"]);
    assert.equal(before.body.queues.technical, 1);
    assert.equal((await call(getReport, member, ["bidding.view"], "twg-evaluation")).body.total, 0);
    const own = await call(getReport, twg, ["bidding.technicalInput"], "twg-evaluation");
    assert.equal(own.body.total, 1); assert.doesNotMatch(JSON.stringify(own.body), /CONFIDENTIAL Supplier Identity/);
    await TwgAssessment.update({ status: "submitted", submittedAt: new Date(), recommendation: "compliant" }, { where: { bidId: bid.id, memberId: twg.id } });
    assert.equal((await call(getPendingCounts, twg, ["bidding.view", "bidding.technicalInput"])).body.queues.technical, 0);
    assert.equal((await call(getReport, member, ["bidding.view"], "twg-evaluation")).body.total, 1);
    await plan.update({ status: "pendingConsolidation" });
    assert.equal((await call(getPendingCounts, requester, ["app.view", "app.create", "app.submit"])).body.counts["/app-entries"], 0);
    assert.equal((await call(getPendingCounts, member, ["app.view", "app.consolidate"])).body.counts["/app-entries"], 1);
  });
  await t.test("all report sources execute with compatible associations and audit exports need separate permission", async () => {
    const permissions = ["app.view", "bidding.view", "contract.view", "audit.viewAll"];
    const catalog = await call(listReportCatalog, member, permissions);
    assert.equal(catalog.body.length, 14);
    for (const report of catalog.body) {
      const result = await call(getReport, member, permissions, report.key, { pageSize: 1, sort: "date", direction: "asc" });
      assert.equal(result.statusCode, 200, report.key); assert.ok(result.body.rows.length <= 1, report.key);
    }
    for (const format of ["csv", "print"]) assert.equal((await call(getReport, member, permissions, "audit-trail", { format })).statusCode, 403);
    const audit = await call(getReport, member, [...permissions, "audit.export"], "audit-trail", { format: "csv" });
    assert.equal(audit.statusCode, 200); assert.match(audit.body, /report.exported/);
  });
});
