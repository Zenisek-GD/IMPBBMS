import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";
import { AppEntry } from "./appEntryModel.js";

// ─────────────────────────────────────────────────────────────────────────────
// Authored public announcements.
//
// There was already a public /announcements endpoint, but it *derived* its list
// from RFQs that had been published — it could only ever describe procurement
// that had already formally started. The LGU's actual practice is the opposite
// way round: a notice goes up first, precisely so that prospective bidders know
// something is coming and have time to get accredited before it does. Nothing
// derived from an RFQ can express that, because at the moment the notice matters
// most there is no RFQ yet.
//
// So announcements are written, not inferred. The derived list still exists and
// still feeds the public tab (see listAnnouncements) — an RFQ going live is worth
// announcing whether or not anyone wrote a post about it — but it is now one of
// two sources rather than the only one.
// ─────────────────────────────────────────────────────────────────────────────

export const ANNOUNCEMENT_CATEGORIES = [
  "procurementOpportunity",
  "newProject",
  "systemUpdate",
  "general",
];

export const ANNOUNCEMENT_CATEGORY_LABELS = {
  procurementOpportunity: "Procurement Opportunity",
  newProject: "New Project",
  systemUpdate: "System Update",
  general: "General Notice",
};

export const Announcement = sequelize.define("Announcement", {
  title: { type: DataTypes.STRING(200), allowNull: false },

  // Plain text. Kept as the canonical body for existing notices and for the
  // short ones an office types straight in.
  body: { type: DataTypes.TEXT, allowNull: false },

  // ── Rich body ─────────────────────────────────────────────────────────────
  // This field previously did not exist, and the comment above explained why:
  // an authoring field that accepted markup would put the decision of what HTML
  // is safe onto whoever writes a notice.
  //
  // That reasoning was right, and what changed is not the risk but the defence.
  // `services/htmlSanitizer.js` now filters authored markup through a tag and
  // CSS allow-list before anything is stored or served, so the decision no
  // longer rests with the author. An Invitation to Bid genuinely needs more
  // than line breaks — a schedule table, an emphasised deadline, a list of
  // eligibility requirements — and typing those as plain text produced notices
  // nobody could read.
  //
  // `body` is retained alongside it and kept in step as a plain-text rendering,
  // so anything consuming the old field (search, an export, a plain-text digest)
  // keeps working and never has to strip tags itself.
  bodyHtml: { type: DataTypes.TEXT("long"), allowNull: true },

  category: {
    type: DataTypes.ENUM(...ANNOUNCEMENT_CATEGORIES),
    allowNull: false,
    defaultValue: "general",
  },

  // Drafts are invisible to the public API. A notice about an upcoming
  // procurement is often written before the office is ready to commit to it, and
  // a post that goes live the moment it is typed cannot be prepared in advance.
  status: {
    type: DataTypes.ENUM("draft", "published", "archived"),
    allowNull: false,
    defaultValue: "draft",
  },

  publishedAt: { type: DataTypes.DATE, allowNull: true },

  // ── Scheduled publication ─────────────────────────────────────────────────
  // When the office wants the notice to go live, as distinct from when it
  // actually did. Two fields rather than one because they answer different
  // questions and can legitimately differ: a notice scheduled for Monday that
  // the scheduler picked up at 00:04 was published at 00:04, and an auditor
  // asking "when did the public first see this?" wants the second number.
  //
  // A notice with a future publishAt stays a draft until the sweep in
  // `releaseScheduledAnnouncements` promotes it, so nothing is publicly visible
  // ahead of its date even if the sweep is late.
  publishAt: { type: DataTypes.DATE, allowNull: true },

  // Set when the notice is retired. Archived notices stay readable on the
  // public portal under a separate view — a closed procurement that vanishes
  // from the record is the opposite of transparency.
  archivedAt: { type: DataTypes.DATE, allowNull: true },

  // Optional. Past this moment the notice stops being served publicly without
  // anyone having to remember to take it down — which matters for exactly the
  // notices that carry a deadline, since a call for bidders that stays on the
  // page for a year after it closed is worse than no notice at all.
  expiresAt: { type: DataTypes.DATE, allowNull: true },

  // ── The bidder registration deadline ──────────────────────────────────────
  // The cutoff for submitting accreditation requirements against this call.
  //
  // Its presence is the single thing that makes an announcement a call for
  // bidders — there is no separate "accepts registrations" flag, because two
  // fields expressing one fact is two fields that can disagree. An announcement
  // is open for registration exactly when it is published, this date is set, and
  // that date has not passed.
  //
  // Missing it excludes an applicant from *this* call, not from the system.
  // Accreditation remains a standing status once granted: a verified bidder does
  // not have to re-apply for every opportunity, which is both how the BAC works
  // and what IRR Sec. 52's registry-based eligibility assumes.
  registrationDeadline: { type: DataTypes.DATE, allowNull: true },

  // Kept at the top of the public list regardless of date. For the notice the
  // office actually wants read — a bidding calendar, a change of venue — which
  // would otherwise sink as newer routine posts arrive.
  pinned: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

  // Free text: "ITB-2026-014", a resolution number, whatever the office quotes.
  // Not a foreign key, because at announcement time the reference frequently
  // belongs to a document that does not exist in this system yet.
  referenceNo: { type: DataTypes.STRING(60), allowNull: true },

  // ── Invitation to Bid particulars ─────────────────────────────────────────
  // The details RA 12009 expects an invitation to carry. They are held on the
  // notice rather than read live from the linked solicitation for one reason
  // that matters: a published notice is a public representation, and it must
  // not change silently because somebody edited the RFQ behind it. The link
  // below *populates* these once; from then on the notice says what it said.
  //
  // They are also nullable because a notice can legitimately precede the
  // solicitation — that is the case the whole announcements feature exists for.
  abc: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
  fundSource: { type: DataTypes.STRING(120), allowNull: true },
  procurementMethod: { type: DataTypes.STRING(120), allowNull: true },
  procurementMethodCitation: { type: DataTypes.STRING(60), allowNull: true },

  // The three dates a bidder actually plans around.
  prebidAt: { type: DataTypes.DATE, allowNull: true },
  submissionDeadline: { type: DataTypes.DATE, allowNull: true },
  bidOpeningAt: { type: DataTypes.DATE, allowNull: true },
  venue: { type: DataTypes.STRING(200), allowNull: true },

  // Who a prospective bidder calls. An invitation without this is a notice the
  // reader cannot act on.
  contactPerson: { type: DataTypes.STRING(120), allowNull: true },
  contactEmail: { type: DataTypes.STRING(160), allowNull: true },
  contactPhone: { type: DataTypes.STRING(60), allowNull: true },

  // Marks a notice created by duplicating another, so the office can tell a
  // reused template from one written fresh.
  duplicatedFromId: { type: DataTypes.INTEGER, allowNull: true },

  // The solicitation this notice invites bids for, once one exists.
  //
  // A plain column rather than a declared association: biddingModel.js imports
  // this file's neighbours, and a belongsTo pointing that way would close the
  // import cycle. The controller joins it explicitly, which is the only place
  // it is needed.
  //
  // Its job is to *populate* the particulars above at authoring time, not to be
  // read at render time — see the note on those fields.
  rfqId: { type: DataTypes.INTEGER, allowNull: true },
});

// The planned procurement this notice is about, when there is one.
//
// An AppEntry rather than an Rfq on purpose: the public project pages are keyed
// on AppEntry ids, and an APP entry exists during planning — before a
// requisition, and long before a solicitation. That is what lets a notice
// published ahead of the procurement still link a reader to the project record.
Announcement.belongsTo(AppEntry, { as: "project", foreignKey: "appEntryId" });

Announcement.belongsTo(User, { as: "author", foreignKey: "createdByUserId" });

// Held separately from the author: the person who wrote a notice and the person
// who decided it should go out to the public are not always the same, and it is
// the second one the audit trail is interested in.
Announcement.belongsTo(User, { as: "publisher", foreignKey: "publishedByUserId" });

/**
 * Whether this announcement is currently accepting bidder registrations.
 *
 * Used by both the public serialiser and the intake controller, so the badge a
 * prospective bidder reads on the portal and the rule that actually accepts or
 * refuses their submission can never disagree.
 */
export const acceptsRegistrations = (announcement, now = new Date()) =>
  Boolean(
    announcement &&
      announcement.status === "published" &&
      announcement.registrationDeadline &&
      new Date(announcement.registrationDeadline) > now
  );

/**
 * Whether the notice should appear on the public portal's *current* list.
 */
export const isPubliclyVisible = (announcement, now = new Date()) =>
  Boolean(
    announcement &&
      announcement.status === "published" &&
      (!announcement.expiresAt || new Date(announcement.expiresAt) > now)
  );

/**
 * Whether the notice belongs in the public *archive*.
 *
 * Deliberately wider than "someone pressed archive": a published notice that
 * has simply expired is also archived from the reader's point of view, and
 * dropping it off the portal entirely would erase the record of a procurement
 * that ran. Transparency is not only about what is open now.
 */
export const isPubliclyArchived = (announcement, now = new Date()) =>
  Boolean(
    announcement &&
      ((announcement.status === "archived" && announcement.publishedAt) ||
        (announcement.status === "published" &&
          announcement.expiresAt &&
          new Date(announcement.expiresAt) <= now))
  );

/**
 * Whether the submission deadline on this notice has passed.
 *
 * Separate from expiry: a notice can and should stay readable after bidding
 * closes. This is what drives the "closed" badge rather than removal.
 */
export const submissionsClosed = (announcement, now = new Date()) =>
  Boolean(announcement?.submissionDeadline && new Date(announcement.submissionDeadline) <= now);

/**
 * Promotes drafts whose scheduled publication time has arrived.
 *
 * Returns the notices it released. Called from the public and authoring list
 * endpoints rather than a background job, so a scheduled notice goes live on
 * the first request after its time whether or not a scheduler is running —
 * the alternative is a notice that silently never publishes because nobody
 * wired up cron. `dispatchUnexpendedAlerts` has the same shape and the same
 * caveat: attach it to a real scheduler for punctual releases.
 */
export const releaseScheduledAnnouncements = async (now = new Date()) => {
  const { Op } = await import("sequelize");

  const due = await Announcement.findAll({
    where: {
      status: "draft",
      publishAt: { [Op.ne]: null, [Op.lte]: now },
    },
  });

  for (const announcement of due) {
    // An expiry already in the past would publish and immediately hide it,
    // which reads as the scheduler having failed. Left as a draft for a human.
    if (announcement.expiresAt && new Date(announcement.expiresAt) <= now) continue;
    await announcement.update({ status: "published", publishedAt: now });
  }

  return due;
};
