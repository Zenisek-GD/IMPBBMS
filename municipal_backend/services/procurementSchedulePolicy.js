// The RFQ is the authoritative schedule for one procurement attempt. Other
// modules receive a projection; they never accept independent bidding dates.
export const SCHEDULE_DATES = ['procurementStartAt', 'publicationStartAt', 'publicationEndAt', 'prebidAt', 'closingDate', 'openingDate', 'evaluationStartAt', 'evaluationEndAt', 'postQualificationStartAt', 'postQualificationEndAt', 'expectedAwardAt'];
export const SCHEDULE_FIELDS = [...SCHEDULE_DATES, 'prebidRequired', 'prebidVenue', 'prebidRemarks'];
export const SCHEDULE_LABELS = { procurementStartAt: 'Procurement start', publicationStartAt: 'Publication start', publicationEndAt: 'Publication end', prebidAt: 'Pre-bid conference', closingDate: 'Bid submission deadline', openingDate: 'Bid opening', evaluationStartAt: 'Evaluation start', evaluationEndAt: 'Evaluation end', postQualificationStartAt: 'Post-qualification start', postQualificationEndAt: 'Post-qualification end', expectedAwardAt: 'Expected award' };

export const scheduleSnapshot = (row) => Object.fromEntries(SCHEDULE_FIELDS.map((key) => [key, SCHEDULE_DATES.includes(key) ? (row[key] ? new Date(row[key]).toISOString() : null) : row[key] ?? (key === 'prebidRequired' ? false : null)]));

export const scheduleValidationError = (row) => {
  for (const key of SCHEDULE_DATES) if (row[key] && Number.isNaN(new Date(row[key]).getTime())) return `${SCHEDULE_LABELS[key]} must be a valid date and time.`;
  if (!row.closingDate || !row.openingDate) return 'A bid submission deadline and bid opening date and time are required.';
  if (row.prebidRequired && (!row.prebidAt || !String(row.prebidVenue ?? '').trim())) return 'A required pre-bid conference needs a date, time, and venue or online meeting details.';
  if (row.prebidAt && new Date(row.prebidAt) >= new Date(row.closingDate)) return 'The pre-bid conference must be scheduled before the bid submission deadline.';
  if (new Date(row.openingDate) <= new Date(row.closingDate)) return 'The new bid opening date cannot be applied because it is not after the bid submission deadline.';
  const ordered = SCHEDULE_DATES.filter((key) => key !== 'prebidAt' && row[key]);
  for (let i = 1; i < ordered.length; i += 1) {
    const previous = ordered[i - 1]; const next = ordered[i];
    if (new Date(row[next]) < new Date(row[previous])) return `${SCHEDULE_LABELS[next]} cannot occur before ${SCHEDULE_LABELS[previous].toLowerCase()}.`;
  }
  if (row.publicationEndAt && new Date(row.publicationEndAt) > new Date(row.closingDate)) return 'Publication end cannot occur after the bid submission deadline.';
  if (row.prebidAt && row.publicationStartAt && new Date(row.prebidAt) < new Date(row.publicationStartAt)) return 'The pre-bid conference cannot occur before publication starts.';
  if (row.prebidAt && row.procurementStartAt && new Date(row.prebidAt) < new Date(row.procurementStartAt)) return 'The pre-bid conference cannot occur before procurement starts.';
  return null;
};

export const normalizeSchedule = (payload, { base = {}, mandatoryPrebid = false } = {}) => {
  if (Object.hasOwn(payload, 'prebidRequired') && typeof payload.prebidRequired !== 'boolean') throw new Error('Choose Yes or No for whether a pre-bid conference is required.');
  if (mandatoryPrebid && payload.prebidRequired === false) throw new Error('The configured procurement rules require a pre-bid conference for this procurement.');
  const row = Object.fromEntries(SCHEDULE_FIELDS.map((key) => [key, Object.hasOwn(payload, key) ? payload[key] : base[key] ?? null]));
  row.prebidRequired = mandatoryPrebid || Boolean(row.prebidRequired);
  for (const key of SCHEDULE_DATES) {
    if (!row[key]) { row[key] = null; continue; }
    const value = new Date(row[key]);
    if (Number.isNaN(value.getTime())) throw new Error(`${SCHEDULE_LABELS[key]} must be a valid date and time.`);
    row[key] = value.toISOString();
  }
  for (const key of ['prebidVenue', 'prebidRemarks']) row[key] = String(row[key] ?? '').trim() || null;
  if (!row.prebidRequired) { row.prebidAt = null; row.prebidVenue = null; row.prebidRemarks = null; }
  const issue = scheduleValidationError(row);
  if (issue) throw new Error(issue);
  return row;
};

export const changedScheduleFields = (before, after) => SCHEDULE_FIELDS.filter((key) => scheduleSnapshot(before)[key] !== scheduleSnapshot(after)[key]);
export const scheduleIsLocked = (rfq) => rfq.status !== 'draft' || Boolean(rfq.schedulePublishedAt);
export const amendmentStageError = (rfq, changes, now = new Date()) => {
  if (['failed', 'awarded', 'cancelled'].includes(rfq.status)) return 'Completed procurement attempts retain their official schedule and cannot be amended.';
  if (rfq.status !== 'draft' && changes.some((key) => ['procurementStartAt', 'publicationStartAt'].includes(key))) return 'Publication has begun; its historical start date cannot be changed.';
  if (['closed', 'opened', 'evaluated'].includes(rfq.status) && changes.some((key) => ['closingDate', 'prebidAt', 'prebidRequired'].includes(key) || (key === 'prebidVenue' && rfq.prebidVenue))) return 'Submission has closed; its deadline and pre-bid conference can no longer be amended.';
  if (['opened', 'evaluated'].includes(rfq.status) && changes.includes('openingDate')) return 'Bids have already been opened; the official opening schedule can no longer be amended.';
  if (rfq.status === 'published' && changes.includes('closingDate') && new Date(rfq.closingDate) <= now) return 'The submission deadline has passed. An amendment cannot reopen bid submission.';
  return null;
};

export const announcementSchedule = (rfq) => ({ referenceNo: rfq.referenceNo, abc: Number(rfq.abc), prebidAt: rfq.prebidRequired ? rfq.prebidAt : null, submissionDeadline: rfq.closingDate, bidOpeningAt: rfq.openingDate });

export const announcementFromOfficialSchedule = (notice) => {
  const rfq = notice.officialProcurement;
  if (!rfq || notice.status === 'archived' || (notice.status === 'published' && rfq.status === 'draft')) return notice;
  return { ...(typeof notice.get === 'function' ? notice.get({ plain: true }) : notice), ...announcementSchedule(rfq), procurementType: rfq.category, prebidRequired: rfq.prebidRequired, prebidVenue: rfq.prebidRequired ? rfq.prebidVenue : null, publicationDate: rfq.publicationStartAt ?? rfq.publishDate };
};
