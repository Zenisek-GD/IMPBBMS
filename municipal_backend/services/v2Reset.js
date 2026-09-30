import crypto from 'node:crypto';
import { QueryTypes } from 'sequelize';
import * as models from '../models/index.js';
import { recordAudit } from './auditLog.js';
import { fingerprintOf } from './integrityMonitor.js';
import { decryptSecret } from '../models/mfaModel.js';

const { sequelize, User, Role, Permission, SystemSetting, SETTING_KEYS, RecordFingerprint } = models;
export const V2_RESET_MARKER = 'deployment.v2.reset';
const retained = new Set(['Department', 'Role', 'Permission', 'RolePermission', 'ProcurementMode',
  'ProcurementLimit', 'DocumentTemplate', 'DocumentTemplateVersion']);
const selected = new Set(['User', 'MfaEnrollment', 'MfaRecoveryCode', 'SystemSetting']);
// Explicit coverage: adding a model requires deciding its retention policy.
const cleared = new Set(`TrustedDevice LoginSession RateLimitBucket Appropriation Obligation DevelopmentPlan
  DevelopmentGoal InvestmentProgram AipEntry AppEntry Announcement Vendor VendorDocument PrHeader
  PrLineItem Rfq Bid BidOpeningRecord Evaluation PostQualification Award TwgDeclaration TwgAssessment
  BacResolution ProcurementAttempt NegotiatedReview FailureRecord BacDecisionVote EvaluationPlan
  EvaluatorDeclaration EvaluationReturn EvaluationCriteriaAmendment Document ScheduleAmendment
  ActivationToken OtpChallenge ExecutiveBudget BudgetProposal BudgetProposalLine BudgetProceeding
  Security Notification PublicMessage Contract Delivery Invoice Payment MutationReceipt ProjectAllocation
  BudgetControlRequest PendingItem AuditLog RecordFingerprint SecurityAlert GeneratedDocument
  LiveConferenceSession ConferenceAttendance ObserverOrganization ObserverInvitation ObservationReport Protest`.split(/\s+/));
const retainedSettingKeys = [...Object.values(SETTING_KEYS), 'migration.budgetControls.v1'];
const quote = name => sequelize.getQueryInterface().queryGenerator.quoteIdentifier(name);
const tableOf = model => String(model.getTableName());
const select = (sql, replacements = {}, transaction) => sequelize.query(sql, { replacements, transaction, type: QueryTypes.SELECT });

export function deletionOrder(tables, foreignKeys) {
  const remaining = new Set(tables), result = [];
  while (remaining.size) {
    const leaves = [...remaining].filter(parent => !foreignKeys.some(fk =>
      !fk.nullable && fk.parent === parent && remaining.has(fk.child)));
    if (!leaves.length) throw new Error('Required foreign-key cycle detected; reset policy needs review.');
    leaves.forEach(table => { remaining.delete(table); result.push(table); });
  }
  return result;
}

const policyFor = (model, adminId) => {
  if (retained.has(model.name)) return { where: '1 = 0', replacements: {}, policy: 'retain reference data' };
  if (cleared.has(model.name)) return { where: '1 = 1', replacements: {}, policy: 'clear' };
  if (model.name === 'User') return { where: '`id` <> :adminId', replacements: { adminId }, policy: 'retain selected administrator only' };
  if (['MfaEnrollment', 'MfaRecoveryCode'].includes(model.name)) return {
    where: '`userId` IS NULL OR `userId` <> :adminId', replacements: { adminId }, policy: 'retain administrator MFA only',
  };
  if (model.name === 'SystemSetting') return {
    where: '`key` NOT IN (:keys)', replacements: { keys: retainedSettingKeys }, policy: 'retain configuration; clear workflow settings',
  };
  throw new Error(`No V2 retention policy for model ${model.name}.`);
};

export async function planV2Reset({ adminEmail, adminDate = 'today', transaction } = {}) {
  if (!adminEmail?.trim()) throw new Error('Specify --admin-email for the existing administrator to retain.');
  if (!['today', 'preserve'].includes(adminDate)) throw new Error('--admin-date must be today or preserve.');
  const registry = Object.values(sequelize.models);
  for (const model of registry) if (![retained, selected, cleared].some(set => set.has(model.name))) {
    throw new Error(`No V2 retention policy for model ${model.name}.`);
  }
  const database = sequelize.getDatabaseName();
  const tables = await select('SELECT TABLE_NAME AS name, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = :database', { database }, transaction);
  const registered = new Set(registry.map(tableOf));
  const actual = new Set(tables.map(row => row.name));
  const unknown = tables.filter(row => !registered.has(row.name)).map(row => row.name);
  const missing = [...registered].filter(name => !actual.has(name));
  if (unknown.length || missing.length) throw new Error(`Schema needs review before reset. Unknown tables: ${unknown.join(', ') || 'none'}. Missing tables (run migrations): ${missing.join(', ') || 'none'}.`);
  if (tables.some(row => row.engine !== 'InnoDB')) throw new Error('Reset requires only InnoDB tables so every deletion can roll back.');
  const columns = await select('SELECT TABLE_NAME AS tableName, COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = :database', { database }, transaction);
  for (const model of registry) for (const attr of Object.values(model.rawAttributes)) {
    if (!columns.some(column => column.tableName === tableOf(model) && column.name === attr.field)) {
      throw new Error(`Missing ${tableOf(model)}.${attr.field}; run migrations before resetting.`);
    }
  }
  const triggers = await select('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = :database', { database }, transaction);
  if (triggers.length) throw new Error('Database triggers need review before a V2 reset.');
  const foreignKeys = (await select(`SELECT k.TABLE_NAME AS child, k.COLUMN_NAME AS columnName,
    k.REFERENCED_TABLE_NAME AS parent, k.TABLE_SCHEMA AS childSchema, k.REFERENCED_TABLE_SCHEMA AS parentSchema,
    c.IS_NULLABLE AS nullable FROM information_schema.KEY_COLUMN_USAGE k
    JOIN information_schema.COLUMNS c ON c.TABLE_SCHEMA=k.TABLE_SCHEMA AND c.TABLE_NAME=k.TABLE_NAME AND c.COLUMN_NAME=k.COLUMN_NAME
    WHERE k.REFERENCED_TABLE_NAME IS NOT NULL AND (k.TABLE_SCHEMA=:database OR k.REFERENCED_TABLE_SCHEMA=:database)`, { database }, transaction))
    .map(row => ({ ...row, nullable: row.nullable === 'YES' }));
  if (foreignKeys.some(fk => fk.childSchema !== database || fk.parentSchema !== database)) {
    throw new Error('Cross-database foreign keys need review before resetting.');
  }
  const admin = await User.findOne({ where: { email: adminEmail.trim() }, include: [Role], transaction });
  if (!admin || admin.Role?.key !== 'systemAdministrator' || admin.status !== 'active') {
    throw new Error('Selected account must be an existing active System Administrator.');
  }
  const enrollment = await models.MfaEnrollment.findOne({ where: { userId: admin.id }, transaction });
  if (enrollment) {
    try { decryptSecret(enrollment.encryptedSecret); }
    catch { throw new Error('Administrator MFA cannot be decrypted with the current environment. Preserve the original MFA encryption key before resetting.'); }
  }
  if (await SystemSetting.findOne({ where: { key: V2_RESET_MARKER }, transaction })) {
    throw new Error('V2 reset has already completed. Refusing to erase newly entered V2 data.');
  }
  const settings = await SystemSetting.findAll({ attributes: ['key', 'value'], transaction });
  const policySetting = settings.find(row => row.key === SETTING_KEYS.PROCUREMENT_POLICY);
  if (policySetting) {
    try { const value = JSON.parse(policySetting.value); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); }
    catch { throw new Error('Procurement policy JSON must be repaired before resetting.'); }
  }
  const rows = [];
  for (const model of registry) {
    const rule = policyFor(model, admin.id), table = tableOf(model);
    const [count] = await select(`SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN (${rule.where}) THEN 1 ELSE 0 END),0) AS removed FROM ${quote(table)}`, rule.replacements, transaction);
    rows.push({ model: model.name, table, total: Number(count.total), removed: Number(count.removed), retained: Number(count.total) - Number(count.removed), policy: rule.policy });
  }
  const order = deletionOrder(rows.filter(row => !retained.has(row.model)).map(row => row.table), foreignKeys);
  return { database, admin: { id: admin.id, name: admin.name, email: admin.email, originalCreatedAt: admin.createdAt },
    adminDate, rows, order, foreignKeys,
    removedSettingKeys: settings.filter(row => !retainedSettingKeys.includes(row.key)).map(row => row.key),
    notes: ['Department heads and BAC signatories are cleared.', 'All sessions, trusted devices and one-time challenges are cleared.',
      'Observer organizations and operational records are cleared. Templates and configured procurement limits remain.',
      'Old audit history is retained in the required backup; a new reset audit starts the V2 database.'] };
}

export async function applyV2Reset({ adminEmail, adminDate = 'today', confirmDatabase, maintenanceConfirmed, createBackup } = {}) {
  if (confirmDatabase !== sequelize.getDatabaseName()) throw new Error('--confirm-database must exactly match DB_NAME.');
  if (maintenanceConfirmed !== true) throw new Error('Stop every application instance and worker, then pass --maintenance-confirmed.');
  if (typeof createBackup !== 'function') throw new Error('A successful database backup is required before reset.');
  return sequelize.transaction(async transaction => {
      // All reset callers lock the same retained row until commit, including callers selecting different admins.
      const role = await Role.findOne({ where: { key: 'systemAdministrator' }, transaction, lock: transaction.LOCK.UPDATE });
      if (!role) throw new Error('System Administrator role is missing.');
      const plan = await planV2Reset({ adminEmail, adminDate, transaction });
      const backup = await createBackup();
      if (!backup?.path || !(backup.bytes > 0) || !/^[a-f0-9]{64}$/.test(backup.sha256 ?? '')) throw new Error('Backup verification failed; nothing was reset.');
      const now = new Date(); now.setMilliseconds(0);
      const rules = new Map(Object.values(sequelize.models).map(model => [tableOf(model), policyFor(model, plan.admin.id)]));
      // Break nullable workflow cycles inside the transaction. Foreign-key checks stay enabled.
      for (const fk of plan.foreignKeys) if (fk.nullable) {
        const rule = rules.get(fk.child);
        await sequelize.query(`UPDATE ${quote(fk.child)} SET ${quote(fk.columnName)} = NULL WHERE (${rule.where})`, { replacements: rule.replacements, transaction });
        if (retained.has(plan.rows.find(row => row.table === fk.child)?.model) && fk.parent === tableOf(User)) {
          await sequelize.query(`UPDATE ${quote(fk.child)} SET ${quote(fk.columnName)} = NULL WHERE ${quote(fk.columnName)} <> :adminId`, { replacements: { adminId: plan.admin.id }, transaction });
        }
      }
      await models.Department.update({ headUserId: null }, { where: {}, transaction, hooks: false });
      const policy = await SystemSetting.findOne({ where: { key: SETTING_KEYS.PROCUREMENT_POLICY }, transaction });
      if (policy) await policy.update({ value: JSON.stringify({ ...JSON.parse(policy.value), memberIds: [] }) }, { transaction });
      for (const table of plan.order) {
        const rule = rules.get(table);
        await sequelize.query(`DELETE FROM ${quote(table)} WHERE (${rule.where})`, { replacements: rule.replacements, transaction });
      }
      // Preserve the existing password hash and MFA secrets; do not pass through password hooks.
      if (adminDate === 'today') await User.update({ createdAt: now, updatedAt: now }, {
        where: { id: plan.admin.id }, transaction, hooks: false, silent: true,
      });
      const afterAdmin = await User.findByPk(plan.admin.id, { transaction });
      for (const row of plan.rows) {
        const model = sequelize.models[row.model];
        if (await model.count({ transaction }) !== row.retained) throw new Error(`Post-reset count mismatch for ${row.table}; rolling back.`);
      }
      // Rebuild integrity anchors atomically so the next security scan sees the authorized reset.
      await RecordFingerprint.create({ entityRef: 'user', entityId: afterAdmin.id, fingerprint: fingerprintOf('user', afterAdmin), lastAuditSequence: null }, { transaction });
      for (const role of await Role.findAll({ include: [Permission], transaction })) {
        const keys = (role.Permissions ?? []).map(permission => permission.key).sort();
        await RecordFingerprint.create({ entityRef: 'rolePermissions', entityId: role.id,
          fingerprint: crypto.createHash('sha256').update(`rolePermissions\u0002${keys.join(',')}`).digest('hex'), lastAuditSequence: null }, { transaction });
      }
      const reset = { version: 2, completedAt: now.toISOString(), localDate: now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }),
        timeZone: 'Asia/Manila', administratorId: afterAdmin.id, administratorCreatedAt: afterAdmin.createdAt,
        originalAdministratorCreatedAt: plan.admin.originalCreatedAt, adminDate, backup,
        tables: plan.rows.map(({ table, total, retained: kept }) => ({ table, before: total, retained: kept })) };
      await SystemSetting.create({ key: V2_RESET_MARKER, value: JSON.stringify(reset), description: 'Completed V2 reset; prevents accidental repeated resets.' }, { transaction });
      await recordAudit({ actionType: 'system.v2.reset', entityRef: 'system', actorName: 'Deployment operator (CLI)', actorRole: 'deploymentOperator',
        summary: 'V2 reset completed after database backup; selected administrator and reference data retained.',
        beforeState: { administratorCreatedAt: plan.admin.originalCreatedAt, tableCounts: plan.rows.map(({ table, total }) => ({ table, total })) },
        afterState: reset }, { transaction, strict: true });
      return reset;
  });
}
