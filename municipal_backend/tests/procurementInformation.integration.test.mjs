import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mysql from "mysql2/promise";

// All fixtures are synthetic. No client form values or municipal records are
// imported. The uniquely named schema is the only schema this test mutates.
test("procurement information persists through planning, requisition, bidding and award", { skip: process.env.RUN_PROCUREMENT_DB_TESTS !== "1", timeout: 180000 }, async (t) => {
  const scratch = `impbbms_information_test_${crypto.randomBytes(8).toString("hex")}`;
  const port = Number(process.env.PROCUREMENT_TEST_DB_PORT ?? 33317);
  assert.match(scratch, /^impbbms_information_test_[a-f0-9]{16}$/);
  Object.assign(process.env, { DB_HOST: "127.0.0.1", DB_PORT: String(port), DB_NAME: scratch, DB_USER: "root", DB_PASSWORD: "", NODE_ENV: "test" });
  const admin = await mysql.createConnection({ host: "127.0.0.1", port, user: "root", password: "" });
  await admin.query(`CREATE DATABASE \`${scratch}\``);
  const m = await import("../models/index.js");
  t.after(async () => { await m.sequelize.close(); assert.match(scratch, /^impbbms_information_test_[a-f0-9]{16}$/); await admin.query(`DROP DATABASE \`${scratch}\``); await admin.end(); });
  await m.sequelize.sync();
  const appApi = await import("../controllers/appEntryController.js");
  const prApi = await import("../controllers/prController.js");
  const bidding = await import("../controllers/biddingController.js");
  const evaluation = await import("../controllers/evaluationController.js");
  const twgApi = await import("../controllers/twgController.js");
  const schedules = await import("../controllers/procurementScheduleController.js");
  const vendorApi = await import("../controllers/vendorController.js");
  const documentApi = await import("../controllers/documentController.js");
  const { OtpChallenge } = await import("../models/otpChallengeModel.js");
  const { COMPLIANCE_REQUIREMENTS } = await import("../services/evaluationPolicy.js");
  const { migrateProcurementInformation } = await import("../services/migrateProcurementInformation.js");
  const { verifyChain } = await import("../services/auditLog.js");
  const { resolvePlaceholders } = await import("../services/placeholderResolver.js");
  const office = await m.Department.create({ name: "Test service office", code: "QA" });
  const permissions = ["app.view", "app.create", "app.submit", "app.consolidate", "app.certify", "app.approve", "pr.create", "pr.view", "pr.endorse", "pr.certifyCash", "pr.approve", "pr.certify", "pr.obligate", "pr.determineMode", "bidding.view", "bidding.publish", "bidding.evaluate", "bidding.technicalInput", "bidding.chairEvaluation", "bidding.award", "bidding.submitBid"];
  const user = async (key, suffix = "") => {
    const [role] = await m.Role.findOrCreate({ where: { key }, defaults: { name: key } });
    const actor = await m.User.create({ name: `Test ${key}${suffix}`, email: `${key}${suffix}@example.test`, password: "ExampleTestPassword123!", roleId: role.id, departmentId: office.id, status: "active" });
    actor.Role = role; return actor;
  };
  const requester = await user("departmentRequester"), secretariat = await user("bacSecretariat"), chair = await user("bacChairperson"), vice = await user("bacViceChairperson"), member = await user("bacMember"), twg = await user("twgMember"), head = await user("headOfOffice"), budget = await user("budgetOfficer"), treasurer = await user("municipalTreasurer"), accountant = await user("municipalAccountant"), hope = await user("hope");
  await user("bacMember", "2"); await user("bacMember", "3");
  const attendance = { attendingMemberIds: [chair.id, vice.id, member.id], presidingMemberId: chair.id };
  const call = async (handler, actor, params = {}, body = {}, extra = {}) => {
    let output, status = 200;
    await handler({ currentUser: actor, permissions: new Set(permissions), params, body, query: {}, ip: "127.0.0.1", ...extra }, { status(code) { status = code; return this; }, json(value) { output = value; return this; } });
    if (status >= 400) throw Object.assign(new Error(output?.message ?? "Request rejected"), { status });
    return output;
  };
  const year = new Date(Date.now() + 8 * 3600000).getUTCFullYear();
  const requiredDate = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
  const program = await m.InvestmentProgram.create({ fiscalYear: year, title: "Test adopted program", status: "adopted" });
  const aip = await m.AipEntry.create({ title: "Test programmed project", investmentProgramId: program.id, implementingUnitId: office.id, expectedOutput: "Configured test output", estimatedCost: 20000 });
  const funding = await m.Appropriation.create({ title: "Test enacted appropriation", ordinanceNo: "QA-ORD-001", fiscalYear: year, departmentId: office.id, amount: 20000, status: "enacted", expenseClass: "mooe", fund: "generalFund" });
  const mode = await m.ProcurementMode.create({ key: "competitiveBidding", name: "Public bidding", requiresJustification: false, minimumOffers: 1, requiresBidSecurity: true });
  let app, pr, rfq, bid, award, supplier;

  await t.test("nullable migration preserves existing No answers and is repeatable", async () => {
    const legacy = await m.PrHeader.create({ prNumber: "PR-QA-LEGACY", dateRequired: requiredDate, isEmergency: false });
    const item = await m.PrLineItem.create({ prHeaderId: legacy.id, description: "Legacy test item", quantity: 1, unitCost: 10, lineTotal: 10, hasUsefulLifeOverOneYear: false });
    const qi = m.sequelize.getQueryInterface();
    await qi.removeColumn(m.AppEntry.getTableName(), "categoryDetails");
    await qi.changeColumn(m.PrHeader.getTableName(), "isEmergency", { ...m.PrHeader.getAttributes().isEmergency, allowNull: false });
    await qi.changeColumn(m.PrLineItem.getTableName(), "hasUsefulLifeOverOneYear", { ...m.PrLineItem.getAttributes().hasUsefulLifeOverOneYear, allowNull: false });
    const result = await migrateProcurementInformation();
    assert.ok(result.added.includes("appentries.categoryDetails")); assert.equal(result.changed.length, 2);
    assert.equal((await legacy.reload()).isEmergency, false); assert.equal((await item.reload()).hasUsefulLifeOverOneYear, false);
    assert.deepEqual(await migrateProcurementInformation(), { added: [], changed: [] });
  });
  await t.test("public-bidding Not Applicable saves without sample defaults and alternative modes require real justification", async () => {
    const payload = { projectTitle: "Test procurement project", category: "goods", categoryDetails: "Test equipment category", abc: 1000, fiscalYear: year, targetStartQuarter: "Q1", targetCompletionQuarter: "Q4", implementingUnitId: office.id, aipEntryId: aip.id, appropriationId: funding.id, procurementMode: mode.key, justificationStatus: "notApplicable", fundSource: "Test earmarked funding", papCode: "QA-PAP", accountCode: "QA-ACCOUNT", mfoId: "QA-MFO" };
    await assert.rejects(call(appApi.createAppEntry, requester, {}, { ...payload, procurementMode: "directAcquisition" }), /cannot be marked/);
    app = await call(appApi.createAppEntry, requester, {}, payload);
    assert.equal(app.justificationStatus, "notApplicable"); assert.equal(app.expectedOutput, "Configured test output");
    for (const [action, actor] of [["submit", requester], ["consolidate", chair], ["certify", budget], ["approve", hope]]) await call(appApi.transitionAppEntry, actor, { id: app.id }, { action, ...attendance });
    assert.equal((await m.AppEntry.findByPk(app.id)).status, "locked");
    await m.ProjectAllocation.create({ appEntryId: app.id, appropriationId: funding.id, fiscalYear: year, amount: 1000, status: "active" });
  });
  await t.test("blank answers remain unanswered drafts; explicit No and Not Applicable persist through approvals", async () => {
    pr = await call(prApi.createPr, requester, {}, { appEntryId: app.id, purpose: "Test office operations", dateRequired: requiredDate, lineItems: [{ description: "Test equipment", unit: "piece", quantity: 1, unitCost: 1000, technicalSpecifications: "Test specification with <text> & symbols" }] });
    assert.equal(pr.isEmergency, null); assert.equal(pr.lineItems[0].hasUsefulLifeOverOneYear, null);
    await assert.rejects(call(prApi.transitionPr, requester, { id: pr.id }, { action: "submit" }), /Emergency purchase/);
    await assert.rejects(call(prApi.updatePr, requester, { id: pr.id }, { isEmergency: true, justificationStatus: "notApplicable" }), /cannot be marked/);
    pr = await call(prApi.updatePr, requester, { id: pr.id }, { isEmergency: true, justificationStatus: "provided", justification: "An unexpected event requires immediate replacement of essential equipment.", lineItems: [{ ...pr.lineItems[0], hasUsefulLifeOverOneYear: "yes" }] });
    assert.equal(pr.isEmergency, true); assert.equal(pr.lineItems[0].hasUsefulLifeOverOneYear, true); assert.equal(pr.lineItems[0].assetClass, "semiExpendable");
    const line = { ...pr.lineItems[0], hasUsefulLifeOverOneYear: "no" };
    pr = await call(prApi.updatePr, requester, { id: pr.id }, { isEmergency: "false", justificationStatus: "notApplicable", justification: "", lineItems: [line] });
    assert.equal(pr.isEmergency, false); assert.equal(pr.lineItems[0].hasUsefulLifeOverOneYear, false); assert.equal(pr.justificationStatus, "notApplicable");
    for (const [action, actor] of [["submit", requester], ["endorse", head], ["certifyCash", treasurer], ["approve", hope], ["certify", budget], ["obligate", accountant], ["determineMode", chair]]) await call(prApi.transitionPr, actor, { id: pr.id }, { action, procurementModeKey: mode.key, justificationStatus: action === "determineMode" ? "notApplicable" : undefined, ...attendance });
    const reopened = (await call(prApi.listPrs, secretariat)).find((row) => row.id === pr.id);
    assert.equal(reopened.status, "approved"); assert.equal(reopened.modeJustificationStatus, "notApplicable"); assert.match(reopened.lineItems[0].technicalSpecifications, /<text>/); assert.equal(reopened.plannedFundSource, "Test earmarked funding");
    const document = await resolvePlaceholders({ documentType: "purchaseRequest", entityId: pr.id, currentUser: requester });
    assert.equal(document.context.emergency_purchase, "No"); assert.equal(document.context.emergency_justification, "Not Applicable");
    assert.match(document.context.pr_line_items_table, /&lt;text&gt; &amp; symbols/); assert.doesNotMatch(document.context.pr_line_items_table, /<text>/);
  });
  await t.test("solicitation details and optional pre-bid No survive saving, reading and publication", async () => {
    rfq = await call(bidding.createRfq, secretariat, {}, { prHeaderId: pr.id, title: "Test solicitation", category: "goods", closingDate: new Date(Date.now() + 30 * 864e5).toISOString(), openingDate: new Date(Date.now() + 30 * 864e5 + 1800000).toISOString(), prebidRequired: false, openingVenue: "Test meeting room", procurementContactPerson: "Test contact", procurementContactEmail: "contact@example.test", requiredSupplierDocuments: "Applicable test bidding documents" });
    assert.equal(rfq.prebidRequired, false); assert.equal(rfq.prebidAt, null); assert.match(rfq.technicalSpecifications[0].specifications, /<text>/);
    await assert.rejects(call(bidding.updateRfqInformation, secretariat, { id: rfq.id }, { procurementContactEmail: "N/A" }), /valid procurement contact email/);
    await call(bidding.updateRfqInformation, secretariat, { id: rfq.id }, { openingVenue: "Revised test room" });
    await call(schedules.approveSchedule, chair, { id: rfq.id }, { ...attendance });
    await call(bidding.publishRfq, secretariat, { id: rfq.id });
    await assert.rejects(call(bidding.updateRfqInformation, secretariat, { id: rfq.id }, { openingVenue: "Unapproved change" }), /locked/);
    const records = await call(bidding.listRfqs, secretariat, {}, {}, { query: { page: 1, pageSize: 1 } });
    assert.equal(records.rows[0].openingVenue, "Revised test room"); assert.equal(records.total, 1);
    const document = await resolvePlaceholders({ documentType: "invitationToBid", entityId: rfq.id, currentUser: secretariat });
    assert.equal(document.context.bid_opening_venue, "Revised test room"); assert.notEqual(document.context.bid_opening_datetime, document.context.submission_deadline_datetime);
  });
  await t.test("supplier category persists and signed bid evidence remains sealed before evaluation closes", async () => {
    const recorded = await call(vendorApi.recordCounterSubmission, secretariat, {}, { businessName: "Synthetic supplier", supplierCategory: "Test supplier category", organizationType: "corporation", contactPerson: "Test representative", contactEmail: "vendor@example.test", contactPhone: "", address: "Test address", documents: [{ docType: "philgeps", label: "Test registration document" }], receivedAt: new Date().toISOString().slice(0, 10), receiptConfirmed: true });
    supplier = await user("vendor");
    const vendor = await m.Vendor.findByPk(recorded.id);
    await vendor.update({ userId: supplier.id, registrationStatus: "verified", philgepsRegistrationNo: "QA-REG", philgepsExpiry: `${year + 1}-12-31` });
    assert.equal((await call(vendorApi.getMyVendorProfile, supplier)).supplierCategory, "Test supplier category");
    const reference = crypto.randomUUID(), ticket = crypto.randomBytes(32).toString("hex");
    await OtpChallenge.create({ reference, purpose: "bidSubmission", codeHash: "test-fixture", deliveredTo: supplier.email, userId: supplier.id, expiresAt: new Date(Date.now() + 600000), consumedAt: new Date(), ticketHash: crypto.createHash("sha256").update(ticket).digest("hex"), ticketExpiresAt: new Date(Date.now() + 600000), contextRef: "rfq", contextId: rfq.id });
    const buffer = Buffer.from("%PDF-1.4\nTest signed document\n%%EOF");
    bid = await call(bidding.submitBid, supplier, { id: rfq.id }, { totalBidPrice: 900, reference, ticket, bidSecurityForm: "securingDeclaration" }, { files: { signedBidDocument: [{ buffer, mimetype: "application/pdf", originalname: "signed-test.pdf", size: buffer.length }] } });
    assert.equal(await m.Document.count({ where: { entityRef: "bid", entityId: bid.id, docType: "signedBidDocument" } }), 1);
    const sealed = await call(bidding.listBidsForRfq, member, { id: rfq.id });
    assert.equal(sealed.blind, true); assert.equal(sealed.bids[0].vendorId, null); assert.deepEqual(sealed.bids[0].evidence, []);
    const access = await documentApi.accessFor({ currentUser: member, permissions: new Set(permissions) }, "bid", bid.id);
    assert.equal(access.read, false, "Raw signed documents stay sealed for evaluators");
  });
  await t.test("complete compliant evaluation records None and all three post-qualification checks govern award eligibility", async () => {
    // Simulate time passing in this disposable fixture. No application schedule
    // or live deadline is altered, and the actual close/open guards still run.
    await m.Rfq.update({ closingDate: new Date(Date.now() - 3600000), openingDate: new Date(Date.now() - 1800000) }, { where: { id: rfq.id } });
    await call(bidding.closeRfq, secretariat, { id: rfq.id });
    await call(bidding.openBids, secretariat, { id: rfq.id }, { witnesses: "Test witness" });
    await call(twgApi.declareTwgConflict, twg, { id: rfq.id }, { declared: true });
    await call(twgApi.saveTwg, twg, { bidId: bid.id }, { status: "submitted", requirements: [{ requirement: "Test specification", complianceStatus: "compliant", findings: "Test evidence verified" }], recommendation: "compliant", remarks: "Test specification satisfied." });
    const checks = Object.fromEntries(COMPLIANCE_REQUIREMENTS.goods.map((row) => [row.key, "compliant"]));
    await call(evaluation.submitEvaluation, member, { bidId: bid.id }, { noConflictDeclared: true, criteriaBreakdown: checks, verdict: "passed", recommendation: "Proceed to mandatory supplier verification." });
    assert.equal((await m.Evaluation.findOne({ where: { bidId: bid.id } })).failureReason, "none");
    await call(evaluation.closeEvaluation, chair, { id: rfq.id }, attendance);
    await assert.rejects(call(bidding.submitPostQualification, member, { bidId: bid.id }, { result: "passed", checklist: { legal: "ok", technical: "notApplicable", financial: "ok" } }), /mandatory checks/);
    await call(bidding.submitPostQualification, member, { bidId: bid.id }, { result: "passed", checklist: { legal: "ok", technical: "ok", financial: "ok" } });
    const reopened = await call(bidding.listBidsForRfq, chair, { id: rfq.id });
    assert.equal(reopened.bids[0].postQualifications[0].result, "passed"); assert.equal(reopened.bids[0].evidence[0].docType, "signedBidDocument");
    const headers = {}; let downloaded;
    await documentApi.downloadDocument({ currentUser: member, permissions: new Set(permissions), params: { id: reopened.bids[0].evidence[0].id } }, { setHeader(key, value) { headers[key] = value; }, send(value) { downloaded = value; } });
    assert.deepEqual(downloaded, Buffer.from("%PDF-1.4\nTest signed document\n%%EOF")); assert.equal(headers["X-Content-Type-Options"], "nosniff");
    award = await call(bidding.recommendAward, chair, { bidId: bid.id }, { ...attendance, resolutionNo: "QA-BAC-001" });
    await assert.rejects(call(bidding.recordAwardReceipt, secretariat, { id: award.id }, { supplierReceivedAt: new Date().toISOString().slice(0, 10) }), /Issue the approved/);
  });
  await t.test("existing NOA reference, issue date and supplier receipt are retained without skipping approvals", async () => {
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    await assert.rejects(call(bidding.approveAward, chair, { id: award.id }, {}), /own award/);
    await call(bidding.approveAward, hope, { id: award.id }, { noaDate: today, externalNoaNumber: "QA-EXTERNAL-NOA" });
    await assert.rejects(call(bidding.recordAwardReceipt, secretariat, { id: award.id }, { supplierReceivedAt: "2000-01-01" }), /precede/);
    m.AuditLog.addHook("beforeCreate", "receiptFailure", () => { throw new Error("Test audit failure"); });
    await assert.rejects(call(bidding.recordAwardReceipt, secretariat, { id: award.id }, { supplierReceivedAt: today }), /audit failure/);
    m.AuditLog.removeHook("beforeCreate", "receiptFailure");
    assert.equal((await m.Award.findByPk(award.id)).supplierReceivedAt, null);
    await call(bidding.recordAwardReceipt, secretariat, { id: award.id }, { supplierReceivedAt: today });
    const reopened = (await call(bidding.listAwards, secretariat)).find((row) => row.id === award.id);
    assert.equal(reopened.externalNoaNumber, "QA-EXTERNAL-NOA"); assert.equal(reopened.noaDate, today); assert.equal(reopened.supplierReceivedAt, today); assert.equal(reopened.status, "issued"); assert.equal(reopened.awardBasis, "LCRB"); assert.equal(reopened.resolutionNo, "QA-BAC-001");
    const document = await resolvePlaceholders({ documentType: "noticeOfAward", entityId: award.id, currentUser: secretariat });
    assert.equal(document.context.existing_noa_number, "QA-EXTERNAL-NOA"); assert.ok(document.context.supplier_receipt_date); assert.equal(document.context.supplier_category, "Test supplier category");
    assert.deepEqual(await migrateProcurementInformation(), { added: [], changed: [] });
    assert.equal((await verifyChain()).intact, true);
  });
});
