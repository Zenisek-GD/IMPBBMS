import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";
import { Rfq } from "./biddingModel.js";

// Design doc Section 7.3: a scheduling and conferencing module attached to the
// Vendor Invitation / RFQ stage. Covers the meeting session, pre-bid conference
// scheduling, attendance tracking, and meeting logs archived against the
// procurement record.
//
// NOTE: this schedules and records conferences and captures attendance. It does
// not host video — `meetingUrl` points at whatever external platform the LGU
// uses. Building an actual video stack is well outside this system's scope.
export const LiveConferenceSession = sequelize.define("LiveConferenceSession", {
  title: { type: DataTypes.STRING, allowNull: false },
  purpose: {
    type: DataTypes.ENUM("prebid", "clarification", "opening", "other"),
    allowNull: false,
    defaultValue: "prebid",
  },
  scheduledAt: { type: DataTypes.DATE, allowNull: false },
  meetingUrl: { type: DataTypes.STRING, allowNull: true },

  status: {
    type: DataTypes.ENUM("scheduled", "inProgress", "completed", "cancelled"),
    allowNull: false,
    defaultValue: "scheduled",
  },
  minutes: { type: DataTypes.TEXT, allowNull: true },
  startedAt: { type: DataTypes.DATE, allowNull: true },
  endedAt: { type: DataTypes.DATE, allowNull: true },
});

LiveConferenceSession.belongsTo(Rfq, { as: "rfq", foreignKey: "rfqId" });
Rfq.hasMany(LiveConferenceSession, { as: "conferences", foreignKey: "rfqId" });
LiveConferenceSession.belongsTo(User, { as: "scheduledBy", foreignKey: "scheduledById" });

// Attendance is its own record so the log survives independently of the
// session and can be produced for audit.
export const ConferenceAttendance = sequelize.define("ConferenceAttendance", {
  joinedAt: { type: DataTypes.DATE, allowNull: false },
  // Free text so external attendees (COA, observers) can be logged without an
  // account, alongside `userId` for internal participants.
  attendeeName: { type: DataTypes.STRING, allowNull: false },
  organization: { type: DataTypes.STRING, allowNull: true },
});

ConferenceAttendance.belongsTo(LiveConferenceSession, {
  as: "session",
  foreignKey: "sessionId",
  onDelete: "CASCADE",
});
LiveConferenceSession.hasMany(ConferenceAttendance, { as: "attendance", foreignKey: "sessionId" });
ConferenceAttendance.belongsTo(User, { as: "user", foreignKey: "userId" });

export { sequelize };
