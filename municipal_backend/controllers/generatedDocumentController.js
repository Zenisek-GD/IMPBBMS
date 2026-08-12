import crypto from "node:crypto";
import { Op } from "sequelize";
import { sequelize } from "../models/db.js";
import {
  GeneratedDocument,
  GENERATED_DOCUMENT_STATUS_LABELS,
  nextDocumentNo,
} from "../models/generatedDocumentModel.js";
import {
  DocumentTemplate,
  DocumentTemplateVersion,
  DOCUMENT_TYPE_LABELS,
} from "../models/documentTemplateModel.js";
import { Document } from "../models/documentModel.js";
import { User } from "../models/userModel.js";
import { DOCUMENT_TYPE_SOURCES, isPublishableType } from "../services/documentTypes.js";
import { resolvePlaceholders } from "../services/placeholderResolver.js";
import { renderTemplate, assembleFromEditedBody } from "../services/templateRenderer.js";
import { renderPdf, BrowserUnavailableError } from "../services/pdfRenderer.js";
import { auditFromRequest, AUDIT_ACTIONS } from "../services/auditLog.js";
import { notifyByPermission, NOTIFICATION_EVENTS } from "../services/notifier.js";

// Issuing documents. The module's promise is that the facts on an official
// document are the ones already on file, so the two rules that matter are:
// nothing is generated from a record the system has not yet approved, and
// nothing reaches the public without a deliberate, separately-permissioned act.

const serialize = (doc, { includeHtml = false } = {}) => ({
  id: doc.id,
  documentNo: doc.documentNo,
  documentType: doc.documentType,
  documentTypeLabel: DOCUMENT_TYPE_LABELS[doc.documentType],
  title: doc.title,
  entityRef: doc.entityRef,
  entityId: doc.entityId,
  status: doc.status,
  statusLabel: GENERATED_DOCUMENT_STATUS_LABELS[doc.status],
  manuallyEdited: doc.manuallyEdited,

  templateId: doc.documentTemplateId,
  templateName: doc.template?.name ?? null,
  templateVersionNo: doc.templateVersion?.versionNo ?? null,

  generatedByName: doc.generatedBy?.name ?? null,
  createdAt: doc.createdAt,
  approvedAt: doc.approvedAt,
  approvedByName: doc.approvedBy?.name ?? null,

  isPublic: doc.isPublic,
  publishedAt: doc.publishedAt,
  publishedByName: doc.publishedBy?.name ?? null,
  publishable: isPublishableType(doc.documentType),

  voidedAt: doc.voidedAt,
  voidReason: doc.voidReason,
  voidedByName: doc.voidedBy?.name ?? null,
  supersedesId: doc.supersedesId,

  hasPdf: Boolean(doc.pdfDocumentId),
  pdfDocumentId: doc.pdfDocumentId,
  printCount: doc.printCount,
  lastPrintedAt: doc.lastPrintedAt,

  dataSnapshot: doc.dataSnapshot,
  ...(includeHtml ? { renderedHtml: doc.renderedHtml } : {}),
});

const withIncludes = {
  include: [
    { model: DocumentTemplate, as: "template", attributes: ["id", "name", "key", "documentType"] },
    { model: DocumentTemplateVersion, as: "templateVersion", attributes: ["id", "versionNo", "css", "pageSize", "landscape", "margins", "headerHtml", "footerHtml"] },
    { model: User, as: "generatedBy", attributes: ["id", "name"] },
    { model: User, as: "approvedBy", attributes: ["id", "name"] },
    { model: User, as: "publishedBy", attributes: ["id", "name"] },
    { model: User, as: "voidedBy", attributes: ["id", "name"] },
  ],
};

export const listDocuments = async (req, res) => {
  const where = {};
  if (req.query.documentType) where.documentType = req.query.documentType;
  if (req.query.status) where.status = req.query.status;
  if (req.query.entityRef) where.entityRef = req.query.entityRef;
  if (Number.isFinite(Number(req.query.entityId))) where.entityId = Number(req.query.entityId);
  if (req.query.search) where.documentNo = { [Op.like]: `%${req.query.search}%` };

  const documents = await GeneratedDocument.findAll({
    where,
    ...withIncludes,
    order: [["createdAt", "DESC"]],
  });

  res.json(documents.map((doc) => serialize(doc)));
};

export const getDocument = async (req, res) => {
  const doc = await GeneratedDocument.findByPk(req.params.id, withIncludes);
  if (!doc) return res.status(404).json({ message: "Document not found." });
  res.json(serialize(doc, { includeHtml: true }));
};

// ── Generate ─────────────────────────────────────────────────────────────────
export const generateDocument = async (req, res) => {
  const { templateId, entityId, manualValues } = req.body;

  const template = await DocumentTemplate.findByPk(templateId, {
    include: [{ model: DocumentTemplateVersion, as: "versions" }],
  });
  if (!template) return res.status(400).json({ message: "That template does not exist." });

  if (template.status !== "active") {
    return res.status(409).json({
      message: `"${template.name}" is ${template.status}. Only an active template can be generated from.`,
    });
  }

  const version = (template.versions ?? []).find((v) => v.id === template.activeVersionId);
  if (!version) {
    return res.status(409).json({ message: "This template has no active version to generate from." });
  }

  const source = DOCUMENT_TYPE_SOURCES[template.documentType];
  if (source?.entityRef && source.entityRef !== "any" && !entityId) {
    return res.status(400).json({ message: `Select the ${source.entityLabel} this document is for.` });
  }

  const documentNo = await nextDocumentNo(source?.numberPrefix ?? "DOC");

  const resolved = await resolvePlaceholders({
    documentType: template.documentType,
    entityId,
    manualValues,
    currentUser: req.currentUser,
    documentNo,
  });
  if (resolved.error) return res.status(400).json({ message: resolved.error });

  const rendered = renderTemplate({
    version,
    context: resolved.context,
    title: resolved.title || template.name,
  });

  const created = await GeneratedDocument.create({
    documentNo,
    documentType: template.documentType,
    title: resolved.title || template.name,
    entityRef: source?.entityRef && source.entityRef !== "any" ? source.entityRef : (req.body.entityRef ?? "none"),
    entityId: entityId ?? 0,
    renderedHtml: rendered.html,
    // The values as they were at this moment. A supplier's address can change
    // tomorrow; this document still bears the old one, and this is the record
    // of why.
    dataSnapshot: resolved.context,
    documentTemplateId: template.id,
    documentTemplateVersionId: version.id,
    generatedById: req.currentUser.id,
    status: "draft",
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.DOCUMENT_GENERATED,
    entityRef: "generatedDocument",
    entityId: created.id,
    summary: `${documentNo} generated from "${template.name}" v${version.versionNo}`,
    afterState: {
      documentType: template.documentType,
      sourceRef: created.entityRef,
      sourceId: created.entityId,
      templateVersion: version.versionNo,
      unresolvedTokens: rendered.missingTokens,
    },
  });

  res.status(201).json({
    ...serialize(await GeneratedDocument.findByPk(created.id, withIncludes), { includeHtml: true }),
    // Surfaced rather than swallowed: a token that did not resolve is printed
    // literally on the page, and the officer should be told before they issue it.
    missingTokens: rendered.missingTokens,
  });
};

// ── Manual edit ──────────────────────────────────────────────────────────────
// The spec asks for this, and it is genuinely needed — a covering paragraph
// that only applies to one award has no business in the template. It is
// restricted to drafts: editing an approved document would let the wording
// change after the signature.
export const updateDocumentBody = async (req, res) => {
  const doc = await GeneratedDocument.findByPk(req.params.id, withIncludes);
  if (!doc) return res.status(404).json({ message: "Document not found." });

  if (doc.status !== "draft") {
    return res.status(409).json({
      message: `This document is "${doc.status}" and can no longer be edited. Void it and generate a corrected one.`,
    });
  }
  if (!req.body.bodyHtml?.trim()) {
    return res.status(400).json({ message: "The document body cannot be empty." });
  }

  const assembled = assembleFromEditedBody({
    bodyHtml: req.body.bodyHtml,
    version: doc.templateVersion,
    title: doc.title,
  });

  await doc.update({
    renderedHtml: assembled.html,
    manuallyEdited: true,
    // The stored PDF no longer matches the wording, so it is dropped rather
    // than left to be downloaded as if it were current.
    pdfDocumentId: null,
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.DOCUMENT_EDITED,
    entityRef: "generatedDocument",
    entityId: doc.id,
    summary: `${doc.documentNo} edited by hand before issue`,
    afterState: { manuallyEdited: true, length: assembled.bodyHtml.length },
  });

  res.json(serialize(await GeneratedDocument.findByPk(doc.id, withIncludes), { includeHtml: true }));
};

// ── Approve ──────────────────────────────────────────────────────────────────
export const approveDocument = async (req, res) => {
  const doc = await GeneratedDocument.findByPk(req.params.id, withIncludes);
  if (!doc) return res.status(404).json({ message: "Document not found." });

  if (doc.status !== "draft") {
    return res.status(409).json({ message: `This document is already "${doc.status}".` });
  }
  // The officer who generated a document must not be the one who approves it.
  // Same control as certify-versus-release on a disbursement: one pair of hands
  // should not both produce and issue a document that binds the municipality.
  if (doc.generatedById === req.currentUser.id) {
    return res.status(403).json({
      message: "You generated this document, so it must be approved by another officer.",
    });
  }

  await doc.update({
    status: "approved",
    approvedAt: new Date(),
    approvedById: req.currentUser.id,
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.DOCUMENT_APPROVED,
    entityRef: "generatedDocument",
    entityId: doc.id,
    summary: `${doc.documentNo} approved and issued`,
    beforeState: { status: "draft" },
    afterState: { status: "approved" },
  });

  if (isPublishableType(doc.documentType)) {
    await notifyByPermission("document.publish", {
      type: NOTIFICATION_EVENTS.DOCUMENT_STATUS,
      title: `${doc.documentNo} approved`,
      body: `${DOCUMENT_TYPE_LABELS[doc.documentType]} is approved and may be published to the transparency portal.`,
      link: "/documents",
      refEntity: "generatedDocument",
      refId: doc.id,
      severity: "info",
    });
  }

  res.json(serialize(await GeneratedDocument.findByPk(doc.id, withIncludes)));
};

// ── PDF ──────────────────────────────────────────────────────────────────────
// Rendered on demand and cached in the attachment store. Regenerating is
// legitimate — a reprint — so this counts prints rather than refusing them.
const buildPdf = async (doc, { userId }) => {
  const version = doc.templateVersion;
  const pdfBuffer = await renderPdf(doc.renderedHtml, {
    pageSize: version?.pageSize ?? "A4",
    landscape: version?.landscape ?? false,
    margins: version?.margins ?? undefined,
    headerHtml: version?.headerHtml ?? null,
    footerHtml: version?.footerHtml ?? null,
  });

  const filename = `${doc.documentNo}.pdf`;
  const stored = await Document.create({
    filename,
    mimeType: "application/pdf",
    sizeBytes: pdfBuffer.length,
    content: pdfBuffer,
    checksum: crypto.createHash("sha256").update(pdfBuffer).digest("hex"),
    entityRef: "generatedDocument",
    entityId: doc.id,
    docType: doc.documentType,
    label: doc.title,
    uploadedAt: new Date(),
    uploadedById: userId,
  });

  await doc.update({
    pdfDocumentId: stored.id,
    printCount: doc.printCount + 1,
    lastPrintedAt: new Date(),
  });

  return { stored, pdfBuffer };
};

export const downloadPdf = async (req, res) => {
  const doc = await GeneratedDocument.findByPk(req.params.id, withIncludes);
  if (!doc) return res.status(404).json({ message: "Document not found." });

  let pdfBuffer;
  try {
    if (doc.pdfDocumentId && req.query.regenerate !== "true") {
      const stored = await Document.findByPk(doc.pdfDocumentId);
      pdfBuffer = stored?.content;
    }
    if (!pdfBuffer) ({ pdfBuffer } = await buildPdf(doc, { userId: req.currentUser.id }));
  } catch (err) {
    if (err instanceof BrowserUnavailableError) {
      return res.status(503).json({ message: err.message, code: err.code });
    }
    throw err;
  }

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.DOCUMENT_DOWNLOADED,
    entityRef: "generatedDocument",
    entityId: doc.id,
    summary: `${doc.documentNo} downloaded`,
    afterState: { regenerated: req.query.regenerate === "true", printCount: doc.printCount },
  });

  // Same hardening the attachment store applies: never inline, never sniffed.
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${doc.documentNo}.pdf"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.send(pdfBuffer);
};

// ── Publish ──────────────────────────────────────────────────────────────────
export const publishDocument = async (req, res) => {
  const doc = await GeneratedDocument.findByPk(req.params.id, withIncludes);
  if (!doc) return res.status(404).json({ message: "Document not found." });

  // Three gates, each closing a different way this could go wrong.
  if (!isPublishableType(doc.documentType)) {
    return res.status(409).json({
      message: `A ${DOCUMENT_TYPE_LABELS[doc.documentType]} is an internal document and cannot be published.`,
    });
  }
  if (doc.status !== "approved") {
    return res.status(409).json({
      message: "Only an approved document can be published. Approve it first.",
    });
  }
  if (doc.isPublic) return res.status(409).json({ message: "This document is already published." });

  // The public portal serves the PDF, so it has to exist before the link does.
  try {
    if (!doc.pdfDocumentId) await buildPdf(doc, { userId: req.currentUser.id });
  } catch (err) {
    if (err instanceof BrowserUnavailableError) {
      return res.status(503).json({ message: err.message, code: err.code });
    }
    throw err;
  }

  await doc.update({
    isPublic: true,
    publishedAt: new Date(),
    publishedById: req.currentUser.id,
    unpublishedAt: null,
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.DOCUMENT_PUBLISHED,
    entityRef: "generatedDocument",
    entityId: doc.id,
    summary: `${doc.documentNo} published to the transparency portal`,
    afterState: { isPublic: true, documentType: doc.documentType },
  });

  res.json(serialize(await GeneratedDocument.findByPk(doc.id, withIncludes)));
};

export const unpublishDocument = async (req, res) => {
  const doc = await GeneratedDocument.findByPk(req.params.id, withIncludes);
  if (!doc) return res.status(404).json({ message: "Document not found." });
  if (!doc.isPublic) return res.status(409).json({ message: "This document is not published." });

  if (!req.body.reason?.trim()) {
    return res.status(400).json({
      message: "Give a reason for withdrawing a document the public has already seen.",
    });
  }

  await doc.update({ isPublic: false, unpublishedAt: new Date() });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.DOCUMENT_UNPUBLISHED,
    entityRef: "generatedDocument",
    entityId: doc.id,
    summary: `${doc.documentNo} withdrawn from the transparency portal: ${req.body.reason.trim()}`,
    afterState: { isPublic: false, reason: req.body.reason.trim() },
  });

  res.json(serialize(await GeneratedDocument.findByPk(doc.id, withIncludes)));
};

// ── Void ─────────────────────────────────────────────────────────────────────
// How a mistake on an issued document is corrected. The wrong document is never
// deleted — it may already be in a supplier's hands — so it is marked void,
// pulled from the portal, and a replacement points back at it.
export const voidDocument = async (req, res) => {
  const doc = await GeneratedDocument.findByPk(req.params.id, withIncludes);
  if (!doc) return res.status(404).json({ message: "Document not found." });

  if (doc.status === "void") return res.status(409).json({ message: "This document is already void." });
  if (!req.body.reason?.trim()) {
    return res.status(400).json({ message: "A reason is required when voiding an issued document." });
  }

  await doc.update({
    status: "void",
    voidedAt: new Date(),
    voidedById: req.currentUser.id,
    voidReason: req.body.reason.trim(),
    isPublic: false,
    unpublishedAt: doc.isPublic ? new Date() : doc.unpublishedAt,
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.DOCUMENT_VOIDED,
    entityRef: "generatedDocument",
    entityId: doc.id,
    summary: `${doc.documentNo} voided: ${req.body.reason.trim()}`,
    beforeState: { status: doc.previous("status"), wasPublic: doc.previous("isPublic") },
    afterState: { status: "void" },
  });

  res.json(serialize(await GeneratedDocument.findByPk(doc.id, withIncludes)));
};

// ── The public surface ───────────────────────────────────────────────────────
// Read-only, unauthenticated, and narrowed at the query rather than in the
// serialiser. Three conditions must all hold, and they are ANDed in the `where`
// so there is no code path that can return a document failing any of them:
//
//   isPublic          somebody with document.publish deliberately published it
//   status=approved   it was approved before that, by a different officer
//   publishable type  its *kind* is one the municipality publishes at all
//
// The last is what stops an operator publishing an internal requisition by
// mistake, and it is re-checked here rather than trusted from the row.
const PUBLIC_WHERE = {
  isPublic: true,
  status: "approved",
  documentType: { [Op.in]: Object.keys(DOCUMENT_TYPE_SOURCES).filter(isPublishableType) },
};

export const listPublicDocuments = async (req, res) => {
  const where = { ...PUBLIC_WHERE };
  if (req.query.documentType && isPublishableType(req.query.documentType)) {
    where.documentType = req.query.documentType;
  }

  const documents = await GeneratedDocument.findAll({
    where,
    // Deliberately narrow. No dataSnapshot (it carries supplier contact
    // details), no renderedHtml, no internal remarks, no generating officer —
    // the public gets the document itself and the fact of its issuance.
    attributes: [
      "id", "documentNo", "documentType", "title",
      "entityRef", "entityId", "publishedAt", "pdfDocumentId",
    ],
    order: [["publishedAt", "DESC"]],
    limit: Math.min(Number(req.query.limit) || 100, 200),
  });

  res.json(
    documents.map((doc) => ({
      id: doc.id,
      documentNo: doc.documentNo,
      documentType: doc.documentType,
      documentTypeLabel: DOCUMENT_TYPE_LABELS[doc.documentType],
      title: doc.title,
      relatesTo: doc.entityRef,
      publishedAt: doc.publishedAt,
      hasPdf: Boolean(doc.pdfDocumentId),
      downloadUrl: `/api/public/documents/${doc.id}/download`,
    }))
  );
};

export const downloadPublicDocument = async (req, res) => {
  const doc = await GeneratedDocument.findOne({
    where: { id: Number(req.params.id), ...PUBLIC_WHERE },
  });
  // Same 404 whether the document does not exist or is simply not published —
  // a distinct "exists but is private" response would confirm the existence of
  // unpublished documents to anyone probing ids.
  if (!doc) return res.status(404).json({ message: "That document is not published, or does not exist." });

  const stored = doc.pdfDocumentId ? await Document.findByPk(doc.pdfDocumentId) : null;
  if (!stored) return res.status(404).json({ message: "The published copy is not available." });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${doc.documentNo}.pdf"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  // Published so a downloader can confirm the file was not altered in transit.
  res.setHeader("X-Checksum-SHA256", stored.checksum);
  res.send(stored.content);
};

// Which documents already exist for a record, so a screen can show "Notice of
// Award issued" rather than offering to generate a second one blindly.
export const listForRecord = async (req, res) => {
  const documents = await GeneratedDocument.findAll({
    where: { entityRef: req.params.entityRef, entityId: Number(req.params.entityId) },
    ...withIncludes,
    order: [["createdAt", "DESC"]],
  });
  res.json(documents.map((doc) => serialize(doc)));
};
