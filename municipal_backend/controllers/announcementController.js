import { Op } from "sequelize";
import {
  Announcement,
  ANNOUNCEMENT_CATEGORIES,
  acceptsRegistrations,
  submissionsClosed,
  releaseScheduledAnnouncements,
} from "../models/announcementModel.js";
import { Rfq } from "../models/biddingModel.js";
import { ProcurementMode } from "../models/procurementModeModel.js";
import { Document, DOCUMENT_METADATA_ATTRIBUTES } from "../models/documentModel.js";
import { sanitizeHtml } from "../services/htmlSanitizer.js";
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
  bodyHtml: announcement.bodyHtml,
  publishedAt: announcement.publishedAt,
  publishAt: announcement.publishAt,
  archivedAt: announcement.archivedAt,
  expiresAt: announcement.expiresAt,
  registrationDeadline: announcement.registrationDeadline,

  // ── Invitation to Bid particulars ─────────────────────────────────────────
  abc: announcement.abc === null || announcement.abc === undefined ? null : Number(announcement.abc),
  fundSource: announcement.fundSource,
  procurementMethod: announcement.procurementMethod,
  procurementMethodCitation: announcement.procurementMethodCitation,
  prebidAt: announcement.prebidAt,
  submissionDeadline: announcement.submissionDeadline,
  bidOpeningAt: announcement.bidOpeningAt,
  venue: announcement.venue,
  contactPerson: announcement.contactPerson,
  contactEmail: announcement.contactEmail,
  contactPhone: announcement.contactPhone,
  rfqId: announcement.rfqId,
  duplicatedFromId: announcement.duplicatedFromId,

  // Bidding having closed is not the same as the notice having expired: the
  // notice stays readable, it just stops accepting anything.
  submissionsClosed: submissionsClosed(announcement),

  // Scheduled but not yet live. Surfaced so the console can say "goes out
  // Monday" rather than showing an indistinguishable draft.
  scheduled: announcement.status === "draft" && Boolean(announcement.publishAt),

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

  // ── Rich body, handled before the plain-text check below ──────────────────
  // Order is load-bearing. The rich editor sends only `bodyHtml`, and the
  // plain-text `body` is *derived* from it — so deriving it after the "a body
  // is required" check meant every notice written in the editor was rejected
  // for having no body it had in fact just supplied.
  //
  // Sanitised on the way in, not on the way out: storing raw authored markup
  // and cleaning it at render time means every future reader of the column has
  // to remember to clean it too, and one that forgets is a stored XSS on a page
  // served to the public.
  if (has("bodyHtml")) {
    const clean = sanitizeHtml(payload.bodyHtml ?? "");
    patch.bodyHtml = clean || null;

    // Keep the plain-text `body` in step so search, exports and any older
    // consumer keep working without having to strip tags themselves.
    if (clean && !String(payload.body ?? "").trim()) {
      const text = clean
        // Block-level closers become line breaks first, so the plain-text
        // version keeps the paragraph structure instead of running together.
        .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      if (text) patch.body = text;
    }
  }

  if (required("body")) {
    const body = String(payload.body ?? "").trim();
    // `patch.body` may already hold the text derived from `bodyHtml` above.
    if (!body && !patch.body) errors.body = "An announcement needs something to say.";
    else if (body) patch.body = body;
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
  if (has("rfqId")) patch.rfqId = payload.rfqId ? Number(payload.rfqId) : null;

  // ── Invitation to Bid particulars ─────────────────────────────────────────
  if (has("abc")) {
    if (payload.abc === null || payload.abc === "") patch.abc = null;
    else {
      const amount = Number(payload.abc);
      if (!Number.isFinite(amount) || amount < 0) errors.abc = "The ABC must be a positive amount.";
      else patch.abc = amount;
    }
  }

  for (const field of ["fundSource", "procurementMethod", "procurementMethodCitation", "venue",
                       "contactPerson", "contactEmail", "contactPhone"]) {
    if (has(field)) patch[field] = String(payload[field] ?? "").trim() || null;
  }

  // The three dates a bidder plans around. Each is validated the same way and
  // each may legitimately be cleared, so this is a loop rather than three
  // near-identical blocks that could drift apart.
  for (const field of ["prebidAt", "submissionDeadline", "bidOpeningAt", "publishAt"]) {
    if (!has(field)) continue;
    if (payload[field] === null || payload[field] === "") { patch[field] = null; continue; }
    const parsed = new Date(payload[field]);
    if (Number.isNaN(parsed.getTime())) errors[field] = "That is not a valid date and time.";
    else patch[field] = parsed;
  }

  // Bids cannot be opened before they are submitted, and a pre-bid conference
  // held after the deadline helps nobody. Caught here so the officer gets a
  // sentence rather than publishing a schedule that cannot happen.
  const deadlineAt = patch.submissionDeadline ?? null;
  if (deadlineAt && patch.bidOpeningAt && patch.bidOpeningAt < deadlineAt) {
    errors.bidOpeningAt = "Bid opening cannot be scheduled before the submission deadline.";
  }
  if (deadlineAt && patch.prebidAt && patch.prebidAt > deadlineAt) {
    errors.prebidAt = "The pre-bid conference must fall before the submission deadline.";
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

// ── Populate from a solicitation ─────────────────────────────────────────────
// The whole point of linking a notice to its RFQ: the reference number, ABC,
// mode and schedule are already on file, and an officer retyping them is how a
// published invitation ends up quoting a different ABC from the one the BAC
// approved.
//
// Returns the values rather than writing them, so the officer sees what will be
// filled in and can still override any of it before saving. Copied once at
// authoring time — a published notice must not change because somebody edited
// the RFQ behind it.
export const draftFromSolicitation = async (req, res) => {
  const rfq = await Rfq.findByPk(req.params.rfqId, {
    include: [
      { model: ProcurementMode, as: "mode" },
      { model: AppEntry, as: "appEntry", attributes: ["id", "projectTitle", "fundSource"] },
    ],
  });
  if (!rfq) return res.status(404).json({ message: "That solicitation does not exist." });

  res.json({
    rfqId: rfq.id,
    appEntryId: rfq.appEntryId ?? null,
    referenceNo: rfq.referenceNo,
    title: `Invitation to Bid — ${rfq.title}`,
    category: "procurementOpportunity",
    abc: rfq.abc === null || rfq.abc === undefined ? null : Number(rfq.abc),
    fundSource: rfq.appEntry?.fundSource ?? null,
    procurementMethod: rfq.mode?.name ?? null,
    procurementMethodCitation: rfq.mode?.citation ?? null,
    prebidAt: rfq.prebidAt,
    submissionDeadline: rfq.closingDate,
    // Bid opening follows the deadline on the same day unless the office says
    // otherwise — the usual practice, and a sensible default the officer can
    // change rather than a blank they must fill.
    bidOpeningAt: rfq.closingDate,
    projectTitle: rfq.appEntry?.projectTitle ?? null,
  });
};

// ── Preview ──────────────────────────────────────────────────────────────────
// The public-facing rendering of a draft, built by the same serialiser the
// portal uses. Previewing through a *different* code path would show the
// officer something the public will never see, which is worse than no preview.
export const previewAnnouncement = async (req, res) => {
  const announcement = await Announcement.findByPk(req.params.id, withIncludes);
  if (!announcement) return res.status(404).json({ message: "Announcement not found." });

  const { publicAnnouncement } = await import("./publicProjectController.js");
  res.json({
    preview: publicAnnouncement(announcement, new Date(), { force: true }),
    attachments: await listAttachmentsFor(announcement.id),
  });
};

const listAttachmentsFor = async (announcementId) => {
  const files = await Document.findAll({
    where: { entityRef: "announcement", entityId: announcementId },
    attributes: DOCUMENT_METADATA_ATTRIBUTES,
    order: [["uploadedAt", "ASC"]],
  });
  return files.map((file) => ({
    id: file.id,
    filename: file.filename,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    checksum: file.checksum,
    label: file.label,
    docType: file.docType,
    uploadedAt: file.uploadedAt,
  }));
};

export const listAnnouncementAttachments = async (req, res) => {
  const announcement = await Announcement.findByPk(req.params.id);
  if (!announcement) return res.status(404).json({ message: "Announcement not found." });
  res.json(await listAttachmentsFor(announcement.id));
};

// ── Duplicate as a template ──────────────────────────────────────────────────
// Procurement notices are near-identical year to year, and retyping one is both
// slow and how a stale ABC survives into a new invitation. The copy is always a
// draft, and deliberately drops everything that belongs to the original
// procurement: its schedule, its reference, its link to a solicitation and its
// publication history. What is reused is the wording.
export const duplicateAnnouncement = async (req, res) => {
  const source = await Announcement.findByPk(req.params.id);
  if (!source) return res.status(404).json({ message: "Announcement not found." });

  const copy = await Announcement.create({
    title: `${source.title} (copy)`.slice(0, 200),
    body: source.body,
    bodyHtml: source.bodyHtml,
    category: source.category,
    status: "draft",

    // Carried over: the standing facts about how this office procures.
    fundSource: source.fundSource,
    procurementMethod: source.procurementMethod,
    procurementMethodCitation: source.procurementMethodCitation,
    venue: source.venue,
    contactPerson: source.contactPerson,
    contactEmail: source.contactEmail,
    contactPhone: source.contactPhone,

    // Deliberately NOT carried: reference number, ABC, every date, the project
    // and solicitation links, pinning, and all publication history. Each
    // belongs to the procurement being copied, and silently inheriting any of
    // them is how a new invitation goes out quoting last year's deadline.
    duplicatedFromId: source.id,
    createdByUserId: req.currentUser.id,
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.ANNOUNCEMENT_UPDATED,
    entityRef: "announcement",
    entityId: copy.id,
    summary: `Notice duplicated from #${source.id} — "${source.title}"`,
    afterState: { duplicatedFromId: source.id, status: "draft" },
  });

  res.status(201).json(serialize(await Announcement.findByPk(copy.id, withIncludes)));
};

// ── Archive ──────────────────────────────────────────────────────────────────
// Distinct from withdrawal. Withdrawing says the notice should not have been
// public; archiving says the procurement it announced is over. Archived notices
// stay readable on the portal's archive view, because a closed procurement that
// disappears from the record is the opposite of transparency.
export const archiveAnnouncement = async (req, res) => {
  const announcement = await Announcement.findByPk(req.params.id, withIncludes);
  if (!announcement) return res.status(404).json({ message: "Announcement not found." });

  if (announcement.status !== "published") {
    return res.status(409).json({
      message: "Only a published notice can be archived. A draft can simply be left unpublished.",
    });
  }

  await announcement.update({ status: "archived", archivedAt: new Date() });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.ANNOUNCEMENT_WITHDRAWN,
    entityRef: "announcement",
    entityId: announcement.id,
    summary: `Notice archived: "${announcement.title}"`,
    beforeState: { status: "published" },
    afterState: { status: "archived", remainsPubliclyReadable: true },
  });

  res.json(serialize(await Announcement.findByPk(announcement.id, withIncludes)));
};

// Releases any notice whose scheduled publication time has arrived. Exposed so
// the console can trigger it, and called from the list endpoints so a schedule
// works even with no cron attached.
export const runScheduledReleases = async (req, res) => {
  const released = await releaseScheduledAnnouncements();

  for (const announcement of released) {
    await auditFromRequest(req, {
      actionType: AUDIT_ACTIONS.ANNOUNCEMENT_PUBLISHED,
      entityRef: "announcement",
      entityId: announcement.id,
      summary: `Scheduled notice released: "${announcement.title}"`,
      afterState: { status: "published", scheduled: true },
    });
  }

  res.json({ released: released.length });
};
