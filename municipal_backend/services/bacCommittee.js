// ── The Bids and Awards Committee as a deliberative body ─────────────────────
//
// The BAC does not act by one officer clicking a button. It sits, it needs a
// quorum, and it resolves. RA 12009 Sec. 41 and the GPPB's procurement manuals
// carry forward the rule the 2016 IRR stated plainly:
//
//   "The majority (one-half of membership plus one) of the BAC members shall
//    constitute a quorum, provided that the Chairperson or the Vice-Chairperson
//    should be present in all meetings and deliberations... in no case shall
//    the quorum be less than three (3) members."
//
// The system previously recorded `quorumMet: committee.length >= 2`, counting
// every user who held a BAC role anywhere in the LGU rather than who was
// actually present, and it recorded the result without ever acting on it. A
// resolution could be produced by a committee of two, none of whom presided.
//
// Composition (2016 IRR Sec. 11.2.2, carried into RA 12009 Sec. 41): for
// provinces, cities and municipalities the BAC is five to seven members
// designated by the Local Chief Executive from the regular offices under their
// Office. All are regular members except the end-user representative, who is
// provisional.

export const BAC_MINIMUM_MEMBERS = 5;
export const BAC_MAXIMUM_MEMBERS = 7;

// No quorum is ever fewer than three, however small the designated committee.
export const BAC_ABSOLUTE_QUORUM_FLOOR = 3;

// The roles that may preside. The Chairperson presides; in their absence the
// Vice-Chairperson does. One of the two must be present for the committee to
// transact business at all.
export const PRESIDING_ROLE_KEYS = ["bacChairperson", "bacViceChairperson"];

export const requiredQuorum = (designatedCount) =>
  Math.max(BAC_ABSOLUTE_QUORUM_FLOOR, Math.floor(designatedCount / 2) + 1);

// Returns { ok, message, required, present, designated, presided }.
//
// `presidingId` is the officer recording the resolution. They must themselves
// be present and hold a presiding role — the Presiding Officer votes only to
// break a tie, but they must be in the room.
export const evaluateBacQuorum = ({ designated = [], present = [], presidingId = null }) => {
  const required = requiredQuorum(designated.length);

  const result = {
    ok: false,
    required,
    present: present.length,
    designated: designated.length,
    presided: false,
    message: null,
  };

  if (designated.length === 0) {
    result.message =
      "No Bids and Awards Committee has been designated. The Local Chief Executive must designate " +
      `${BAC_MINIMUM_MEMBERS}–${BAC_MAXIMUM_MEMBERS} members before the committee can resolve anything.`;
    return result;
  }

  const presiding = present.find(
    (member) => PRESIDING_ROLE_KEYS.includes(member.Role?.key) && member.id === presidingId
  );
  const anyPresidingPresent = present.some((member) => PRESIDING_ROLE_KEYS.includes(member.Role?.key));

  result.presided = Boolean(presiding);

  if (present.length < required) {
    result.message =
      `The committee is not quorate: ${present.length} of ${designated.length} designated members ` +
      `present, ${required} required (one-half plus one, never fewer than ${BAC_ABSOLUTE_QUORUM_FLOOR}).`;
    return result;
  }

  if (!anyPresidingPresent) {
    result.message =
      "The Chairperson or the Vice-Chairperson must be present at every BAC meeting and deliberation. " +
      "Neither is recorded as present.";
    return result;
  }

  if (!presiding) {
    result.message =
      "Only the Chairperson, or the Vice-Chairperson in their absence, may preside over and record " +
      "a resolution of the committee.";
    return result;
  }

  result.ok = true;
  return result;
};

// A warning rather than a refusal. An LGU whose designated BAC is the wrong
// size has a designation problem, not a procurement problem, and blocking every
// award until the Mayor fixes it would stop the municipality buying anything.
// Surfaced so it appears on the record instead of going unnoticed.
export const compositionWarnings = (designated = []) => {
  const warnings = [];

  if (designated.length > 0 && designated.length < BAC_MINIMUM_MEMBERS) {
    warnings.push(
      `The BAC has ${designated.length} designated member(s); RA 12009 Sec. 41 requires at least ` +
        `${BAC_MINIMUM_MEMBERS}.`
    );
  }
  if (designated.length > BAC_MAXIMUM_MEMBERS) {
    warnings.push(
      `The BAC has ${designated.length} designated members; RA 12009 Sec. 41 allows no more than ` +
        `${BAC_MAXIMUM_MEMBERS}.`
    );
  }
  if (!designated.some((member) => member.Role?.key === "bacChairperson")) {
    warnings.push("No BAC Chairperson has been designated.");
  }
  if (!designated.some((member) => member.Role?.key === "bacViceChairperson")) {
    warnings.push(
      "No BAC Vice-Chairperson has been designated. The committee cannot sit when the Chairperson is absent."
    );
  }

  return warnings;
};
