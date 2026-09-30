import { Permission, RolePermission } from '../models/permissionModel.js';
import { Role } from '../models/roleModel.js';
import { SystemSetting } from '../models/systemSettingModel.js';
import { withAuditTransaction } from './auditLog.js';

// A one-time grant for new workflow permissions. Repeated migrations preserve
// later administrator revocations instead of silently restoring permissions.
export const migrateBudgetControls = async () => withAuditTransaction(async (transaction, audit) => {
  const [marker] = await SystemSetting.findOrCreate({ where: { key: 'migration.budgetControls.v1' },
    defaults: { value: 'pending', description: 'Budget control permission migration' }, transaction });
  await marker.reload({ transaction, lock: transaction.LOCK.UPDATE });
  if (marker.value === 'complete') return { granted: 0 };
  let granted = 0;
  for (const [key, roleKey, description] of [
    ['budget.requestControl', 'budgetOfficer', 'Prepare documented allocation, closeout and budget control requests'],
    ['budget.approveControl', 'hope', 'Approve independently prepared budget controls under documented authority'],
  ]) {
    const [permission] = await Permission.findOrCreate({ where: { key }, defaults: { description, module: 'budget' }, transaction });
    const role = await Role.findOne({ where: { key: roleKey }, transaction });
    if (!role) continue;
    const [, created] = await RolePermission.findOrCreate({ where: { roleId: role.id, permissionId: permission.id }, transaction });
    if (created) {
      granted++;
      await audit({ actionType: 'role.permission.granted', entityRef: 'role', entityId: role.id,
        summary: `${key} granted by the budget controls migration.`, beforeState: { granted: false }, afterState: { granted: true, permission: key, source: 'budgetControls.v1' } });
    }
  }
  await marker.update({ value: 'complete' }, { transaction });
  return { granted };
});
