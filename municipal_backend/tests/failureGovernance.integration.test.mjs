import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mysql from "mysql2/promise";

test("failure governance preserves attempts and requires personal BAC approvals", { skip: process.env.RUN_PROCUREMENT_DB_TESTS !== "1", timeout: 180000 }, async (t) => {
  const scratch = `impbbms_failure_test_${crypto.randomBytes(8).toString("hex")}`;
  const port = Number(process.env.PROCUREMENT_TEST_DB_PORT ?? 33317);
  Object.assign(process.env, { DB_HOST: "127.0.0.1", DB_PORT: String(port), DB_NAME: scratch, DB_USER: "root", DB_PASSWORD: "", NODE_ENV: "test" });
  const admin = await mysql.createConnection({ host: "127.0.0.1", port, user: "root", password: "" });
  assert.match(scratch, /^impbbms_failure_test_[a-f0-9]{16}$/);
  await admin.query(`CREATE DATABASE \`${scratch}\``);
  let db;
  t.after(async () => { await db?.close(); assert.match(scratch, /^impbbms_failure_test_[a-f0-9]{16}$/); await admin.query(`DROP DATABASE \`${scratch}\``); await admin.end(); });
  const m = await import("../models/index.js"); db = m.sequelize;
  await db.sync();
  const api = await import("../controllers/procurementGovernanceController.js");
  const bidding = await import("../controllers/biddingController.js");
  const { migrateFailureGovernance } = await import("../services/migrateFailureGovernance.js");
  const { verifyChain } = await import("../services/auditLog.js");
  const { DEFAULT_PROCUREMENT_POLICY } = await import("../services/bacCommittee.js");
  const users = [];
  for (const [index, roleKey] of ["bacChairperson", "bacViceChairperson", "bacMember", "bacMember", "bacMember", "bacSecretariat", "twgMember"].entries()) {
    const [role] = await m.Role.findOrCreate({ where: { key: roleKey }, defaults: { key: roleKey, name: roleKey } });
    const user = await m.User.create({ name: `Official ${index}`, email: `official${index}@example.test`, password: "ExamplePassword123!", roleId: role.id, status: "active" });
    user.Role = role; users.push(user);
  }
  const [chair, vice, member, , , secretariat, twg] = users;
  const attendance = { attendingMemberIds: [chair.id, vice.id, member.id], presidingMemberId: chair.id };
  const mode = await m.ProcurementMode.create({ key: "competitiveBidding", name: "Competitive Bidding", minimumOffers: 2 });
  await m.ProcurementMode.create({ key: "negotiatedProcurement", name: "Negotiated Procurement", minimumOffers: 1 });
  const call = async (handler, user, rfq, body = {}, params = {}) => {
    let result;
    const req = { currentUser: user, params: { id: rfq.id, ...params }, body, permissions: new Set(["bidding.view", "bidding.evaluate", "bidding.publish", "bidding.chairEvaluation"]), query: {}, ip: "127.0.0.1" };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { result = value; return this; } };
    await handler(req, res); return { body: result, statusCode: res.statusCode };
  };
  let serial = 0;
  const makeRfq = async (status = "closed") => {
    const number = ++serial;
    const pr = await m.PrHeader.create({ prNumber: `PR-FAILURE-${number}`, status: "approved", totalAmount: 1000, dateRequired: "2028-01-01", procurementModeId: mode.id });
    return m.Rfq.create({ referenceNo: `ITB-FAILURE-${number}`, title: `Failure workflow ${number}`, abc: 1000, category: "goods", status, closingDate: "2026-01-01T02:00:00Z", openingDate: "2026-01-01T03:00:00Z", prHeaderId: pr.id, procurementModeId: mode.id });
  };
  const document = async (rfq, docType = "procurementEvidence") => {
    const content = Buffer.from(`%PDF-1.4\nOfficial evidence ${rfq.id} ${docType}`);
    return m.Document.create({ filename: `${docType}.pdf`, mimeType: "application/pdf", sizeBytes: content.length, content, checksum: crypto.createHash("sha256").update(content).digest("hex"), entityRef: "rfq", entityId: rfq.id, docType, uploadedAt: new Date() });
  };
  const prepare = async (rfq, category = "noBids") => {
    const file = await document(rfq);
    return call(api.prepareFailureRecord, secretariat, rfq, { reason: "No responsive bids received", category, explanation: "The applicable procurement records establish the failure ground.", supportingDocuments: [file.id] });
  };
  let resolution = 0;
  const review = (rfq, handler = api.reviewFailureRecord) => call(handler, chair, rfq, { ...attendance, resolutionNo: `2026-F-${++resolution}`, resolutionDate: "2026-01-02", remarks: "BAC reviewed official records and confirmed the failure ground." });
  const vote = (rfq, user, handler = api.voteFailureRecord, decision = "approved") => call(handler, user, rfq, { decision, remarks: "I reviewed the official records and record my own decision." });
  const approve = async (rfq) => {
    await call(api.submitFailureRecord, secretariat, rfq); await review(rfq);
    for (const user of [chair, vice, member]) await vote(rfq, user);
    return call(api.declareFailureOfBidding, chair, rfq, { decision: "approved", remarks: "Quorum approvals and the required presiding action are complete." });
  };
  let first, second;
  await t.test("Secretariat prepares and submits; attendance alone cannot finalize; votes cannot be impersonated or rewritten", async () => {
    first = await makeRfq();
    await assert.rejects(call(api.declareFailureOfBidding, secretariat, first, { ...attendance, reason: "No bids" }), /Only.*Chairperson/);
    await assert.rejects(call(api.declareFailureOfBidding, chair, first, attendance), /Prepare and submit/);
    const prepared = await prepare(first);
    assert.equal(prepared.body.failureRecord.status, "draft"); assert.equal((await first.reload()).status, "closed");
    await assert.rejects(call(api.createRebid, secretariat, first), /failed procurement/);
    await call(api.submitFailureRecord, secretariat, first);
    await assert.rejects(prepare(first), /locked/);
    await assert.rejects(call(api.reviewFailureRecord, secretariat, first, { ...attendance, remarks: "Reviewed" }), /Only.*official/);
    await review(first);
    await assert.rejects(call(api.declareFailureOfBidding, chair, first, { decision: "approved", remarks: "Attendance only", ...attendance }), /authenticated approvals/);
    await assert.rejects(vote(first, twg), /Only.*official/);
    await assert.rejects(call(api.voteFailureRecord, chair, first, { userId: member.id, decision: "approved", remarks: "Proxy vote" }), /only your own/);
    await vote(first, chair);
    await assert.rejects(vote(first, chair), /already.*locked/);
    await vote(first, vice); await vote(first, member);
    await assert.rejects(call(api.declareFailureOfBidding, secretariat, first, { decision: "approved", remarks: "Approve" }), /Only.*Chairperson/);
    m.AuditLog.addHook("beforeCreate", "failureAuditReject", () => { throw new Error("audit unavailable"); });
    await assert.rejects(call(api.declareFailureOfBidding, chair, first, { decision: "approved", remarks: "Approve" }), /audit unavailable/);
    m.AuditLog.removeHook("beforeCreate", "failureAuditReject");
    assert.equal((await first.reload()).status, "closed");
    assert.equal((await m.FailureRecord.findByPk(prepared.body.failureRecord.id)).status, "reviewed");
    const finalized = await call(api.declareFailureOfBidding, chair, first, { decision: "approved", remarks: "Approve" });
    assert.equal(finalized.body.nextAction, "Rebid"); assert.equal(finalized.body.eligibleForReview, false);
    await assert.rejects(prepare(first), /locked/);
    await assert.rejects(call(api.recordAttemptEvidence, secretariat, first, { reason: "Overwrite", category: "other", explanation: "Changed" }), /locked/);
    const official = await m.BacResolution.findByPk(finalized.body.failureRecord.bacResolutionId);
    assert.equal(official.members.filter((entry) => entry.concurred).length, 3);
    assert.equal(official.members.filter((entry) => !entry.present && entry.concurred).length, 0);
  });
  await t.test("rebid retains the first official failure and first failure cannot trigger negotiated review", async () => {
    await assert.rejects(call(api.submitNegotiatedReview, secretariat, first, { justification: "Review", legalBasis: "Approved policy" }), /2 failed/);
    const before = (await m.FailureRecord.findAll()).map((row) => row.get({ plain: true }));
    const created = await call(api.createRebid, secretariat, first, { closingDate: "2028-01-01T02:00:00Z", openingDate: "2028-01-01T03:00:00Z", prebidRequired: false });
    second = await m.Rfq.findByPk(created.body.id);
    assert.equal(created.body.attemptNumber, 2); assert.equal(second.prHeaderId, first.prHeaderId);
    assert.equal((await first.reload()).status, "failed"); assert.deepEqual((await m.FailureRecord.findAll()).map((row) => row.get({ plain: true })), before);
    await assert.rejects(call(api.createRebid, secretariat, first, { closingDate: "2028-02-01", openingDate: "2028-02-02" }), /later procurement/);
    await second.update({ status: "closed" }); await prepare(second); await approve(second);
    const history = await call(api.listAttemptHistory, secretariat, second);
    assert.equal(history.body.eligibility.eligible, true); assert.equal(history.body.attempts.length, 2);
  });
  await t.test("negotiated procurement verifies typed documents and independent authenticated BAC quorum", async () => {
    await assert.rejects(call(api.startNegotiatedProcurement, secretariat, second), /approval/);
    await assert.rejects(call(api.submitNegotiatedReview, secretariat, second, { justification: "Two attempts failed", legalBasis: "Approved policy", supportingDocuments: [] }), /cost estimate/);
    const documents = [];
    for (const requirement of DEFAULT_PROCUREMENT_POLICY.negotiatedRequirements.filter((item) => !item.categories || item.categories.includes("goods"))) {
      const file = await document(second, `negotiated_${requirement.key}`); documents.push({ documentId: file.id, requirementKey: requirement.key });
    }
    await call(api.submitNegotiatedReview, secretariat, second, { justification: "End-user reviewed revised specifications, costs and references", legalBasis: "Configured approved procurement procedure", supportingDocuments: documents });
    await assert.rejects(call(api.decideNegotiatedReview, chair, second, { decision: "approved", remarks: "Attendance only", ...attendance }), /BAC review/);
    await review(second, api.reviewNegotiatedDocuments);
    await assert.rejects(call(api.decideNegotiatedReview, chair, second, { decision: "approved", remarks: "Attendance only", ...attendance }), /authenticated approvals/);
    for (const user of [chair, vice, member]) await vote(second, user, api.voteNegotiatedReview);
    await call(api.decideNegotiatedReview, chair, second, { decision: "approved", remarks: "All revised documents and required approvals verified" });
    await assert.rejects(call(api.startNegotiatedProcurement, secretariat, second, { closingDate: "2028-03-01T02:00:00Z", openingDate: "2028-03-01T03:00:00Z", prebidRequired: true }), /pre-bid conference/);
    const created = await call(api.startNegotiatedProcurement, secretariat, second, { closingDate: "2028-03-01T02:00:00Z", openingDate: "2028-03-01T03:00:00Z", prebidRequired: false });
    assert.equal(created.body.attemptNumber, 3);
    assert.equal((await call(api.listAttemptHistory, secretariat, second)).body.attempts.length, 3);
    assert.equal(await m.FailureRecord.count({ where: { status: "approved" } }), 2);
  });
  await t.test("insufficient offers is verified against the procurement method, after evaluation", async () => {
    const rfq = await makeRfq("evaluated");
    const vendor = await m.Vendor.create({ businessName: "Responsive vendor", registrationStatus: "verified" });
    const bid = await m.Bid.create({ rfqId: rfq.id, vendorId: vendor.id, status: "financialOpened", totalBidPrice: 100 });
    await assert.rejects(prepare(rfq), /responsive bidder/);
    await prepare(rfq, "insufficientOffers"); await approve(rfq);
    assert.equal((await bid.reload()).status, "financialOpened");
    const enough = await makeRfq("evaluated");
    for (let i = 0; i < 2; i++) {
      const bidder = await m.Vendor.create({ businessName: `Eligible vendor ${i}`, registrationStatus: "verified" });
      await m.Bid.create({ rfqId: enough.id, vendorId: bidder.id, status: "financialOpened", totalBidPrice: 100 });
    }
    await assert.rejects(prepare(enough, "insufficientOffers"), /meets the configured minimum/);
  });
  await t.test("legacy failed records require official review without modifying historical bid outcomes", async () => {
    const legacy = await makeRfq("failed");
    const vendor = await m.Vendor.create({ businessName: "Historical bidder", registrationStatus: "verified" });
    const bid = await m.Bid.create({ rfqId: legacy.id, vendorId: vendor.id, status: "submitted", totalBidPrice: 100 });
    await assert.rejects(call(api.createRebid, secretariat, legacy), /approved Failure/);
    await prepare(legacy); await approve(legacy);
    assert.equal((await bid.reload()).status, "submitted");
  });
  await t.test("BAC failure review blocks cancellation and post-qualification without changing evidence", async () => {
    const rfq = await makeRfq("evaluated");
    const vendor = await m.Vendor.create({ businessName: "Bidder awaiting committee decision", registrationStatus: "verified" });
    const bid = await m.Bid.create({ rfqId: rfq.id, vendorId: vendor.id, status: "technicalPassed", totalBidPrice: 100 });
    await prepare(rfq, "insufficientOffers");
    await call(api.submitFailureRecord, secretariat, rfq); await review(rfq);
    const attempt = await m.ProcurementAttempt.findOne({ where: { rfqId: rfq.id } });
    const snapshot = async () => ({
      rfq: (await rfq.reload()).get({ plain: true }), bid: (await bid.reload()).get({ plain: true }),
      failure: (await m.FailureRecord.findOne({ where: { attemptId: attempt.id } })).get({ plain: true }),
      postQualifications: await m.PostQualification.count({ where: { bidId: bid.id } }), auditCount: await m.AuditLog.count(),
    });
    const before = await snapshot();
    await assert.rejects(call(bidding.cancelRfq, secretariat, rfq, { reason: "Attempt to cancel during the pending BAC decision." }), /under BAC review/);
    await assert.rejects(call(bidding.submitPostQualification, member, rfq, { result: "passed" }, { bidId: bid.id }), /under BAC review/);
    assert.deepEqual(await snapshot(), before);
  });
  await t.test("additive migration repeats without rewriting approvals or audit evidence", async () => {
    const records = (await m.FailureRecord.findAll()).map((row) => row.get({ plain: true }));
    await migrateFailureGovernance(); assert.deepEqual((await migrateFailureGovernance()).added, []);
    assert.deepEqual((await m.FailureRecord.findAll()).map((row) => row.get({ plain: true })), records);
    assert.equal((await verifyChain({})).intact, true);
  });
});
