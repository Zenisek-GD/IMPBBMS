import assert from "node:assert/strict";
import test from "node:test";
import { Op } from "sequelize";
import {
  AUDIT_ACTIVITY_SCOPES,
  auditActivityWhere,
  canViewSystemActivity,
  resolveAuditActivityScope,
} from "./auditVisibility.js";

const officialPermissions = new Set(["audit.viewAll"]);
const technicalPermissions = new Set(["audit.viewAll", "audit.viewLogs"]);

test("official activity is the default stream for every authorised reader", () => {
  assert.equal(resolveAuditActivityScope(undefined, officialPermissions), AUDIT_ACTIVITY_SCOPES.OFFICIAL);
  assert.equal(resolveAuditActivityScope("official", technicalPermissions), AUDIT_ACTIVITY_SCOPES.OFFICIAL);
});

test("technical activity requires audit.viewLogs even when requested directly", () => {
  assert.equal(resolveAuditActivityScope("system", officialPermissions), AUDIT_ACTIVITY_SCOPES.OFFICIAL);
  assert.equal(resolveAuditActivityScope("system", technicalPermissions), AUDIT_ACTIVITY_SCOPES.SYSTEM);
  assert.equal(canViewSystemActivity(officialPermissions), false);
  assert.equal(canViewSystemActivity(technicalPermissions), true);
});

test("invalid activity scope is rejected rather than silently treated as a different view", () => {
  assert.equal(resolveAuditActivityScope("all", technicalPermissions), null);
});

test("activity query clauses keep human and technical rows mutually exclusive", () => {
  assert.equal(auditActivityWhere(AUDIT_ACTIVITY_SCOPES.SYSTEM).actorId, null);
  assert.equal(auditActivityWhere(AUDIT_ACTIVITY_SCOPES.OFFICIAL).actorId[Op.ne], null);
});
