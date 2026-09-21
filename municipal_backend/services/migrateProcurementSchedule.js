import { sequelize } from '../models/db.js';
import { Rfq } from '../models/biddingModel.js';
import { ScheduleAmendment } from '../models/scheduleAmendmentModel.js';
export const migrateProcurementSchedule = async () => {
  const qi = sequelize.getQueryInterface();
  const columns = await qi.describeTable(Rfq.getTableName());
  const fields = ['procurementStartAt', 'publicationStartAt', 'publicationEndAt', 'evaluationStartAt', 'evaluationEndAt', 'postQualificationStartAt', 'postQualificationEndAt', 'expectedAwardAt', 'prebidVenue', 'prebidRemarks', 'scheduleApprovedAt', 'scheduleApprovedById', 'schedulePreparedById', 'schedulePublishedAt'];
  const added = [];
  for (const field of fields) {
    if (columns[field]) continue;
    await qi.addColumn(Rfq.getTableName(), field, Rfq.getAttributes()[field]);
    added.push(`rfqs.${field}`);
  }
  await ScheduleAmendment.sync();
  // Existing published dates remain protected by status. Never fabricate an
  // approval, date, venue, or amendment for historical procurement records.
  return { added };
};
