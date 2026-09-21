import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROCUREMENT_POLICY, evaluateBacDecision, validateProcurementPolicy } from "../services/bacCommittee.js";
import { negotiatedEligibility, negotiatedDocumentChecklist, negotiatedReadiness } from "../services/attemptPolicy.js";

const committee = ["bacChairperson", "bacViceChairperson", "bacMember", "bacMember", "bacMember"].map((role, index) => ({ id: index + 1, role }));
const committeeReview = { committee, attendingMemberIds: [1, 2, 3], presidingId: 1, policy: DEFAULT_PROCUREMENT_POLICY };
const votes = [1, 2, 3].map((userId) => ({ userId, role: committee[userId - 1].role, decision: "approved" }));
const failure = (number) => ({ attemptNumber: number, status: "failed", failureReason: "No bids", bacResolutionId: number,
  resolution: { resolutionNo: `2026-${number}`, resolvedAt: "2026-01-01", quorumMet: true, members: [{ concurred: true }] }, supportingDocuments: [{ documentId: number }],
  failureRecords: [{ status: "approved", approvedById: 1, approvedAt: "2026-01-01", bacResolutionId: number }] });

test("attendance, arbitrary names and proxy votes cannot replace authenticated BAC decisions", () => {
  assert.equal(evaluateBacDecision({ committeeReview }).ok, false);
  assert.equal(evaluateBacDecision({ committeeReview, votes }).ok, true);
  assert.equal(evaluateBacDecision({ committeeReview, votes: [votes[0], votes[0], votes[1]] }).ok, false);
  assert.equal(evaluateBacDecision({ committeeReview, votes: [votes[0], votes[1], { userId: 99, role: "bacMember", decision: "approved" }] }).ok, false);
  assert.equal(evaluateBacDecision({ committeeReview, votes: votes.map((vote) => ({ ...vote, role: "bacSecretariat" })) }).ok, false);
});

test("quorum approval and required presiding official are distinct enforced conditions", () => {
  const review = { ...committeeReview, attendingMemberIds: [1, 2, 3, 4] };
  const approvals = [...votes.slice(1), { userId: 4, role: "bacMember", decision: "approved" }, { ...votes[0], decision: "abstained" }];
  assert.match(evaluateBacDecision({ committeeReview: review, votes: approvals }).message, /Chairperson/);
  assert.equal(evaluateBacDecision({ committeeReview: { ...review, policy: { ...DEFAULT_PROCUREMENT_POLICY, requirePresidingOfficer: false } }, votes: approvals }).ok, true);
  assert.equal(evaluateBacDecision({ committeeReview, votes: votes.map((vote) => ({ ...vote, decision: "rejected" })), decision: "rejected" }).ok, true);
});

test("negotiated eligibility never reduces to one failure and requires approved permanent records", () => {
  assert.equal(negotiatedEligibility([failure(1)], { ...DEFAULT_PROCUREMENT_POLICY, requiredFailedAttempts: 1 }).eligible, false);
  assert.equal(negotiatedEligibility([failure(1), failure(2)]).eligible, true);
  assert.equal(negotiatedEligibility([failure(1), { ...failure(2), failureRecords: [] }]).eligible, false);
  assert.equal(negotiatedEligibility([failure(1), { ...failure(2), status: "cancelled" }]).eligible, false);
});

test("negotiated checklist is category-aware and requires classified uploaded documents", () => {
  const goods = negotiatedDocumentChecklist([], "goods");
  assert.ok(goods.some((item) => item.key === "revisedSpecifications"));
  assert.ok(!goods.some((item) => item.key === "revisedScope"));
  assert.ok(negotiatedDocumentChecklist([], "infrastructure").some((item) => item.key === "revisedScope"));
  assert.equal(negotiatedDocumentChecklist([{ requirementKey: "costEstimate", url: "https://example.test/fake.pdf" }], "goods").find((item) => item.key === "costEstimate").complete, false);
  const documents = goods.map((item, index) => ({ requirementKey: item.key, documentId: index + 1 }));
  const review = { status: "approved", approverId: 1, bacResolutionId: 3, committeeReview, supportingDocuments: documents };
  assert.equal(negotiatedReadiness({ attempts: [failure(1), failure(2)], review, votes, category: "goods" }).eligible, true);
  assert.equal(negotiatedReadiness({ attempts: [failure(1), failure(2)], review: { ...review, supportingDocuments: documents.filter((item) => item.requirementKey !== "costEstimate") }, votes, category: "goods" }).eligible, false);
  assert.equal(negotiatedReadiness({ attempts: [failure(1), failure(2)], review, votes: [], category: "goods" }).eligible, false);
});

test("configured negotiated requirements reject duplicate, invalid and unnamed entries", () => {
  assert.equal(validateProcurementPolicy({}).ok, true);
  assert.equal(validateProcurementPolicy({ negotiatedRequirements: [{ key: "extra", label: "", required: true }] }).ok, false);
  assert.equal(validateProcurementPolicy({ negotiatedRequirements: [{ key: "extra", label: "Extra", required: true }, { key: "extra", label: "Other", required: true }] }).ok, false);
});
