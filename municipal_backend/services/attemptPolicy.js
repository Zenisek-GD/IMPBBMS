import { DEFAULT_PROCUREMENT_POLICY } from "./bacCommittee.js";

// Pure guard shared by history displays, review, approval and process creation.
// Count sequential failed attempts, never cancelled or merely drafted records.
export const negotiatedEligibility = (attempts = [], policy = DEFAULT_PROCUREMENT_POLICY) => {
  const ordered = [...attempts].sort((a, b) => a.attemptNumber - b.attemptNumber);
  const required = Number(policy.requiredFailedAttempts);
  const missing = [];
  const failed = ordered.filter((attempt) => attempt.status === "failed");
  if (failed.length < required) missing.push(`${required} failed procurement attempts are required; ${failed.length} have been recorded.`);
  if (ordered.some((attempt) => !["failed", "cancelled"].includes(attempt.status))) missing.push("Every preceding procurement attempt must be closed without an award before Negotiated Procurement review.");
  for (const attempt of failed) {
    const number = attempt.attemptNumber;
    if (!attempt.failureReason?.trim()) missing.push(`Official failure reason for Procurement Attempt #${number} has not yet been recorded.`);
    const resolution = attempt.resolution ?? attempt.outcomeSnapshot?.resolution;
    if (!attempt.bacResolutionId || !resolution?.resolutionNo || !resolution?.resolvedAt) missing.push(`Resolution for Procurement Attempt #${number} has not yet been recorded.`);
    if (!resolution?.quorumMet || !Array.isArray(resolution.members) || !resolution.members.some((member) => member.concurred)) missing.push(`Required BAC approval for Procurement Attempt #${number} has not yet been completed.`);
    if (policy.requireFailureDocuments && !attempt.supportingDocuments?.length) missing.push(`Supporting documents for Procurement Attempt #${number} have not yet been recorded.`);
  }
  return { eligible: missing.length === 0, requiredFailedAttempts: required, failedAttempts: failed.length, missing };
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
