export function pendingTransitionRows(rows, transitions, permissions, userId, creatorKey) {
  const pending = Object.entries(transitions).filter(([key, transition]) => !["revise", "cancel", "return"].includes(key) && transition.permission && permissions.has(transition.permission));
  return rows.filter((row) => pending.some(([action, transition]) => transition.from.includes(row.status) && (action === "submit" ? Number(row[creatorKey]) === Number(userId) : Number(row[creatorKey]) !== Number(userId))));
}

export function evaluationQueues(rfqs, permissions, userId) {
  const technical = new Set();
  const bac = new Set();
  const postQualification = new Set();
  for (const rfq of rfqs) {
    if (rfq.status === "opened") {
      const liveBids = (rfq.bids || []).filter((bid) => ["opened", "technicalPassed", "financialOpened"].includes(bid.status));
      if (permissions.has("bidding.technicalInput") && rfq.twgRequired !== false && liveBids.some((bid) => !(bid.twgAssessments || []).some((entry) => entry.status === "submitted" && Number(entry.memberId) === Number(userId)))) technical.add(rfq.id);
      if (permissions.has("bidding.evaluate") || permissions.has("bidding.chairEvaluation")) {
        const ready = liveBids.filter((bid) => rfq.twgRequired === false || (bid.twgAssessments || []).some((entry) => entry.status === "submitted"));
        const ownReviewAvailable = permissions.has("bidding.evaluate") && ready.some((bid) => !(bid.twgAssessments || []).some((entry) => entry.status === "submitted" && Number(entry.memberId) === Number(userId)) && !(bid.evaluations || []).some((entry) => Number(entry.evaluatorId) === Number(userId)));
        const readyToFinalize = permissions.has("bidding.chairEvaluation") && ready.length > 0 && ready.length === liveBids.length && ready.every((bid) => (bid.evaluations || []).length && !(bid.twgAssessments || []).some((entry) => entry.status === "draft"));
        if (ownReviewAvailable || readyToFinalize) bac.add(rfq.id);
      }
    }
    if (rfq.status === "evaluated" && (permissions.has("bidding.evaluate") || permissions.has("bidding.chairEvaluation")) && (rfq.bids || []).some((bid) => ["financialOpened", "technicalPassed"].includes(bid.status) || (permissions.has("bidding.chairEvaluation") && bid.status === "postQualified"))) postQualification.add(rfq.id);
  }
  return { technical: technical.size, bac: bac.size, postQualification: postQualification.size, evaluation: new Set([...technical, ...bac, ...postQualification]).size };
}
