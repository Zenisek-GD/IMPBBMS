import express from "express";
import {
  getTransparencyOverview,
  listPublishedApp,
  listPublishedProcurements,
  listPublishedAwards,
} from "../controllers/transparencyController.js";
import {
  getPublicFilters,
  getPublicOverview,
  listProjects,
  getProject,
  getProjectTimeline,
  listProjectDocuments,
  downloadProjectDocument,
  listAnnouncements,
} from "../controllers/publicProjectController.js";
import { submitBidderRequirements } from "../controllers/bidderIntakeController.js";
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
// One exception to "read only", added deliberately: bidder requirements intake.
// See the note above that route below — it is a write, but it cannot create,
// grant or escalate access, which is the property that matters here.
const router = express.Router();

// Anonymous traffic still gets a ceiling so the portal cannot be used to hammer
// the database. It is generous — a citizen browsing tabs makes several requests
// per minute — and separate from the auth buckets so public browsing can never
// lock anybody out of signing in.
router.use(rateLimit({ bucket: "public", max: 600 }));

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

// Registered after the fixed paths above so "/projects/filters" is not
// swallowed by the ":id" parameter.
router.get("/projects/:id", getProject);
router.get("/projects/:id/timeline", getProjectTimeline);
router.get("/projects/:id/documents", listProjectDocuments);
router.get("/projects/:id/documents/:documentId/download", downloadProjectDocument);

// ── Bidder requirements intake ──────────────────────────────────────────────
// The one write on the public surface, and the first step of bidder onboarding:
// a prospective bidder submits their eligibility and accreditation requirements
// together with the email address that will serve as their official channel.
//
// This is NOT registration. It creates no account, no session, no role and no
// credential — only an application in `submitted` status for the BAC Secretariat
// to review. Access to the system still begins with an authorized official
// deciding to create an account, which is what "no public bidder registration"
// means in practice.
//
// Its own bucket, and a tight one: a public form that sends email needs a much
// lower ceiling than a public form that only reads, because each accepted call
// costs an outbound message.
router.post(
  "/bidder-registrations",
  rateLimit({ bucket: "bidderIntake", max: 5 }),
  submitBidderRequirements
);

export default router;
