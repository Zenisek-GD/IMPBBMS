import { Announcement } from './announcementModel.js';
import { Rfq } from './biddingModel.js';
// Register after both models initialize: Rfq -> Vendor -> Announcement is an
// existing dependency chain, so Announcement must not import Rfq itself.
if (!Announcement.associations.officialProcurement) Announcement.belongsTo(Rfq, { as: 'officialProcurement', foreignKey: 'rfqId', constraints: false });
