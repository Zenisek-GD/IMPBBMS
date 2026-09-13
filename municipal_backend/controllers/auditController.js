import { Op } from "sequelize";
import { AuditLog } from "../models/auditLogModel.js";
import { User } from "../models/userModel.js";
import { verifyChain } from "../services/auditLog.js";
import { parseListParams, searchCondition, pageEnvelope } from "../services/listQuery.js";

const serialize = (entry) => ({
  id: entry.id,
  sequence: entry.sequence,
  actionType: entry.actionType,
  entityRef: entry.entityRef,
  entityId: entry.entityId,
  outcome: entry.outcome,
  summary: entry.summary,
  actorName: entry.actorName,
  actorRole: entry.actorRole,
  ipAddress: entry.ipAddress,
  recordedAt: entry.recordedAt,
  beforeState: entry.beforeState,
  afterState: entry.afterState,
  // Truncated for the list view; full hashes are available per entry.
  hash: entry.hash,
  prevHash: entry.prevHash,
});

const AUDIT_SORTS = {
  sequence: "sequence",
  recordedAt: "recordedAt",
  actionType: "actionType",
  actorName: "actorName",
  outcome: "outcome",
};

export const listAuditLog = async (req, res) => {
  const { actionType, entityRef, entityId, outcome, actor, limit, search, sort, page, pageSize } = req.query;

  const where = {};
  if (actionType) where.actionType = actionType;
  if (entityRef) where.entityRef = entityRef;
  if (entityId) where.entityId = Number(entityId);
  if (outcome) where.outcome = outcome;
  if (actor) where.actorName = { [Op.like]: `%${actor}%` };
  if (req.query.actorRole) where.actorRole = req.query.actorRole;

  const searchWhere = searchCondition(search, ["summary", "actorName", "actionType", "entityRef"]);
  const scoped = searchWhere ? { [Op.and]: [where, searchWhere] } : where;

  // Paginated shape is opt-in: callers that pass page/pageSize/sort/search get
  // { rows, total, page, pageSize, totalPages }. Older callers (dashboard feed,
  // export preview) keep receiving the plain array.
  if (page !== undefined || pageSize !== undefined || sort !== undefined || search !== undefined) {
    const params = parseListParams(req.query, {
      sorts: AUDIT_SORTS,
      defaultSort: { field: "sequence", direction: "desc" },
    });
    const { count, rows } = await AuditLog.findAndCountAll({
      where: scoped,
      order: params.order,
      limit: params.limit,
      offset: params.offset,
    });
    return res.json(pageEnvelope({ rows: rows.map(serialize), total: count, page: params.page, pageSize: params.pageSize }));
  }

  const entries = await AuditLog.findAll({
    where: scoped,
    order: [["sequence", "DESC"]],
    limit: Math.min(Number(limit) || 100, 500),
  });

  res.json(entries.map(serialize));
};

// Section 7.9: the tamper-evidence claim is only meaningful if it can be
// checked, so verification is a first-class endpoint rather than a script.
export const verifyAuditChain = async (req, res) => {
  res.json(await verifyChain());
};

// Distinct filter values for the server-side audit table, so its dropdowns
// name only actions and roles that actually occur — without downloading the
// whole log to derive them client-side.
export const getAuditFacets = async (req, res) => {
  const [actions, roles] = await Promise.all([
    AuditLog.findAll({
      attributes: ["actionType"],
      group: ["actionType"],
      order: [["actionType", "ASC"]],
      raw: true,
    }),
    AuditLog.findAll({
      attributes: ["actorRole"],
      where: { actorRole: { [Op.ne]: null } },
      group: ["actorRole"],
      order: [["actorRole", "ASC"]],
      raw: true,
    }),
  ]);
  res.json({
    actions: actions.map((row) => row.actionType).filter(Boolean),
    roles: roles.map((row) => row.actorRole).filter(Boolean),
  });
};

// Section 2.2 / Section 11: Internal Auditors need full workflow history
// timelines across modules for a single record.
export const getEntityTimeline = async (req, res) => {
  const { entityRef, entityId } = req.params;

  const entries = await AuditLog.findAll({
    where: { entityRef, entityId: Number(entityId) },
    order: [["sequence", "ASC"]],
  });

  res.json({
    entityRef,
    entityId: Number(entityId),
    events: entries.map(serialize),
  });
};

// Export for the Internal Auditor (Section 2.3 grants audit.export).
export const exportAuditLog = async (req, res) => {
  const entries = await AuditLog.findAll({
    order: [["sequence", "ASC"]],
    include: [{ model: User, as: "actor", attributes: ["id", "email"] }],
  });

  const verification = await verifyChain();

  // CSV so it opens anywhere COA or an auditor is likely to want it.
  const header = [
    "sequence",
    "recordedAt",
    "actionType",
    "outcome",
    "actorName",
    "actorRole",
    "actorEmail",
    "entityRef",
    "entityId",
    "summary",
    "ipAddress",
    "prevHash",
    "hash",
  ];

  const escape = (value) => {
    if (value === null || value === undefined) return "";
    const raw = String(value);
    const text = /^[\s]*[=+@-]|^[\t\r\n]/.test(raw) ? "\'" + raw : raw;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const rows = entries.map((entry) =>
    [
      entry.sequence,
      new Date(entry.recordedAt).toISOString(),
      entry.actionType,
      entry.outcome,
      entry.actorName,
      entry.actorRole,
      entry.actor?.email ?? "",
      entry.entityRef,
      entry.entityId,
      entry.summary,
      entry.ipAddress,
      entry.prevHash,
      entry.hash,
    ]
      .map(escape)
      .join(",")
  );

  // The integrity verdict travels with the export, so a reviewer holding the
  // file knows whether the chain was intact when it was produced.
  const preamble = [
    `# ProcureNance audit log export`,
    `# generated: ${new Date().toISOString()}`,
    `# entries: ${verification.entriesChecked}`,
    `# chain intact: ${verification.intact}`,
    `# head hash: ${verification.headHash}`,
  ].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="procurenance-audit-log.csv"`);
  res.send(`${preamble}\n${header.join(",")}\n${rows.join("\n")}\n`);
};
