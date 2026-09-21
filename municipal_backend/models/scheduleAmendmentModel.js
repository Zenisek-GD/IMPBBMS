import { DataTypes } from 'sequelize';
import { sequelize } from './db.js';
import { Rfq } from './biddingModel.js';
import { User } from './userModel.js';
import { Document } from './documentModel.js';

export const ScheduleAmendment = sequelize.define('ScheduleAmendment', {
  referenceNo: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  status: { type: DataTypes.ENUM('draft', 'submitted', 'applied', 'rejected'), allowNull: false, defaultValue: 'draft' },
  previousSchedule: { type: DataTypes.JSON, allowNull: false },
  proposedSchedule: { type: DataTypes.JSON, allowNull: false },
  changedFields: { type: DataTypes.JSON, allowNull: false },
  reason: { type: DataTypes.TEXT, allowNull: false },
  requestedAt: { type: DataTypes.DATE, allowNull: false },
  submittedAt: { type: DataTypes.DATE, allowNull: true },
  approvedAt: { type: DataTypes.DATE, allowNull: true },
  appliedAt: { type: DataTypes.DATE, allowNull: true },
  decisionRemarks: { type: DataTypes.TEXT, allowNull: true },
  reviewedAt: { type: DataTypes.DATE, allowNull: true },
}, { indexes: [{ fields: ['rfqId', 'status'] }] });
ScheduleAmendment.belongsTo(Rfq, { as: 'rfq', foreignKey: { name: 'rfqId', allowNull: false }, onDelete: 'RESTRICT' });
ScheduleAmendment.belongsTo(User, { as: 'requestedBy', foreignKey: { name: 'requestedById', allowNull: false }, onDelete: 'RESTRICT' });
ScheduleAmendment.belongsTo(User, { as: 'approvedBy', foreignKey: 'approvedById', onDelete: 'RESTRICT' });
ScheduleAmendment.belongsTo(Document, { as: 'supportingDocument', foreignKey: { name: 'supportingDocumentId', allowNull: false }, onDelete: 'RESTRICT' });
