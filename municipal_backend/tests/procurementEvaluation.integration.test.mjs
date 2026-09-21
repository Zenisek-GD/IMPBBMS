import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mysql from "mysql2/promise";
import { evaluationPlanError, evaluationError, consultingQualityScore, consultingMinimumsMet, COMPLIANCE_REQUIREMENTS, technicalAverage } from "../services/evaluationPolicy.js";

const planInput = { qualityWeight: 75, financialWeight: 25, passingScore: 60, financialMethod: "lowestResponsivePrice", criteria: [
  { key: "experience", name: "Experience", maxScore: 20, weight: 30, minimumScore: 5 },
  { key: "methodology", name: "Methodology", maxScore: 50, weight: 70, minimumScore: 20 },
] };
test("approved criteria determine exact keys, score limits, minimums and quality normalization", () => {
  assert.equal(evaluationPlanError(planInput), null);
  assert.ok(evaluationPlanError({ ...planInput, qualityWeight: 50, financialWeight: 50 }));
  assert.ok(evaluationPlanError({ ...planInput, criteria: [...planInput.criteria, planInput.criteria[0]] }));
  assert.ok(evaluationPlanError({ ...planInput, criteria: [{ ...planInput.criteria[0], weight: 99 }] }));
  const plan = { ...planInput, status: "approved" };
  assert.equal(evaluationError({ category: "consulting", plan, criteriaBreakdown: { experience: 10, methodology: 40 } }), null);
  assert.ok(evaluationError({ category: "consulting", plan, criteriaBreakdown: { experience: 10, replaced: 40 } }));
  assert.ok(evaluationError({ category: "consulting", plan, criteriaBreakdown: { experience: 21, methodology: 40 } }));
  assert.ok(evaluationError({ category: "consulting", plan: { ...plan, status: "draft" }, criteriaBreakdown: { experience: 10, methodology: 40 } }));
  assert.equal(consultingQualityScore({ experience: 10, methodology: 40 }, plan), 71);
  assert.equal(consultingMinimumsMet({ experience: 4, methodology: 50 }, plan), false);
  assert.equal(technicalAverage([{ status: "superseded", score: 0 }, { status: "returned", score: 10 }, { status: "submitted", score: 80 }]), 80);
  for (const category of ["goods", "infrastructure"]) {
    const criteriaBreakdown = Object.fromEntries(COMPLIANCE_REQUIREMENTS[category].map((row) => [row.key, "compliant"]));
    assert.equal(evaluationError({ category, criteriaBreakdown, verdict: "passed" }), null);
    assert.ok(evaluationError({ category, criteriaBreakdown: { ...criteriaBreakdown, bidSecurity: "nonCompliant" }, verdict: "passed" }));
    assert.ok(evaluationError({ category, criteriaBreakdown, verdict: "failed", remarks: "Verification failed" }));
    assert.ok(evaluationError({ category, criteriaBreakdown, verdict: "failed", remarks: "Verification failed", failureReason: "other" }));
  }
});

test("evaluation criteria, declarations and authorized correction histories against isolated MySQL", { skip: process.env.RUN_PROCUREMENT_DB_TESTS !== "1", timeout: 180000 }, async (t) => {
  const scratch = `impbbms_evaluation_test_${crypto.randomBytes(8).toString("hex")}`;
  const port = Number(process.env.PROCUREMENT_TEST_DB_PORT ?? 33317);
  Object.assign(process.env, { DB_HOST: "127.0.0.1", DB_PORT: String(port), DB_NAME: scratch, DB_USER: "root", DB_PASSWORD: "", NODE_ENV: "test" });
  const admin = await mysql.createConnection({ host: "127.0.0.1", port, user: "root", password: "" });
  assert.match(scratch, /^impbbms_evaluation_test_[a-f0-9]{16}$/);
  await admin.query(`CREATE DATABASE \`${scratch}\``);
  let m;
  t.after(async () => { if (m) await m.sequelize.close(); assert.match(scratch, /^impbbms_evaluation_test_[a-f0-9]{16}$/); await admin.query(`DROP DATABASE \`${scratch}\``); await admin.end(); });
  m = await import("../models/index.js");
  await m.sequelize.sync();
  const api = await import("../controllers/evaluationWorkflowController.js");
  const evaluation = await import("../controllers/evaluationController.js");
  const twgApi = await import("../controllers/twgController.js");
  const { assertApprovedEvaluationPlan } = await import("../services/evaluationPlan.js");
  const { migrateEvaluationWorkflow } = await import("../services/migrateEvaluationWorkflow.js");
  const { verifyChain } = await import("../services/auditLog.js");
  const users = [];
  for (const [index, key] of ["bacChairperson", "bacViceChairperson", "bacMember", "bacMember", "bacMember", "bacSecretariat", "twgMember"].entries()) {
    const [role] = await m.Role.findOrCreate({ where: { key }, defaults: { name: key } });
    const user = await m.User.create({ name: `${key}${index}`, email: `evaluator${index}@example.test`, password: "ExampleTestPassword123!", status: "active", roleId: role.id });
    user.Role = role; users.push(user);
  }
  const [chair, vice, member, replacement, , secretariat, twg] = users;
  const attendance = { attendingMemberIds: [chair.id, vice.id, member.id], presidingMemberId: chair.id };
  const call = async (handler, user, params = {}, body = {}) => {
    let output;
    const req = { currentUser: user, permissions: new Set(["bidding.view", "bidding.evaluate", "bidding.technicalInput", "bidding.publish", "bidding.chairEvaluation"]), params, body, query: {}, ip: "127.0.0.1" };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { output = value; return this; } };
    await handler(req, res); return output;
  };
  let serial = 0;
  const rfq = (category = "goods", status = "opened", twgRequired = false) => m.Rfq.create({ referenceNo: `EVAL-${++serial}`, title: "Evaluation policy test", abc: 1000, category, status, twgRequired, closingDate: "2030-01-01T01:00:00Z", openingDate: "2030-01-01T02:00:00Z" });
  const bidFor = async (procurement) => { const vendor = await m.Vendor.create({ businessName: `Bidder ${serial}` }); return m.Bid.create({ rfqId: procurement.id, vendorId: vendor.id, blindLabel: "Bidder A", status: "opened", totalBidPrice: 100, technicalSubmitted: true, financialSealed: true }); };
  const goodsPayload = { noConflictDeclared: true, criteriaBreakdown: Object.fromEntries(COMPLIANCE_REQUIREMENTS.goods.map((row) => [row.key, "compliant"])), verdict: "passed", recommendation: "Proceed to the responsive bid review." };
  const evidence = [{ name: "Approved criteria amendment", url: "https://example.test/criteria-amendment.pdf" }];

  await t.test("criteria approval precedes bidding; amendments retain approved versions and enforce independent quorum", async () => {
    const procurement = await rfq("consulting", "draft");
    await assert.rejects(assertApprovedEvaluationPlan(procurement), /criteria|approved/i);
    await call(api.saveEvaluationPlan, secretariat, { id: procurement.id }, planInput);
    await assert.rejects(call(api.approveEvaluationPlan, secretariat, { id: procurement.id }, { ...attendance, approvalReference: "PLAN-1" }), /Another authorized/);
    await assert.rejects(call(api.approveEvaluationPlan, chair, { id: procurement.id }, { approvalReference: "PLAN-1" }), /quorum/);
    await call(api.approveEvaluationPlan, chair, { id: procurement.id }, { ...attendance, approvalReference: "PLAN-1" });
    await assertApprovedEvaluationPlan(await procurement.reload());
    await assert.rejects(call(api.saveEvaluationPlan, secretariat, { id: procurement.id }, planInput), /locked/);
    const proposed = { ...planInput, qualityWeight: 60, financialWeight: 40 };
    await assert.rejects(call(api.requestCriteriaAmendment, secretariat, { id: procurement.id }, { reason: "Revise approved weights", plan: proposed }), /document/);
    const request = await call(api.requestCriteriaAmendment, secretariat, { id: procurement.id }, { reason: "Revise approved weights", plan: proposed, supportingDocuments: evidence });
    assert.equal(Number((await m.EvaluationPlan.findOne({ where: { rfqId: procurement.id } })).qualityWeight), 75);
    await assert.rejects(call(api.approveCriteriaAmendment, secretariat, { amendmentId: request.amendment.id }, { ...attendance, approvalReference: "AMEND-1" }), /Another authorized/);
    await call(api.approveCriteriaAmendment, chair, { amendmentId: request.amendment.id }, { ...attendance, approvalReference: "AMEND-1" });
    const updated = await m.EvaluationPlan.findOne({ where: { rfqId: procurement.id } });
    assert.equal(updated.revision, 2); assert.equal(Number(updated.qualityWeight), 60);
    assert.equal(Number((await request.amendment.reload()).previousPlan.qualityWeight), 75);
    await procurement.update({ status: "opened" }); const bid = await bidFor(procurement);
    await assert.rejects(call(api.requestCriteriaAmendment, secretariat, { id: procurement.id }, { reason: "Late change", plan: proposed, supportingDocuments: evidence }), /submitted or opened/);
    await assert.rejects(call(evaluation.submitEvaluation, member, { bidId: bid.id }, { noConflictDeclared: true, criteriaBreakdown: { experience: 10, invented: 50 }, recommendation: "Review" }), /approved quality criterion/);
    await assert.rejects(call(evaluation.submitEvaluation, member, { bidId: bid.id }, { noConflictDeclared: true, criteriaBreakdown: { experience: 10, methodology: 40 }, qualityWeight: 90, recommendation: "Review" }), /cannot be changed/);
    const submitted = await call(evaluation.submitEvaluation, member, { bidId: bid.id }, { noConflictDeclared: true, criteriaBreakdown: { experience: 10, methodology: 40 }, recommendation: "Meets the quality requirements." });
    assert.equal(submitted.score, 71);
  });

  await t.test("declarations are self-only, conflicts exclude previous participation and require replacement", async () => {
    const procurement = await rfq(); const bid = await bidFor(procurement);
    await assert.rejects(call(evaluation.submitEvaluation, member, { bidId: bid.id }, { ...goodsPayload, noConflictDeclared: false }), /conflict/);
    await assert.rejects(call(api.declareEvaluatorConflict, member, { id: procurement.id }, { declared: true, userId: replacement.id }), /themselves/);
    await call(evaluation.submitEvaluation, member, { bidId: bid.id }, goodsPayload);
    await call(api.declareEvaluatorConflict, member, { id: procurement.id }, { declared: false, reason: "Personal interest disclosed" });
    assert.equal((await m.Evaluation.findOne({ where: { bidId: bid.id } })).status, "superseded");
    assert.equal((await m.EvaluatorDeclaration.findOne({ where: { rfqId: procurement.id, userId: member.id } })).reassignmentRequired, true);
    await assert.rejects(call(api.declareEvaluatorConflict, member, { id: procurement.id }, { declared: true }), /reassignment/);
    await assert.rejects(call(evaluation.submitEvaluation, member, { bidId: bid.id }, goodsPayload), /evaluated|reassignment/);
    await assert.rejects(call(evaluation.closeEvaluation, chair, { id: procurement.id }, attendance), /no BAC evaluation/);
    await call(evaluation.submitEvaluation, replacement, { bidId: bid.id }, goodsPayload);
    await call(evaluation.closeEvaluation, chair, { id: procurement.id }, attendance);
    assert.equal((await bid.reload()).status, "technicalPassed");
  });

  await t.test("BAC correction appends a new submission and preserves complete before/after history", async () => {
    const procurement = await rfq(); const bid = await bidFor(procurement);
    const original = await call(evaluation.submitEvaluation, member, { bidId: bid.id }, goodsPayload);
    await assert.rejects(call(evaluation.submitEvaluation, member, { bidId: bid.id }, goodsPayload), /return for correction/);
    await assert.rejects(call(api.returnEvaluationForCorrection, member, { kind: "bac", evaluationId: original.id }, { ...attendance, reason: "Clarify" }), /Another authorized/);
    await call(api.returnEvaluationForCorrection, chair, { kind: "bac", evaluationId: original.id }, { ...attendance, reason: "Recheck bid security evidence" });
    await assert.rejects(call(evaluation.closeEvaluation, chair, { id: procurement.id }, attendance), /returned evaluation/);
    const failed = { ...goodsPayload, criteriaBreakdown: { ...goodsPayload.criteriaBreakdown, bidSecurity: "nonCompliant" }, verdict: "failed", remarks: "Invalid security evidence.", failureReason: "failedVerification", recommendation: "Exclude the bid." };
    const corrected = await call(evaluation.submitEvaluation, member, { bidId: bid.id }, failed);
    assert.notEqual(corrected.id, original.id);
    assert.equal((await m.Evaluation.findByPk(original.id)).score, "100.00");
    assert.equal((await m.Evaluation.findByPk(original.id)).status, "superseded");
    const history = await m.EvaluationReturn.findOne({ where: { targetId: original.id, targetType: "evaluation" } });
    assert.equal(Number(history.previousSubmission.score), 100); assert.equal(Number(history.updatedSubmission.score), 0); assert.ok(history.correctedAt);
    await call(evaluation.closeEvaluation, chair, { id: procurement.id }, attendance);
    assert.equal((await bid.reload()).status, "technicalFailed"); assert.equal(bid.financialSealed, true);
  });

  await t.test("TWG corrections preserve prior recommendation and declarations cannot be impersonated", async () => {
    const procurement = await rfq("goods", "opened", true); const bid = await bidFor(procurement);
    await assert.rejects(call(twgApi.declareTwgConflict, twg, { id: procurement.id }, { declared: true, memberId: chair.id }), /themselves/);
    await call(twgApi.declareTwgConflict, twg, { id: procurement.id }, { declared: true });
    const assessment = { requirements: [{ requirement: "Mandatory specification", complianceStatus: "compliant", findings: "Evidence verified" }], status: "submitted", recommendation: "compliant", remarks: "Original recommendation" };
    const original = await call(twgApi.saveTwg, twg, { bidId: bid.id }, assessment);
    await call(api.returnEvaluationForCorrection, chair, { kind: "twg", evaluationId: original.id }, { ...attendance, reason: "Clarify technical findings" });
    await call(twgApi.saveTwg, twg, { bidId: bid.id }, { ...assessment, remarks: "Corrected written recommendation" });
    const history = await m.EvaluationReturn.findOne({ where: { targetType: "twgAssessment", targetId: original.id } });
    assert.equal(history.previousSubmission.remarks, "Original recommendation"); assert.equal(history.updatedSubmission.remarks, "Corrected written recommendation");
    await call(api.declareEvaluatorConflict, twg, { id: procurement.id }, { declared: false });
    assert.equal((await m.TwgAssessment.findByPk(original.id)).excludedForConflict, true);
    await assert.rejects(call(twgApi.saveTwg, twg, { bidId: bid.id }, assessment), /reassignment/);
  });

  await t.test("migration is repeatable and audit storage failure rolls evaluation back", async () => {
    const procurement = await rfq(); const bid = await bidFor(procurement);
    m.AuditLog.addHook("beforeCreate", "failEvaluationAudit", () => { throw new Error("Evaluation audit unavailable"); });
    await assert.rejects(call(evaluation.submitEvaluation, member, { bidId: bid.id }, goodsPayload), /audit unavailable/);
    m.AuditLog.removeHook("beforeCreate", "failEvaluationAudit");
    assert.equal(await m.Evaluation.count({ where: { bidId: bid.id } }), 0);
    assert.equal(await m.EvaluatorDeclaration.count({ where: { rfqId: procurement.id } }), 0);
    assert.deepEqual((await migrateEvaluationWorkflow()).added, []);
    assert.deepEqual((await migrateEvaluationWorkflow()).added, []);
    assert.equal((await verifyChain({})).intact, true);
  });
});
