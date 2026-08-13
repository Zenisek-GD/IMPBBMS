import crypto from "node:crypto";
import { Op } from "sequelize";
import { RecordFingerprint } from "../models/integrityModel.js";

// ── WHAT IS WATCHED, AND WHY THOSE COLUMNS ───────────────────────────────────
//
// Not every table, and not every column. Fingerprinting everything would be
// slow, noisy, and would fire on `updatedAt` moving. What is watched is the set
// of records where a silent change would either move money or change who can
// move it:
//
//   the money        appropriations, obligations, requisitions, awards,
//                    contracts, bids, payments
//   the authority    users (role, status, password hash) and the role→permission
//                    grants
//   the gatekeeping  vendor accreditation and blacklisting
//
// `columns` lists the *material* fields — the ones whose alteration changes what
// the record means. `updatedAt` is deliberately excluded: it changes on every
// legitimate save and would make every fingerprint a moving target.
const WATCHED = {
  appropriation: {
    load: async () => (await import("../models/appropriationModel.js")).Appropriation,
    columns: ["fiscalYear", "ordinanceNo", "type", "fund", "expenseClass", "amount", "status", "departmentId"],
    label: (row) => `${row.ordinanceNo} — ${row.title}`,
    severity: "critical",
  },
  obligation: {
    load: async () => (await import("../models/appropriationModel.js")).Obligation,
    columns: ["obligationNo", "amount", "status", "appropriationId", "prHeaderId"],
    label: (row) => row.obligationNo,
    severity: "critical",
  },
  purchaseRequisition: {
    load: async () => (await import("../models/prModel.js")).PrHeader,
    columns: ["prNumber", "totalAmount", "status", "appEntryId", "fundSource", "procurementModeId"],
    label: (row) => row.prNumber,
    severity: "critical",
  },
  award: {
    load: async () => (await import("../models/biddingModel.js")).Award,
    columns: ["noaNumber", "amount", "status", "awardBasis", "vendorId", "rfqId", "bidId"],
    label: (row) => row.noaNumber ?? `award #${row.id}`,
    severity: "critical",
  },
  bid: {
    load: async () => (await import("../models/biddingModel.js")).Bid,
    columns: ["totalBidPrice", "status", "vendorId", "rfqId"],
    label: (row) => `bid #${row.id}`,
    severity: "critical",
  },
  contract: {
    load: async () => (await import("../models/contractModel.js")).Contract,
    columns: ["contractNo", "amount", "status", "vendorId", "awardId", "deliveryDeadline"],
    label: (row) => row.contractNo,
    severity: "critical",
  },
  payment: {
    load: async () => (await import("../models/paymentModel.js")).Payment,
    columns: ["amount", "status"],
    label: (row) => `payment #${row.id}`,
    severity: "critical",
  },

  // ── Authority ──────────────────────────────────────────────────────────────
  // The password hash is included on purpose. Overwriting it in SQL with a hash
  // whose plaintext you know is one of the quietest ways to take over an
  // account: the victim's password simply "stops working", which reads as a
  // forgotten password rather than a compromise.
  user: {
    load: async () => (await import("../models/userModel.js")).User,
    columns: ["email", "roleId", "status", "password", "departmentId"],
    label: (row) => row.email,
    severity: "critical",
  },
  vendor: {
    load: async () => (await import("../models/vendorModel.js")).Vendor,
    columns: ["businessName", "tin", "registrationStatus", "blacklistedAt", "userId"],
    label: (row) => row.businessName,
    severity: "high",
  },
  appEntry: {
    load: async () => (await import("../models/appEntryModel.js")).AppEntry,
    columns: ["projectTitle", "abc", "status", "appropriationId", "aipEntryId"],
    label: (row) => row.projectTitle,
    severity: "high",
  },
};

const MATERIAL = (entityRef) => WATCHED[entityRef]?.columns ?? [];

// Values are normalised before hashing so a legitimate round-trip through the
// database cannot look like tampering. MySQL returns DECIMAL as a string and
// DATETIME as a Date; hashing the raw value would make the fingerprint depend
// on which driver path loaded the row.
const normalise = (value) => {
  if (value === null || value === undefined) return "\u0000";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return String(value);
  return String(value);
};

// "appropriation" → "Appropriation", "purchaseRequisition" → "Purchase
// requisition". Used to open the summary sentence, which sidesteps the a/an
// problem entirely — "A appropriation record" was appearing on screen.
const entityNoun = (entityRef) => {
  const spaced = entityRef.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

export const fingerprintOf = (entityRef, row) => {
  const canonical = MATERIAL(entityRef)
    .map((column) => `${column}=${normalise(row[column] ?? row.get?.(column))}`)
    .join("");
  return crypto.createHash("sha256").update(`${entityRef}${canonical}`).digest("hex");
};

// ── Role grants ──────────────────────────────────────────────────────────────
// Fingerprinted as one row per role rather than per grant, because the join
// table has no stable single-column identity and because the question a
// reviewer actually asks is "did this role's powers change?", not "which join
// row moved". Granting `payment.release` to the Vendor role in SQL is the
// highest-value silent attack on this system, and this is what catches it.
export const roleGrantFingerprint = async (roleId) => {
  const { Role } = await import("../models/roleModel.js");
  const { Permission } = await import("../models/permissionModel.js");

  const role = await Role.findByPk(roleId, { include: [Permission] });
  if (!role) return null;

  const keys = (role.Permissions ?? []).map((p) => p.key).sort();
  return crypto.createHash("sha256").update(`rolePermissions${keys.join(",")}`).digest("hex");
};

// ── Recording ────────────────────────────────────────────────────────────────
// Called from model hooks, so it runs on every legitimate write. Best-effort by
// design: fingerprinting must never be the thing that breaks a requisition
// being saved. A missed fingerprint surfaces later as a finding to investigate,
// which is the safe direction to fail in.
export const recordFingerprint = async (entityRef, row) => {
  try {
    const fingerprint = fingerprintOf(entityRef, row);
    await RecordFingerprint.upsert({
      entityRef,
      entityId: row.id,
      fingerprint,
      lastAuditSequence: null,
    });
  } catch (err) {
    console.error(`[integrity] could not fingerprint ${entityRef}#${row?.id}:`, err.message);
  }
};

export const forgetFingerprint = async (entityRef, id) => {
  try {
    await RecordFingerprint.destroy({ where: { entityRef, entityId: id } });
  } catch (err) {
    console.error(`[integrity] could not clear ${entityRef}#${id}:`, err.message);
  }
};

// ── Hooks ────────────────────────────────────────────────────────────────────
// Attached once at start-up. Every watched model gets create/update/destroy
// hooks that keep its fingerprint current, so anything the *application* does
// is by definition authorised and leaves the fingerprint matching.
let attached = false;

export const attachIntegrityHooks = async () => {
  if (attached) return;
  attached = true;

  for (const [entityRef, spec] of Object.entries(WATCHED)) {
    const model = await spec.load();
    model.addHook("afterCreate", (row) => recordFingerprint(entityRef, row));
    model.addHook("afterUpdate", (row) => recordFingerprint(entityRef, row));
    model.addHook("afterSave", (row) => recordFingerprint(entityRef, row));
    model.addHook("afterDestroy", (row) => forgetFingerprint(entityRef, row.id));
    // Bulk writes bypass per-row hooks unless asked; the seed and the
    // appropriation release both use bulkCreate, and a row created without a
    // fingerprint would be reported as an unauthorised insert on the next sweep.
    model.addHook("afterBulkCreate", (rows) =>
      Promise.all(rows.map((row) => recordFingerprint(entityRef, row)))
    );
  }

  // Role grants are re-fingerprinted whenever a role's permission set is
  // replaced, which is what `setPermissions` does during seeding and role
  // administration.
  const { Role } = await import("../models/roleModel.js");
  Role.addHook("afterCreate", (role) => recordRoleGrants(role.id));
};

export const recordRoleGrants = async (roleId) => {
  try {
    const fingerprint = await roleGrantFingerprint(roleId);
    if (!fingerprint) return;
    await RecordFingerprint.upsert({ entityRef: "rolePermissions", entityId: roleId, fingerprint });
  } catch (err) {
    console.error(`[integrity] could not fingerprint role grants ${roleId}:`, err.message);
  }
};

// Establishes a clean baseline: fingerprints everything currently present and
// treats it as authorised. Run after seeding or after a deliberate data import,
// otherwise every pre-existing row looks like an unauthorised insert.
export const rebaseline = async () => {
  const counts = {};

  for (const [entityRef, spec] of Object.entries(WATCHED)) {
    const model = await spec.load();
    const rows = await model.findAll();
    for (const row of rows) await recordFingerprint(entityRef, row);
    counts[entityRef] = rows.length;
  }

  const { Role } = await import("../models/roleModel.js");
  const roles = await Role.findAll();
  for (const role of roles) await recordRoleGrants(role.id);
  counts.rolePermissions = roles.length;

  return counts;
};

// ── The sweep ────────────────────────────────────────────────────────────────
// Compares the database against the fingerprints. Three findings are possible,
// and each means the same underlying thing — a change that did not go through
// the application:
//
//   modified  the row is there but its fingerprint has moved
//   inserted  the row is there and has no fingerprint at all
//   deleted   the fingerprint is there and the row has gone
export const sweep = async () => {
  const findings = [];

  for (const [entityRef, spec] of Object.entries(WATCHED)) {
    const model = await spec.load();
    const rows = await model.findAll();
    const stored = await RecordFingerprint.findAll({ where: { entityRef } });
    const byId = new Map(stored.map((f) => [f.entityId, f]));

    for (const row of rows) {
      const known = byId.get(row.id);
      const current = fingerprintOf(entityRef, row);

      if (!known) {
        findings.push({
          type: "recordInsertedOutsideSystem",
          severity: spec.severity,
          entityRef,
          entityId: row.id,
          summary: `${entityNoun(entityRef)} record inserted outside the system: ${spec.label(row)}`,
          detail: { fingerprint: current, watchedColumns: spec.columns },
        });
      } else if (known.fingerprint !== current) {
        findings.push({
          type: "recordModifiedOutsideSystem",
          severity: spec.severity,
          entityRef,
          entityId: row.id,
          summary: `${entityNoun(entityRef)} record altered outside the system: ${spec.label(row)}`,
          detail: {
            expectedFingerprint: known.fingerprint,
            observedFingerprint: current,
            watchedColumns: spec.columns,
            // The current values of the watched columns, so a reviewer can see
            // what the record says *now* without another query.
            currentValues: Object.fromEntries(
              spec.columns.map((column) => [column, normalise(row[column])])
            ),
          },
        });
        // Re-baselined so the same change is not reported forever. The alert is
        // the permanent record; the fingerprint's job is to catch the *next*
        // change, and leaving it stale would mask one.
        await known.update({ fingerprint: current });
      }

      byId.delete(row.id);
    }

    // Anything left had a fingerprint but no row.
    for (const orphan of byId.values()) {
      findings.push({
        type: "recordDeletedOutsideSystem",
        severity: spec.severity,
        entityRef,
        entityId: orphan.entityId,
        summary: `${entityNoun(entityRef)} record deleted outside the system (id ${orphan.entityId})`,
        detail: { lastKnownFingerprint: orphan.fingerprint },
      });
      await orphan.destroy();
    }
  }

  // ── Role grants ────────────────────────────────────────────────────────────
  const { Role } = await import("../models/roleModel.js");
  const roles = await Role.findAll();
  const grantPrints = await RecordFingerprint.findAll({ where: { entityRef: "rolePermissions" } });
  const grantsById = new Map(grantPrints.map((f) => [f.entityId, f]));

  for (const role of roles) {
    const current = await roleGrantFingerprint(role.id);
    const known = grantsById.get(role.id);

    if (known && known.fingerprint !== current) {
      const { Permission } = await import("../models/permissionModel.js");
      const withPerms = await Role.findByPk(role.id, { include: [Permission] });
      findings.push({
        // Deliberately the highest severity in the system. Someone silently
        // altering what a role may do is the change that makes every other
        // control meaningless.
        type: "privilegeChanged",
        severity: "critical",
        entityRef: "role",
        entityId: role.id,
        summary: `The permissions granted to "${role.name}" changed outside the system`,
        detail: {
          role: role.key,
          currentPermissions: (withPerms.Permissions ?? []).map((p) => p.key).sort(),
        },
      });
      await known.update({ fingerprint: current });
    }
  }

  return findings;
};

export const watchedEntities = () =>
  Object.entries(WATCHED).map(([entityRef, spec]) => ({
    entityRef,
    columns: spec.columns,
    severity: spec.severity,
  }));

export { WATCHED, Op };
