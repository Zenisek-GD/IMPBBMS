import express from "express";
import {
  listAnnouncementsForAuthor,
  createAnnouncement,
  updateAnnouncement,
  publishAnnouncement,
  withdrawAnnouncement,
  listOpenCalls,
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

export default router;
