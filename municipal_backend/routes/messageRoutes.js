import express from "express";
import {
  listPublicMessages,
  updatePublicMessage,
} from "../controllers/publicMessageController.js";
import { requireAnyPermission } from "../middleware/permissionMiddleware.js";
import { MESSAGE_ROUTING } from "../models/publicMessageModel.js";

// ── The officers' side of public correspondence ──────────────────────────────
// The gate is "hold at least one permission a message can be routed to", derived
// from the routing table itself rather than retyped here — so adding a category
// automatically admits the office that answers it, and cannot leave a category
// whose messages nobody may read.
//
// Who sees *which* messages is decided in the controller, per message, against
// the permission it was routed to. This list only decides who gets through the
// door; it does not grant anyone a view of everybody's post.
const ROUTED_PERMISSIONS = [
  ...new Set(Object.values(MESSAGE_ROUTING).map((route) => route.permission)),
];

const router = express.Router();

router.get("/", requireAnyPermission(...ROUTED_PERMISSIONS), listPublicMessages);
router.patch("/:id", requireAnyPermission(...ROUTED_PERMISSIONS), updatePublicMessage);

export default router;
