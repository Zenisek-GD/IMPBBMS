import { Op } from "sequelize";
import {
  SecurityAlert,
  RecordFingerprint,
  ALERT_TYPE_LABELS,
  ALERT_SEVERITIES,
} from "../models/integrityModel.js";
import { User } from "../models/userModel.js";
import { sweep, rebaseline, watchedEntities } from "../services/integrityMonitor.js";
import { detectAnomalies, RULE_THRESHOLDS } from "../services/anomalyDetector.js";
import { auditFromRequest, recordAudit, AUDIT_ACTIONS } from "../services/auditLog.js";
import { notifyByPermission, NOTIFICATION_EVENTS } from "../services/notifier.js";

// The security console. Two detectors feed one alert store:
//
//   integrityMonitor  — did something change without going through the system?
//   anomalyDetector   — did something go through the system that looks wrong?
//
// Both produce findings in the same shape, so everything below treats them
// identically. That matters for the operator: they should not have to know
// which subsystem noticed a problem in order to act on it.

const serialize = (alert) => ({
  id: alert.id,
  type: alert.type,
  typeLabel: ALERT_TYPE_LABELS[alert.type] ?? alert.type,
  severity: alert.severity,
  summary: alert.summary,
  detail: alert.detail,
  entityRef: alert.entityRef,
  entityId: alert.entityId,
  status: alert.status,
  occurrences: alert.occurrences,
  firstSeenAt: alert.createdAt,
  lastSeenAt: alert.lastSeenAt,
  resolutionNote: alert.resolutionNote,
  resolvedAt: alert.resolvedAt,
  resolvedByName: alert.resolvedBy?.name ?? null,
});

// Findings arrive on every sweep. Raising a fresh alert each time would bury a
// new critical finding under a hundred repeats of an old one, so a finding that
// has been seen before bumps its counter instead — and a finding somebody has
// already resolved does NOT reopen unless it happens again after the fact.
const upsertAlert = async (finding) => {
  const dedupeKey =
    finding.dedupeKey ?? `${finding.type}:${finding.entityRef ?? "-"}:${finding.entityId ?? "-"}`;

  const existing = await SecurityAlert.findOne({ where: { dedupeKey } });

  if (existing) {
    await existing.update({
      occurrences: existing.occurrences + 1,
      lastSeenAt: new Date(),
      summary: finding.summary,
      detail: finding.detail ?? existing.detail,
      // A resolved alert that recurs is a new problem and must be seen again.
      status: existing.status === "resolved" ? "open" : existing.status,
    });
    return { alert: existing, isNew: false };
  }

  const alert = await SecurityAlert.create({
    type: finding.type,
    severity: finding.severity ?? "medium",
    summary: finding.summary,
    detail: finding.detail ?? null,
    entityRef: finding.entityRef ?? null,
    entityId: finding.entityId ?? null,
    dedupeKey,
    lastSeenAt: new Date(),
  });
  return { alert, isNew: true };
};

// ── Running the detectors ────────────────────────────────────────────────────
export const runSecurityScan = async (req, res) => {
  const startedAt = Date.now();

  const integrityFindings = await sweep();
  const { findings: behaviourFindings, failures } = await detectAnomalies();
  const all = [...integrityFindings, ...behaviourFindings];

  const raised = [];
  for (const finding of all) {
    const { alert, isNew } = await upsertAlert(finding);
    if (isNew) raised.push(alert);
  }

  // ── Telling somebody ──────────────────────────────────────────────────────
  // A detector nobody hears from is a log file. Anything critical or high goes
  // out immediately.
  //
  // Delivery is on `security.view` alone, and the narrowness is the point. The
  // obvious-looking choice — `audit.viewAll` — is held by almost every officer
  // in the LGU, so a finding like "the appropriations table was altered in raw
  // SQL" would land in nineteen inboxes, one of which may well belong to
  // whoever did it. Telling a suspect that they have been detected is worse
  // than not detecting them.
  //
  // `security.view` is held by exactly two roles: the System Administrator and
  // the Internal Auditor. The auditor is deliberately included rather than
  // leaving this to the administrator alone — the administrator is the one
  // person with both the database access to do this and the motive to suppress
  // the alert, so they must not be the only recipient.
  const urgent = raised.filter((a) => a.severity === "critical" || a.severity === "high");
  for (const alert of urgent) {
    await notifyByPermission("security.view", {
      type: NOTIFICATION_EVENTS.SECURITY_ALERT,
      title: `Security alert — ${ALERT_TYPE_LABELS[alert.type] ?? alert.type}`,
      body: alert.summary,
      link: "/admin/security",
      refEntity: "securityAlert",
      refId: alert.id,
      severity: alert.severity === "critical" ? "danger" : "warning",
    });
  }

  // The scan itself is audited. An attacker who reached the database would want
  // to disable monitoring, and a gap in the record of scans is itself a signal.
  await recordAudit({
    actionType: AUDIT_ACTIONS.SECURITY_SCAN_RUN,
    entityRef: "security",
    summary:
      `Security scan: ${all.length} finding(s), ${raised.length} new` +
      (failures.length ? `, ${failures.length} rule(s) errored` : ""),
    actorId: req?.currentUser?.id ?? null,
    actorName: req?.currentUser?.name ?? "scheduled scan",
    ipAddress: req?.ip ?? null,
    afterState: {
      findings: all.length,
      newAlerts: raised.length,
      integrityFindings: integrityFindings.length,
      behaviourFindings: behaviourFindings.length,
      ruleFailures: failures,
      durationMs: Date.now() - startedAt,
    },
  });

  const payload = {
    ranAt: new Date(),
    durationMs: Date.now() - startedAt,
    findings: all.length,
    newAlerts: raised.length,
    integrityFindings: integrityFindings.length,
    behaviourFindings: behaviourFindings.length,
    ruleFailures: failures,
    alerts: raised.map(serialize),
  };

  if (res) return res.json(payload);
  return payload;
};

// ── The console ──────────────────────────────────────────────────────────────
export const listAlerts = async (req, res) => {
  const where = {};
  if (req.query.status) where.status = req.query.status;
  if (req.query.severity) where.severity = req.query.severity;
  if (req.query.type) where.type = req.query.type;

  const alerts = await SecurityAlert.findAll({
    where,
    include: [{ model: User, as: "resolvedBy", attributes: ["id", "name"] }],
    // Critical first, then most recently seen. An operator opening this screen
    // during an incident needs the worst thing at the top, not the newest.
    order: [
      [
        SecurityAlert.sequelize.literal(
          "FIELD(severity, 'critical', 'high', 'medium', 'low')"
        ),
        "ASC",
      ],
      ["lastSeenAt", "DESC"],
    ],
    limit: Math.min(Number(req.query.limit) || 200, 500),
  });

  res.json(alerts.map(serialize));
};

export const getSecurityOverview = async (req, res) => {
  const open = await SecurityAlert.findAll({ where: { status: { [Op.in]: ["open", "acknowledged"] } } });

  const bySeverity = Object.fromEntries(
    ALERT_SEVERITIES.map((severity) => [severity, open.filter((a) => a.severity === severity).length])
  );

  const lastScan = await (await import("../models/auditLogModel.js")).AuditLog.findOne({
    where: { actionType: AUDIT_ACTIONS.SECURITY_SCAN_RUN },
    order: [["recordedAt", "DESC"]],
  });

  const fingerprinted = await RecordFingerprint.count();

  res.json({
    openAlerts: open.length,
    bySeverity,
    // Surfaced prominently: a monitor that has not run is not monitoring, and
    // "when did this last check?" is the first question to ask of any such
    // system.
    lastScanAt: lastScan?.recordedAt ?? null,
    lastScanSummary: lastScan?.summary ?? null,
    recordsUnderWatch: fingerprinted,
    watchedEntities: watchedEntities(),
    thresholds: RULE_THRESHOLDS,
    alertTypes: Object.entries(ALERT_TYPE_LABELS).map(([key, label]) => ({ key, label })),
  });
};

export const updateAlert = async (req, res) => {
  const alert = await SecurityAlert.findByPk(req.params.id);
  if (!alert) return res.status(404).json({ message: "That alert does not exist." });

  const { status, note } = req.body;
  if (!["acknowledged", "resolved", "dismissed"].includes(status)) {
    return res.status(400).json({ message: "Unknown alert status." });
  }

  // Closing an alert without saying why destroys the value of having raised it:
  // the next reviewer needs to know whether it was investigated or waved
  // through.
  if ((status === "resolved" || status === "dismissed") && !note?.trim()) {
    return res.status(400).json({
      message: "Record what was found. An alert closed without a reason tells the next reviewer nothing.",
    });
  }

  const before = alert.status;
  await alert.update({
    status,
    resolutionNote: note?.trim() ?? alert.resolutionNote,
    resolvedAt: status === "acknowledged" ? null : new Date(),
    resolvedById: status === "acknowledged" ? null : req.currentUser.id,
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.SECURITY_ALERT_UPDATED,
    entityRef: "securityAlert",
    entityId: alert.id,
    summary: `Security alert ${status}: ${alert.summary}`,
    beforeState: { status: before },
    afterState: { status, note: note?.trim() ?? null },
  });

  res.json(serialize(await SecurityAlert.findByPk(alert.id, {
    include: [{ model: User, as: "resolvedBy", attributes: ["id", "name"] }],
  })));
};

// ── Baseline ─────────────────────────────────────────────────────────────────
// Fingerprints everything currently in the database and treats it as
// authorised. Needed once after seeding or a deliberate data import; without it
// every pre-existing row looks like an unauthorised insert.
//
// It is also, unavoidably, the way to make evidence of tampering disappear —
// so it is restricted, requires a stated reason, and is audited loudly.
export const rebaselineIntegrity = async (req, res) => {
  if (!req.body.reason?.trim()) {
    return res.status(400).json({
      message:
        "Record why the baseline is being reset. This makes any existing discrepancy stop being reported, so it must be explained.",
    });
  }

  const counts = await rebaseline();
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.SECURITY_BASELINE_RESET,
    entityRef: "security",
    summary: `Integrity baseline reset over ${total} record(s): ${req.body.reason.trim()}`,
    afterState: { counts, reason: req.body.reason.trim() },
  });

  await notifyByPermission("security.view", {
    type: NOTIFICATION_EVENTS.SECURITY_ALERT,
    title: "Integrity baseline was reset",
    body: `${req.currentUser.name} re-baselined ${total} records: ${req.body.reason.trim()}`,
    link: "/admin/security",
    refEntity: "security",
    severity: "warning",
  });

  res.json({ rebaselined: true, counts, total });
};
