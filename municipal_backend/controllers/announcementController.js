import { Op } from "sequelize";
import '../models/announcementScheduleAssociation.js';
import {
  Announcement,
  ANNOUNCEMENT_CATEGORIES,
  acceptsRegistrations,
  submissionsClosed,
  releaseScheduledAnnouncements,
} from "../models/announcementModel.js";
import { Rfq } from "../models/biddingModel.js";
import { announcementSchedule, announcementFromOfficialSchedule } from "../services/procurementSchedulePolicy.js";
import { assertApprovedSchedule } from "../services/procurementSchedule.js";
import { workflowError, actorAudit } from "../services/workflowSupport.js";
import { ProcurementMode } from "../models/procurementModeModel.js";
import { Document, DOCUMENT_METADATA_ATTRIBUTES } from "../models/documentModel.js";
import { sanitizeHtml } from "../services/htmlSanitizer.js";
import { AppEntry } from "../models/appEntryModel.js";
import { User } from "../models/userModel.js";
import { auditFromRequest, AUDIT_ACTIONS, withAuditTransaction } from "../services/auditLog.js";
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
    { model: Rfq, as: 'officialProcurement' },
  ],
};

// The internal view: everything, including what the public never sees.
const serialize = (source) => {
  const announcement = announcementFromOfficialSchedule(source);
  return ({
  id: announcement.id,
  title: announcement.title,
  body: announcement.body,
  category: announcement.category,
  status: announcement.status,
  referenceNo: announcement.referenceNo,
  pinned: announcement.pinned,
  bodyHtml: sanitizeHtml(announcement.bodyHtml),
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
  prebidVenue: announcement.prebidVenue ?? null,
  prebidRequired: announcement.prebidRequired ?? Boolean(announcement.prebidAt),
  procurementType: announcement.procurementType ?? null,
  publicationDate: announcement.publicationDate ?? null,
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
};

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
  if (deadlineAt && patch.bidOpeningAt && patch.bidOpeningAt <= deadlineAt) {
    errors.bidOpeningAt = "Bid opening must be scheduled after the bid submission deadline.";
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

const canonicalNotice = async (payload, previous, transaction, { publishing = false } = {}) => {
  const rfqId = payload.rfqId ?? previous?.rfqId;
  if (previous?.rfqId && Object.hasOwn(payload, 'rfqId') && Number(payload.rfqId) !== previous.rfqId) throw workflowError('A linked procurement notice cannot be detached or moved to another attempt. Create a new draft.');
  const procurement = (payload.category ?? previous?.category) === 'procurementOpportunity';
  if (!rfqId) {
    const hasBiddingDates = ['submissionDeadline', 'bidOpeningAt', 'prebidAt'].some((key) => [payload[key], previous?.[key]].some((value) => value !== undefined && value !== null && value !== ''));
    if ((procurement && publishing) || hasBiddingDates) throw workflowError('Link this procurement announcement to its official RFQ / ITB schedule before entering bidding dates or publishing.');
    return payload;
  }
  const rfq = await Rfq.findByPk(rfqId, { include: [{ model: ProcurementMode, as: 'mode' }], transaction, lock: transaction.LOCK.UPDATE });
  if (!rfq) throw workflowError('The linked procurement does not exist.', 400);
  if (publishing) {
    if (rfq.status !== 'published') throw workflowError('Publish the approved procurement before publishing its Invitation to Bid.');
    assertApprovedSchedule(rfq);
    if (new Date(rfq.closingDate) <= new Date()) throw workflowError('The official bid submission deadline has passed.');
  }
  const official = announcementSchedule(rfq);
  for (const field of ['prebidAt', 'submissionDeadline', 'bidOpeningAt']) {
    if (!Object.hasOwn(payload, field)) continue;
    const supplied = payload[field] ? new Date(payload[field]).getTime() : null;
    const canonical = official[field] ? new Date(official[field]).getTime() : null;
    if (supplied !== canonical) throw workflowError(`${field} must match the official procurement schedule. Request a schedule amendment to change published dates.`, 400);
  }
  return { ...payload, ...official, rfqId: rfq.id, category: 'procurementOpportunity', procurementMethod: rfq.mode?.name ?? null, procurementMethodCitation: rfq.mode?.citation ?? null };
};

export const createAnnouncement = async (req, res) => {
  const announcement = await withAuditTransaction(async (transaction, audit) => {
    const payload = await canonicalNotice(req.body ?? {}, null, transaction);
    const { errors, patch } = readBody(payload, { partial: false });
    if (Object.keys(errors).length) throw workflowError(Object.values(errors)[0], 400, { errors });
    if (patch.appEntryId && !await AppEntry.findByPk(patch.appEntryId, { transaction })) throw workflowError('The linked project does not exist.', 400);
    const created = await Announcement.create({ ...patch, status: 'draft', createdByUserId: req.currentUser.id }, { transaction });
    await audit(actorAudit(req, { actionType: 'announcement.generated', entityRef: 'announcement', entityId: created.id, summary: 'Public announcement draft generated for review using the official procurement dates.', afterState: { rfqId: created.rfqId, status: 'draft', prebidAt: created.prebidAt, submissionDeadline: created.submissionDeadline, bidOpeningAt: created.bidOpeningAt } }));
    return created;
  });
  res.status(201).json(serialize(await Announcement.findByPk(announcement.id, withIncludes)));
};

export const updateAnnouncement = async (req, res) => {
  // RFQ is locked before the notice, matching the amendment propagation order.
  const previous = await Announcement.findByPk(req.params.id);
  if (!previous) throw workflowError('Announcement not found.', 404);
  await withAuditTransaction(async (transaction, audit) => {
    const payload = await canonicalNotice(req.body ?? {}, previous, transaction);
    const announcement = await Announcement.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (announcement.status === 'archived') throw workflowError('Archived notices preserve what the public was told and cannot be edited.');
    const { errors, patch } = readBody({ prebidAt: announcement.prebidAt, submissionDeadline: announcement.submissionDeadline, bidOpeningAt: announcement.bidOpeningAt, ...payload }, { partial: true });
    if (Object.keys(errors).length) throw workflowError(Object.values(errors)[0], 400, { errors });
    const before = { status: announcement.status, submissionDeadline: announcement.submissionDeadline, bidOpeningAt: announcement.bidOpeningAt, prebidAt: announcement.prebidAt };
    if (announcement.status === 'published' && !announcement.rfqId && ['submissionDeadline', 'bidOpeningAt', 'prebidAt'].some((key) => Object.hasOwn(req.body ?? {}, key))) throw workflowError('Published bidding dates require an official procurement schedule amendment.');
    await announcement.update(patch, { transaction });
    await audit(actorAudit(req, { actionType: AUDIT_ACTIONS.ANNOUNCEMENT_UPDATED, entityRef: 'announcement', entityId: announcement.id, summary: 'Public announcement reviewed and updated; bidding dates come from the official schedule.', beforeState: before, afterState: { rfqId: announcement.rfqId, ...patch } }));
  });
  res.json(serialize(await Announcement.findByPk(req.params.id, withIncludes)));
};

export const publishAnnouncement = async (req, res) => {
  const previous = await Announcement.findByPk(req.params.id);
  if (!previous) throw workflowError('Announcement not found.', 404);
  await withAuditTransaction(async (transaction, audit) => {
    const canonical = await canonicalNotice({}, previous, transaction, { publishing: true });
    const announcement = await Announcement.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (announcement.status !== 'draft') throw workflowError('Only a draft announcement can be published.');
    const now = new Date();
    if (announcement.registrationDeadline && new Date(announcement.registrationDeadline) <= now) throw workflowError('The registration deadline has passed.', 400);
    if (announcement.expiresAt && new Date(announcement.expiresAt) <= now) throw workflowError('The announcement expiry date has passed.', 400);
    await announcement.update({ ...canonical, status: 'published', publishedAt: now, publishedByUserId: req.currentUser.id }, { transaction });
    await audit(actorAudit(req, { actionType: AUDIT_ACTIONS.ANNOUNCEMENT_PUBLISHED, entityRef: 'announcement', entityId: announcement.id, summary: 'Public announcement published using the approved official procurement schedule.', beforeState: { status: 'draft' }, afterState: { status: 'published', rfqId: announcement.rfqId, submissionDeadline: announcement.submissionDeadline, bidOpeningAt: announcement.bidOpeningAt } }));
  });
  const announcement = await Announcement.findByPk(req.params.id, withIncludes);
  if (acceptsRegistrations(announcement)) await notifyByPermission('bidding.publish', { type: NOTIFICATION_EVENTS.ANNOUNCEMENT_PUBLISHED, title: 'Call for bidders published', body: `"${announcement.title}" is open for registration.`, link: '/announcements/manage', refEntity: 'announcement', refId: announcement.id, severity: 'info' });
  res.json(serialize(announcement));
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
  assertApprovedSchedule(rfq);
  await auditFromRequest(req, { actionType: "announcement.previewGenerated", entityRef: "rfq", entityId: rfq.id, summary: "Invitation to Bid generated from the approved official schedule for review.", afterState: announcementSchedule(rfq) });

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
    procurementType: rfq.category,
    publicationDate: rfq.publicationStartAt ?? rfq.publishDate,
    prebidRequired: rfq.prebidRequired,
    venue: rfq.prebidVenue,
    prebidAt: rfq.prebidRequired ? rfq.prebidAt : null,
    submissionDeadline: rfq.closingDate,
    // Bid opening follows the deadline on the same day unless the office says
    // otherwise — the usual practice, and a sensible default the officer can
    // change rather than a blank they must fill.
    bidOpeningAt: rfq.openingDate,
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
