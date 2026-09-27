// An SVP quotation becomes available to reviewers only after the official
// deadline and scheduled opening, with an opening record in the audit trail.
export const svpQuotationsDisclosable = (rfq, opening) => {
  if (!opening || !rfq.openingDate || !["opened", "evaluated", "awarded", "cancelled", "failed"].includes(rfq.status)) return false;
  const closingAt = new Date(rfq.closingDate).getTime();
  const scheduledOpeningAt = new Date(rfq.openingDate).getTime();
  const recordedOpeningAt = new Date(opening.openedAt).getTime();
  const now = Date.now();
  return [closingAt, scheduledOpeningAt, recordedOpeningAt].every(Number.isFinite) &&
    recordedOpeningAt > closingAt && recordedOpeningAt >= scheduledOpeningAt && now >= recordedOpeningAt;
};
