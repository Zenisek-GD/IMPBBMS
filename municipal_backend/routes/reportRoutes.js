import express from "express";
import { loadCurrentUser, permissionsOf } from "../middleware/permissionMiddleware.js";
import { getReport, listReportCatalog } from "../controllers/reportController.js";
import { getPendingCounts } from "../controllers/pendingCountsController.js";

const router = express.Router();
const safely = (handler) => async (req, res, next) => {
  try { await handler(req, res, next); }
  catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    next(error);
  }
};
router.use(safely(async (req, res, next) => {
  const user = await loadCurrentUser(req);
  if (!user) return res.status(401).json({ message: "Not authenticated." });
  req.currentUser = user;
  req.permissions = permissionsOf(user);
  next();
}));
router.get("/catalog", listReportCatalog);
router.get("/pending-counts", safely(getPendingCounts));
router.get("/:type", safely(getReport));
export default router;
