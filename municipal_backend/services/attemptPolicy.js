import { DEFAULT_PROCUREMENT_POLICY, evaluateBacDecision } from "./bacCommittee.js";

// Pure guard shared by history displays, review, approval and process creation.
// Count sequential failed attempts, never cancelled or merely drafted records.
const TWO_FAILED_BIDDINGS_MODES = new Set(["competitiveBidding", "limitedSourceBidding", "competitiveDialogue"]);
export const eligibleFailedBiddingMode = (attempt) => {
  const modeKey = attempt.rfq?.mode?.key ?? attempt.modeKey;
  // Older standalone policy records do not carry an RFQ association. Live
  // procurement attempts load it through attemptsForProject.
  return modeKey == null ? !attempt.rfq : TWO_FAILED_BIDDINGS_MODES.has(modeKey);
};
export const negotiatedEligibility = (attempts = [], policy = DEFAULT_PROCUREMENT_POLICY) => {
  const ordered = [...attempts].sort((a, b) => a.attemptNumber - b.attemptNumber);
  const required = Math.max(2, Number(policy.requiredFailedAttempts) || 2);
  const missing = [];
  const failed = ordered.filter((attempt) => attempt.status === "failed" && eligibleFailedBiddingMode(attempt));
  if (ordered.some((attempt) => attempt.status === "failed" && !eligibleFailedBiddingMode(attempt))) missing.push("Only failed Competitive Bidding, Limited Source Bidding, or Competitive Dialogue attempts qualify under IRR Section 35.1.");
  if (failed.length < required) missing.push(`${required} failed procurement attempts are required; ${failed.length} have been recorded.`);
  if (ordered.some((attempt) => !["failed", "cancelled"].includes(attempt.status))) missing.push("Every preceding procurement attempt must be closed without an award before Negotiated Procurement review.");
  for (const attempt of failed) {
    const number = attempt.attemptNumber;
    if (!attempt.failureReason?.trim()) missing.push(`Official failure reason for Procurement Attempt #${number} has not yet been recorded.`);
    const resolution = attempt.resolution ?? attempt.outcomeSnapshot?.resolution;
    if (!attempt.bacResolutionId || !resolution?.resolutionNo || !resolution?.resolvedAt) missing.push(`Resolution for Procurement Attempt #${number} has not yet been recorded.`);
    if (!resolution?.quorumMet || !Array.isArray(resolution.members) || !resolution.members.some((member) => member.concurred)) missing.push(`Required BAC approval for Procurement Attempt #${number} has not yet been completed.`);
    if (policy.requireFailureDocuments && !attempt.supportingDocuments?.length) missing.push(`Supporting documents for Procurement Attempt #${number} have not yet been recorded.`);
    const official = attempt.failureRecords?.find((record) => record.status === "approved");
    if (!official?.approvedById || !official?.approvedAt || !official?.bacResolutionId) missing.push(`Approved Failure of Bidding record for Procurement Attempt #${number} has not yet been completed.`);
  }
  return { eligible: missing.length === 0, requiredFailedAttempts: required, failedAttempts: failed.length, missing };
};

export const negotiatedDocumentChecklist = (documents = [], category, policy = DEFAULT_PROCUREMENT_POLICY) =>
  (policy.negotiatedRequirements ?? DEFAULT_PROCUREMENT_POLICY.negotiatedRequirements)
    .filter((item) => !item.categories || item.categories.includes(category))
    .map((item) => ({ ...item, complete: documents.some((document) => document.requirementKey === item.key && Number.isSafeInteger(document.documentId) && document.documentId > 0) }));

export const negotiatedReadiness = ({ attempts = [], review, votes = [], category, policy = DEFAULT_PROCUREMENT_POLICY }) => {
  const eligibility = negotiatedEligibility(attempts, policy);
  const checklist = negotiatedDocumentChecklist(review?.supportingDocuments ?? [], category, policy);
  const missing = [...eligibility.missing, ...checklist.filter((item) => item.required && !item.complete).map((item) => `${item.label} is missing.`)];
  if (!review?.committeeReview) missing.push("BAC review is pending.");
  const decision = evaluateBacDecision({ committeeReview: review?.committeeReview, votes });
  if (!decision.ok) missing.push(decision.message);
  if (review?.status !== "approved" || !review?.approverId || !review?.bacResolutionId) missing.push("BAC approval is pending.");
  return { eligible: missing.length === 0, checklist, missing: [...new Set(missing)], decision };
};

export const failureStatusLabel = (number) => number === 1 ? "Failed – First Attempt" : number === 2 ? "Failed – Second Attempt" : `Failed – Attempt #${number}`;

export const validateAttemptSchedule = ({ closingDate, openingDate, prebidAt }) => {
  const closing = new Date(closingDate);
  const opening = new Date(openingDate);
  if (!closingDate || !Number.isFinite(closing.getTime())) return "A valid bid submission deadline is required.";
  if (!openingDate || !Number.isFinite(opening.getTime())) return "A valid bid opening date and time is required.";
  if (opening <= closing) return "Bid opening must be scheduled after the bid submission deadline.";
  if (closing <= new Date()) return "The new procurement attempt's submission deadline must be in the future.";
  if (prebidAt && (!Number.isFinite(new Date(prebidAt).getTime()) || new Date(prebidAt) >= closing)) return "The pre-bid conference must be scheduled before the submission deadline.";
  return null;
};
