import { workflowError } from "./workflowSupport.js";

export const conferenceSchedule = (rfq, { purpose = "prebid", scheduledAt } = {}) => {
  if (!["prebid", "clarification", "opening", "other"].includes(purpose)) throw workflowError("Choose a valid conference purpose.", 400);
  if (["cancelled", "awarded", "failed"].includes(rfq.status)) throw workflowError(`Cannot schedule a conference for a ${rfq.status} procurement.`);
  if (purpose === "prebid" && !rfq.prebidRequired) throw workflowError("A pre-bid conference is not applicable to this procurement. Update the approved procurement schedule first.");
  const official = purpose === "prebid" ? rfq.prebidAt : purpose === "opening" ? rfq.openingDate : null;
  if (["prebid", "opening"].includes(purpose)) {
    if (!official || !Number.isFinite(new Date(official).getTime())) throw workflowError("Complete the main procurement schedule before creating this conference.");
    if (scheduledAt && new Date(scheduledAt).getTime() !== new Date(official).getTime()) throw workflowError("Conference dates must match the main procurement schedule. Request a schedule amendment to change an approved date.");
  }
  const date = new Date(official || scheduledAt);
  if (!Number.isFinite(date.getTime())) throw workflowError("A valid scheduled date and time is required.", 400);
  if (purpose === "prebid" && date >= new Date(rfq.closingDate)) throw workflowError("The pre-bid conference must be scheduled before the bid submission deadline.", 400);
  if (purpose === "opening" && date <= new Date(rfq.closingDate)) throw workflowError("Bid opening must be scheduled after the bid submission deadline.", 400);
  return { purpose, scheduledAt: date };
};

export const conferenceDisplayDate = (session) => {
  // Preserve completed meeting records; future meetings reference the approved schedule.
  if (["completed", "cancelled"].includes(session.status)) return session.scheduledAt;
  return (session.purpose === "prebid" ? session.rfq?.prebidAt : session.purpose === "opening" ? session.rfq?.openingDate : null) ?? session.scheduledAt;
};
