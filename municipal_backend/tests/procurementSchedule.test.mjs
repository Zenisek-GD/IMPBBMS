import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSchedule, scheduleValidationError, amendmentStageError, changedScheduleFields, scheduleSnapshot, announcementFromOfficialSchedule } from '../services/procurementSchedulePolicy.js';
const base = { closingDate: '2031-06-20T01:00:00Z', openingDate: '2031-06-20T02:00:00Z', prebidRequired: false };

test('optional pre-bid has no required schedule; applicable conferences need date, venue and strict ordering', () => {
  assert.equal(normalizeSchedule(base).prebidAt, null);
  assert.throws(() => normalizeSchedule({ ...base, prebidRequired: true }), /date, time, and venue/);
  assert.throws(() => normalizeSchedule(base, { mandatoryPrebid: true }), /configured procurement rules/);
  assert.throws(() => normalizeSchedule({ ...base, prebidRequired: 'false' }), /Yes or No/);
  for (const prebidAt of [base.closingDate, base.openingDate]) assert.throws(() => normalizeSchedule({ ...base, prebidRequired: true, prebidAt, prebidVenue: 'Municipal Hall' }), /before the bid submission deadline/);
  assert.equal(normalizeSchedule({ ...base, prebidRequired: true, prebidAt: '2031-06-10T01:00:00Z', prebidVenue: 'Municipal Hall' }).prebidVenue, 'Municipal Hall');
});

test('all milestones are validated even across missing optional dates and publication overlaps a pre-bid', () => {
  assert.equal(scheduleValidationError({ ...base, openingDate: base.closingDate }), null);
  assert.match(scheduleValidationError({ ...base, openingDate: '2031-06-20T00:59:00Z' }), /before the bid submission deadline/);
  assert.throws(() => normalizeSchedule({ ...base, evaluationEndAt: '2031-06-19T00:00:00Z' }), /Evaluation end cannot occur before bid opening/);
  assert.throws(() => normalizeSchedule({ ...base, expectedAwardAt: 'invalid' }), /valid date/);
  assert.throws(() => normalizeSchedule({ ...base, publicationStartAt: '2031-06-12T00:00:00Z', prebidRequired: true, prebidAt: '2031-06-10T01:00:00Z', prebidVenue: 'Hall' }), /before publication starts/);
  assert.equal(scheduleValidationError({ ...base, publicationStartAt: '2031-06-01', publicationEndAt: '2031-06-19', prebidRequired: true, prebidAt: '2031-06-10', prebidVenue: 'Hall' }), null);
});

test('applicable milestones can share one calendar day with optional dates omitted', () => {
  const schedule = normalizeSchedule({
    ...base,
    prebidVenue: 'N/A',
    evaluationStartAt: '2031-06-20T03:15:00Z',
    postQualificationStartAt: '2031-06-20T05:40:00Z',
    expectedAwardAt: '2031-06-20T07:10:00Z',
  });
  assert.equal(schedule.prebidAt, null);
  assert.equal(schedule.prebidVenue, null);
  assert.equal(schedule.evaluationEndAt, null);
  assert.equal(scheduleValidationError(schedule), null);
});

test('official sequence cannot be reopened, backdated to completed stages, or overwritten after completion', () => {
  assert.match(amendmentStageError({ ...base, status: 'closed' }, ['closingDate']), /Submission has closed/);
  assert.match(amendmentStageError({ ...base, status: 'opened' }, ['openingDate']), /already been opened/);
  assert.match(amendmentStageError({ ...base, status: 'failed' }, ['expectedAwardAt']), /Completed procurement/);
  assert.match(amendmentStageError({ ...base, status: 'published' }, ['publicationStartAt']), /historical start date/);
  assert.equal(amendmentStageError({ ...base, status: 'closed' }, ['openingDate']), null);
  assert.equal(amendmentStageError({ ...base, status: 'closed', prebidVenue: null }, ['prebidVenue']), null, 'missing legacy venue may be documented through approved amendment');
  assert.match(amendmentStageError({ ...base, status: 'closed', prebidVenue: 'Original Hall' }, ['prebidVenue']), /Submission has closed/);
  assert.deepEqual(changedScheduleFields(base, { ...base, openingDate: '2031-06-21T02:00:00Z' }), ['openingDate']);
  assert.equal(scheduleSnapshot(base).openingDate, '2031-06-20T02:00:00.000Z');
});

test('live announcement projections use the authoritative schedule while archives preserve prior public dates', () => {
  const notice = { status: 'published', bidOpeningAt: 'old date', officialProcurement: { ...base, status: 'published', referenceNo: 'ITB-1', abc: 1000 } };
  assert.equal(announcementFromOfficialSchedule(notice).bidOpeningAt, base.openingDate);
  assert.equal(announcementFromOfficialSchedule({ ...notice, status: 'archived' }).bidOpeningAt, 'old date');
});
