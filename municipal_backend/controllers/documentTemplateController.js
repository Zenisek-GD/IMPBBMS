import { Op } from "sequelize";
import { sequelize } from "../models/db.js";
import {
  DocumentTemplate,
  DocumentTemplateVersion,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  TEMPLATE_STATUSES,
  nextVersionNo,
} from "../models/documentTemplateModel.js";
import { GeneratedDocument } from "../models/generatedDocumentModel.js";
import { User } from "../models/userModel.js";
import {
  DOCUMENT_TYPE_SOURCES,
  PLACEHOLDER_CATALOGUE,
  placeholdersFor,
  isPublishableType,
  manualFieldsFor,
} from "../services/documentTypes.js";
import { tokensUsedIn, unresolvableTokens, renderTemplate } from "../services/templateRenderer.js";
import { auditFromRequest, AUDIT_ACTIONS } from "../services/auditLog.js";

// Template authoring. The wording of every official document the office issues
// lives here, so the two things this controller is careful about are: never
// mutating a version somebody may already have generated from, and telling an
// author about a broken placeholder while they can still fix it.

const serializeVersion = (version) => ({
  id: version.id,
  versionNo: version.versionNo,
  bodyHtml: version.bodyHtml,
  headerHtml: version.headerHtml,
  footerHtml: version.footerHtml,
  css: version.css,
  pageSize: version.pageSize,
  landscape: version.landscape,
  margins: version.margins,
  changeNote: version.changeNote,
  createdAt: version.createdAt,
  createdByName: version.createdBy?.name ?? null,
});

const serializeTemplate = (template, { includeBody = false } = {}) => {
  const versions = template.versions ?? [];
  const active = versions.find((v) => v.id === template.activeVersionId) ?? null;

  return {
    id: template.id,
    key: template.key,
    name: template.name,
    documentType: template.documentType,
    documentTypeLabel: DOCUMENT_TYPE_LABELS[template.documentType],
    description: template.description,
    status: template.status,
    publishable: template.publishable,
    isSystemTemplate: template.isSystemTemplate,
    createdByName: template.createdBy?.name ?? null,
    createdAt: template.createdAt,
    activeVersionId: template.activeVersionId,
    activeVersionNo: active?.versionNo ?? null,
    versionCount: versions.length,
    // The source record the document is generated from, so the UI knows which
    // screen to offer the generate button on.
    entityRef: DOCUMENT_TYPE_SOURCES[template.documentType]?.entityRef ?? null,
    manualFields: manualFieldsFor(template.documentType),
    ...(includeBody && active ? { activeVersion: serializeVersion(active) } : {}),
    versions: versions
      .slice()
      .sort((a, b) => b.versionNo - a.versionNo)
      .map((version) => ({
        id: version.id,
        versionNo: version.versionNo,
        changeNote: version.changeNote,
        createdAt: version.createdAt,
        createdByName: version.createdBy?.name ?? null,
        isActive: version.id === template.activeVersionId,
      })),
  };
};

const withVersions = {
  include: [
    {
      model: DocumentTemplateVersion,
      as: "versions",
      include: [{ model: User, as: "createdBy", attributes: ["id", "name"] }],
    },
    { model: User, as: "createdBy", attributes: ["id", "name"] },
  ],
};

// ── Options: what the editor needs to render its palette ─────────────────────
export const getTemplateOptions = async (req, res) => {
  res.json({
    documentTypes: DOCUMENT_TYPES.map((key) => ({
      key,
      label: DOCUMENT_TYPE_LABELS[key],
      description: DOCUMENT_TYPE_SOURCES[key]?.description ?? null,
      entityRef: DOCUMENT_TYPE_SOURCES[key]?.entityRef ?? null,
      entityLabel: DOCUMENT_TYPE_SOURCES[key]?.entityLabel ?? null,
      publishable: isPublishableType(key),
      manualFields: manualFieldsFor(key),
      placeholders: placeholdersFor(key),
    })),
    // The full catalogue too, so the editor can grey out tokens that exist but
    // do not apply to the type being written rather than hiding them — an
    // author who cannot find `{contract_no}` assumes it does not exist.
    placeholderCatalogue: PLACEHOLDER_CATALOGUE,
    pageSizes: ["A4", "Letter", "Legal"],
    statuses: TEMPLATE_STATUSES,
  });
};

export const listTemplates = async (req, res) => {
  const where = {};
  if (req.query.documentType) where.documentType = req.query.documentType;
  if (req.query.status) where.status = req.query.status;
  if (req.query.search) where.name = { [Op.like]: `%${req.query.search}%` };

  const templates = await DocumentTemplate.findAll({
    where,
    ...withVersions,
    order: [["documentType", "ASC"], ["name", "ASC"]],
  });

  res.json(templates.map((template) => serializeTemplate(template)));
};

export const getTemplate = async (req, res) => {
  const template = await DocumentTemplate.findByPk(req.params.id, withVersions);
  if (!template) return res.status(404).json({ message: "Template not found." });
  res.json(serializeTemplate(template, { includeBody: true }));
};

// A specific historical version, so a document generated last March can be
// shown against the wording that was in force then.
export const getTemplateVersion = async (req, res) => {
  const version = await DocumentTemplateVersion.findByPk(req.params.versionId, {
    include: [{ model: User, as: "createdBy", attributes: ["id", "name"] }],
  });
  if (!version) return res.status(404).json({ message: "Template version not found." });
  res.json(serializeVersion(version));
};

const validate = (payload) => {
  if (!payload.name?.trim()) return "A template name is required.";
  if (!DOCUMENT_TYPES.includes(payload.documentType)) return "Unknown document type.";
  if (!payload.bodyHtml?.trim()) return "The template body cannot be empty.";
  return null;
};

// Warnings rather than errors. A template referencing a token this document
// type cannot resolve is almost always a mistake, but "almost always" is not
// "always" — a shared boilerplate header may legitimately carry a token only
// some types fill. Refusing to save would make that impossible; warning makes
// it visible.
const tokenWarnings = (payload) => {
  const tokens = tokensUsedIn(payload.bodyHtml, payload.headerHtml, payload.footerHtml);
  const unresolvable = unresolvableTokens(tokens, payload.documentType);
  return { tokens, unresolvable };
};

export const createTemplate = async (req, res) => {
  const error = validate(req.body);
  if (error) return res.status(400).json({ message: error });

  const key =
    req.body.key?.trim() ||
    `${req.body.documentType}-${Date.now().toString(36)}`.toLowerCase();

  if (await DocumentTemplate.findOne({ where: { key } })) {
    return res.status(409).json({ message: `A template with the key "${key}" already exists.` });
  }

  const { unresolvable } = tokenWarnings(req.body);

  const created = await sequelize.transaction(async (transaction) => {
    const template = await DocumentTemplate.create(
      {
        key,
        name: req.body.name.trim(),
        documentType: req.body.documentType,
        description: req.body.description?.trim() || null,
        status: req.body.status === "active" ? "active" : "draft",
        // Whether a type *may* be published is a property of the type, not a
        // choice on the form — an operator must not be able to make an internal
        // requisition publishable by ticking a box.
        publishable: isPublishableType(req.body.documentType),
        createdById: req.currentUser.id,
      },
      { transaction }
    );

    const version = await DocumentTemplateVersion.create(
      {
        documentTemplateId: template.id,
        versionNo: 1,
        bodyHtml: req.body.bodyHtml,
        headerHtml: req.body.headerHtml || null,
        footerHtml: req.body.footerHtml || null,
        css: req.body.css || null,
        pageSize: req.body.pageSize || "A4",
        landscape: Boolean(req.body.landscape),
        margins: req.body.margins ?? null,
        changeNote: req.body.changeNote?.trim() || "Initial version",
        createdById: req.currentUser.id,
      },
      { transaction }
    );

    await template.update({ activeVersionId: version.id }, { transaction });
    return template;
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.TEMPLATE_CREATED,
    entityRef: "documentTemplate",
    entityId: created.id,
    summary: `Template created: ${created.name} (${DOCUMENT_TYPE_LABELS[created.documentType]})`,
    afterState: { key: created.key, documentType: created.documentType, status: created.status },
  });

  res.status(201).json({
    ...serializeTemplate(await DocumentTemplate.findByPk(created.id, withVersions), { includeBody: true }),
    unresolvableTokens: unresolvable,
  });
};

// Metadata only. The content of a template is changed by saving a new version,
// never by editing one in place.
export const updateTemplate = async (req, res) => {
  const template = await DocumentTemplate.findByPk(req.params.id, withVersions);
  if (!template) return res.status(404).json({ message: "Template not found." });

  if (req.body.status && !TEMPLATE_STATUSES.includes(req.body.status)) {
    return res.status(400).json({ message: "Unknown template status." });
  }

  // A template with no version cannot be made active: generation would have
  // nothing to render.
  if (req.body.status === "active" && !template.activeVersionId) {
    return res.status(409).json({ message: "Save a version before activating this template." });
  }

  const before = { name: template.name, status: template.status };

  await template.update({
    name: req.body.name?.trim() ?? template.name,
    description: req.body.description?.trim() ?? template.description,
    status: req.body.status ?? template.status,
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.TEMPLATE_UPDATED,
    entityRef: "documentTemplate",
    entityId: template.id,
    summary: `Template updated: ${template.name}`,
    beforeState: before,
    afterState: { name: template.name, status: template.status },
  });

  res.json(serializeTemplate(await DocumentTemplate.findByPk(template.id, withVersions), { includeBody: true }));
};

// ── Saving a new version ─────────────────────────────────────────────────────
// This is what "editing a template" actually does. The previous version stays
// exactly as it was, because documents generated from it must remain explicable.
export const createVersion = async (req, res) => {
  const template = await DocumentTemplate.findByPk(req.params.id, withVersions);
  if (!template) return res.status(404).json({ message: "Template not found." });

  if (!req.body.bodyHtml?.trim()) {
    return res.status(400).json({ message: "The template body cannot be empty." });
  }

  const { unresolvable } = tokenWarnings({ ...req.body, documentType: template.documentType });

  const version = await sequelize.transaction(async (transaction) => {
    const created = await DocumentTemplateVersion.create(
      {
        documentTemplateId: template.id,
        versionNo: await nextVersionNo(template.id),
        bodyHtml: req.body.bodyHtml,
        headerHtml: req.body.headerHtml || null,
        footerHtml: req.body.footerHtml || null,
        css: req.body.css || null,
        pageSize: req.body.pageSize || "A4",
        landscape: Boolean(req.body.landscape),
        margins: req.body.margins ?? null,
        changeNote: req.body.changeNote?.trim() || null,
        createdById: req.currentUser.id,
      },
      { transaction }
    );

    // A new version becomes the active one unless the author explicitly saves
    // it as a draft revision.
    if (req.body.activate !== false) {
      await template.update({ activeVersionId: created.id }, { transaction });
    }

    return created;
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.TEMPLATE_VERSION_SAVED,
    entityRef: "documentTemplate",
    entityId: template.id,
    summary: `${template.name}: version ${version.versionNo} saved${req.body.activate === false ? " (not activated)" : " and activated"}`,
    afterState: {
      versionNo: version.versionNo,
      activated: req.body.activate !== false,
      changeNote: version.changeNote,
      unresolvableTokens: unresolvable,
    },
  });

  res.status(201).json({
    ...serializeTemplate(await DocumentTemplate.findByPk(template.id, withVersions), { includeBody: true }),
    unresolvableTokens: unresolvable,
  });
};

// Roll back by pointing the template at an older version. The rollback is
// itself recorded; the version is not copied forward, because the history
// should show that an office reverted rather than hiding it as a new edit.
export const activateVersion = async (req, res) => {
  const template = await DocumentTemplate.findByPk(req.params.id, withVersions);
  if (!template) return res.status(404).json({ message: "Template not found." });

  const version = (template.versions ?? []).find((v) => v.id === Number(req.params.versionId));
  if (!version) return res.status(404).json({ message: "That version does not belong to this template." });

  const previous = template.activeVersionId;
  await template.update({ activeVersionId: version.id });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.TEMPLATE_VERSION_ACTIVATED,
    entityRef: "documentTemplate",
    entityId: template.id,
    summary: `${template.name}: reverted to version ${version.versionNo}`,
    beforeState: { activeVersionId: previous },
    afterState: { activeVersionId: version.id, versionNo: version.versionNo },
  });

  res.json(serializeTemplate(await DocumentTemplate.findByPk(template.id, withVersions), { includeBody: true }));
};

// ── Preview with sample values ───────────────────────────────────────────────
// Renders the draft in the editor against placeholder names as stand-ins, so an
// author can see the layout without needing a real award to point at.
export const previewTemplate = async (req, res) => {
  const documentType = req.body.documentType;
  if (!DOCUMENT_TYPES.includes(documentType)) {
    return res.status(400).json({ message: "Unknown document type." });
  }

  const sample = {};
  for (const group of placeholdersFor(documentType)) {
    for (const field of group.fields) {
      sample[field.token] = field.example ?? `«${field.label}»`;
    }
  }
  for (const field of manualFieldsFor(documentType)) {
    sample[field.key] = `«${field.label}»`;
  }

  const rendered = renderTemplate({
    version: {
      bodyHtml: req.body.bodyHtml ?? "",
      headerHtml: req.body.headerHtml ?? null,
      footerHtml: req.body.footerHtml ?? null,
      css: req.body.css ?? null,
    },
    context: sample,
    title: req.body.name || "Template preview",
  });

  res.json({
    html: rendered.html,
    bodyHtml: rendered.bodyHtml,
    missingTokens: rendered.missingTokens,
    unresolvableTokens: unresolvableTokens(
      tokensUsedIn(req.body.bodyHtml, req.body.headerHtml, req.body.footerHtml),
      documentType
    ),
  });
};

export const archiveTemplate = async (req, res) => {
  const template = await DocumentTemplate.findByPk(req.params.id);
  if (!template) return res.status(404).json({ message: "Template not found." });

  // Archived, never deleted. Documents already generated from it point at its
  // versions, and a dangling reference would make them unexplainable.
  const generatedCount = await GeneratedDocument.count({ where: { documentTemplateId: template.id } });

  await template.update({ status: "archived" });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.TEMPLATE_UPDATED,
    entityRef: "documentTemplate",
    entityId: template.id,
    summary: `Template archived: ${template.name}`,
    afterState: { status: "archived", documentsGenerated: generatedCount },
  });

  res.json({ archived: true, documentsGenerated: generatedCount });
};
