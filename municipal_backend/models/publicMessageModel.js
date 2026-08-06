import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";

// ── MESSAGES FROM THE PUBLIC ─────────────────────────────────────────────────
// The one thing a citizen may write to. Everything else under /api/public is
// read-only, and deliberately so — this is the single exception, because a
// transparency portal that publishes a figure and offers no way to say "that
// figure is wrong" is only half a transparency portal.
//
// It is not part of the procurement record and never becomes one. A message is
// inbound correspondence: it is routed to the office responsible for the subject
// it names, and that office decides whether anything follows. Nothing here
// enters the audit chain as a municipal act, because a member of the public
// sending an email is not one.
//
// ── On the personal data ─────────────────────────────────────────────────────
// Name and email are optional. Someone reporting a procurement irregularity may
// have good reason not to identify themselves, and forcing a name would filter
// out exactly the reports most worth receiving. A message with no contact
// details simply cannot be replied to, which the form says.

// Category → the permission that answers it. Routing by *permission* rather than
// by role means the mapping survives a role being renamed or a duty moving
// office: whoever holds the permission gets the message, which is the same rule
// the rest of the system already uses to decide who may act on what.
export const MESSAGE_ROUTING = {
  projectEnquiry: {
    label: "A project or contract",
    permission: "bidding.publish",
    hint: "Handled by the BAC Secretariat, which keeps the procurement record.",
  },
  dataCorrection: {
    label: "Something published here looks wrong",
    // `audit.export`, not `audit.viewAll`. Nine roles hold viewAll — the Mayor,
    // the Budget Officer, the Treasurer, the Accountant, both BAC chairs and
    // more — so routing to it would have put every correction report in nine
    // inboxes. That is broadcasting, not routing, and it is how a message ends
    // up being everyone's to read and nobody's to answer.
    //
    // `audit.export` is the Internal Auditor's alone, which is what makes it a
    // usable address for "this office, specifically".
    permission: "audit.export",
    hint: "Handled by the Internal Auditor.",
  },
  bidderEnquiry: {
    label: "Becoming an accredited bidder",
    permission: "bidding.publish",
    hint: "Handled by the BAC Secretariat.",
  },
  procurementComplaint: {
    label: "A complaint about a procurement",
    permission: "protest.decide",
    hint: "Goes to the Head of the Procuring Entity — the Municipal Mayor.",
  },
  siteProblem: {
    label: "A problem with this website",
    permission: "settings.manage",
    hint: "Handled by the system administrator.",
  },
  other: {
    label: "Something else",
    permission: "settings.manage",
    hint: "Routed to the administrator, who will pass it on.",
  },
};

export const MESSAGE_CATEGORIES = Object.keys(MESSAGE_ROUTING);

export const PublicMessage = sequelize.define(
  "PublicMessage",
  {
    // Optional: see the note above on anonymous reports.
    senderName: { type: DataTypes.STRING(190), allowNull: true },
    senderEmail: { type: DataTypes.STRING(190), allowNull: true },

    category: {
      type: DataTypes.ENUM(...MESSAGE_CATEGORIES),
      allowNull: false,
      defaultValue: "other",
    },

    subject: { type: DataTypes.STRING(200), allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },

    // Which permission this was routed to, recorded at the time of sending. Kept
    // as a stored value rather than re-derived from the category on read: if the
    // routing table is ever changed, a message must still show where it actually
    // went, not where it would go today.
    routedToPermission: { type: DataTypes.STRING(80), allowNull: false },

    // A citizen may name the project they are writing about. Free text, because
    // they are reading a reference off a page and should not have to match an id.
    referenceHint: { type: DataTypes.STRING(190), allowNull: true },

    status: {
      type: DataTypes.ENUM("new", "acknowledged", "closed"),
      allowNull: false,
      defaultValue: "new",
    },
    handledAt: { type: DataTypes.DATE, allowNull: true },
    handlingNotes: { type: DataTypes.TEXT, allowNull: true },

    // Kept for abuse handling only. It is the one thing here that is not shown
    // to the officer reading the message.
    ipAddress: { type: DataTypes.STRING(64), allowNull: true },
  },
  { indexes: [{ fields: ["status"] }, { fields: ["routedToPermission"] }] }
);

PublicMessage.belongsTo(User, { as: "handledBy", foreignKey: "handledById" });

export { sequelize };
