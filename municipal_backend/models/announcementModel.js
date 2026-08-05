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

  // Plain text, deliberately. This is rendered on a page served to the public,
  // and an authoring field that accepted markup would put the decision of what
  // HTML is safe onto whoever writes a notice. The UI preserves line breaks,
  // which is the only formatting a procurement notice has ever needed.
  body: { type: DataTypes.TEXT, allowNull: false },

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
 * Whether the notice should appear on the public portal at all.
 */
export const isPubliclyVisible = (announcement, now = new Date()) =>
  Boolean(
    announcement &&
      announcement.status === "published" &&
      (!announcement.expiresAt || new Date(announcement.expiresAt) > now)
  );
