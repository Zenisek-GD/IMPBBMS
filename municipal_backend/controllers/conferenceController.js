import { LiveConferenceSession, ConferenceAttendance } from "../models/liveConferenceModel.js";
import { Rfq } from "../models/biddingModel.js";
import { Vendor } from "../models/vendorModel.js";
import { User } from "../models/userModel.js";
import { notifyUsers, NOTIFICATION_EVENTS } from "../services/notifier.js";

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
  scheduledAt: session.scheduledAt,
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

  if (!scheduledAt) return res.status(400).json({ message: "A scheduled date and time is required." });

  const rfq = await Rfq.findByPk(rfqId);
  if (!rfq) return res.status(400).json({ message: "That RFQ/ITB does not exist." });

  // Section 7.3 attaches conferences to the invitation stage, so a cancelled or
  // already-awarded procurement should not gain new ones.
  if (["cancelled", "awarded", "failed"].includes(rfq.status)) {
    return res.status(409).json({ message: `Cannot schedule a conference for a ${rfq.status} procurement.` });
  }

  const session = await LiveConferenceSession.create({
    rfqId: rfq.id,
    title: title?.trim() || `${purpose === "prebid" ? "Pre-bid" : "Clarification"} conference — ${rfq.referenceNo}`,
    purpose: purpose ?? "prebid",
    scheduledAt,
    meetingUrl: meetingUrl ?? null,
    scheduledById: req.currentUser.id,
    status: "scheduled",
  });

  // Section 7.4: invitations reach bidders in-system.
  const vendors = await Vendor.findAll({ where: { registrationStatus: "verified" } });
  await notifyUsers(
    vendors.map((vendor) => vendor.userId),
    {
      type: NOTIFICATION_EVENTS.RFQ_PUBLISHED,
      title: `Conference scheduled — ${rfq.referenceNo}`,
      body: `${session.title} on ${new Date(scheduledAt).toLocaleString()}.`,
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

  await session.update(changes);
  res.json(serialize(await LiveConferenceSession.findByPk(session.id, includes)));
};
