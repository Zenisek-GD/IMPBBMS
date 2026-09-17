import assert from "node:assert/strict";
import test from "node:test";
import { migrateAuditVisibility } from "./migrateAuditVisibility.js";

const model = (result) => ({ findOne: async () => result });

test("audit visibility migration does not alter a database without the expected role", async () => {
  let recorded = false;
  const result = await migrateAuditVisibility({
    RoleModel: model(null),
    PermissionModel: model({ id: 7 }),
    RolePermissionModel: model(null),
    record: async () => { recorded = true; },
  });
  assert.deepEqual(result, { granted: false, reason: "roleOrPermissionMissing" });
  assert.equal(recorded, false);
});

test("audit visibility migration is repeatable when the role already has the permission", async () => {
  let added = false;
  const result = await migrateAuditVisibility({
    RoleModel: model({ id: 3, addPermission: async () => { added = true; } }),
    PermissionModel: model({ id: 7 }),
    RolePermissionModel: model({ roleId: 3, permissionId: 7 }),
    record: async () => assert.fail("an already-applied migration must not write another audit event"),
  });
  assert.deepEqual(result, { granted: false, reason: "alreadyGranted" });
  assert.equal(added, false);
});

test("audit visibility migration grants only official audit visibility and records the technical change", async () => {
  let grantedPermission;
  let auditEvent;
  const result = await migrateAuditVisibility({
    RoleModel: model({ id: 3, addPermission: async (permission) => { grantedPermission = permission; } }),
    PermissionModel: model({ id: 7, key: "audit.viewAll" }),
    RolePermissionModel: model(null),
    record: async (event) => { auditEvent = event; },
  });
  assert.deepEqual(result, { granted: true, reason: "granted" });
  assert.deepEqual(grantedPermission, { id: 7, key: "audit.viewAll" });
  assert.equal(auditEvent.actionType, "role.permission.granted");
  assert.equal(auditEvent.entityRef, "role");
  assert.equal(auditEvent.entityId, 3);
  assert.deepEqual(auditEvent.afterState, { permission: "audit.viewAll", source: "auditVisibilityMigration" });
});
