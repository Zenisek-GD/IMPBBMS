import { LiveConferenceSession, ConferenceAttendance } from "../models/liveConferenceModel.js";
import { Rfq } from "../models/biddingModel.js";
import { Vendor } from "../models/vendorModel.js";
import { User } from "../models/userModel.js";
import { notifyUsers, NOTIFICATION_EVENTS } from "../services/notifier.js";
import { withAuditTransaction } from "../services/auditLog.js";
import { actorAudit, workflowError } from "../services/workflowSupport.js";
import { conferenceSchedule, conferenceDisplayDate } from "../services/conferenceSchedulePolicy.js";
import { ensureProcurementAttempt } from "../services/procurementGovernance.js";
import { Op } from "sequelize";

const includes = {
  include: [
    { model: Rfq, as: "rfq" },
    { model: ConferenceAttendance, as: "attendance" },
    { model: User, as: "scheduledBy", attributes: ["id", "name"] },
  ],
};

const serialize = (session) => ({
  id: session.id,
  title: session.title,
  purpose: session.purpose,
  scheduledAt: conferenceDisplayDate(session),
  venue: session.purpose === "prebid" ? session.rfq?.prebidVenue ?? null : null,
  meetingUrl: session.meetingUrl,
  status: session.status,
  minutes: session.minutes,
  startedAt: session.startedAt,
  endedAt: session.endedAt,
  rfqId: session.rfqId,
  referenceNo: session.rfq?.referenceNo ?? null,
  scheduledByName: session.scheduledBy?.name ?? null,
  attendanceCount: session.attendance?.length ?? 0,
  attendance: (session.attendance ?? []).map((entry) => ({
    id: entry.id,
    attendeeName: entry.attendeeName,
    organization: entry.organization,
    joinedAt: entry.joinedAt,
  })),
});

export const listSessions = async (req, res) => {
  const sessions = await LiveConferenceSession.findAll({ ...includes, order: [["scheduledAt", "DESC"]] });
  res.json(sessions.map(serialize));
};

export const scheduleSession = async (req, res) => {
  const { rfqId, title, purpose, scheduledAt, meetingUrl } = req.body;
  if (meetingUrl) {
    let url;
    try { url = new URL(meetingUrl); } catch { return res.status(400).json({ message: "Enter a valid HTTPS meeting URL." }); }
    if (url.protocol !== "https:" || url.username || url.password) return res.status(400).json({ message: "Enter a valid HTTPS meeting URL." });
  }

  const rfq = await Rfq.findByPk(rfqId);
  if (!rfq) return res.status(400).json({ message: "That RFQ/ITB does not exist." });

  // Section 7.3 attaches conferences to the invitation stage, so a cancelled or
  // already-awarded procurement should not gain new ones.
  if (["cancelled", "awarded", "failed"].includes(rfq.status)) {
    return res.status(409).json({ message: `Cannot schedule a conference for a ${rfq.status} procurement.` });
  }

  const session = await withAuditTransaction(async (transaction, audit) => {
  await rfq.reload({ transaction, lock: transaction.LOCK.UPDATE });
  const schedule = conferenceSchedule(rfq, { purpose, scheduledAt });
  if (["prebid", "opening"].includes(schedule.purpose) && await LiveConferenceSession.findOne({ where: { rfqId: rfq.id, purpose: schedule.purpose, status: { [Op.ne]: "cancelled" } }, transaction })) {
    throw workflowError("This procurement already has a conference for that stage. Use its existing meeting record.");
  }
  const created = await LiveConferenceSession.create({
    rfqId: rfq.id,
    title: title?.trim() || `${purpose === "prebid" ? "Pre-bid" : "Clarification"} conference — ${rfq.referenceNo}`,
    ...schedule,
    meetingUrl: meetingUrl ?? null,
    scheduledById: req.currentUser.id,
    status: "scheduled",
  }, { transaction });
  const attempt = await ensureProcurementAttempt(rfq, { transaction, actorId: req.currentUser.id });
  await audit(actorAudit(req, { actionType: schedule.purpose === "prebid" ? "rfq.prebidScheduled" : "conference.scheduled", entityRef: "rfq", entityId: rfq.id,
    summary: "Conference created from the procurement schedule.", afterState: { ...schedule, conferenceId: created.id, attemptId: attempt.id, attemptNumber: attempt.attemptNumber, meetingUrl: created.meetingUrl } }));
  return created;
  });

  // Section 7.4: invitations reach bidders in-system.
  const vendors = await Vendor.findAll({ where: { registrationStatus: "verified" } });
  await notifyUsers(
    vendors.map((vendor) => vendor.userId),
    {
      type: NOTIFICATION_EVENTS.RFQ_PUBLISHED,
      title: `Conference scheduled — ${rfq.referenceNo}`,
      body: `${session.title} on ${new Date(session.scheduledAt).toLocaleString()}.`,
      link: "/supplier/opportunities",
      refEntity: "conference",
      refId: session.id,
      severity: "info",
    }
  );

  res.status(201).json(serialize(await LiveConferenceSession.findByPk(session.id, includes)));
};

// Attendance is captured against the procurement record so it can be produced
// for audit (Section 7.3).
export const recordAttendance = async (req, res) => {
  const { attendeeName, organization } = req.body;
  const session = await LiveConferenceSession.findByPk(req.params.id);
  if (!session) return res.status(404).json({ message: "Conference not found." });
  if (session.status === "cancelled") {
    return res.status(409).json({ message: "This conference was cancelled." });
  }

  const name = attendeeName?.trim() || req.currentUser.name;

  // One attendance row per user per session — re-joining should not duplicate.
  const existing = await ConferenceAttendance.findOne({
    where: { sessionId: session.id, userId: req.currentUser.id },
  });
  if (existing) return res.json({ id: existing.id, alreadyRecorded: true });

  const entry = await ConferenceAttendance.create({
    sessionId: session.id,
    userId: req.currentUser.id,
    attendeeName: name,
    organization: organization ?? null,
    joinedAt: new Date(),
  });

  res.status(201).json({ id: entry.id, attendeeName: entry.attendeeName, joinedAt: entry.joinedAt });
};

export const updateSession = async (req, res) => {
  const { status, minutes } = req.body;
  const session = await LiveConferenceSession.findByPk(req.params.id, includes);
  if (!session) return res.status(404).json({ message: "Conference not found." });

  const changes = {};
  if (minutes !== undefined) changes.minutes = minutes;

  if (status) {
    if (!["scheduled", "inProgress", "completed", "cancelled"].includes(status)) {
      return res.status(400).json({ message: "Unknown status." });
    }
    changes.status = status;
    if (status === "inProgress" && !session.startedAt) changes.startedAt = new Date();
    if (status === "completed") changes.endedAt = new Date();
  }

  await withAuditTransaction(async (transaction, audit) => {
    await Rfq.findByPk(session.rfqId, { transaction, lock: transaction.LOCK.UPDATE });
    await session.reload({ ...includes, transaction, lock: transaction.LOCK.UPDATE });
    const transitions = { scheduled: ["inProgress", "cancelled"], inProgress: ["completed", "cancelled"], completed: [], cancelled: [] };
    if (status && status !== session.status && !transitions[session.status].includes(status)) throw workflowError(`A ${session.status} conference cannot move directly to ${status}.`);
    if (status === "inProgress" && new Date(conferenceDisplayDate(session)) > new Date()) throw workflowError("The approved conference time has not yet been reached.");
    if (status === "inProgress" && ["failed", "cancelled", "awarded"].includes(session.rfq?.status)) throw workflowError("This procurement is no longer open for a conference.");
    const beforeState = { status: session.status, minutes: session.minutes, startedAt: session.startedAt, endedAt: session.endedAt };
    await session.update(changes, { transaction });
    await audit(actorAudit(req, { actionType: "conference.updated", entityRef: "rfq", entityId: session.rfqId, summary: "Conference progress or minutes recorded.", beforeState, afterState: { conferenceId: session.id, ...changes } }));
  });
  res.json(serialize(await LiveConferenceSession.findByPk(session.id, includes)));
};
