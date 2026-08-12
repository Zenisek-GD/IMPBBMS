import express from "express";
import {
  listAnnouncementsForAuthor,
  createAnnouncement,
  updateAnnouncement,
  publishAnnouncement,
  withdrawAnnouncement,
  listOpenCalls,
  draftFromSolicitation,
  previewAnnouncement,
  duplicateAnnouncement,
  archiveAnnouncement,
  listAnnouncementAttachments,
  runScheduledReleases,
} from "../controllers/announcementController.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";

// Authoring only. The public read path is mounted under /api/public — see
// publicRoutes.js — and shares nothing with these routes but the table.
//
// Every route here is gated on the same permission, including the reads: the
// list returns drafts, and an unpublished notice about an upcoming procurement
// is precisely the kind of thing that must not leak to a prospective bidder
// ahead of everyone else.
const router = express.Router();

router.get("/", requirePermission("announcements.manage"), listAnnouncementsForAuthor);

// The calls a counter submission can be recorded against. Gated on
// `bidding.publish` rather than `announcements.manage`, because the caller is the
// officer recording an application, not the one writing notices — the two happen
// to be the same office today, but the permission should follow the act.
router.get("/open-calls", requirePermission("bidding.publish"), listOpenCalls);
router.post("/", requirePermission("announcements.manage"), createAnnouncement);
router.patch("/:id", requirePermission("announcements.manage"), updateAnnouncement);
router.post("/:id/publish", requirePermission("announcements.manage"), publishAnnouncement);
router.post("/:id/withdraw", requirePermission("announcements.manage"), withdrawAnnouncement);

// ── Invitation to Bid support ────────────────────────────────────────────────

// Reads a solicitation and returns the notice fields it would fill, so the
// reference number, ABC, mode and schedule are copied from the record rather
// than retyped. Returns values; it does not write them.
router.get(
  "/from-solicitation/:rfqId",
  requirePermission("announcements.manage"),
  draftFromSolicitation
);

// The public rendering of a draft, produced by the *same* serialiser the portal
// uses — previewing through a second code path would show the officer something
// the public will never see.
router.get("/:id/preview", requirePermission("announcements.manage"), previewAnnouncement);

// Bidding documents, terms of reference and specifications hung off the notice.
// Upload and delete go through the shared /api/documents routes with
// entityRef=announcement; this is the listing.
router.get("/:id/attachments", requirePermission("announcements.manage"), listAnnouncementAttachments);

// Reuse a previous notice's wording. The copy is always a draft and drops every
// date, reference and link belonging to the procurement being copied.
router.post("/:id/duplicate", requirePermission("announcements.manage"), duplicateAnnouncement);

// Retire a notice whose procurement is over. Distinct from withdrawal: an
// archived notice stays readable on the portal's archive view.
router.post("/:id/archive", requirePermission("announcements.manage"), archiveAnnouncement);

// Releases anything whose scheduled publication time has passed. Also runs on
// the public list, so a schedule works with no cron attached.
router.post("/release-scheduled", requirePermission("announcements.manage"), runScheduledReleases);

export default router;
