import { Op, fn, col } from "sequelize";
import { AuditLog } from "../models/auditLogModel.js";
import { verifyChain } from "./auditLog.js";

// ── BEHAVIOURAL ANOMALIES ────────────────────────────────────────────────────
//
// The integrity monitor answers "did something change without going through the
// system?". This answers the other half: "did something go through the system
// that does not look right?"
//
// Every rule below is computed from records the system already keeps — the
// audit log, bids, documents. Nothing new is collected about anybody, which
// matters: a monitoring feature that starts gathering fresh personal data to
// find wrongdoing has traded one problem for another.
//
// Thresholds are constants rather than configuration on purpose. Each one is a
// judgement about this office's normal volume, and a knob nobody knows how to
// set is worse than a number written down with its reasoning next to it.

const HOUR = 60 * 60 * 1000;

// A single mistyped password is normal. Six against one account in an hour is
// somebody working through a list.
const LOGIN_FAILURE_THRESHOLD = 6;
const LOGIN_FAILURE_WINDOW = 1 * HOUR;

// The second factor is a six-digit space, so failures matter more than password
// failures: repeated ones mean somebody already has the password.
const MFA_FAILURE_THRESHOLD = 4;
const MFA_FAILURE_WINDOW = 1 * HOUR;

// Municipal office hours, local time. Outside them is not wrong — procurement
// deadlines produce genuine late nights — but it is worth a note when it
// coincides with something consequential.
const OFFICE_OPENS = 6;
const OFFICE_CLOSES = 20;

// Reading a handful of documents is the job. Forty in an hour is somebody
// taking a copy of the file room.
const BULK_DOWNLOAD_THRESHOLD = 40;
const BULK_DOWNLOAD_WINDOW = 1 * HOUR;

const since = (ms) => new Date(Date.now() - ms);

const groupCount = (rows, keyOf) => {
  const counts = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (key === null || key === undefined) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

// ── Rules ────────────────────────────────────────────────────────────────────

const repeatedLoginFailures = async () => {
  const rows = await AuditLog.findAll({
    where: { actionType: "auth.login.failed", recordedAt: { [Op.gte]: since(LOGIN_FAILURE_WINDOW) } },
    attributes: ["actorName", "ipAddress", "recordedAt"],
  });

  const findings = [];
  for (const [account, count] of groupCount(rows, (r) => r.actorName)) {
    if (count < LOGIN_FAILURE_THRESHOLD) continue;
    const addresses = [...new Set(rows.filter((r) => r.actorName === account).map((r) => r.ipAddress))];
    findings.push({
      type: "repeatedLoginFailures",
      // Attempts from many addresses is a distributed attempt at one account,
      // which is a different and worse thing than one person mistyping.
      severity: addresses.length > 2 ? "high" : "medium",
      summary: `${count} failed sign-in attempts for "${account}" in the last hour, from ${addresses.length} address(es)`,
      detail: { account, attempts: count, addresses },
      dedupeKey: `loginFailures:${account}:${new Date().toISOString().slice(0, 13)}`,
    });
  }
  return findings;
};

const repeatedMfaFailures = async () => {
  const rows = await AuditLog.findAll({
    where: {
      actionType: "auth.mfa.challenge.failed",
      recordedAt: { [Op.gte]: since(MFA_FAILURE_WINDOW) },
    },
    attributes: ["actorName", "entityId", "ipAddress", "afterState"],
  });

  const findings = [];
  for (const [account, count] of groupCount(rows, (r) => r.actorName)) {
    if (count < MFA_FAILURE_THRESHOLD) continue;
    const forAccount = rows.filter((r) => r.actorName === account);
    // A *replayed* code is qualitatively different from a wrong one: it means
    // somebody obtained a real code and tried to use it again, which is the
    // signature of a phishing proxy rather than a fumbled entry.
    const replays = forAccount.filter((r) => r.afterState?.replay).length;
    findings.push({
      type: "repeatedMfaFailures",
      severity: replays > 0 ? "critical" : "high",
      summary:
        `${count} second-factor failures for "${account}" in the last hour` +
        (replays > 0 ? ` — ${replays} were REUSED codes, which suggests interception` : " — the password is already known to someone"),
      detail: { account, failures: count, replayedCodes: replays, addresses: [...new Set(forAccount.map((r) => r.ipAddress))] },
      dedupeKey: `mfaFailures:${account}:${new Date().toISOString().slice(0, 13)}`,
    });
  }
  return findings;
};

// Privilege changes made *through* the system are legitimate but consequential,
// so they are surfaced for review rather than alerted as attacks. The
// unauthorised kind is caught by the integrity monitor instead.
const privilegeChanges = async () => {
  const rows = await AuditLog.findAll({
    where: {
      actionType: { [Op.in]: ["user.updated", "user.created", "auth.mfa.reset.byAdmin"] },
      recordedAt: { [Op.gte]: since(24 * HOUR) },
    },
    attributes: ["id", "actionType", "actorName", "summary", "entityId", "beforeState", "afterState", "recordedAt"],
  });

  return rows
    .filter((row) => {
      if (row.actionType === "auth.mfa.reset.byAdmin") return true;
      // Only role changes, not a corrected spelling of somebody's name.
      return row.beforeState?.roleId !== undefined && row.beforeState?.roleId !== row.afterState?.roleId;
    })
    .map((row) => {
      // An administrator clearing somebody's second factor is not a privilege
      // change, and reporting it as one puts it under the label "Role or
      // permission changed" — which reads, wrongly, as though someone's powers
      // were altered. It is its own thing and gets its own type.
      //
      // It is still surfaced, because it is the textbook account-takeover route
      // inside a system like this: reset the officer's second factor, enrol a
      // new authenticator, sign in as them, approve something. Every reset here
      // is legitimate and carries a stated reason — the alert exists so that a
      // pattern of them, or one nobody can account for, is visible.
      const isReset = row.actionType === "auth.mfa.reset.byAdmin";
      return {
        type: isReset ? "credentialReset" : "privilegeChanged",
        severity: isReset ? "medium" : "high",
        entityRef: "user",
        entityId: row.entityId,
        summary: row.summary,
        detail: { performedBy: row.actorName, at: row.recordedAt, before: row.beforeState, after: row.afterState },
        dedupeKey: `${isReset ? "credentialReset" : "privilege"}:${row.id}`,
      };
    });
};

const offHoursConsequentialActs = async () => {
  const CONSEQUENTIAL = [
    "award.approved",
    "budget.appropriations.released",
    "payment.released",
    "pr.transition",
    "contract.signed",
    "user.updated",
  ];

  const rows = await AuditLog.findAll({
    where: { actionType: { [Op.in]: CONSEQUENTIAL }, recordedAt: { [Op.gte]: since(24 * HOUR) } },
    attributes: ["id", "actionType", "actorName", "summary", "ipAddress", "recordedAt"],
  });

  return rows
    .filter((row) => {
      const hour = new Date(row.recordedAt).getHours();
      return hour < OFFICE_OPENS || hour >= OFFICE_CLOSES;
    })
    .map((row) => ({
      type: "offHoursAccess",
      // Low on its own. It is a fact worth having beside the others, not an
      // accusation — deadlines produce genuine late nights.
      severity: "low",
      summary: `${row.summary} — performed at ${new Date(row.recordedAt).toLocaleTimeString("en-PH")}, outside office hours`,
      detail: { actor: row.actorName, action: row.actionType, at: row.recordedAt, ip: row.ipAddress },
      dedupeKey: `offHours:${row.id}`,
    }));
};

const bulkDocumentAccess = async () => {
  const rows = await AuditLog.findAll({
    where: {
      actionType: { [Op.in]: ["document.downloaded", "document.accessed"] },
      recordedAt: { [Op.gte]: since(BULK_DOWNLOAD_WINDOW) },
    },
    attributes: ["actorName", "ipAddress"],
  });

  const findings = [];
  for (const [actor, count] of groupCount(rows, (r) => r.actorName)) {
    if (count < BULK_DOWNLOAD_THRESHOLD) continue;
    findings.push({
      type: "bulkDocumentAccess",
      severity: "high",
      summary: `${actor} downloaded ${count} documents in the last hour`,
      detail: { actor, downloads: count },
      dedupeKey: `bulkDownload:${actor}:${new Date().toISOString().slice(0, 13)}`,
    });
  }
  return findings;
};

// ── Bidding irregularities ───────────────────────────────────────────────────
// Two classic collusion signatures, both computable from what is already
// stored. Neither proves anything on its own — a shared internet café is a
// perfectly innocent explanation for a shared address — which is why they are
// raised for the BAC to consider rather than acted on automatically.

const duplicateBidDocuments = async () => {
  const { Document } = await import("../models/documentModel.js");

  const duplicates = await Document.findAll({
    where: { entityRef: "bid" },
    attributes: ["checksum", [fn("COUNT", col("id")), "copies"]],
    group: ["checksum"],
    having: fn("COUNT", col("id")) > 1,
    raw: true,
  }).catch(() => []);

  const findings = [];
  for (const row of duplicates) {
    if (Number(row.copies) < 2) continue;
    const files = await Document.findAll({
      where: { checksum: row.checksum, entityRef: "bid" },
      attributes: ["id", "entityId", "filename", "uploadedById"],
    });
    const bidIds = [...new Set(files.map((f) => f.entityId))];
    // The same file attached twice to one bid is housekeeping. The same file on
    // two different bids means two "competing" bidders filed identical paper.
    if (bidIds.length < 2) continue;

    findings.push({
      type: "duplicateBidDocument",
      severity: "critical",
      summary: `Identical document submitted against ${bidIds.length} different bids — possible collusion`,
      detail: { checksum: row.checksum, bidIds, filenames: [...new Set(files.map((f) => f.filename))] },
      dedupeKey: `dupBidDoc:${row.checksum}`,
    });
  }
  return findings;
};

const bidIpClustering = async () => {
  const rows = await AuditLog.findAll({
    where: { actionType: "bid.submitted" },
    attributes: ["entityId", "actorName", "ipAddress", "recordedAt"],
  });

  const findings = [];
  const byIp = new Map();
  for (const row of rows) {
    if (!row.ipAddress) continue;
    if (!byIp.has(row.ipAddress)) byIp.set(row.ipAddress, []);
    byIp.get(row.ipAddress).push(row);
  }

  for (const [ip, submissions] of byIp) {
    const bidders = [...new Set(submissions.map((s) => s.actorName))];
    if (bidders.length < 2) continue;
    findings.push({
      type: "bidIpClustering",
      severity: "high",
      summary: `${bidders.length} different bidders submitted from the same address (${ip})`,
      detail: {
        ip,
        bidders,
        // Named so the BAC can weigh it rather than treat it as proof — a
        // shared office or internet café is an innocent explanation.
        note: "Not conclusive on its own. Consider alongside pricing patterns and document similarity.",
      },
      dedupeKey: `bidIp:${ip}`,
    });
  }
  return findings;
};

// The audit chain itself. Cheap to check and catastrophic to miss: a broken
// chain means somebody edited history.
const auditChainIntegrity = async () => {
  const result = await verifyChain();
  if (result.intact) return [];

  return [
    {
      type: "auditChainBroken",
      severity: "critical",
      summary: `The audit log hash chain is broken at ${result.problems.length} point(s) — entries have been altered`,
      detail: { entriesChecked: result.entriesChecked, problems: result.problems.slice(0, 10) },
      dedupeKey: `auditChain:${result.problems[0]?.sequence ?? "unknown"}`,
    },
  ];
};

// ── Run them all ─────────────────────────────────────────────────────────────
// Each rule is isolated: one that throws must not stop the others, because a
// monitor that silently stops monitoring is worse than none at all.
export const detectAnomalies = async () => {
  const rules = [
    ["auditChainIntegrity", auditChainIntegrity],
    ["repeatedLoginFailures", repeatedLoginFailures],
    ["repeatedMfaFailures", repeatedMfaFailures],
    ["privilegeChanges", privilegeChanges],
    ["offHoursConsequentialActs", offHoursConsequentialActs],
    ["bulkDocumentAccess", bulkDocumentAccess],
    ["duplicateBidDocuments", duplicateBidDocuments],
    ["bidIpClustering", bidIpClustering],
  ];

  const findings = [];
  const failures = [];

  for (const [name, rule] of rules) {
    try {
      findings.push(...(await rule()));
    } catch (err) {
      failures.push({ rule: name, error: err.message });
      console.error(`[anomaly] rule ${name} failed:`, err.message);
    }
  }

  return { findings, failures };
};

export const RULE_THRESHOLDS = {
  loginFailures: { threshold: LOGIN_FAILURE_THRESHOLD, windowHours: LOGIN_FAILURE_WINDOW / HOUR },
  mfaFailures: { threshold: MFA_FAILURE_THRESHOLD, windowHours: MFA_FAILURE_WINDOW / HOUR },
  bulkDownloads: { threshold: BULK_DOWNLOAD_THRESHOLD, windowHours: BULK_DOWNLOAD_WINDOW / HOUR },
  officeHours: { opens: OFFICE_OPENS, closes: OFFICE_CLOSES },
};
