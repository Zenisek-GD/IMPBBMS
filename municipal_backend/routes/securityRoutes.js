import express from "express";
import {
  listAlerts,
  getSecurityOverview,
  runSecurityScan,
  updateAlert,
  rebaselineIntegrity,
} from "../controllers/securityController.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";

const router = express.Router();

router.get("/overview", requirePermission("security.view"), getSecurityOverview);
router.get("/alerts", requirePermission("security.view"), listAlerts);

// A scan is a write in every sense that matters — it raises alerts and notifies
// people — so it is a POST behind `security.manage`, not a GET anyone with read
// access could trigger.
router.post("/scan", requirePermission("security.manage"), runSecurityScan);
router.patch("/alerts/:id", requirePermission("security.manage"), updateAlert);
router.post("/rebaseline", requirePermission("security.manage"), rebaselineIntegrity);

export default router;
