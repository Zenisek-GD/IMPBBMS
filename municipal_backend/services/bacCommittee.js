// BAC policy is read from Settings by procurementGovernance.js. Defaults apply
// until the administrator records the municipality's approved setup.
export const BAC_MINIMUM_MEMBERS = 5;
export const BAC_MAXIMUM_MEMBERS = 7;
export const BAC_ABSOLUTE_QUORUM_FLOOR = 3;
export const PRESIDING_ROLE_KEYS = ["bacChairperson", "bacViceChairperson"];
export const BAC_ROLE_KEYS = [...PRESIDING_ROLE_KEYS, "bacMember"];
export const NEGOTIATED_REQUIREMENTS = Object.freeze([
  { key: "bacResolution", label: "Required BAC resolution", required: true },
  { key: "revisedSpecifications", label: "Revised technical specifications", categories: ["goods"], required: true },
  { key: "revisedScope", label: "Revised scope of work", categories: ["infrastructure", "consulting"], required: true },
  { key: "costEstimate", label: "Updated cost estimate / Approved Budget for the Contract", required: true },
  { key: "marketReferences", label: "Supporting market references", required: true },
  { key: "priceReferences", label: "Supporting price references", required: true },
  { key: "endUserJustification", label: "End-user justification and review", required: true },
  { key: "procurementDocuments", label: "Relevant procurement documents", required: true },
  { key: "requiredApprovals", label: "Required approvals", required: true },
]);
export const DEFAULT_PROCUREMENT_POLICY = Object.freeze({ membershipCount: 5, quorumCount: 3,
  requirePresidingOfficer: true, requiredFailedAttempts: 2, requireFailureDocuments: true, memberIds: [],
  negotiatedRequirements: NEGOTIATED_REQUIREMENTS });

export const requiredQuorum = (designatedCount, policy = {}) =>
  Number(policy.quorumCount ?? Math.max(BAC_ABSOLUTE_QUORUM_FLOOR, Math.floor(designatedCount / 2) + 1));

export const validateProcurementPolicy = (input = {}) => {
  const policy = { ...DEFAULT_PROCUREMENT_POLICY, ...input };
  const errors = [];
  if (!Number.isInteger(policy.membershipCount) || policy.membershipCount < 3 || policy.membershipCount > 15) errors.push("BAC membership must be a whole number between 3 and 15.");
  if (!Number.isInteger(policy.quorumCount) || policy.quorumCount < 3 || policy.quorumCount > policy.membershipCount) errors.push("BAC quorum must be at least 3 and cannot exceed the configured membership.");
  if (!Number.isInteger(policy.requiredFailedAttempts) || policy.requiredFailedAttempts < 2 || policy.requiredFailedAttempts > 10) errors.push("Negotiated Procurement requires between 2 and 10 failed procurement attempts.");
  for (const key of ["requirePresidingOfficer", "requireFailureDocuments"]) {
    if (typeof policy[key] !== "boolean") errors.push(`${key} must be true or false.`);
  }
  if (!Array.isArray(policy.memberIds) || policy.memberIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) errors.push("BAC signatories must be valid user IDs.");
  else if (new Set(policy.memberIds).size !== policy.memberIds.length) errors.push("A BAC signatory cannot occupy more than one position.");
  else if (policy.memberIds.length && policy.memberIds.length !== policy.membershipCount) errors.push("Select exactly the configured number of official BAC signatories.");
  if (!Array.isArray(policy.negotiatedRequirements) || !policy.negotiatedRequirements.length || policy.negotiatedRequirements.length > 30 || policy.negotiatedRequirements.some((item) =>
    !/^[a-zA-Z][a-zA-Z0-9]{0,63}$/.test(item?.key ?? "") || typeof item.label !== "string" || !item.label.trim() || item.label.length > 255 || typeof item.required !== "boolean" ||
    (item.categories != null && (!Array.isArray(item.categories) || item.categories.some((category) => !["goods", "infrastructure", "consulting"].includes(category)))))) errors.push("Configure named negotiated procurement document requirements and their applicable categories.");
  else if (new Set(policy.negotiatedRequirements.map((item) => item.key)).size !== policy.negotiatedRequirements.length) errors.push("Negotiated procurement requirement keys must be unique.");
  return { ok: errors.length === 0, errors, policy };
};

const roleOf = (member) => member.Role?.key ?? member.role;
export const compositionWarnings = (designated = [], policy = DEFAULT_PROCUREMENT_POLICY) => {
  const warnings = [];
  if (new Set(designated.map((member) => Number(member.id))).size !== designated.length) warnings.push("Each official BAC signatory must be a different person.");
  if (designated.length !== Number(policy.membershipCount ?? 5)) warnings.push(`The approved BAC setup requires ${policy.membershipCount ?? 5} official signatories; ${designated.length} active signatories are designated.`);
  for (const [role, label] of [["bacChairperson", "Chairperson"], ["bacViceChairperson", "Vice-Chairperson"]]) {
    if (designated.filter((member) => roleOf(member) === role).length !== 1) warnings.push(`Exactly one BAC ${label} must be designated.`);
  }
  if (designated.some((member) => !BAC_ROLE_KEYS.includes(roleOf(member)))) warnings.push("Every signatory must hold an official BAC position.");
  return warnings;
};

export const evaluateBacQuorum = ({ designated = [], present = [], presidingId = null, policy = DEFAULT_PROCUREMENT_POLICY }) => {
  const required = requiredQuorum(designated.length, policy);
  const designatedIds = new Set(designated.map((member) => Number(member.id)));
  const presentIds = new Set(present.map((member) => Number(member.id)));
  const knownPresent = designated.filter((member) => presentIds.has(Number(member.id)));
  const presiding = knownPresent.find((member) => PRESIDING_ROLE_KEYS.includes(roleOf(member)) && Number(member.id) === Number(presidingId));
  const warnings = compositionWarnings(designated, policy);
  const result = { ok: false, required, present: knownPresent.length, designated: designated.length, presided: Boolean(presiding), message: null, warnings };
  if (warnings.length) { result.message = warnings.join(" "); return result; }
  if (presentIds.size !== present.length || [...presentIds].some((id) => !designatedIds.has(id))) { result.message = "Attendance must contain distinct, officially designated BAC members."; return result; }
  if (knownPresent.length < required) { result.message = "BAC action cannot be finalized because the required quorum has not been met."; return result; }
  if (policy.requirePresidingOfficer !== false && !presiding) { result.message = "Record the attending BAC Chairperson or Vice-Chairperson who presided over this action."; return result; }
  result.ok = true;
  return result;
};

// Attendance alone is never an approval: count immutable votes submitted by
// each authenticated official after the meeting record has been reviewed.
export const evaluateBacDecision = ({ committeeReview, votes = [], decision = "approved" }) => {
  if (!committeeReview) return { ok: false, message: "BAC review must be completed before a committee decision can be finalized." };
  const { committee = [], attendingMemberIds = [], presidingId, policy = DEFAULT_PROCUREMENT_POLICY } = committeeReview;
  const present = attendingMemberIds.map((id) => committee.find((member) => Number(member.id) === Number(id)) ?? { id });
  const quorum = evaluateBacQuorum({ designated: committee, present, presidingId, policy });
  if (!quorum.ok) return quorum;
  const authenticated = votes.filter((vote) => attendingMemberIds.includes(Number(vote.userId)) && committee.some((member) => Number(member.id) === Number(vote.userId) && BAC_ROLE_KEYS.includes(vote.role)));
  const participants = new Set(authenticated.map((vote) => Number(vote.userId)));
  const agreeing = new Set(authenticated.filter((vote) => vote.decision === decision).map((vote) => Number(vote.userId)));
  const result = { ...quorum, ok: false, participated: participants.size, approved: authenticated.filter((vote) => vote.decision === "approved").length,
    rejected: authenticated.filter((vote) => vote.decision === "rejected").length, abstained: authenticated.filter((vote) => vote.decision === "abstained").length };
  if (authenticated.length !== participants.size) return { ...result, message: "Each official may record only one personal BAC decision." };
  if (agreeing.size < quorum.required) return { ...result, message: `This BAC decision cannot be finalized because ${quorum.required} authenticated ${decision === "approved" ? "approvals" : "rejections"} are required; ${agreeing.size} have been recorded.` };
  if (policy.requirePresidingOfficer !== false && !authenticated.some((vote) => Number(vote.userId) === Number(presidingId) && vote.decision === decision)) return { ...result, message: "The required Chairperson or Vice-Chairperson must personally confirm this BAC decision." };
  return { ...result, ok: true, message: null };
};
