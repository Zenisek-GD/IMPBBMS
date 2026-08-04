import express from "express";
import {
  uploadDocument,
  listDocuments,
  downloadDocument,
  deleteDocument,
} from "../controllers/documentController.js";
import { upload, describeUploadError } from "../services/documentStore.js";
import { loadCurrentUser, permissionsOf } from "../middleware/permissionMiddleware.js";
import { rateLimit } from "../middleware/rateLimitMiddleware.js";

const router = express.Router();

// Any authenticated user may reach these; the controller decides per record
// whether they may read or write it (Section 12).
router.use(async (req, res, next) => {
  const user = await loadCurrentUser(req);
  if (!user) return res.status(401).json({ message: "Not authenticated." });
  req.currentUser = user;
  req.permissions = permissionsOf(user);
  next();
});

// Multer errors (oversize, wrong type) arrive as thrown errors rather than
// validation results, so they are translated here instead of becoming a 500.
const receiveFile = (req, res, next) =>
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ message: describeUploadError(err) });
    next();
  });

// Uploads are rate limited — they are the most expensive endpoint here.
router.post("/", rateLimit({ bucket: "upload", max: 60 }), receiveFile, uploadDocument);
router.get("/", listDocuments);
router.get("/:id/download", downloadDocument);
router.delete("/:id", deleteDocument);

export default router;
