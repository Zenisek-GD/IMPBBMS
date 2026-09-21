import { randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import { Rfq, Bid } from '../models/biddingModel.js';
import { ScheduleAmendment } from '../models/scheduleAmendmentModel.js';
import { Document, DOCUMENT_METADATA_ATTRIBUTES } from '../models/documentModel.js';
import { ProcurementAttempt } from '../models/procurementAttemptModel.js';
import { ProcurementMode } from '../models/procurementModeModel.js';
import { User } from '../models/userModel.js';
import { LiveConferenceSession } from '../models/liveConferenceModel.js';
import { withAuditTransaction } from '../services/auditLog.js';
import { actorAudit, workflowError } from '../services/workflowSupport.js';
import { getLguProfile } from '../models/systemSettingModel.js';
import { requiresPrebidConference, minimumPostingDays } from '../services/procurementThresholds.js';
import { readProcurementSchedule, synchronizeSchedule } from '../services/procurementSchedule.js';
import { scheduleSnapshot, scheduleIsLocked, changedScheduleFields, amendmentStageError } from '../services/procurementSchedulePolicy.js';

const includes = [{ model: User, as: 'requestedBy', attributes: ['id', 'name'] }, { model: User, as: 'approvedBy', attributes: ['id', 'name'] }, { model: Document, as: 'supportingDocument', attributes: DOCUMENT_METADATA_ATTRIBUTES }];
const rfqFor = async (id, transaction) => {
  const rfq = await Rfq.findByPk(id, { include: [{ model: ProcurementMode, as: 'mode' }], transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) });
  if (!rfq) throw workflowError('Procurement not found.', 404);
  return rfq;
};
const identity = async (rfq, transaction) => {
  const attempt = await ProcurementAttempt.findOne({ where: { rfqId: rfq.id }, transaction });
  return { rfqId: rfq.id, attemptId: attempt?.id, attemptNumber: attempt?.attemptNumber };
};
const approvedOfficer = (req) => {
  if (!req.permissions?.has('bidding.chairEvaluation') || !['bacChairperson', 'bacViceChairperson'].includes(req.currentUser?.Role?.key)) throw workflowError('Only the authorized BAC Chairperson or Vice-Chairperson may approve a procurement schedule.', 403);
};
const normalize = async (payload, rfq) => readProcurementSchedule(payload, { base: rfq, mandatoryPrebid: requiresPrebidConference(Number(rfq.abc), await getLguProfile(), rfq.category) });

export const getSchedule = async (req, res) => {
  const rfq = await rfqFor(req.params.id);
  const amendments = await ScheduleAmendment.findAll({ where: { rfqId: rfq.id }, include: includes, order: [['requestedAt', 'DESC']] });
  res.json({ rfqId: rfq.id, ...scheduleSnapshot(rfq), status: rfq.status, locked: scheduleIsLocked(rfq), approvedAt: rfq.scheduleApprovedAt, approvedById: rfq.scheduleApprovedById, preparedById: rfq.schedulePreparedById, publishedAt: rfq.schedulePublishedAt, amendments });
};

export const approveSchedule = async (req, res) => {
  approvedOfficer(req);
  await withAuditTransaction(async (transaction, audit) => {
    const rfq = await rfqFor(req.params.id, transaction);
    if (scheduleIsLocked(rfq)) throw workflowError('The schedule has been officially communicated. Request a schedule amendment.');
    if (rfq.scheduleApprovedAt) throw workflowError('This schedule is already approved.');
    if (Number(rfq.schedulePreparedById) === req.currentUser.id) throw workflowError('Another authorized BAC officer must approve the schedule you prepared.');
    await normalize({}, rfq);
    await rfq.update({ scheduleApprovedAt: new Date(), scheduleApprovedById: req.currentUser.id }, { transaction });
    await audit(actorAudit(req, { actionType: 'rfq.scheduleApproved', entityRef: 'rfq', entityId: rfq.id, summary: 'Procurement schedule approved for publication.', afterState: { ...await identity(rfq, transaction), schedule: scheduleSnapshot(rfq), approvedById: req.currentUser.id } }));
  });
  res.json({ message: 'The procurement schedule was approved. Complete the evaluation criteria approval, when applicable, before publishing.' });
};

const validateAmendment = async (rfq, amendment, transaction) => {
  if (JSON.stringify(scheduleSnapshot(rfq)) !== JSON.stringify(scheduleSnapshot(amendment.previousSchedule))) throw workflowError('The official schedule changed after this amendment was prepared. Create a new amendment against the current dates.');
  const values = await normalize(amendment.proposedSchedule, rfq);
  const issue = amendmentStageError(rfq, amendment.changedFields);
  if (issue) throw workflowError(issue);
  if (amendment.changedFields.includes('closingDate')) {
    if (new Date(values.closingDate) <= new Date()) throw workflowError('The new bid submission deadline must be in the future.');
    if (await Bid.findOne({ where: { rfqId: rfq.id, submittedAt: { [Op.gte]: new Date(values.closingDate) } }, transaction })) throw workflowError('The new deadline would invalidate an already accepted bid.');
    if (rfq.publishDate) {
      const earliestClose = new Date(rfq.publishDate);
      earliestClose.setDate(earliestClose.getDate() + minimumPostingDays(rfq));
      if (new Date(values.closingDate) < earliestClose) throw workflowError('The revised submission deadline would violate the required minimum posting period.');
    }
  }
  for (const field of ['prebidAt', 'openingDate', 'evaluationStartAt', 'evaluationEndAt', 'postQualificationStartAt', 'postQualificationEndAt', 'expectedAwardAt']) {
    if (amendment.changedFields.includes(field) && values[field] && new Date(values[field]) <= new Date()) throw workflowError('A revised procurement stage must be scheduled in the future; an amendment cannot backdate a stage.');
  }
  // An explicit approved evidence-backed amendment may fill a missing legacy
  // venue; existing dates and already-recorded venue information remain locked.
  if (amendment.changedFields.some((key) => ['prebidAt', 'prebidRequired'].includes(key) || (key === 'prebidVenue' && rfq.prebidVenue)) && await LiveConferenceSession.findOne({ where: { rfqId: rfq.id, purpose: 'prebid', status: { [Op.in]: ['inProgress', 'completed'] } }, transaction })) throw workflowError('A pre-bid conference already started or completed; its official schedule cannot be changed.');
  if (!Number.isSafeInteger(amendment.supportingDocumentId) || amendment.supportingDocumentId <= 0) throw workflowError('Attach a supporting document belonging to this procurement attempt.', 400);
  const doc = await Document.findOne({ where: { id: amendment.supportingDocumentId, entityRef: 'rfq', entityId: rfq.id }, attributes: ['id'], transaction });
  if (!doc) throw workflowError('Attach a supporting document belonging to this procurement attempt.', 400);
  return values;
};

export const requestScheduleAmendment = async (req, res) => {
  const result = await withAuditTransaction(async (transaction, audit) => {
    const rfq = await rfqFor(req.params.id, transaction);
    if (!scheduleIsLocked(rfq)) throw workflowError('This schedule has not been published. Update the draft schedule instead.');
    const reason = String(req.body.reason ?? '').trim();
    if (!reason) throw workflowError('A reason for the schedule amendment is required.', 400);
    const proposedSchedule = await normalize(req.body.schedule ?? {}, rfq);
    const changedFields = changedScheduleFields(rfq, proposedSchedule);
    if (!changedFields.length) throw workflowError('Change at least one schedule field before requesting an amendment.', 400);
    const values = { rfqId: rfq.id, referenceNo: `SA-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`, previousSchedule: scheduleSnapshot(rfq), proposedSchedule, changedFields, reason, supportingDocumentId: Number(req.body.supportingDocumentId), requestedById: req.currentUser.id, requestedAt: new Date(), status: 'draft' };
    await validateAmendment(rfq, values, transaction);
    const amendment = await ScheduleAmendment.create(values, { transaction });
    await audit(actorAudit(req, { actionType: 'rfq.scheduleAmendmentRequested', entityRef: 'rfq', entityId: rfq.id, summary: `${amendment.referenceNo}: schedule amendment prepared. Submit it for BAC approval.`, beforeState: amendment.previousSchedule, afterState: { ...await identity(rfq, transaction), amendmentId: amendment.id, proposedSchedule, reason, supportingDocumentId: amendment.supportingDocumentId } }));
    return amendment;
  });
  res.status(201).json({ ...result.get({ plain: true }), message: 'Schedule amendment draft prepared. Submit it for BAC review; the official dates remain in force until approval.' });
};

export const submitScheduleAmendment = async (req, res) => {
  await withAuditTransaction(async (transaction, audit) => {
    const rfq = await rfqFor(req.params.id, transaction);
    const amendment = await ScheduleAmendment.findOne({ where: { id: req.params.amendmentId, rfqId: rfq.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!amendment || amendment.status !== 'draft') throw workflowError('Only a draft schedule amendment can be submitted.');
    await validateAmendment(rfq, amendment, transaction);
    await amendment.update({ status: 'submitted', submittedAt: new Date() }, { transaction });
    await audit(actorAudit(req, { actionType: 'rfq.scheduleAmendmentSubmitted', entityRef: 'rfq', entityId: rfq.id, summary: `${amendment.referenceNo}: submitted for BAC schedule approval.`, afterState: { ...await identity(rfq, transaction), amendmentId: amendment.id, status: amendment.status } }));
  });
  res.json({ message: 'The amendment was submitted for BAC review. Official dates will change only after approval.' });
};

export const decideScheduleAmendment = async (req, res) => {
  approvedOfficer(req);
  if (!['approve', 'reject'].includes(req.body.decision)) throw workflowError('Choose approve or reject.', 400);
  await withAuditTransaction(async (transaction, audit) => {
    const rfq = await rfqFor(req.params.id, transaction);
    const amendment = await ScheduleAmendment.findOne({ where: { id: req.params.amendmentId, rfqId: rfq.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!amendment || amendment.status !== 'submitted') throw workflowError('Only an amendment submitted for review can be decided.');
    if (amendment.requestedById === req.currentUser.id) throw workflowError('Another authorized BAC officer must review the amendment you requested.');
    const remarks = String(req.body.remarks ?? '').trim();
    if (req.body.decision === 'reject' && !remarks) throw workflowError('Explain why the schedule amendment was rejected.', 400);
    const afterState = { ...await identity(rfq, transaction), amendmentId: amendment.id, referenceNo: amendment.referenceNo, reason: amendment.reason, supportingDocumentId: amendment.supportingDocumentId, approvedById: req.currentUser.id };
    if (req.body.decision === 'approve') {
      const schedule = await validateAmendment(rfq, amendment, transaction);
      const now = new Date();
      await audit(actorAudit(req, { actionType: 'rfq.scheduleAmendmentApproved', entityRef: 'rfq', entityId: rfq.id, summary: `${amendment.referenceNo}: schedule amendment approved.`, beforeState: amendment.previousSchedule, afterState: { ...afterState, schedule } }));
      await rfq.update({ ...schedule, scheduleApprovedAt: now, scheduleApprovedById: req.currentUser.id }, { transaction });
      await synchronizeSchedule(rfq, { transaction });
      await amendment.update({ status: 'applied', approvedById: req.currentUser.id, approvedAt: now, appliedAt: now, reviewedAt: now, decisionRemarks: remarks || null }, { transaction });
      await audit(actorAudit(req, { actionType: 'rfq.scheduleAmendmentApplied', entityRef: 'rfq', entityId: rfq.id, summary: `${amendment.referenceNo}: official dates and public announcements updated.`, beforeState: amendment.previousSchedule, afterState: { ...afterState, schedule } }));
    } else {
      await amendment.update({ status: 'rejected', approvedById: req.currentUser.id, reviewedAt: new Date(), decisionRemarks: remarks }, { transaction });
      await audit(actorAudit(req, { actionType: 'rfq.scheduleAmendmentRejected', entityRef: 'rfq', entityId: rfq.id, summary: `${amendment.referenceNo}: amendment rejected.`, afterState: { ...afterState, remarks } }));
    }
  });
  res.json({ message: req.body.decision === 'approve' ? 'The schedule amendment was approved. Related procurement dates and public information have been updated.' : 'The amendment was rejected. The official procurement schedule remains in force.' });
};
