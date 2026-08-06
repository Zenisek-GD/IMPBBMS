import express from "express";
import {
  getObserverOptions,
  listOrganizations,
  createOrganization,
  listInvitations,
  inviteObservers,
  stageCoverage,
  recordAttendance,
  submitObservationReport,
  observationSummary,
} from "../controllers/observerController.js";
import { requirePermission, requireAnyPermission } from "../middleware/permissionMiddleware.js";

const router = express.Router();

router.get("/options", requireAnyPermission("observer.manage", "observer.participate"), getObserverOptions);

// ── The roster of accredited organisations ──────────────────────────────────
router.get(
  "/organizations",
  requireAnyPermission("observer.manage", "observer.participate", "bidding.view"),
  listOrganizations
);
router.post("/organizations", requirePermission("observer.manage"), createOrganization);

// ── Invitations (Sec. 43.1–43.2) ────────────────────────────────────────────
router.get(
  "/invitations",
  requireAnyPermission("observer.manage", "observer.participate", "bidding.view"),
  listInvitations
);
router.post("/rfqs/:rfqId/invitations", requirePermission("observer.manage"), inviteObservers);

// Whether each stage of a procurement is observed as Sec. 43.1 requires.
router.get(
  "/rfqs/:rfqId/coverage",
  requireAnyPermission("observer.manage", "bidding.view", "audit.viewAll"),
  stageCoverage
);
router.get(
  "/rfqs/:rfqId/summary",
  requireAnyPermission("observer.manage", "bidding.view", "audit.viewAll"),
  observationSummary
);

// Attendance is recorded by the Secretariat; inhibition is the observer's own
// act, so both permissions reach it and the controller distinguishes them.
router.post(
  "/invitations/:id/attendance",
  requireAnyPermission("observer.manage", "observer.participate"),
  recordAttendance
);

// Sec. 43.4 — the report is the observer's, and only the observer files it.
router.post("/invitations/:id/report", requirePermission("observer.participate"), submitObservationReport);

export default router;
