import { Permission, RolePermission } from "../models/permissionModel.js";
import { Role } from "../models/roleModel.js";
import { AUDIT_ACTIONS, recordAudit } from "./auditLog.js";

// A permission-matrix edit only affects fresh seed data. Existing deployments
// keep their RolePermission rows by design, so this focused, repeatable
// migration grants the one new audit-reading permission without re-seeding or
// replacing any administrator-managed role assignment.
export const migrateAuditVisibility = async ({
  RoleModel = Role,
  PermissionModel = Permission,
  RolePermissionModel = RolePermission,
  record = recordAudit,
} = {}) => {
  const administrator = await RoleModel.findOne({ where: { key: "systemAdministrator" } });
  const officialAuditPermission = await PermissionModel.findOne({ where: { key: "audit.viewAll" } });

  if (!administrator || !officialAuditPermission) {
    return { granted: false, reason: "roleOrPermissionMissing" };
  }

  const existing = await RolePermissionModel.findOne({
    where: { roleId: administrator.id, permissionId: officialAuditPermission.id },
  });
  if (existing) return { granted: false, reason: "alreadyGranted" };

  await administrator.addPermission(officialAuditPermission);
  await record({
    actionType: AUDIT_ACTIONS.ROLE_PERMISSION_GRANTED,
    entityRef: "role",
    entityId: administrator.id,
    summary: "System Administrator granted official audit activity visibility by migration.",
    afterState: { permission: officialAuditPermission.key, source: "auditVisibilityMigration" },
  });

  return { granted: true, reason: "granted" };
};
