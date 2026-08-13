import crypto from "crypto";
import { AuditLog } from "../models/auditLogModel.js";
import { sequelize } from "../models/db.js";

// The chain's anchor. The first entry links to this so even entry #1 has a
// verifiable predecessor and cannot be silently replaced.
export const GENESIS_HASH = "0".repeat(64);

// MySQL DATETIME stores whole seconds — milliseconds are silently dropped on
// write. If the hash covered a millisecond-precision timestamp, recomputing it
// from the stored row would never match and every entry would look tampered.
// Hashing must cover exactly what is persisted, so timestamps are truncated to
// whole seconds *before* both storage and hashing.
const toStoredPrecision = (value) => {
  const date = new Date(value);
  date.setMilliseconds(0);
  return date;
};

// MySQL's native JSON type does not preserve object key order — it normalises
// keys by length, then lexicographically. So `JSON.stringify` of a JSON column
// yields a different string after a storage round-trip than it did on write,
// and the recomputed hash would not match. Sorting keys recursively makes the
// serialisation independent of key order, so write and verify always agree.
const stableStringify = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";

  // Dates must be handled before the generic object branch below, and this is not
  // a nicety — it is a correctness requirement.
  //
  // A Date has no enumerable own properties, so `Object.keys` returns [] and the
  // object branch would serialise it as `{}`. But MySQL stores it in a JSON column
  // as the ISO string that `JSON.stringify` produces, so reading the row back
  // yields a *string*. Write would hash `{}` and verify would hash `"2026-…Z"`,
  // and every entry carrying a timestamp in its state would be reported as
  // tampered for the rest of the log's life. Serialising to the same ISO string
  // both times is what makes the two agree.
  if (value instanceof Date) return JSON.stringify(value.toISOString());

  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
};

// Canonical serialisation: key order must be fixed, or the same logical entry
// could hash differently and verification would produce false alarms.
const canonicalise = (entry) =>
  JSON.stringify([
    entry.sequence,
    entry.actionType,
    entry.entityRef ?? null,
    entry.entityId ?? null,
    entry.actorId ?? null,
    entry.actorName ?? null,
    entry.actorRole ?? null,
    entry.outcome,
    entry.summary ?? null,
    entry.ipAddress ?? null,
    // Dates must serialise identically on write and on verify.
    toStoredPrecision(entry.recordedAt).toISOString(),
    entry.beforeState ? stableStringify(entry.beforeState) : null,
    entry.afterState ? stableStringify(entry.afterState) : null,
  ]);

export const computeHash = (entry, prevHash) =>
  crypto.createHash("sha256").update(prevHash + canonicalise(entry)).digest("hex");

// ── Secret redaction ─────────────────────────────────────────────────────────
//
// The audit log must never contain a password (current, previous or new), an OTP,
// an activation or reset token, or any other authentication credential. Every
// call site in this codebase is written to respect that, but "every call site is
// careful" is a property that decays the moment somebody adds the next one — and
// the log is append-only and hash-chained, so a secret written into it cannot be
// edited out afterwards. The prohibition is therefore enforced here, once, on the
// way in.
//
// Matching is on key name, substring, case-insensitive, recursively through
// nested objects and arrays. `[redacted]` is left in place of the value rather
// than the key being dropped, so a reviewer can see that a field was present and
// deliberately withheld — silent removal would look like it was never sent.
const FORBIDDEN_KEY_PATTERNS = [
  /pass(word|wd|phrase)/i,
  // Substring, not word-bounded. `\botp\b` looks tighter but fails on exactly the
  // names people actually write — in `numericOtp` or `otpForBid` the "otp" sits
  // between two word characters, so there is no boundary to match and the field
  // would sail through unredacted. No legitimate key in this domain contains the
  // sequence, so the loose form costs nothing.
  /otp/i,
  /verificationcode|onetimecode|activationcode|resetcode|securitycode/i,
  /token/i,
  /secret/i,
  /credential/i,
  /ticket/i,
  /apikey|api_key/i,
  /\bhash\b|passwordhash/i,
];

// Bare `code` is deliberately NOT matched: departments, procurement modes and
// reference numbers all legitimately carry a `code`, and redacting those would
// gut the log's usefulness. No caller puts a one-time code under that key — the
// specific names above cover the ones that would.
const isForbiddenKey = (key) => FORBIDDEN_KEY_PATTERNS.some((pattern) => pattern.test(key));

// A secret is always a string — a password, a code, a token, a hash. A boolean or
// a timestamp cannot be one, whatever its key is called.
//
// This distinction matters because the key patterns above are deliberately broad,
// and broad patterns catch useful metadata: `passwordSet: true` and
// `passwordChangedAt: <date>` both match /password/, and redacting them would
// throw away exactly the facts an auditor needs — that a password was set, and
// when — while protecting nothing, since neither value could ever be a credential.
// So booleans and dates under a forbidden key survive; everything else does not.
const isRedactableValue = (value) =>
  !(typeof value === "boolean" || value instanceof Date || value === null || value === undefined);

export const redactSecrets = (value, depth = 0) => {
  // Guards against a cyclic or pathological structure taking the audit writer
  // down with it. Auditing must never be the thing that breaks a request.
  if (depth > 8) return "[truncated]";
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, depth + 1));

  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    out[key] =
      isForbiddenKey(key) && isRedactableValue(nested)
        ? "[redacted]"
        : redactSecrets(nested, depth + 1);
  }
  return out;
};

// Writing is serialised so two concurrent actions cannot claim the same
// sequence number or chain off the same predecessor — that would fork the
// chain and make verification ambiguous.
let writeQueue = Promise.resolve();

export const recordAudit = (payload) => {
  const run = async () => {
    try {
      return await sequelize.transaction(async (transaction) => {
        const last = await AuditLog.findOne({
          order: [["sequence", "DESC"]],
          transaction,
          lock: transaction.LOCK?.UPDATE,
        });

        const entry = {
          sequence: (last?.sequence ?? 0) + 1,
          actionType: payload.actionType,
          entityRef: payload.entityRef ?? null,
          entityId: payload.entityId ?? null,
          actorId: payload.actorId ?? null,
          actorName: payload.actorName ?? null,
          actorRole: payload.actorRole ?? null,
          outcome: payload.outcome ?? "success",
          summary: payload.summary ?? null,
          ipAddress: payload.ipAddress ?? null,
          // Scrubbed on the way in — see redactSecrets above. The hash is
          // computed over the redacted form, which is also what is stored, so
          // verification still holds.
          beforeState: payload.beforeState ? redactSecrets(payload.beforeState) : null,
          afterState: payload.afterState ? redactSecrets(payload.afterState) : null,
          // Defaults to now. The override exists for backfilling historical
          // activity — importing records from a predecessor system, or seeding
          // demonstration data — where the entry's real time is not the time it
          // was written. No controller passes it; every live action is stamped
          // by the server. The hash covers whatever is stored either way, so a
          // backfilled entry stays as verifiable as a live one.
          recordedAt: toStoredPrecision(payload.recordedAt ?? new Date()),
        };

        const prevHash = last?.hash ?? GENESIS_HASH;
        return AuditLog.create(
          { ...entry, prevHash, hash: computeHash(entry, prevHash) },
          { transaction }
        );
      });
    } catch (err) {
      // Auditing must never break the action it is recording. A failure here
      // is itself worth shouting about, but not worth rolling back a payment.
      console.error("[audit] failed to record:", err.message);
      return null;
    }
  };

  writeQueue = writeQueue.then(run, run);
  return writeQueue;
};

// Convenience for controllers: pulls actor and IP off the request.
export const auditFromRequest = (req, payload) =>
  recordAudit({
    ...payload,
    actorId: req.currentUser?.id ?? null,
    actorName: req.currentUser?.name ?? null,
    actorRole: req.currentUser?.Role?.key ?? null,
    ipAddress: req.ip ?? null,
  });

// Walks the whole chain and reports the first point at which it breaks.
// Returns every anomaly rather than stopping at the first, so a reviewer can
// see the full extent of any tampering.
export const verifyChain = async ({ limit } = {}) => {
  const entries = await AuditLog.findAll({
    order: [["sequence", "ASC"]],
    ...(limit ? { limit } : {}),
  });

  const problems = [];
  let expectedPrev = GENESIS_HASH;
  let expectedSequence = 1;

  for (const entry of entries) {
    if (entry.sequence !== expectedSequence) {
      problems.push({
        sequence: entry.sequence,
        type: "sequenceGap",
        detail: `Expected sequence ${expectedSequence} but found ${entry.sequence} — an entry may have been removed.`,
      });
      expectedSequence = entry.sequence;
    }

    if (entry.prevHash !== expectedPrev) {
      problems.push({
        sequence: entry.sequence,
        type: "brokenLink",
        detail: "This entry does not link to the previous entry's hash.",
      });
    }

    const recomputed = computeHash(entry, entry.prevHash);
    if (recomputed !== entry.hash) {
      problems.push({
        sequence: entry.sequence,
        type: "contentAltered",
        detail: "Stored hash does not match this entry's contents — it has been modified since it was written.",
      });
    }

    expectedPrev = entry.hash;
    expectedSequence += 1;
  }

  return {
    intact: problems.length === 0,
    entriesChecked: entries.length,
    problems,
    headHash: entries.at(-1)?.hash ?? GENESIS_HASH,
  };
};

// Action types kept together so the log stays greppable and the DSS can group
// on them without matching free text.
export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: "auth.login.success",
  LOGIN_FAILED: "auth.login.failed",
  LOGOUT: "auth.logout",

  // ── Bidder onboarding ─────────────────────────────────────────────────────
  // The chain of accountability from a bidder handing in papers to a usable
  // account. Every step is a separate entry so a reviewer can see who did what
  // and when, and can tell an account that was properly invited and verified
  // from one that appeared some other way.
  BIDDER_REQUIREMENTS_SUBMITTED: "bidder.requirements.submitted",
  BIDDER_REQUIREMENTS_REVIEWED: "bidder.requirements.reviewed",

  // A submission refused because the call it answered had already closed. Worth
  // its own action rather than a generic denial: a cluster of these against one
  // announcement is the evidence that a deadline was too tight, and an applicant
  // who later claims they submitted on time can be checked against it.
  BIDDER_REQUIREMENTS_LATE: "bidder.requirements.late",

  // Per-document accreditation decisions. The registration-level decision above
  // records that a bidder was accepted; these record which papers were actually
  // examined to reach it, which is the part an auditor asks about.
  BIDDER_DOCUMENT_REVIEWED: "bidder.document.reviewed",
  BIDDER_ACCOUNT_CREATED: "bidder.account.created",
  BIDDER_INVITATION_SENT: "bidder.invitation.sent",
  BIDDER_INVITATION_FAILED: "bidder.invitation.failed",
  BIDDER_ACTIVATION_ACCESSED: "bidder.activation.accessed",
  BIDDER_ACTIVATION_REJECTED: "bidder.activation.rejected",
  BIDDER_ACTIVATION_SETUP: "bidder.activation.setup",
  BIDDER_ACCOUNT_ACTIVATED: "bidder.account.activated",

  // ── One-time codes ────────────────────────────────────────────────────────
  // What was verified, for whom, and whether it succeeded — never the code.
  OTP_ISSUED: "otp.issued",
  OTP_VERIFIED: "otp.verified",
  OTP_FAILED: "otp.failed",

  // ── Security monitoring ───────────────────────────────────────────────────
  // The scans themselves are audited. An attacker who reached the database
  // would want monitoring switched off, so a *gap* in the record of scans is
  // itself a signal worth having.
  SECURITY_SCAN_RUN: "security.scan.run",
  SECURITY_ALERT_UPDATED: "security.alert.updated",
  SECURITY_BASELINE_RESET: "security.baseline.reset",

  // ── Two-factor authentication ─────────────────────────────────────────────
  // Every change to somebody's second factor is logged, because each one is a
  // change to who can get into an account. The administrator reset is the one
  // that matters most: it is the only path that removes the protection without
  // the account holder's phone, so it must never be able to happen quietly.
  MFA_CHALLENGE_ISSUED: "auth.mfa.challenge.issued",
  MFA_ENROLLMENT_STARTED: "auth.mfa.enrollment.started",
  MFA_ENABLED: "auth.mfa.enabled",
  MFA_DISABLED: "auth.mfa.disabled",
  MFA_DISABLE_REFUSED: "auth.mfa.disable.refused",
  MFA_CHALLENGE_FAILED: "auth.mfa.challenge.failed",
  MFA_RECOVERY_USED: "auth.mfa.recovery.used",
  MFA_RECOVERY_REGENERATED: "auth.mfa.recovery.regenerated",
  MFA_RESET_BY_ADMIN: "auth.mfa.reset.byAdmin",

  // ── Credentials ───────────────────────────────────────────────────────────
  PASSWORD_RESET_REQUESTED: "auth.password.reset.requested",
  PASSWORD_RESET: "auth.password.reset",
  PASSWORD_CHANGE_REQUESTED: "auth.password.change.requested",
  PASSWORD_CHANGED: "auth.password.changed",

  PROFILE_UPDATED: "user.profile.updated",
  BID_SUBMITTED: "bid.submitted",

  USER_CREATED: "user.created",
  USER_UPDATED: "user.updated",
  USER_PASSWORD_RESET: "user.password.reset",
  SETTINGS_CHANGED: "settings.changed",

  // ── Public announcements ──────────────────────────────────────────────────
  // Publishing is the accountable act, not writing: a draft affects nobody, and
  // a notice that went out to the municipality and was then quietly edited or
  // withdrawn is exactly the kind of change a transparency system has to be able
  // to evidence after the fact.
  ANNOUNCEMENT_PUBLISHED: "announcement.published",
  ANNOUNCEMENT_UPDATED: "announcement.updated",
  ANNOUNCEMENT_WITHDRAWN: "announcement.withdrawn",
  // ── Planning and budget authorisation ─────────────────────────────────────
  // The chain above procurement. These matter to an auditor for the opposite
  // reason the procurement entries do: procurement logs answer "was this bought
  // properly?", these answer "was the LGU ever authorised to buy it?".
  CDP_RECORDED: "planning.cdp.recorded",
  CDP_ADOPTED: "planning.cdp.adopted",
  PRIORITIES_SET: "planning.priorities.set",
  AIP_TRANSITION: "planning.aip.transition",
  BUDGET_PROPOSAL_SUBMITTED: "budget.proposal.submitted",
  BUDGET_PROPOSAL_REVIEWED: "budget.proposal.reviewed",
  BUDGET_TRANSITION: "budget.executive.transition",
  BUDGET_PROCEEDING_RECORDED: "budget.proceeding.recorded",
  // The moment budget stops being a proposal and becomes spendable authority.
  APPROPRIATIONS_RELEASED: "budget.appropriations.released",

  // ── Document templates and generated documents ────────────────────────────
  // Templates are logged because whoever edits one changes what the
  // municipality says in every future document of that kind — a heavier act
  // than issuing any single document, and one with no other trace.
  TEMPLATE_CREATED: "template.created",
  TEMPLATE_UPDATED: "template.updated",
  TEMPLATE_VERSION_SAVED: "template.version.saved",
  TEMPLATE_VERSION_ACTIVATED: "template.version.activated",

  // Generated documents are logged at every point the spec asks for:
  // generation, manual edit, approval, download, publication and voiding.
  // The download entry is the one people forget — it answers "who took a copy
  // of this, and when", which is the question asked after a leak.
  DOCUMENT_GENERATED: "document.generated",
  DOCUMENT_EDITED: "document.edited",
  DOCUMENT_APPROVED: "document.approved",
  DOCUMENT_DOWNLOADED: "document.downloaded",
  DOCUMENT_PUBLISHED: "document.published",
  DOCUMENT_UNPUBLISHED: "document.unpublished",
  DOCUMENT_VOIDED: "document.voided",

  APP_TRANSITION: "app.transition",
  PR_TRANSITION: "pr.transition",
  // Step 19: the committee's determination of how a requisition will be
  // procured, recorded as its own act rather than inferred from an RFQ form.
  PR_MODE_DETERMINED: "pr.mode.determined",
  RFQ_PUBLISHED: "rfq.published",
  BIDS_OPENED: "bids.opened",
  EVALUATION_SUBMITTED: "evaluation.submitted",
  EVALUATION_CLOSED: "evaluation.closed",
  AWARD_RECOMMENDED: "award.recommended",
  AWARD_APPROVED: "award.approved",

  // ── Observers (RA 12009 Sec. 43) ──────────────────────────────────────────
  // The invitation is what makes an observer's absence lawful, and the report
  // is the observer's finding on the committee itself. Both belong in the trail
  // as first-class acts: "were observers invited, and what did they say" is a
  // question COA asks of every procurement.
  OBSERVERS_INVITED: "observers.invited",
  OBSERVATION_REPORT_FILED: "observers.report.filed",

  // ── Protest mechanism (RA 12009 Sec. 83–85) ───────────────────────────────
  PROTEST_FILED: "protest.filed",
  PROTEST_RESOLVED: "protest.resolved",

  // Sec. 64 — a failed bidding is a recorded act, not the absence of an award.
  // Two of these on one project is what opens Negotiated Procurement.
  BIDDING_FAILED: "bidding.failed",

  // Sec. 69 — blacklisting is the sanction that bars a supplier from every
  // government procurement, so it belongs in the trail as its own act.
  VENDOR_BLACKLISTED: "vendor.blacklisted",
  VENDOR_BLACKLIST_LIFTED: "vendor.blacklist.lifted",

  // Sec. 71 — variation orders and contract termination.
  VARIATION_ORDER_APPROVED: "contract.variation.approved",
  CONTRACT_TERMINATED: "contract.terminated",

  CONTRACT_SIGNED: "contract.signed",
  // The instrument that starts contract time. Separate from signing because a
  // contract can be in force for days before the supplier is told to begin.
  NOTICE_TO_PROCEED_ISSUED: "contract.ntp.issued",
  SECURITY_POSTED: "security.posted",
  DELIVERY_INSPECTED: "delivery.inspected",
  INVOICE_CERTIFIED: "invoice.certified",
  PAYMENT_RELEASED: "payment.released",
  PERMISSION_DENIED: "access.denied",
};
