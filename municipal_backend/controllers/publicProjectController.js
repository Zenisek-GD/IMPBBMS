import { Op } from "sequelize";
import { AuditLog } from "../models/auditLogModel.js";
import { Role } from "../models/roleModel.js";
import { Department } from "../models/departmentModel.js";
import { AppEntry } from "../models/appEntryModel.js";
import { Document, DOCUMENT_METADATA_ATTRIBUTES } from "../models/documentModel.js";
import { Announcement, acceptsRegistrations } from "../models/announcementModel.js";
import { getLguProfile } from "../models/systemSettingModel.js";
import {
  listPublicProjects,
  getPublicProject,
  getPublicSummary,
  LIFECYCLE_PHASES,
  PROJECT_CATEGORIES,
} from "../services/projectLifecycle.js";

// ── PUBLIC PROJECT API ───────────────────────────────────────────────────────
// Everything here answers anonymous requests. Three rules apply to every
// handler in this file:
//
//   1. Read only records the LGU has already approved or published. The
//      publication filter lives in services/projectLifecycle.js, at the query.
//   2. Never trust a parameter. These endpoints take input from the open
//      internet, so every id and number is validated before it reaches a query.
//   3. Serialise explicitly. Return named fields, never a model instance —
//      a column added later must not silently become public.

const num = (value) => (value === null || value === undefined ? 0 : Number(value));

export const getPublicFilters = async (req, res) => {
  const [lgu, departments, years] = await Promise.all([
    getLguProfile(),
    Department.findAll({ where: { status: "active" }, order: [["name", "ASC"]] }),
    AppEntry.findAll({
      where: { status: { [Op.in]: ["approved", "locked"] } },
      attributes: ["fiscalYear"],
      group: ["fiscalYear"],
      order: [["fiscalYear", "DESC"]],
    }),
  ]);

  res.json({
    lgu,
    categories: PROJECT_CATEGORIES,
    phases: LIFECYCLE_PHASES,
    departments: departments.map((department) => ({
      id: department.id,
      code: department.code,
      name: department.name,
    })),
    fiscalYears: years.map((row) => row.fiscalYear),
  });
};

export const getPublicOverview = async (req, res) => {
  const [lgu, summary] = await Promise.all([getLguProfile(), getPublicSummary()]);
  res.json({ lgu, ...summary });
};

export const listProjects = async (req, res) => {
  const { search, category, fiscalYear, department } = req.query;

  // Query values arrive as strings, or as arrays if a parameter is repeated.
  // Coercing to a string keeps `search` from reaching Op.like as an object.
  const projects = await listPublicProjects({
    search: typeof search === "string" ? search.slice(0, 120) : undefined,
    category: typeof category === "string" ? category : undefined,
    fiscalYear,
    department,
  });

  res.json(projects);
};

export const getProject = async (req, res) => {
  const project = await getPublicProject(req.params.id);
  if (!project) {
    return res.status(404).json({ message: "That project is not published, or does not exist." });
  }

  // The client never needs the internal id map; it is used server-side to scope
  // the timeline and document lookups and is stripped before the response.
  const { entityRefs, ...publicView } = project;
  res.json(publicView);
};

// ── TRANSPARENCY TIMELINE ────────────────────────────────────────────────────
// "Who did what, when, and why." The spine is the tamper-evident audit log:
// every entry carries the actor, their role, the outcome and a timestamp, and
// the chain hash means an entry cannot be quietly rewritten after the fact.
//
// What is deliberately withheld:
//   · IP addresses — an official's network location is not public interest.
//   · Evaluator identity and scores. IRR Sec. 58 evaluation is blind by design,
//     and this system enforces that (see Evaluation.blindFlag). Naming the
//     individual who scored a bid, or publishing the score, would undo the
//     protection the blind process exists to provide. The *fact* of evaluation
//     and the committee role are published; the person and the number are not.
//   · Raw beforeState/afterState. Only the status change and any stated reason
//     are surfaced, so an internal field added later cannot leak through.
const ACTION_LABELS = {
  "app.transition": "Annual Procurement Plan",
  "pr.transition": "Purchase Requisition",
  "rfq.published": "Invitation to Bid published",
  "bids.opened": "Bids opened",
  "evaluation.submitted": "Bid evaluation submitted",
  "evaluation.closed": "Evaluation concluded",
  "award.recommended": "Award recommended",
  "award.approved": "Notice of Award approved",
  "contract.signed": "Contract signed",
  "delivery.inspected": "Delivery inspected",
  "invoice.certified": "Invoice certified",
  "payment.released": "Payment released",
  "document.uploaded": "Document attached",
};

// Actions where the individual's name is withheld but the role is kept, so the
// public still sees which body acted without breaking blind evaluation.
const ANONYMISED_ACTIONS = new Set(["evaluation.submitted"]);

// Audit actions that never belong on a public project timeline, even if they
// somehow carried a project entity reference.
const EXCLUDED_ACTIONS = new Set([
  "auth.login.success",
  "auth.login.failed",
  "auth.logout",
  "auth.password.changed",
  "auth.password.reset",
  "access.denied",
]);

// Status keys are camelCase ("pendingHopeApproval"); the public reads prose.
// Acronyms are restored afterwards — splitting on case alone turns HOPE (Head
// of Procuring Entity) into "Hope", which reads as a different word entirely.
const ACRONYMS = { Hope: "HOPE", Bac: "BAC", Twg: "TWG", Rfq: "RFQ", Pr: "PR", Noa: "NOA", Abc: "ABC" };

const readableStatus = (value) => {
  if (typeof value !== "string" || !value) return null;

  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (char) => char.toUpperCase())
    .split(" ")
    .map((word) => ACRONYMS[word] ?? word)
    .join(" ");
};

export const getProjectTimeline = async (req, res) => {
  const project = await getPublicProject(req.params.id);
  if (!project) {
    return res.status(404).json({ message: "That project is not published, or does not exist." });
  }

  const refs = project.entityRefs;

  // One OR-group per entity kind. Built from ids the server resolved itself,
  // so a caller cannot ask for another project's trail.
  const conditions = Object.entries(refs)
    .filter(([, ids]) => ids.length > 0)
    .map(([entityRef, ids]) => ({ entityRef, entityId: { [Op.in]: ids } }));

  const entries = conditions.length
    ? await AuditLog.findAll({
        where: { [Op.or]: conditions, outcome: "success" },
        order: [["sequence", "ASC"]],
      })
    : [];

  // Audit rows store the role key ("bacChairperson"); the public wants the
  // title ("BAC Chairperson").
  const roles = await Role.findAll({ attributes: ["key", "name"] });
  const roleNames = new Map(roles.map((role) => [role.key, role.name]));

  const events = entries
    .filter((entry) => !EXCLUDED_ACTIONS.has(entry.actionType))
    .map((entry) => {
      const anonymise = ANONYMISED_ACTIONS.has(entry.actionType);
      const after = entry.afterState ?? {};
      const before = entry.beforeState ?? {};

      return {
        id: entry.id,
        sequence: entry.sequence,
        occurredAt: entry.recordedAt,
        action: ACTION_LABELS[entry.actionType] ?? readableStatus(entry.actionType),
        actionType: entry.actionType,
        summary: entry.summary,
        // Named for accountability, except where blind evaluation forbids it.
        actorName: anonymise ? null : entry.actorName,
        actorRole: roleNames.get(entry.actorRole) ?? entry.actorRole,
        actorWithheld: anonymise,
        statusFrom: readableStatus(before.status),
        statusTo: readableStatus(after.status),
        // The stated reason for a return, rejection or revision.
        note: typeof after.remarks === "string" && after.remarks.trim() ? after.remarks.trim() : null,
        source: "auditLog",
        // Lets a reviewer tie a public event back to the verifiable chain.
        recordHash: entry.hash,
      };
    });

  // Milestones the audit log does not cover — record creation is not an
  // audited *decision*, but a citizen reading a timeline still expects to see
  // when the contract was drafted or the delivery arrived.
  const milestones = [];
  const addMilestone = (occurredAt, action, detail) => {
    if (!occurredAt) return;
    milestones.push({
      id: `record-${milestones.length}`,
      sequence: null,
      occurredAt,
      action,
      actionType: "record.milestone",
      summary: detail,
      actorName: null,
      actorRole: null,
      actorWithheld: false,
      statusFrom: null,
      statusTo: null,
      note: null,
      source: "record",
      recordHash: null,
    });
  };

  for (const contract of project.records.contracts) {
    addMilestone(contract.startDate, "Contract commenced", `${contract.contractNo} took effect`);
  }
  for (const delivery of project.records.deliveries) {
    addMilestone(delivery.deliveredAt, "Delivery reported", delivery.description ?? "Goods or works delivered");
  }
  for (const payment of project.records.payments) {
    addMilestone(payment.releasedAt, "Disbursement released", `${payment.disbursementNo}`);
  }

  const timeline = [...events, ...milestones].sort(
    (a, b) => new Date(a.occurredAt) - new Date(b.occurredAt)
  );

  res.json({
    projectId: project.id,
    projectTitle: project.projectTitle,
    phases: project.phases,
    events: timeline,
    // Stated plainly so a reader knows the trail is complete rather than curated.
    disclosure:
      "Every entry below is drawn from the system's tamper-evident audit log. Evaluator identities and " +
      "individual bid scores are withheld while blind evaluation rules apply; nothing else is filtered.",
  });
};

// ── PUBLIC DOCUMENTS ─────────────────────────────────────────────────────────
// Only two attachment points are ever public:
//
//   rfq       — the solicitation itself: bid documents, terms of reference.
//   contract  — the signed agreement and its annexes.
//
// Everything else stays private, and the omissions are the point:
//   · vendor   — eligibility files hold business permits, tax records and
//                financial statements. That is a supplier's private data held
//                for a regulatory purpose, not a public record.
//   · bid      — a bidder's submission, including losing bids.
//   · invoice / delivery — commercial and banking detail.
//
// This is an allow-list. A new attachment point is private until someone adds
// it here deliberately.
const PUBLIC_ENTITY_REFS = ["rfq", "contract"];

const publicDocumentScope = (project) =>
  PUBLIC_ENTITY_REFS.map((entityRef) => ({
    entityRef,
    entityId: { [Op.in]: project.entityRefs[entityRef] ?? [] },
  })).filter((condition) => condition.entityId[Op.in].length > 0);

export const listProjectDocuments = async (req, res) => {
  const project = await getPublicProject(req.params.id);
  if (!project) {
    return res.status(404).json({ message: "That project is not published, or does not exist." });
  }

  const scope = publicDocumentScope(project);
  if (scope.length === 0) return res.json([]);

  const documents = await Document.findAll({
    where: { [Op.or]: scope },
    attributes: DOCUMENT_METADATA_ATTRIBUTES,
    order: [["uploadedAt", "DESC"]],
  });

  res.json(
    documents.map((document) => ({
      id: document.id,
      filename: document.filename,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      // Published so a downloader can verify the file was not altered.
      checksum: document.checksum,
      label: document.label,
      docType: document.docType,
      attachedTo: document.entityRef,
      uploadedAt: document.uploadedAt,
    }))
  );
};

export const downloadProjectDocument = async (req, res) => {
  const project = await getPublicProject(req.params.id);
  if (!project) {
    return res.status(404).json({ message: "That project is not published, or does not exist." });
  }

  const documentId = Number(req.params.documentId);
  if (!Number.isFinite(documentId)) {
    return res.status(400).json({ message: "Invalid document reference." });
  }

  const scope = publicDocumentScope(project);
  if (scope.length === 0) return res.status(404).json({ message: "Document not found." });

  // Scoped to this project's public attachment points, so a document id alone
  // is not enough to reach a private file.
  const document = await Document.findOne({ where: { id: documentId, [Op.or]: scope } });
  if (!document) return res.status(404).json({ message: "Document not found." });

  // Same hardening as the authenticated download path: always an attachment,
  // never rendered in our origin.
  res.setHeader("Content-Type", document.mimeType);
  res.setHeader("Content-Length", document.sizeBytes);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("Content-Disposition", `attachment; filename="${document.filename}"`);
  res.send(document.content);
};

// ── ANNOUNCEMENTS ────────────────────────────────────────────────────────────
// Two things arrive on this page and they answer different questions.
//
// A *solicitation* is derived: an RFQ that has been published is, by definition,
// an open procurement, and it should appear here without anyone remembering to
// write a post about it. But a derived list can only ever describe procurement
// that has already formally started, and the notice that matters most to a
// prospective bidder is the one that goes up before it does — "we intend to
// procure this, get accredited now". Nothing derived from an RFQ can say that,
// because there is no RFQ yet.
//
// So authored announcements are merged in alongside. Each entry carries its
// `source` so the portal can tell a written notice from an automatic listing,
// and pinned notices are held at the top regardless of date.

const DAY_MS = 86400000;
const daysUntil = (date, now) =>
  date ? Math.ceil((new Date(date) - now) / DAY_MS) : null;

// The public view of an authored notice. Explicitly serialised, per rule 3
// above: `status`, the author, the publisher and the withdrawal reason all exist
// on the row and none of them belongs on a public page.
const publicAnnouncement = (announcement, now) => ({
  source: "announcement",
  id: announcement.id,
  title: announcement.title,
  body: announcement.body,
  category: announcement.category,
  referenceNo: announcement.referenceNo,
  pinned: announcement.pinned,
  publishedAt: announcement.publishedAt,

  // Present only while the call is genuinely open. A closed deadline is dropped
  // rather than shown greyed out, because the sort below treats a null deadline
  // as "not a call for bidders" and the portal renders the badge off this field.
  registrationDeadline: acceptsRegistrations(announcement, now)
    ? announcement.registrationDeadline
    : null,
  registrationClosesInDays: acceptsRegistrations(announcement, now)
    ? daysUntil(announcement.registrationDeadline, now)
    : null,

  projectId: announcement.appEntryId ?? null,
  projectTitle: announcement.project?.projectTitle ?? null,
});

export const listAnnouncements = async (req, res) => {
  const now = new Date();

  // Assembled in one pass rather than re-fetching each project: this endpoint
  // is unauthenticated, so a per-row query would be a cheap way to load the
  // database from outside.
  const [projects, authored] = await Promise.all([
    listPublicProjects({ detailed: true }),
    Announcement.findAll({
      // The publication filter is at the query, not in the serialiser. A draft
      // must never be loaded here in the first place.
      where: {
        status: "published",
        [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: now } }],
      },
      include: [{ model: AppEntry, as: "project", attributes: ["id", "projectTitle"] }],
      order: [["publishedAt", "DESC"]],
    }),
  ]);

  const entries = authored.map((announcement) => publicAnnouncement(announcement, now));

  for (const project of projects) {
    if (project.category !== "ongoing") continue;
    for (const solicitation of project.records.solicitations) {
      if (solicitation.status !== "published") continue;
      entries.push({
        source: "solicitation",
        // Namespaced: solicitation ids and announcement ids come from different
        // tables and would otherwise collide as React keys on the same list.
        id: `rfq-${project.id}-${solicitation.referenceNo}`,
        category: "procurementOpportunity",
        projectId: project.id,
        projectTitle: project.projectTitle,
        referenceNo: solicitation.referenceNo,
        title: solicitation.title,
        mode: solicitation.mode,
        abc: num(solicitation.abc),
        publishDate: solicitation.publishDate,
        publishedAt: solicitation.publishDate,
        closingDate: solicitation.closingDate,
        closingInDays: daysUntil(solicitation.closingDate, now),
        implementingUnit: project.implementingUnit,
        pinned: false,
      });
    }
  }

  // Pinned first, then newest. A bidding calendar the office wants read stays at
  // the top; everything else falls back to recency, which is what a reader
  // checking "what is new" expects.
  entries.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.publishedAt ?? 0) - new Date(a.publishedAt ?? 0);
  });

  res.json(entries);
};
