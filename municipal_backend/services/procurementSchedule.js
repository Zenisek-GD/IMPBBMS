import { Op } from 'sequelize';
import { Announcement } from '../models/announcementModel.js';
import { LiveConferenceSession } from '../models/liveConferenceModel.js';
import { workflowError } from './workflowSupport.js';
import { normalizeSchedule, announcementSchedule, scheduleValidationError } from './procurementSchedulePolicy.js';

export const readProcurementSchedule = (payload, options) => {
  try { return normalizeSchedule(payload, options); } catch (error) { throw workflowError(error.message, 400); }
};

export const assertApprovedSchedule = (rfq) => {
  const issue = scheduleValidationError(rfq);
  if (issue) throw workflowError(issue, 400);
  if (!rfq.scheduleApprovedAt) throw workflowError('The procurement schedule requires approval before publication. Open Schedule / Criteria and obtain schedule approval.');
};

export const synchronizeSchedule = async (rfq, { transaction } = {}) => {
  // These are compatibility projections for existing public readers. Mutation
  // and projections commit together; withdrawn notices retain their old dates.
  await Announcement.update(announcementSchedule(rfq), { where: { rfqId: rfq.id, status: { [Op.ne]: 'archived' } }, transaction });
  await LiveConferenceSession.update(rfq.prebidRequired ? { scheduledAt: rfq.prebidAt } : { status: 'cancelled' }, { where: { rfqId: rfq.id, purpose: 'prebid', status: 'scheduled' }, transaction });
  await LiveConferenceSession.update({ scheduledAt: rfq.openingDate }, { where: { rfqId: rfq.id, purpose: 'opening', status: 'scheduled' }, transaction });
};
