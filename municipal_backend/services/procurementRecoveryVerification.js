import { createHash } from "node:crypto";
import { sequelize } from "../models/db.js";

const digest = (rows) => createHash("sha256").update(JSON.stringify(rows)).digest("hex");
const quoted = (identifier) => sequelize.getQueryInterface().quoteIdentifier(identifier);

// Store only row identifiers, schema names and digests, never credentials or
// row contents. Existing columns are compared even after additive migration.
export const captureRecoveryBaseline = async () => {
  const qi = sequelize.getQueryInterface(), snapshot = {};
  for (const table of (await qi.showAllTables()).sort()) {
    const columns = Object.keys(await qi.describeTable(table));
    const [rows] = await sequelize.query(`SELECT ${columns.map(quoted).join(",")} FROM ${quoted(table)}`);
    const signatures = rows.map((row) => ({ id: row.id ?? null, digest: digest(row) }));
    snapshot[table] = { columns, count: rows.length, signatures };
  }
  return snapshot;
};

export const verifyRecoveryBaseline = async (baseline) => {
  const altered = [], appended = {};
  for (const [table, before] of Object.entries(baseline)) {
    const [rows] = await sequelize.query(`SELECT ${before.columns.map(quoted).join(",")} FROM ${quoted(table)}`);
    const counts = new Map();
    for (const row of rows) { const signature = digest(row); counts.set(signature, (counts.get(signature) ?? 0) + 1); }
    for (const { digest: signature } of before.signatures) {
      if (!counts.get(signature)) altered.push(table);
      else counts.set(signature, counts.get(signature) - 1);
    }
    if (rows.length !== before.count) appended[table] = rows.length - before.count;
  }
  return { existingRowsPreserved: altered.length === 0, alteredTables: [...new Set(altered)], rowCountChanges: appended };
};
