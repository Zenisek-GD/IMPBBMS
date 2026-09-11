import test from "node:test";
import assert from "node:assert/strict";
import { scheduleError, weightError, combinedScores, evaluationError, requirementsError, assessmentCompliant } from "../services/evaluationPolicy.js";
import { evaluateBacQuorum, DEFAULT_PROCUREMENT_POLICY } from "../services/bacCommittee.js";
import { procurementAmountError, suggestProcurementMode, requiresPrebidConference } from "../services/procurementThresholds.js";
import { negotiatedEligibility } from "../services/attemptPolicy.js";

test("bid opening compares complete instants, allowing later time on the same day", () => {
  assert.equal(scheduleError("2026-09-15T10:00:00+08:00", "2026-09-15T13:00:00+08:00"), null);
  for (const opening of ["2026-09-15T09:00:00+08:00", "2026-09-15T10:00:00+08:00", "2026-09-15T02:00:00Z"]) assert.equal(scheduleError("2026-09-15T10:00:00+08:00", opening), "Bid opening must be scheduled after the bid submission deadline.");
  assert.ok(scheduleError("invalid", "2026-09-15T13:00:00+08:00"));
  assert.ok(scheduleError("2026-09-15T10:00:00+08:00", null));
});
test("quality dominates financial weight, both contribute and sum to 100", () => {
  for (const [q, f] of [[75,25], [60,40], [50.01,49.99]]) assert.equal(weightError(q,f), null);
  for (const [q, f] of [[50,50], [40,60], [75,20], [100,0], [101,-1], [NaN,25], ["",100], [true,99]]) assert.ok(weightError(q,f));
  assert.deepEqual(combinedScores({ qualityScore:80, price:200, lowestPrice:100, qualityWeight:75, financialWeight:25 }), { qualityScore:80, financialScore:50, combinedScore:72.5 });
  assert.throws(() => combinedScores({ qualityScore:80, price:0, lowestPrice:0, qualityWeight:75, financialWeight:25 }));
  const expensive = combinedScores({ qualityScore:90, price:200, lowestPrice:100, qualityWeight:60, financialWeight:40 });
  const cheaper = combinedScores({ qualityScore:80, price:100, lowestPrice:100, qualityWeight:60, financialWeight:40 });
  assert.ok(cheaper.combinedScore > expensive.combinedScore, "financial scoring changes ranking where justified by approved weights");
});
test("goods and infrastructure reject rating scores and failed mandatory criteria", () => {
  for (const category of ["goods", "infrastructure"]) {
    assert.ok(evaluationError({ category, verdict:"passed", criteriaBreakdown:{ specification:90 } }));
    assert.ok(evaluationError({ category, verdict:"passed", criteriaBreakdown:{ specification:"nonCompliant" } }));
    assert.ok(evaluationError({ category, verdict:"passed", criteriaBreakdown:{ specification:"needsClarification" } }));
    assert.equal(evaluationError({ category, verdict:"passed", criteriaBreakdown:{ specification:"compliant" } }), null);
    assert.equal(evaluationError({ category, verdict:"failed", criteriaBreakdown:{ specification:"nonCompliant" }, remarks:"Required specification missing" }), null);
  }
  assert.ok(evaluationError({ category:"consulting", criteriaBreakdown:{ expertise:"" } }));
});
test("TWG recommendations cannot declare mandatory noncompliance responsive", () => {
  const row = { status:"submitted", requirements:[{ requirement:"Capacity", complianceStatus:"compliant", findings:"Meets published requirement" }], recommendation:"compliant" };
  assert.equal(requirementsError(row.requirements), null);
  assert.equal(assessmentCompliant(row), true);
  assert.equal(assessmentCompliant({ ...row, status:"draft" }), false);
  assert.equal(assessmentCompliant({ ...row, recommendation:"disqualification" }), false);
  assert.ok(requirementsError([{ ...row.requirements[0], complianceStatus:"needsClarification" }]));
  assert.equal(assessmentCompliant({ ...row, requirements:[{ ...row.requirements[0], complianceStatus:"nonCompliant" }] }), false);
});

test("committee composition and distinct attendance enforce the configured quorum", () => {
  const designated = ["bacChairperson", "bacViceChairperson", "bacMember", "bacMember", "bacMember"].map((role, index) => ({ id: index+1, role }));
  const check = (present, policy = DEFAULT_PROCUREMENT_POLICY) => evaluateBacQuorum({ designated, present, presidingId:1, policy });
  assert.equal(check(designated.slice(0,3)).ok, true);
  assert.match(check(designated.slice(0,2)).message, /required quorum has not been met/);
  assert.equal(check([designated[0], designated[0], designated[1]]).ok, false);
  assert.equal(check([...designated.slice(0,2), {id:99,role:"bacMember"}]).ok, false);
  assert.equal(check(designated.slice(0,3), {...DEFAULT_PROCUREMENT_POLICY,quorumCount:4}).ok, false);
});

test("central category limits affect amount checks, mode suggestions and pre-bid requirements", () => {
  const lgu = {lguType:"municipality",incomeClass:"1st",applicableLimits:[
    {category:"goods",procurementMethod:"directAcquisition",minimumAmount:0,maximumAmount:100},
    {category:"goods",procurementMethod:"smallValueProcurement",minimumAmount:0,maximumAmount:1000},
    {category:"goods",procurementMethod:"postingExemption",minimumAmount:0,maximumAmount:200},
    {category:"goods",procurementMethod:"mandatoryPrebidConference",minimumAmount:500,maximumAmount:null},
  ]};
  assert.ok(procurementAmountError(101,"directAcquisition",lgu,"goods"));
  assert.equal(procurementAmountError(100,"directAcquisition",lgu,"goods"),null);
  assert.equal(suggestProcurementMode(300,lgu,"goods").requiresPosting,true);
  assert.equal(suggestProcurementMode(300,lgu,"goods").suggested,"smallValueProcurement");
  assert.equal(requiresPrebidConference(500,lgu,"goods"),true);
  assert.equal(requiresPrebidConference(500,lgu,"consulting"),false);
});

test("negotiated review identifies the precise missing records and excludes incomplete attempts", () => {
  const failure = {attemptNumber:1,status:"failed",failureReason:"No bids",bacResolutionId:1,resolution:{resolutionNo:"2026-001",resolvedAt:"2026-01-01",quorumMet:true,members:[{concurred:true}]},supportingDocuments:[{name:"Minutes"}]};
  assert.equal(negotiatedEligibility([failure]).eligible,false);
  assert.ok(negotiatedEligibility([failure,{...failure,attemptNumber:2,bacResolutionId:null}]).missing.includes("Resolution for Procurement Attempt #2 has not yet been recorded."));
  assert.equal(negotiatedEligibility([failure,{...failure,attemptNumber:2}]).eligible,true);
  assert.equal(negotiatedEligibility([failure,{...failure,attemptNumber:2},{attemptNumber:3,status:"ongoing"}]).eligible,false);
});
