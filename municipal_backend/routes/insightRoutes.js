import express from "express";
import {
  listAuditLog,
  verifyAuditChain,
  getEntityTimeline,
  exportAuditLog,
} from "../controllers/auditController.js";
import { getDssOverview } from "../controllers/dssController.js";
import { requirePermission, requireAnyPermission } from "../middleware/permissionMiddleware.js";

const router = express.Router();

// ── Audit log ───────────────────────────────────────────────────────────────
router.get("/audit", requireAnyPermission("audit.viewAll", "audit.viewLogs"), listAuditLog);
router.get("/audit/verify", requireAnyPermission("audit.viewAll", "audit.viewLogs"), verifyAuditChain);
router.get("/audit/timeline/:entityRef/:entityId", requirePermission("audit.viewAll"), getEntityTimeline);
router.get("/audit/export", requirePermission("audit.export"), exportAuditLog);

// ── Decision Support (Section 7.8) ──────────────────────────────────────────
// Read access for HOPE, Budget Officer and Internal Auditor.
router.get("/dss", requireAnyPermission("audit.viewAll", "budget.view"), getDssOverview);

// ── Transparency Portal ─────────────────────────────────────────────────────
// Moved to routes/publicRoutes.js (/api/public/transparency/*). Published
// procurement records are open to the public and require no account, so they
// must not sit behind this router — staff read the same endpoints.

export default router;
