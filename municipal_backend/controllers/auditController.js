import { Op } from "sequelize";
import { AuditLog } from "../models/auditLogModel.js";
import { User } from "../models/userModel.js";
import { verifyChain } from "../services/auditLog.js";

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

export const listAuditLog = async (req, res) => {
  const { actionType, entityRef, entityId, outcome, actor, limit } = req.query;

  const where = {};
  if (actionType) where.actionType = actionType;
  if (entityRef) where.entityRef = entityRef;
  if (entityId) where.entityId = Number(entityId);
  if (outcome) where.outcome = outcome;
  if (actor) where.actorName = { [Op.like]: `%${actor}%` };

  const entries = await AuditLog.findAll({
    where,
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
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
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
    `# Procurenance audit log export`,
    `# generated: ${new Date().toISOString()}`,
    `# entries: ${verification.entriesChecked}`,
    `# chain intact: ${verification.intact}`,
    `# head hash: ${verification.headHash}`,
  ].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="procurenance-audit-log.csv"`);
  res.send(`${preamble}\n${header.join(",")}\n${rows.join("\n")}\n`);
};
