import express from "express";
import {
  getTemplateOptions,
  listTemplates,
  getTemplate,
  getTemplateVersion,
  createTemplate,
  updateTemplate,
  createVersion,
  activateVersion,
  previewTemplate,
  archiveTemplate,
} from "../controllers/documentTemplateController.js";
import {
  listDocuments,
  getDocument,
  generateDocument,
  updateDocumentBody,
  approveDocument,
  downloadPdf,
  publishDocument,
  unpublishDocument,
  voidDocument,
  listForRecord,
} from "../controllers/generatedDocumentController.js";
import { requirePermission, requireAnyPermission } from "../middleware/permissionMiddleware.js";

const router = express.Router();

// ── Templates ────────────────────────────────────────────────────────────────
// Reading a template is open to anyone who generates documents — they need to
// know what a template will produce. Writing one is restricted, because it
// changes what every future document of that kind says.
router.get(
  "/templates/options",
  requireAnyPermission("template.view", "document.generate"),
  getTemplateOptions
);
router.get("/templates", requireAnyPermission("template.view", "document.generate"), listTemplates);
router.get("/templates/:id", requireAnyPermission("template.view", "document.generate"), getTemplate);
router.get("/template-versions/:versionId", requirePermission("template.view"), getTemplateVersion);

router.post("/templates", requirePermission("template.manage"), createTemplate);
router.patch("/templates/:id", requirePermission("template.manage"), updateTemplate);
router.post("/templates/:id/versions", requirePermission("template.manage"), createVersion);
router.post(
  "/templates/:id/versions/:versionId/activate",
  requirePermission("template.manage"),
  activateVersion
);
router.post("/templates/:id/archive", requirePermission("template.manage"), archiveTemplate);

// Renders the draft in the editor against sample values. Needs authoring rights
// because the body being previewed is whatever the caller posted.
router.post("/templates/preview", requirePermission("template.manage"), previewTemplate);

// ── Generated documents ──────────────────────────────────────────────────────
router.get(
  "/documents",
  requireAnyPermission("document.generate", "document.approve", "document.publish", "audit.viewAll"),
  listDocuments
);
router.get(
  "/documents/:id",
  requireAnyPermission("document.generate", "document.approve", "document.publish", "audit.viewAll"),
  getDocument
);
router.get(
  "/documents/for/:entityRef/:entityId",
  requireAnyPermission("document.generate", "document.approve", "document.publish", "audit.viewAll"),
  listForRecord
);

router.post("/documents", requirePermission("document.generate"), generateDocument);
router.patch("/documents/:id/body", requirePermission("document.generate"), updateDocumentBody);
router.post("/documents/:id/approve", requirePermission("document.approve"), approveDocument);

// Downloading is deliberately available to any office that can see the document
// — including the auditor, whose whole job is reading what was issued. Every
// download is logged.
router.get(
  "/documents/:id/pdf",
  requireAnyPermission("document.generate", "document.approve", "document.publish", "audit.viewAll"),
  downloadPdf
);

router.post("/documents/:id/publish", requirePermission("document.publish"), publishDocument);
router.post("/documents/:id/unpublish", requirePermission("document.publish"), unpublishDocument);
router.post("/documents/:id/void", requirePermission("document.void"), voidDocument);

export default router;
