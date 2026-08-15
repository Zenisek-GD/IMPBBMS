import { Op } from "sequelize";
import { AuditLog } from "../models/auditLogModel.js";
import { Role } from "../models/roleModel.js";
import { User } from "../models/userModel.js";
import { Department } from "../models/departmentModel.js";
import { AppEntry } from "../models/appEntryModel.js";
import { Document, DOCUMENT_METADATA_ATTRIBUTES } from "../models/documentModel.js";
import {
  Announcement,
  acceptsRegistrations,
  submissionsClosed,
  isPubliclyVisible,
  isPubliclyArchived,
  releaseScheduledAnnouncements,
} from "../models/announcementModel.js";
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
  "pr.mode.determined": "Procurement method decided",
  "rfq.published": "Invitation to Bid published",
  "observers.invited": "Observers invited",
  "bids.opened": "Bids opened",
  "evaluation.submitted": "Bid evaluation submitted",
  "evaluation.closed": "Evaluation concluded",
  "award.recommended": "Award recommended",
  "award.approved": "Notice of Award approved",
  "contract.signed": "Contract signed",
  "contract.ntp.issued": "Notice to Proceed issued",
  "delivery.inspected": "Delivery inspected",
  "invoice.certified": "Invoice certified",
  "payment.released": "Payment released",
  "document.uploaded": "Document attached",
};

// Which of the eight published lifecycle stages each action belongs to, so the
// timeline can be grouped under the same headings as the progress rail rather
// than presenting one flat run of entries. Keys match LIFECYCLE_PHASES in
// services/projectLifecycle.js; an action absent here is grouped by the stage
// of the entry before it, so a new action type degrades to "same stage as the
// last one" instead of vanishing into an unlabelled group.
const ACTION_STAGES = {
  "app.transition": "planning",
  "pr.transition": "requisition",
  "pr.mode.determined": "requisition",
  "rfq.published": "solicitation",
  "observers.invited": "solicitation",
  "bids.opened": "bidding",
  "evaluation.submitted": "evaluation",
  "evaluation.closed": "evaluation",
  "award.recommended": "award",
  "award.approved": "award",
  "contract.signed": "contract",
  "contract.ntp.issued": "contract",
  "delivery.inspected": "completion",
  "invoice.certified": "completion",
  "payment.released": "completion",
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

// Whole families that are never public, whatever entity they were recorded
// against. The explicit set above predates MFA and the security console, and
// listing each new action type individually means a family only stays private
// for as long as someone remembers to extend the list — so account-security and
// system-security trails are excluded by prefix instead.
const EXCLUDED_ACTION_PREFIXES = ["auth.", "security."];

const isPublicAction = (actionType) =>
  typeof actionType === "string" &&
  !EXCLUDED_ACTIONS.has(actionType) &&
  !EXCLUDED_ACTION_PREFIXES.some((prefix) => actionType.startsWith(prefix));

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
    .filter((entry) => isPublicAction(entry.actionType))
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
        stage: ACTION_STAGES[entry.actionType] ?? null,
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
  const addMilestone = (occurredAt, action, detail, stage) => {
    if (!occurredAt) return;
    milestones.push({
      id: `record-${milestones.length}`,
      sequence: null,
      occurredAt,
      action,
      actionType: "record.milestone",
      stage,
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
    addMilestone(contract.startDate, "Contract commenced", `${contract.contractNo} took effect`, "contract");
  }
  for (const delivery of project.records.deliveries) {
    addMilestone(
      delivery.deliveredAt,
      "Delivery reported",
      delivery.description ?? "Goods or works delivered",
      "completion"
    );
  }
  for (const payment of project.records.payments) {
    addMilestone(payment.releasedAt, "Disbursement released", `${payment.disbursementNo}`, "completion");
  }

  const timeline = [...events, ...milestones].sort(
    (a, b) => new Date(a.occurredAt) - new Date(b.occurredAt)
  );

  // Carry the last known stage forward over any entry ACTION_STAGES does not
  // name, so an action type added later joins the group it chronologically
  // belongs to instead of forming an "Other" bucket at the end of the page.
  // Done after the sort, because "the stage before it" only means anything once
  // the entries are in time order.
  let carried = project.phases?.[0]?.key ?? null;
  for (const event of timeline) {
    if (event.stage) carried = event.stage;
    else event.stage = carried;
  }

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
// The public rendering of an authored notice, including the Invitation to Bid
// particulars a prospective bidder needs to act on it.
//
// Exported so the authoring console's *preview* can call this exact function.
// Rendering a preview through a second, parallel serialiser would show the
// officer something the public will never see, which is worse than offering no
// preview at all.
//
// It deliberately omits author, publisher, draft state and withdrawal history —
// everything the internal serialiser carries and the public must not.
export const publicAnnouncement = (announcement, now) => ({
  source: "announcement",
  id: announcement.id,
  title: announcement.title,
  body: announcement.body,
  // The rich body when the office wrote one; `body` remains the plain-text
  // fallback, so a portal that renders only text still works.
  bodyHtml: announcement.bodyHtml ?? null,
  category: announcement.category,
  referenceNo: announcement.referenceNo,
  pinned: announcement.pinned,
  publishedAt: announcement.publishedAt,
  archivedAt: announcement.archivedAt ?? null,

  // ── Invitation to Bid particulars ─────────────────────────────────────────
  // Shown whether or not bidding is still open: after the deadline these are
  // the record of what was advertised, which is the whole point of keeping
  // closed notices readable.
  abc: announcement.abc === null || announcement.abc === undefined ? null : num(announcement.abc),
  fundSource: announcement.fundSource ?? null,
  procurementMethod: announcement.procurementMethod ?? null,
  procurementMethodCitation: announcement.procurementMethodCitation ?? null,
  prebidAt: announcement.prebidAt ?? null,
  submissionDeadline: announcement.submissionDeadline ?? null,
  submissionClosesInDays: daysUntil(announcement.submissionDeadline, now),
  bidOpeningAt: announcement.bidOpeningAt ?? null,
  venue: announcement.venue ?? null,

  // Contact details are published on purpose — an invitation a reader cannot
  // follow up is not an invitation. These are the office's own published
  // contacts, not personal data of a third party.
  contactPerson: announcement.contactPerson ?? null,
  contactEmail: announcement.contactEmail ?? null,
  contactPhone: announcement.contactPhone ?? null,

  submissionsClosed: submissionsClosed(announcement, now),
  isArchived: isPubliclyArchived(announcement, now),

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

  // A notice scheduled for today goes live on the first request after its time,
  // whether or not anyone wired up a scheduler. Doing it here rather than only
  // in a cron job means a schedule cannot silently never fire.
  await releaseScheduledAnnouncements(now);

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

  // ── Search, filter and sort ───────────────────────────────────────────────
  // Applied after the two sources are merged, because a reader searching the
  // portal is searching *notices*, not one table or the other. Doing it in SQL
  // would only cover the authored half and silently miss every derived
  // solicitation.
  const filtered = applyPublicFilters(entries, req.query, now);

  res.json(filtered);
};

// Shared by the current and archived listings so the two cannot drift.
const applyPublicFilters = (entries, query = {}, now = new Date()) => {
  let rows = entries;

  const search = String(query.search ?? "").trim().toLowerCase();
  if (search) {
    rows = rows.filter((entry) =>
      [entry.title, entry.referenceNo, entry.projectTitle, entry.body, entry.procurementMethod]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(search))
    );
  }

  if (query.category) rows = rows.filter((entry) => entry.category === query.category);

  // "Open" means a bidder can still act on it. Derived rather than stored,
  // so it stays true as deadlines pass without anything having to update rows.
  if (query.status === "open") {
    rows = rows.filter((entry) => !entry.submissionsClosed && !entry.isArchived);
  } else if (query.status === "closed") {
    rows = rows.filter((entry) => entry.submissionsClosed || entry.isArchived);
  }

  if (query.acceptingRegistrations === "true") {
    rows = rows.filter((entry) => Boolean(entry.registrationDeadline));
  }

  const direction = query.order === "asc" ? 1 : -1;
  const sorters = {
    // Pinned first, then newest. A bidding calendar the office wants read stays
    // at the top; everything else falls back to recency, which is what a reader
    // checking "what is new" expects.
    published: (a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return direction * (new Date(a.publishedAt ?? 0) - new Date(b.publishedAt ?? 0));
    },
    // Soonest deadline first, with notices that carry no deadline last rather
    // than sorted as if they were due in 1970.
    deadline: (a, b) => {
      const left = a.submissionDeadline ?? a.closingDate;
      const right = b.submissionDeadline ?? b.closingDate;
      if (!left && !right) return 0;
      if (!left) return 1;
      if (!right) return -1;
      return direction * (new Date(left) - new Date(right));
    },
    abc: (a, b) => direction * ((a.abc ?? 0) - (b.abc ?? 0)),
    title: (a, b) => direction * String(a.title ?? "").localeCompare(String(b.title ?? "")),
  };

  return [...rows].sort(sorters[query.sort] ?? sorters.published);
};

// ── The archive ──────────────────────────────────────────────────────────────
// Notices the office archived, and published notices that have simply expired.
// Kept publicly readable on purpose: a procurement that vanishes from the record
// once it closes is the opposite of transparency, and the archive is what lets a
// citizen check what was advertised months later.
export const listArchivedAnnouncements = async (req, res) => {
  const now = new Date();

  const rows = await Announcement.findAll({
    where: {
      [Op.or]: [
        // Archived by hand — but only if it was ever published. A draft that was
        // archived was never public and must not become public now.
        { status: "archived", publishedAt: { [Op.ne]: null } },
        { status: "published", expiresAt: { [Op.ne]: null, [Op.lte]: now } },
      ],
    },
    include: [{ model: AppEntry, as: "project", attributes: ["id", "projectTitle"] }],
    order: [["publishedAt", "DESC"]],
    limit: Math.min(Number(req.query.limit) || 200, 500),
  });

  res.json(applyPublicFilters(rows.map((row) => publicAnnouncement(row, now)), req.query, now));
};

// ── Attachments on a published notice ────────────────────────────────────────
// The bidding documents, terms of reference and specifications a prospective
// bidder needs. Unauthenticated by design — that is what "public posting" means.
const publiclyReadableNotice = async (id, now) => {
  const announcement = await Announcement.findByPk(Number(id));
  if (!announcement) return null;
  // Readable if it is live *or* archived: the papers behind a closed
  // procurement remain part of the public record.
  return isPubliclyVisible(announcement, now) || isPubliclyArchived(announcement, now)
    ? announcement
    : null;
};

export const listPublicAnnouncementAttachments = async (req, res) => {
  const announcement = await publiclyReadableNotice(req.params.id, new Date());
  if (!announcement) {
    return res.status(404).json({ message: "That notice is not published, or does not exist." });
  }

  const files = await Document.findAll({
    where: { entityRef: "announcement", entityId: announcement.id },
    attributes: DOCUMENT_METADATA_ATTRIBUTES,
    order: [["uploadedAt", "ASC"]],
  });

  res.json(
    files.map((file) => ({
      id: file.id,
      filename: file.filename,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      // Published so a downloader can confirm the file was not altered.
      checksum: file.checksum,
      label: file.label,
      uploadedAt: file.uploadedAt,
      downloadUrl: `/api/public/announcements/${announcement.id}/attachments/${file.id}`,
    }))
  );
};

export const downloadPublicAnnouncementAttachment = async (req, res) => {
  const announcement = await publiclyReadableNotice(req.params.id, new Date());
  if (!announcement) {
    return res.status(404).json({ message: "That notice is not published, or does not exist." });
  }

  // Scoped to this notice, so an id from an unpublished notice cannot be
  // fetched by pairing it with a published one.
  const file = await Document.findOne({
    where: {
      id: Number(req.params.documentId),
      entityRef: "announcement",
      entityId: announcement.id,
    },
  });
  if (!file) return res.status(404).json({ message: "That attachment does not exist." });

  // Same hardening the authenticated attachment route applies: never inline,
  // never sniffed, never able to execute in this origin.
  res.setHeader("Content-Type", file.mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("X-Checksum-SHA256", file.checksum);
  res.send(file.content);
};

// ── OFFICIALS ────────────────────────────────────────────────────────────────
// Who is accountable for the records on this portal.
//
// RA 12009 makes procurement decisions attributable to named officials, and a
// transparency portal that publishes a Notice of Award without publishing who
// signs such notices only tells half the story. This lists the offices and the
// people holding them — nothing more.
//
// What is deliberately NOT published: email addresses, telephone numbers,
// account status, last sign-in, or any other operational field. A citizen needs
// to know who holds a position; publishing a working official's contact record
// invites harassment and is not what accountability requires. Correspondence
// goes through the contact form, which routes by subject.
//
// Only `active` accounts appear. A deactivated or pending-activation account is
// not a person currently holding the office.
// Keys as seeded in seed.js — `hope` is the Head of the Procuring Entity.
// Observers are deliberately absent: IRR Sec. 43 seats them from civil society
// and professional bodies, so they are private persons attending in a watchdog
// capacity, not officers of this LGU. Publishing their names is not this
// portal's to do.
const PUBLISHED_ROLE_KEYS = [
  "hope",
  "bacChairperson",
  "bacViceChairperson",
  "bacMember",
  "bacSecretariat",
  "twgMember",
  "budgetOfficer",
  "municipalAccountant",
  "municipalTreasurer",
  "planningOfficer",
  "internalAuditor",
];

// Presentation order: the committee first, then the finance and planning
// offices. Sorting by role rather than by name keeps the list reading as an
// organisation chart instead of a directory.
const ROLE_RANK = new Map(PUBLISHED_ROLE_KEYS.map((key, index) => [key, index]));

export const listPublicOfficials = async (_req, res) => {
  const officials = await User.findAll({
    where: { status: "active" },
    attributes: ["id", "name"],
    include: [
      { model: Role, attributes: ["key", "name"], where: { key: PUBLISHED_ROLE_KEYS }, required: true },
      { model: Department, attributes: ["name", "code"], required: false },
    ],
    order: [["name", "ASC"]],
  });

  const serialised = officials
    .map((official) => ({
      id: official.id,
      name: official.name,
      roleKey: official.Role.key,
      roleName: official.Role.name,
      office: official.Department?.name ?? null,
      officeCode: official.Department?.code ?? null,
    }))
    .sort(
      (a, b) =>
        (ROLE_RANK.get(a.roleKey) ?? 99) - (ROLE_RANK.get(b.roleKey) ?? 99) ||
        a.name.localeCompare(b.name)
    );

  res.json(serialised);
};
