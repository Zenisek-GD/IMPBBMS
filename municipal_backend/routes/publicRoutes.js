import express from "express";
import {
  getTransparencyOverview,
  listPublishedApp,
  listPublishedProcurements,
  listPublishedAwards,
} from "../controllers/transparencyController.js";
import { getPublicBranding } from "../controllers/settingsController.js";
import {
  getPublicFilters,
  getPublicOverview,
  listProjects,
  getProject,
  getProjectTimeline,
  listProjectDocuments,
  downloadProjectDocument,
  listAnnouncements,
  listArchivedAnnouncements,
  listPublicAnnouncementAttachments,
  downloadPublicAnnouncementAttachment,
} from "../controllers/publicProjectController.js";
import { submitPublicMessage } from "../controllers/publicMessageController.js";
import {
  listPublicDocuments,
  downloadPublicDocument,
} from "../controllers/generatedDocumentController.js";
import { rateLimit } from "../middleware/rateLimitMiddleware.js";

// ── PUBLIC API ──────────────────────────────────────────────────────────────
// Everything mounted under /api/public is reachable with no session and no
// account, by anyone. That is the point: RA 12009 requires procurement
// information to be publicly accessible, and requiring a citizen to be issued
// an account before they can read it would defeat that.
//
// The prefix is what makes the boundary legible. Anything added here is
// published to the world, so it must:
//   1. read only records the LGU has already approved or published, and
//   2. be filtered in the controller, never in the UI.
//
// The transparency controller already does both — it queries published states
// at the source and its serialisers omit internal fields (return remarks,
// evaluator scores, justifications, creator identities) even where the
// underlying row carries them.
//
// Do NOT mount an authenticated endpoint here to save writing a route.
//
// ── The one write ────────────────────────────────────────────────────────────
// This surface was READ ONLY with no exceptions, and stayed that way when a
// bidder-requirements intake endpoint was removed: accreditation documents are
// submitted in person at the BAC office, so there was nothing for the public to
// write.
//
// `POST /messages` is now the single deliberate exception. A portal that
// publishes a figure and offers no way to say "that figure is wrong" is only
// half a transparency portal, and the alternative — an email address in the
// footer — routes nowhere and is answerable by nobody.
//
// It is safe to be here because of what it is *not*: it writes to its own
// correspondence table, it touches no procurement record, it enters nothing into
// the audit chain, and it cannot address itself to an office of the sender's
// choosing. See controllers/publicMessageController.js.
const router = express.Router();

// Anonymous traffic still gets a ceiling so the portal cannot be used to hammer
// the database. It is generous — a citizen browsing tabs makes several requests
// per minute — and separate from the auth buckets so public browsing can never
// lock anybody out of signing in.
router.use(rateLimit({ bucket: "public", max: 600 }));

// System branding — the login screen, the public header and the transparency
// footer all need the admin-configured system name. No auth required.
router.get("/branding", getPublicBranding);

router.get("/transparency/overview", getTransparencyOverview);
router.get("/transparency/app", listPublishedApp);
router.get("/transparency/procurements", listPublishedProcurements);
router.get("/transparency/awards", listPublishedAwards);

// ── Project-centric public portal ───────────────────────────────────────────
// The record-type views above answer "show me the APP / the bids / the awards".
// These answer the question a citizen actually asks: "what is happening with
// this project, and who decided it?" Same publication boundary, assembled
// across the lifecycle instead of one table at a time.
router.get("/projects", listProjects);
router.get("/projects/filters", getPublicFilters);
router.get("/projects/overview", getPublicOverview);
router.get("/announcements", listAnnouncements);

// The archive: notices the office retired, and published notices that have
// simply expired. Kept publicly readable because a procurement that vanishes
// from the record once it closes is the opposite of transparency.
router.get("/announcements/archive", listArchivedAnnouncements);

// Bidding documents, terms of reference and specifications attached to a
// published notice. Unauthenticated by design — that is what public posting
// means — and scoped to the notice, so an attachment id from an unpublished
// notice cannot be fetched by pairing it with a published one.
router.get("/announcements/:id/attachments", listPublicAnnouncementAttachments);
router.get(
  "/announcements/:id/attachments/:documentId",
  downloadPublicAnnouncementAttachment
);

// Officially issued documents the municipality has chosen to publish —
// Notices of Award and Notices to Proceed. Narrowed at the query to approved
// AND published AND a publishable *type*, so no unapproved or internal
// document can be reached by guessing an id.
router.get("/documents", listPublicDocuments);
router.get("/documents/:id/download", downloadPublicDocument);

// Registered after the fixed paths above so "/projects/filters" is not
// swallowed by the ":id" parameter.
router.get("/projects/:id", getProject);
router.get("/projects/:id/timeline", getProjectTimeline);
router.get("/projects/:id/documents", listProjectDocuments);
router.get("/projects/:id/documents/:documentId/download", downloadProjectDocument);

// Its own bucket, far tighter than the browsing one above: reading is cheap and
// should be generous, writing is not. Five in the window is more than any honest
// citizen needs and small enough that flooding the officers' inbox is not worth
// attempting from one address.
router.post(
  "/messages",
  rateLimit({ bucket: "publicMessage", max: 5 }),
  submitPublicMessage
);

export default router;
