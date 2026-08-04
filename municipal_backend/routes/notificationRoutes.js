import express from "express";
import {
  listMyNotifications,
  markRead,
  markAllRead,
} from "../controllers/notificationController.js";
import { loadCurrentUser } from "../middleware/permissionMiddleware.js";

const router = express.Router();

// Every authenticated user has an inbox regardless of role, so this is gated
// on authentication rather than on a permission.
router.use(async (req, res, next) => {
  const user = await loadCurrentUser(req);
  if (!user) return res.status(401).json({ message: "Not authenticated." });
  req.currentUser = user;
  next();
});

router.get("/", listMyNotifications);
router.post("/:id/read", markRead);
router.post("/read-all", markAllRead);

export default router;
