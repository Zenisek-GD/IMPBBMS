// Proof that a change made straight in MySQL — never touching the application,
// never writing an audit entry — is detected and reaches an administrator.
//
// Every tampering statement below is raw SQL through the connection,
// deliberately bypassing every model, hook, controller and permission check in
// the system. This is what a developer with database access, a contractor, or
// an attacker who got past the application would actually do.
//
//   node services/integrityMonitor.proof.mjs           run and restore
//   node services/integrityMonitor.proof.mjs --keep    run and leave the alerts
//                                                      standing, to demonstrate
//                                                      the security console
//
// Nothing here is part of the running system. It exists so the detection can be
// demonstrated on demand rather than asserted.

import "../config/env.js";
import { sequelize } from "../models/index.js";
import { SecurityAlert } from "../models/integrityModel.js";
import { Notification } from "../models/notificationModel.js";
import { runSecurityScan } from "../controllers/securityController.js";

const KEEP = process.argv.includes("--keep");

const q = (sql, opts) => sequelize.query(sql, opts);
const line = (s = "") => console.log(s);
const rule = () => line("─".repeat(78));

const restore = [];
const raisedHere = [];

try {
  rule();
  line("STEP 0 — baseline: the system is clean before anything is touched");
  rule();
  const clean = await runSecurityScan(null, null);
  line(`   integrity findings: ${clean.integrityFindings}`);
  line(`   behavioural findings: ${clean.behaviourFindings}`);

  // Taken after the baseline scan, because that scan writes an audit entry of
  // its own. Counting from before it would credit the tampering with an entry
  // the monitor wrote about itself.
  const [[auditBefore]] = await q("SELECT COUNT(*) c FROM auditlogs");

  // ── The tampering ─────────────────────────────────────────────────────────
  rule();
  line("STEP 1 — four unauthorised changes, made in raw SQL only");
  rule();

  // (a) Raise an appropriation. The classic fraud: more money appears to be
  //     available than the Sanggunian actually authorised.
  const [[approp]] = await q(
    "SELECT id, ordinanceNo, title, amount FROM appropriations ORDER BY id LIMIT 1"
  );
  const inflated = Number(approp.amount) + 5_000_000;
  await q("UPDATE appropriations SET amount = :amt WHERE id = :id", {
    replacements: { amt: inflated, id: approp.id },
  });
  restore.push([
    "UPDATE appropriations SET amount = :amt WHERE id = :id",
    { amt: approp.amount, id: approp.id },
  ]);
  line(`   (a) appropriation #${approp.id} "${approp.title}" (${approp.ordinanceNo})`);
  line(
    `       ₱${Number(approp.amount).toLocaleString()} → ₱${inflated.toLocaleString()}   [+₱5,000,000]`
  );

  // (b) Grant a permission by INSERT. The highest-value silent attack there is:
  //     it steals nothing directly, it makes everything else stealable.
  const [[vendorRole]] = await q("SELECT id, name FROM roles WHERE `key` = 'vendor'");
  const [[perm]] = await q("SELECT id, `key` FROM permissions WHERE `key` = 'payment.release'");
  await q(
    "INSERT INTO rolepermissions (RoleId, PermissionId, createdAt, updatedAt) VALUES (:r, :p, NOW(), NOW())",
    { replacements: { r: vendorRole.id, p: perm.id } }
  );
  restore.push([
    "DELETE FROM rolepermissions WHERE RoleId = :r AND PermissionId = :p",
    { r: vendorRole.id, p: perm.id },
  ]);
  line(`   (b) granted "${perm.key}" to the "${vendorRole.name}" role`);

  // (c) Delete a bid. Removing a competitor after the fact changes who won.
  const [[bid]] = await q("SELECT * FROM bids ORDER BY id DESC LIMIT 1");
  const bidColumns = Object.keys(bid);
  await q("DELETE FROM bids WHERE id = :id", { replacements: { id: bid.id } });
  restore.push([
    `INSERT INTO bids (${bidColumns.map((c) => `\`${c}\``).join(",")}) ` +
      `VALUES (${bidColumns.map((c) => `:${c}`).join(",")})`,
    bid,
  ]);
  line(`   (c) deleted bid #${bid.id}`);

  // (d) Insert a payment that no requisition, obligation or approval produced.
  const [[pay]] = await q("SELECT * FROM payments ORDER BY id LIMIT 1");
  await q(
    "INSERT INTO payments (disbursementNo, invoiceId, grossAmount, amount, status, createdAt, updatedAt) " +
      "VALUES (:dv, :inv, 750000, 750000, :st, NOW(), NOW())",
    { replacements: { dv: `DV-GHOST-${Date.now()}`, inv: pay.invoiceId, st: pay.status } }
  );
  const [[ghost]] = await q("SELECT id FROM payments ORDER BY id DESC LIMIT 1");
  restore.push(["DELETE FROM payments WHERE id = :id", { id: ghost.id }]);
  line(`   (d) inserted payment #${ghost.id} for ₱750,000 — no PR, no obligation, no approval`);

  // ── Did the audit log notice? ─────────────────────────────────────────────
  rule();
  line("STEP 2 — what the audit log has to say about all that");
  rule();
  const [[auditAfter]] = await q("SELECT COUNT(*) c FROM auditlogs");
  line(`   audit entries produced by those four changes: ${auditAfter.c - auditBefore.c}`);
  line("   The hash chain is still perfectly intact. It has nothing to report,");
  line("   because nothing asked it to write anything. That gap is exactly what");
  line("   the fingerprints exist to close.");

  // ── Detection ─────────────────────────────────────────────────────────────
  rule();
  line("STEP 3 — security scan");
  rule();
  const notifiedBefore = await Notification.count({ where: { type: "security.alert" } });
  const result = await runSecurityScan(null, null);
  raisedHere.push(...result.alerts.map((a) => a.id));

  for (const alert of result.alerts) {
    line(`   [${alert.severity.toUpperCase().padEnd(8)}] ${alert.typeLabel}`);
    line(`              ${alert.summary}`);
  }
  line(`   findings: ${result.findings}   new alerts raised: ${result.newAlerts}`);

  // ── Reaching a person ─────────────────────────────────────────────────────
  rule();
  line("STEP 4 — who was told");
  rule();
  const notifiedAfter = await Notification.count({ where: { type: "security.alert" } });
  const recipients = await sequelize.query(
    "SELECT u.name, u.email, r.name roleName, COUNT(*) n FROM notifications nt " +
      "JOIN users u ON u.id = nt.recipientId LEFT JOIN roles r ON r.id = u.roleId " +
      "WHERE nt.type = 'security.alert' GROUP BY u.id ORDER BY u.name",
    { type: sequelize.QueryTypes.SELECT }
  );
  line(`   notifications delivered: ${notifiedAfter - notifiedBefore}`);
  for (const r of recipients) line(`   → ${r.name} (${r.roleName}) — ${r.n} alert(s)`);

  // ── Verdict ───────────────────────────────────────────────────────────────
  rule();
  const kinds = new Set(result.alerts.map((a) => a.type));
  const expected = [
    ["recordModifiedOutsideSystem", "(a) inflated appropriation"],
    ["privilegeChanged", "(b) permission granted in SQL"],
    ["recordDeletedOutsideSystem", "(c) deleted bid"],
    ["recordInsertedOutsideSystem", "(d) fabricated payment"],
  ];
  let pass = notifiedAfter > notifiedBefore;
  for (const [type, label] of expected) {
    const ok = kinds.has(type);
    if (!ok) pass = false;
    line(`   ${ok ? "✅" : "❌"} ${label.padEnd(34)} → ${type}`);
  }
  line(`   ${notifiedAfter > notifiedBefore ? "✅" : "❌"} an administrator was notified`);
  rule();
  line(pass ? "   RESULT: all four detected and reported." : "   RESULT: something was missed.");
  rule();
} catch (err) {
  console.error("proof failed:", err);
} finally {
  if (KEEP) {
    line();
    line("--keep: the tampering and the alerts have been LEFT IN PLACE.");
    line("Sign in as the administrator and open the security console to see them.");
    line();
    // `npm run seed` restores the reference data but NOT the deleted bid, which
    // belongs to the demo set — so the statements to undo each change are
    // printed here rather than leaving the reader to work them out. Learned the
    // hard way: a demo bid stayed deleted after the first --keep run.
    line("To undo, run these, then `npm run seed` to re-baseline:");
    for (const [sql, replacements] of [...restore].reverse()) {
      const filled = sql.replace(/:(\w+)/g, (_, key) => {
        const value = replacements[key];
        if (value === null || value === undefined) return "NULL";
        return typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`;
      });
      line(`   ${filled};`);
    }
  } else {
    line();
    line("restoring the database…");
    for (const [sql, replacements] of restore.reverse()) {
      try {
        await q(sql, { replacements });
      } catch (err) {
        console.error("  restore step failed:", err.message);
      }
    }
    // Only the alerts this run raised, by id. Deleting by *type* would take a
    // genuine open alert with it — the exact record somebody needs — and a demo
    // script must not be able to erase real evidence.
    const removed = raisedHere.length
      ? await SecurityAlert.destroy({ where: { id: raisedHere } })
      : 0;
    if (raisedHere.length) {
      await Notification.destroy({
        where: { type: "security.alert", refEntity: "securityAlert", refId: raisedHere },
      });
    }

    // The scan re-baselines as it reports, so the restore itself now looks like
    // tampering. One more baseline leaves the database genuinely clean.
    const { rebaseline } = await import("./integrityMonitor.js");
    await rebaseline();
    const final = await runSecurityScan(null, null);
    line(`restored. ${removed} demo alert(s) removed; final scan findings: ${final.findings}`);
  }
  process.exit(0);
}
