import express from "express";
import {
  listSessions,
  scheduleSession,
  recordAttendance,
  updateSession,
} from "../controllers/conferenceController.js";
import { requirePermission, requireAnyPermission } from "../middleware/permissionMiddleware.js";

const router = express.Router();

// Anyone involved in a procurement can see the conference schedule; only the
// Secretariat schedules and runs them.
router.get(
  "/",
  requireAnyPermission("bidding.view", "bidding.viewPublished", "bidding.submitBid"),
  listSessions
);
router.post("/", requirePermission("bidding.publish"), scheduleSession);
router.patch("/:id", requirePermission("bidding.publish"), updateSession);

// Attendance is self-recorded on joining, by any participant.
router.post(
  "/:id/attendance",
  requireAnyPermission("bidding.view", "bidding.submitBid", "bidding.evaluate", "bidding.technicalInput"),
  recordAttendance
);

export default router;
