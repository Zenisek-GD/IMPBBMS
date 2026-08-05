import { Op } from "sequelize";
import {
  Announcement,
  ANNOUNCEMENT_CATEGORIES,
  acceptsRegistrations,
} from "../models/announcementModel.js";
import { AppEntry } from "../models/appEntryModel.js";
import { User } from "../models/userModel.js";
import { auditFromRequest, AUDIT_ACTIONS } from "../services/auditLog.js";
import { notifyByPermission, NOTIFICATION_EVENTS } from "../services/notifier.js";

// ─────────────────────────────────────────────────────────────────────────────
// Authoring side of public announcements. Everything here requires
// `announcements.manage`; the public read path lives in publicProjectController
// and shares no code with this file beyond the model.
//
// That separation is deliberate. This controller returns drafts, author names
// and withdrawal history; the public one must never return any of them. Keeping
// them apart means the two serialisers cannot drift into each other, which is
// the failure mode that leaks an unpublished notice.
// ─────────────────────────────────────────────────────────────────────────────

const withIncludes = {
  include: [
    { model: User, as: "author", attributes: ["id", "name"] },
    { model: User, as: "publisher", attributes: ["id", "name"] },
    { model: AppEntry, as: "project", attributes: ["id", "projectTitle", "fiscalYear"] },
  ],
};

// The internal view: everything, including what the public never sees.
const serialize = (announcement) => ({
  id: announcement.id,
  title: announcement.title,
  body: announcement.body,
  category: announcement.category,
  status: announcement.status,
  referenceNo: announcement.referenceNo,
  pinned: announcement.pinned,
  publishedAt: announcement.publishedAt,
  expiresAt: announcement.expiresAt,
  registrationDeadline: announcement.registrationDeadline,

  // Derived rather than stored, from the same helper the intake controller
  // enforces with — so the badge an officer sees in this console is the literal
  // answer to "would a bidder be able to submit right now?"
  acceptingRegistrations: acceptsRegistrations(announcement),

  appEntryId: announcement.appEntryId,
  projectTitle: announcement.project?.projectTitle ?? null,
  projectFiscalYear: announcement.project?.fiscalYear ?? null,

  authorName: announcement.author?.name ?? null,
  publisherName: announcement.publisher?.name ?? null,
  createdAt: announcement.createdAt,
  updatedAt: announcement.updatedAt,
});

// A deadline is only meaningful on a notice that is inviting bidders to apply,
// and only in the future. Both are checked here rather than in the model so the
// officer gets a sentence back instead of a constraint violation.
const readDeadline = (value, { required = false } = {}) => {
  if (value === undefined) return { ok: true, skip: true };
  if (value === null || value === "") {
    return required
      ? { ok: false, message: "A registration deadline is required for this notice." }
      : { ok: true, value: null };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, message: "That registration deadline is not a valid date." };
  }
  return { ok: true, value: parsed };
};

const readBody = (payload, { partial = false } = {}) => {
  const errors = {};
  const patch = {};

  const has = (field) => payload[field] !== undefined;
  const required = (field) => !partial || has(field);

  if (required("title")) {
    const title = String(payload.title ?? "").trim();
    if (!title) errors.title = "A title is required.";
    else if (title.length > 200) errors.title = "That title is too long.";
    else patch.title = title;
  }

  if (required("body")) {
    const body = String(payload.body ?? "").trim();
    if (!body) errors.body = "An announcement needs something to say.";
    else patch.body = body;
  }

  if (has("category")) {
    if (!ANNOUNCEMENT_CATEGORIES.includes(payload.category)) {
      errors.category = "Choose a valid category.";
    } else {
      patch.category = payload.category;
    }
  }

  if (has("referenceNo")) {
    patch.referenceNo = String(payload.referenceNo ?? "").trim().slice(0, 60) || null;
  }
  if (has("pinned")) patch.pinned = Boolean(payload.pinned);

  if (has("expiresAt")) {
    if (payload.expiresAt === null || payload.expiresAt === "") {
      patch.expiresAt = null;
    } else {
      const parsed = new Date(payload.expiresAt);
      if (Number.isNaN(parsed.getTime())) errors.expiresAt = "That expiry date is not valid.";
      else patch.expiresAt = parsed;
    }
  }

  const deadline = readDeadline(payload.registrationDeadline);
  if (!deadline.ok) errors.registrationDeadline = deadline.message;
  else if (!deadline.skip) patch.registrationDeadline = deadline.value;

  if (has("appEntryId")) {
    patch.appEntryId = payload.appEntryId ? Number(payload.appEntryId) : null;
  }

  return { errors, patch };
};

/**
 * The authoring list — drafts included. Ordered the way an officer works: what
 * is still unpublished first, then the most recent.
 */
export const listAnnouncementsForAuthor = async (req, res) => {
  const { status, category } = req.query;

  const where = {};
  if (status && ["draft", "published", "archived"].includes(status)) where.status = status;
  if (category && ANNOUNCEMENT_CATEGORIES.includes(category)) where.category = category;

  const announcements = await Announcement.findAll({
    where,
    ...withIncludes,
    order: [
      ["status", "ASC"], // draft < published < archived, alphabetically
      ["pinned", "DESC"],
      ["publishedAt", "DESC"],
      ["createdAt", "DESC"],
    ],
  });

  res.json(announcements.map(serialize));
};

export const createAnnouncement = async (req, res) => {
  const { errors, patch } = readBody(req.body ?? {}, { partial: false });
  if (Object.keys(errors).length) {
    return res.status(400).json({ message: "Please correct the highlighted fields.", errors });
  }

  if (patch.appEntryId) {
    const project = await AppEntry.findByPk(patch.appEntryId);
    if (!project) {
      return res.status(400).json({
        message: "The project this notice links to does not exist.",
        errors: { appEntryId: "Choose a project from the list." },
      });
    }
  }

  // Always born as a draft, whatever the caller sent. Publishing is a separate
  // call so it is a separate, auditable decision — and so a notice cannot go out
  // to the public as a side effect of a form submit.
  const announcement = await Announcement.create({
    ...patch,
    status: "draft",
    createdByUserId: req.currentUser.id,
  });

  res.status(201).json(serialize(await Announcement.findByPk(announcement.id, withIncludes)));
};

export const updateAnnouncement = async (req, res) => {
  const announcement = await Announcement.findByPk(req.params.id, withIncludes);
  if (!announcement) return res.status(404).json({ message: "Announcement not found." });

  if (announcement.status === "archived") {
    return res.status(409).json({
      message:
        "This notice has been withdrawn. Withdrawn notices are kept as a record of what the " +
        "public was told and are not edited — post a new one instead.",
    });
  }

  const { errors, patch } = readBody(req.body ?? {}, { partial: true });
  if (Object.keys(errors).length) {
    return res.status(400).json({ message: "Please correct the highlighted fields.", errors });
  }

  const wasPublished = announcement.status === "published";
  const before = wasPublished
    ? {
        title: announcement.title,
        body: announcement.body,
        registrationDeadline: announcement.registrationDeadline,
        expiresAt: announcement.expiresAt,
      }
    : null;

  await announcement.update(patch);

  // Only edits to a live notice are recorded. A draft being reworked is not an
  // accountable event — nobody has read it — but changing what the municipality
  // has already been told is, particularly when it moves a deadline.
  if (wasPublished) {
    await auditFromRequest(req, {
      actionType: AUDIT_ACTIONS.ANNOUNCEMENT_UPDATED,
      entityRef: "announcement",
      entityId: announcement.id,
      summary: `Published announcement "${announcement.title}" was edited`,
      beforeState: before,
      afterState: {
        title: announcement.title,
        body: announcement.body,
        registrationDeadline: announcement.registrationDeadline,
        expiresAt: announcement.expiresAt,
      },
    });
  }

  res.json(serialize(await Announcement.findByPk(announcement.id, withIncludes)));
};

/**
 * Puts the notice on the public portal.
 *
 * A deadline in the past is refused here rather than allowed through and hidden
 * by the serialiser: a call for bidders that is closed the moment it appears
 * wastes the time of everyone who reads it.
 */
export const publishAnnouncement = async (req, res) => {
  const announcement = await Announcement.findByPk(req.params.id, withIncludes);
  if (!announcement) return res.status(404).json({ message: "Announcement not found." });

  if (announcement.status === "published") {
    return res.status(409).json({ message: "This notice is already published." });
  }
  if (announcement.status === "archived") {
    return res.status(409).json({ message: "A withdrawn notice cannot be republished." });
  }

  const now = new Date();
  if (announcement.registrationDeadline && new Date(announcement.registrationDeadline) <= now) {
    return res.status(400).json({
      message:
        "The registration deadline on this notice has already passed. Move it forward before " +
        "publishing, or clear it if this notice is not calling for bidders.",
    });
  }
  if (announcement.expiresAt && new Date(announcement.expiresAt) <= now) {
    return res.status(400).json({
      message: "This notice is set to expire in the past, so publishing it would hide it at once.",
    });
  }

  await announcement.update({
    status: "published",
    publishedAt: now,
    publishedByUserId: req.currentUser.id,
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.ANNOUNCEMENT_PUBLISHED,
    entityRef: "announcement",
    entityId: announcement.id,
    summary: `Announcement "${announcement.title}" published to the public portal`,
    beforeState: { status: "draft" },
    afterState: {
      status: "published",
      category: announcement.category,
      registrationDeadline: announcement.registrationDeadline,
      expiresAt: announcement.expiresAt,
      // On the record because it is the fact that decides whether the public
      // form will accept a submission.
      acceptingRegistrations: acceptsRegistrations(announcement, now),
    },
  });

  // A call for bidders is the one announcement the Secretariat needs to know
  // went out, since applications will start arriving in their queue against it.
  if (acceptsRegistrations(announcement, now)) {
    await notifyByPermission("bidding.publish", {
      type: NOTIFICATION_EVENTS.ANNOUNCEMENT_PUBLISHED,
      title: "Call for bidders published",
      body: `"${announcement.title}" is open for registration until ${new Date(
        announcement.registrationDeadline
      ).toLocaleString("en-PH")}.`,
      link: "/announcements/manage",
      refEntity: "announcement",
      refId: announcement.id,
      severity: "info",
    });
  }

  res.json(serialize(await Announcement.findByPk(announcement.id, withIncludes)));
};

/**
 * Takes a notice down.
 *
 * Archived rather than deleted, and deliberately not editable afterwards: what
 * the public was told, and when it stopped being told it, is part of the
 * procurement record. Rows are kept so an audit can reconstruct what a bidder
 * would have seen on any given day.
 */
export const withdrawAnnouncement = async (req, res) => {
  const announcement = await Announcement.findByPk(req.params.id, withIncludes);
  if (!announcement) return res.status(404).json({ message: "Announcement not found." });

  if (announcement.status !== "published") {
    return res.status(409).json({ message: "Only a published notice can be withdrawn." });
  }

  const { reason } = req.body ?? {};
  const remarks = String(reason ?? "").trim();
  if (!remarks) {
    return res.status(400).json({
      message:
        "Give a reason for withdrawing this notice. It has already been read by the public, so " +
        "the record needs to say why it was taken down.",
    });
  }

  await announcement.update({ status: "archived" });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.ANNOUNCEMENT_WITHDRAWN,
    entityRef: "announcement",
    entityId: announcement.id,
    summary: `Announcement "${announcement.title}" withdrawn from the public portal`,
    beforeState: { status: "published", publishedAt: announcement.publishedAt },
    afterState: { status: "archived", reason: remarks },
  });

  res.json(serialize(await Announcement.findByPk(announcement.id, withIncludes)));
};

/**
 * The calls an application can currently be recorded against.
 *
 * Authenticated and permission-gated, unlike the version this replaced. It used
 * to be public, because a public form needed to name the call it was answering —
 * accreditation is now submitted in person, so the only caller is the officer at
 * the counter recording what a bidder handed in.
 */
export const listOpenCalls = async (_req, res) => {
  const now = new Date();

  const announcements = await Announcement.findAll({
    where: {
      status: "published",
      registrationDeadline: { [Op.ne]: null },
      [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: now } }],
    },
    order: [["registrationDeadline", "DESC"]],
  });

  res.json(
    announcements.map((announcement) => ({
      id: announcement.id,
      title: announcement.title,
      referenceNo: announcement.referenceNo,
      registrationDeadline: announcement.registrationDeadline,
      // Closed calls are still listed — documents received at the counter before
      // the deadline may legitimately be keyed in afterwards — but the officer is
      // shown which ones have lapsed so a late submission is a deliberate act.
      closed: new Date(announcement.registrationDeadline) <= now,
    }))
  );
};
