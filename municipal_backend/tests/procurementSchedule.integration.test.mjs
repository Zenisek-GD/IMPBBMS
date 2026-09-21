import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';

test('schedule approval, immutable publication, amendment review, propagation and audit rollback in isolated MySQL', { skip: process.env.RUN_PROCUREMENT_DB_TESTS !== '1', timeout: 180000 }, async (t) => {
  const scratch = `impbbms_schedule_test_${crypto.randomBytes(8).toString('hex')}`;
  const port = Number(process.env.PROCUREMENT_TEST_DB_PORT ?? 33317);
  Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: scratch, DB_USER: 'root', DB_PASSWORD: '', NODE_ENV: 'test' });
  const admin = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: '' });
  assert.match(scratch, /^impbbms_schedule_test_[a-f0-9]{16}$/);
  await admin.query(`CREATE DATABASE \`${scratch}\``);
  const m = await import('../models/index.js');
  t.after(async () => { await m.sequelize.close(); assert.match(scratch, /^impbbms_schedule_test_[a-f0-9]{16}$/); await admin.query(`DROP DATABASE \`${scratch}\``); await admin.end(); });
  await m.sequelize.sync();
  const schedule = await import('../controllers/procurementScheduleController.js');
  const bidding = await import('../controllers/biddingController.js');
  const notices = await import('../controllers/announcementController.js');
  const { releaseScheduledAnnouncements } = await import('../models/announcementModel.js');
  const { migrateProcurementSchedule } = await import('../services/migrateProcurementSchedule.js');
  const { verifyChain } = await import('../services/auditLog.js');
  const actors = {};
  for (const key of ['bacSecretariat', 'bacChairperson', 'bacViceChairperson']) {
    const role = await m.Role.create({ key, name: key });
    const user = await m.User.create({ name: key, email: `${key}@example.test`, password: 'ExamplePassword123!', roleId: role.id, status: 'active' });
    user.Role = role; actors[key] = user;
  }
  const secretary = actors.bacSecretariat, chair = actors.bacChairperson;
  const call = async (handler, actor, params = {}, body = {}) => {
    let output;
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { output = value; return this; } };
    await handler({ currentUser: actor, permissions: new Set(actor === secretary ? ['bidding.publish', 'announcements.manage'] : ['bidding.chairEvaluation', 'bidding.view']), params, body, query: {}, ip: '127.0.0.1' }, res);
    return { status: res.statusCode, body: output };
  };
  const mode = await m.ProcurementMode.create({ key: 'competitiveBidding', name: 'Competitive Bidding', minimumOffers: 2 });
  const rfq = await m.Rfq.create({ referenceNo: 'ITB-SCHEDULE-1', title: 'Official Schedule', category: 'goods', abc: 1000, closingDate: '2031-06-20T01:00:00Z', openingDate: '2031-06-20T02:00:00Z', prebidRequired: true, prebidAt: '2031-06-10T01:00:00Z', prebidVenue: 'Municipal Hall', status: 'draft', schedulePreparedById: secretary.id, procurementModeId: mode.id });
  await m.ProcurementAttempt.create({ rfqId: rfq.id, projectKey: `rfq:${rfq.id}`, attemptNumber: 1, status: 'ongoing', startedAt: new Date() });
  const doc = await m.Document.create({ filename: 'Amendment.pdf', mimeType: 'application/pdf', sizeBytes: 4, content: Buffer.from('%PDF'), checksum: 'a'.repeat(64), entityRef: 'rfq', entityId: rfq.id, uploadedAt: new Date(), uploadedById: secretary.id });

  await t.test('normal RFQ creation saves one complete authoritative schedule', async () => {
    const pr = await m.PrHeader.create({ prNumber: 'PR-SCHEDULE-NEW', dateRequired: '2031-07-01', status: 'approved', totalAmount: 1000, procurementModeId: mode.id });
    const result = await call(bidding.createRfq, secretary, {}, { prHeaderId: pr.id, title: 'New scheduled procurement', category: 'goods', closingDate: '2031-07-01T01:00:00Z', openingDate: '2031-07-01T02:00:00Z', prebidRequired: true, prebidAt: '2031-06-21T01:00:00Z', prebidVenue: 'Online conference', evaluationEndAt: '2031-07-10T01:00:00Z' });
    assert.equal(result.status, 201);
    const created = await m.Rfq.findByPk(result.body.id);
    assert.equal(created.prebidVenue, 'Online conference');
    assert.equal(created.evaluationEndAt.toISOString(), '2031-07-10T01:00:00.000Z');
    assert.equal(created.schedulePreparedById, secretary.id);
    assert.equal(created.scheduleApprovedAt, null);
  });

  await t.test('approval and publication are separate, audit-backed actions', async () => {
    await assert.rejects(call(bidding.publishRfq, secretary, { id: rfq.id }), /requires approval/);
    await assert.rejects(call(schedule.approveSchedule, secretary, { id: rfq.id }), /Only the authorized BAC/);
    await call(schedule.approveSchedule, chair, { id: rfq.id });
    await call(bidding.updateRfqSchedule, secretary, { id: rfq.id }, { openingDate: '2031-06-20T03:00:00Z' });
    assert.equal((await rfq.reload()).scheduleApprovedAt, null, 'draft changes invalidate prior approval');
    await call(schedule.approveSchedule, chair, { id: rfq.id });
    await call(bidding.publishRfq, secretary, { id: rfq.id });
    assert.equal((await rfq.reload()).status, 'published');
    await assert.rejects(call(bidding.updateRfqSchedule, secretary, { id: rfq.id }, { openingDate: '2031-06-21T03:00:00Z' }), /cannot be directly edited/);
    assert.equal(await m.AuditLog.count({ where: { actionType: 'rfq.published' } }), 1);
  });

  let announcement;
  await t.test('public notices use approved dates and cannot be detached or given conflicting dates', async () => {
    const result = await call(notices.createAnnouncement, secretary, {}, { title: 'Official invitation', body: 'Review the official schedule below.', category: 'procurementOpportunity', rfqId: rfq.id });
    announcement = await m.Announcement.findByPk(result.body.id);
    assert.equal(announcement.bidOpeningAt.toISOString(), rfq.openingDate.toISOString());
    await assert.rejects(call(notices.updateAnnouncement, secretary, { id: announcement.id }, { bidOpeningAt: '2031-06-21T03:00:00Z' }), /must match the official/);
    await assert.rejects(call(notices.updateAnnouncement, secretary, { id: announcement.id }, { rfqId: null }), /cannot be detached/);
    await call(notices.publishAnnouncement, secretary, { id: announcement.id });
    const draft = await m.Announcement.create({ title: 'Unlinked draft', body: 'Draft', category: 'procurementOpportunity', publishAt: new Date(Date.now() - 1000), status: 'draft' });
    assert.equal((await releaseScheduledAnnouncements()).length, 0);
    assert.equal((await draft.reload()).status, 'draft');
  });

  await t.test('announcement categories cannot bypass the official bidding schedule on direct or scheduled publication', async () => {
    for (const category of ['general', 'newProject', 'systemUpdate']) {
      for (const field of ['bidOpeningAt', 'submissionDeadline', 'prebidAt']) {
        await assert.rejects(call(notices.createAnnouncement, secretary, {}, { title: 'Unlinked bidding notice', body: 'Official dates required.', category, [field]: '2031-06-25T01:00:00Z' }), /Link this procurement announcement/);
      }
    }
    // Legacy rows can predate the guard. Neither publication endpoint may
    // expose their independent bidding dates, regardless of the category.
    const legacy = await m.Announcement.create({ title: 'Legacy general bidding notice', body: 'Needs a linked official schedule.', category: 'general', status: 'draft', bidOpeningAt: '2031-06-25T01:00:00Z', publishAt: new Date(Date.now() - 1000) });
    await assert.rejects(call(notices.publishAnnouncement, secretary, { id: legacy.id }), /Link this procurement announcement/);
    assert.equal((await legacy.reload()).status, 'draft');
    assert.equal((await releaseScheduledAnnouncements()).some((row) => row.id === legacy.id), false);
    assert.equal((await legacy.reload()).status, 'draft');
    const ordinary = await call(notices.createAnnouncement, secretary, {}, { title: 'Ordinary municipal notice', body: 'No procurement bidding dates.', category: 'general' });
    await call(notices.publishAnnouncement, secretary, { id: ordinary.body.id });
    assert.equal((await m.Announcement.findByPk(ordinary.body.id)).status, 'published', 'ordinary notices still publish without a procurement link');
  });

  await t.test('approval revalidates sequence and applies every projection atomically while retaining old dates', async () => {
    const conference = await m.LiveConferenceSession.create({ rfqId: rfq.id, title: 'Pre-bid', purpose: 'prebid', scheduledAt: rfq.prebidAt, status: 'scheduled' });
    await assert.rejects(call(schedule.requestScheduleAmendment, secretary, { id: rfq.id }, { schedule: { openingDate: rfq.closingDate }, reason: 'Move opening', supportingDocumentId: doc.id }), /not after the bid submission/);
    await assert.rejects(call(schedule.requestScheduleAmendment, secretary, { id: rfq.id }, { schedule: { openingDate: '2031-06-21T03:00:00Z' }, reason: 'Move opening' }), /supporting document/);
    const request = await call(schedule.requestScheduleAmendment, secretary, { id: rfq.id }, { schedule: { closingDate: '2031-06-22T01:00:00Z', openingDate: '2031-06-22T03:00:00Z', prebidAt: '2031-06-11T01:00:00Z' }, reason: 'Official schedule amendment', supportingDocumentId: doc.id });
    const amendmentId = request.body.id;
    await assert.rejects(call(schedule.decideScheduleAmendment, chair, { id: rfq.id, amendmentId }, { decision: 'approve' }), /submitted for review/);
    await call(schedule.submitScheduleAmendment, secretary, { id: rfq.id, amendmentId });
    await assert.rejects(call(schedule.decideScheduleAmendment, secretary, { id: rfq.id, amendmentId }, { decision: 'approve' }), /Only the authorized BAC/);
    const before = rfq.openingDate.toISOString();
    m.AuditLog.addHook('beforeCreate', 'rejectScheduleAudit', (event) => { if (event.actionType === 'rfq.scheduleAmendmentApplied') throw new Error('Schedule audit unavailable'); });
    await assert.rejects(call(schedule.decideScheduleAmendment, chair, { id: rfq.id, amendmentId }, { decision: 'approve' }), /Schedule audit unavailable/);
    m.AuditLog.removeHook('beforeCreate', 'rejectScheduleAudit');
    assert.equal((await rfq.reload()).openingDate.toISOString(), before);
    assert.equal((await announcement.reload()).bidOpeningAt.toISOString(), before);
    assert.equal((await m.ScheduleAmendment.findByPk(amendmentId)).status, 'submitted');
    await call(schedule.decideScheduleAmendment, chair, { id: rfq.id, amendmentId }, { decision: 'approve' });
    assert.equal((await rfq.reload()).openingDate.toISOString(), '2031-06-22T03:00:00.000Z');
    assert.equal((await announcement.reload()).bidOpeningAt.toISOString(), rfq.openingDate.toISOString());
    assert.equal((await conference.reload()).scheduledAt.toISOString(), rfq.prebidAt.toISOString());
    assert.equal((await m.ScheduleAmendment.findByPk(amendmentId)).previousSchedule.openingDate, before);
  });

  await t.test('stale amendments and completed stage changes cannot bypass the current official schedule', async () => {
    const make = async () => (await call(schedule.requestScheduleAmendment, secretary, { id: rfq.id }, { schedule: { openingDate: '2031-06-23T03:00:00Z' }, reason: 'Move opening', supportingDocumentId: doc.id })).body.id;
    const a = await make(), b = await make();
    for (const amendmentId of [a, b]) await call(schedule.submitScheduleAmendment, secretary, { id: rfq.id, amendmentId });
    await call(schedule.decideScheduleAmendment, chair, { id: rfq.id, amendmentId: a }, { decision: 'approve' });
    await assert.rejects(call(schedule.decideScheduleAmendment, chair, { id: rfq.id, amendmentId: b }, { decision: 'approve' }), /changed after this amendment/);
    await rfq.update({ status: 'closed' });
    await assert.rejects(call(schedule.requestScheduleAmendment, secretary, { id: rfq.id }, { schedule: { closingDate: '2031-06-23T01:00:00Z' }, reason: 'Reopen', supportingDocumentId: doc.id }), /Submission has closed/);
    await rfq.update({ status: 'opened' });
    await assert.rejects(call(schedule.requestScheduleAmendment, secretary, { id: rfq.id }, { schedule: { openingDate: '2031-06-24T03:00:00Z' }, reason: 'Change historical opening', supportingDocumentId: doc.id }), /already been opened/);
  });
  assert.deepEqual((await migrateProcurementSchedule()).added, []);
  assert.deepEqual((await migrateProcurementSchedule()).added, []);
  const chain = await verifyChain();
  assert.equal(chain.intact, true);
});
