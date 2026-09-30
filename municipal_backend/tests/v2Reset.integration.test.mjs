import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';

test('V2 reset retains the selected administrator and references with atomic backup and audit guards', {
  skip: process.env.RUN_PROCUREMENT_DB_TESTS !== '1', timeout: 240000,
}, async t => {
  const scratch = `impbbms_v2_reset_${crypto.randomBytes(8).toString('hex')}`;
  const port = Number(process.env.PROCUREMENT_TEST_DB_PORT ?? 33317);
  Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: scratch,
    DB_USER: 'root', DB_PASSWORD: '', NODE_ENV: 'test', MFA_ENCRYPTION_KEY: 'v2-reset-integration-only-key' });
  const connection = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: '' });
  assert.match(scratch, /^impbbms_v2_reset_[a-f0-9]{16}$/);
  await connection.query(`CREATE DATABASE \`${scratch}\``);
  let m;
  t.after(async () => {
    if (m) await m.sequelize.close();
    assert.match(scratch, /^impbbms_v2_reset_[a-f0-9]{16}$/);
    await connection.query(`DROP DATABASE \`${scratch}\``);
    await connection.end();
  });
  m = await import('../models/index.js');
  await m.sequelize.sync();
  const { planV2Reset, applyV2Reset, V2_RESET_MARKER } = await import('../services/v2Reset.js');
  const { recordAudit, verifyChain, GENESIS_HASH } = await import('../services/auditLog.js');
  const { fingerprintOf, roleGrantFingerprint, rebaseline, sweep } = await import('../services/integrityMonitor.js');
  const { DEFAULT_PROCUREMENT_POLICY } = await import('../services/bacCommittee.js');
  const { encryptSecret } = await import('../models/mfaModel.js');
  const originalDate = new Date('2026-01-01T01:02:03.000Z');
  const department = await m.Department.create({ code: 'RESET', name: 'Reset test office' });
  const adminRole = await m.Role.create({ key: 'systemAdministrator', name: 'System Administrator', defaultDepartmentId: department.id });
  const budgetRole = await m.Role.create({ key: 'budgetOfficer', name: 'Budget Officer', defaultDepartmentId: department.id });
  const permission = await m.Permission.create({ key: 'user.manage', module: 'users', description: 'Manage accounts' });
  await adminRole.setPermissions([permission]);
  const password = 'V2ResetTestOnly!123';
  const administrator = await m.User.create({ name: 'Retained administrator', email: 'retained@example.test',
    password, roleId: adminRole.id, departmentId: department.id, status: 'active', createdAt: originalDate,
    activatedAt: originalDate, passwordChangedAt: originalDate });
  const officer = await m.User.create({ name: 'Removed officer', email: 'officer@example.test',
    password, roleId: budgetRole.id, departmentId: department.id });
  const otherAdmin = await m.User.create({ name: 'Other administrator', email: 'other-admin@example.test',
    password, roleId: adminRole.id, departmentId: department.id });
  await department.update({ headUserId: officer.id });
  const secondDepartment = await m.Department.create({ code: 'ADMINHEAD', name: 'Administrator head assignment', headUserId: administrator.id });
  for (const user of [administrator, officer]) {
    const enrollment = await m.MfaEnrollment.create({ userId: user.id, encryptedSecret: encryptSecret(`fixture-secret-${user.id}`),
      status: 'active', confirmedAt: originalDate, lastUsedStep: 1000, failedAttempts: 1 });
    await m.MfaRecoveryCode.create({ userId: user.id, codeHash: crypto.createHash('sha256').update(`recovery-${user.id}`).digest('hex') });
    await m.TrustedDevice.create({ userId: user.id, roleId: user.roleId, roleVersion: 0,
      tokenHash: crypto.createHash('sha256').update(`trust-${user.id}`).digest('hex'), enrollmentId: enrollment.id,
      credentialVersion: 'a'.repeat(64), verifiedAt: originalDate, twoFactorTrustedUntil: new Date('2040-01-01') });
    await m.LoginSession.create({ id: `session-${user.id}`, data: { userId: user.id },
      expiresAt: new Date('2040-01-01'), purgeAt: new Date('2040-01-02') });
    await m.ActivationToken.create({ userId: user.id, issuedByUserId: administrator.id,
      tokenHash: `activation-${user.id}`, issuedToEmail: user.email, expiresAt: new Date('2040-01-01') });
    await m.OtpChallenge.create({ userId: user.id, reference: crypto.randomUUID(), purpose: m.OTP_PURPOSES[0],
      codeHash: `otp-${user.id}`, deliveredTo: user.email, expiresAt: new Date('2040-01-01') });
  }
  await m.RateLimitBucket.create({ id: 'b'.repeat(64), attempts: 4, expiresAt: Date.now() + 3600000 });
  const mode = await m.ProcurementMode.create({ key: 'competitiveBidding', name: 'Competitive Bidding', isDefault: true });
  await m.ProcurementLimit.create({ procurementMethod: mode.key, effectiveDate: '2026-01-01',
    maximumAmount: 100000, policyReference: 'Test reference policy' });
  const templates = [];
  for (const user of [administrator, officer]) {
    const template = await m.DocumentTemplate.create({ key: `template-${user.id}`, name: `Template ${user.id}`,
      documentType: 'other', status: 'active', createdById: user.id, isSystemTemplate: user.id === administrator.id });
    const version = await m.DocumentTemplateVersion.create({ documentTemplateId: template.id,
      versionNo: 1, bodyHtml: '<p>Reference template</p>', createdById: user.id });
    await template.update({ activeVersionId: version.id });
    templates.push({ template, version });
  }
  const initialPolicy = { ...DEFAULT_PROCUREMENT_POLICY, memberIds: [officer.id, otherAdmin.id] };
  await m.SystemSetting.bulkCreate([
    { key: m.SETTING_KEYS.SYSTEM_NAME, value: 'Retained municipality system' },
    { key: m.SETTING_KEYS.SESSION_DURATION_MINUTES, value: '60' },
    { key: m.SETTING_KEYS.PROCUREMENT_POLICY, value: JSON.stringify(initialPolicy) },
    { key: 'migration.budgetControls.v1', value: 'complete' },
    { key: 'recordLock.appropriationYear.2026', value: 'transaction mutex' },
    { key: 'budget.reenactedReplacement.1', value: JSON.stringify({ executiveBudgetId: 1 }) },
    { key: 'oldWorkflow.counter', value: '19' },
  ]);
  const appropriation = await m.Appropriation.create({ fiscalYear: 2026, title: 'Old authority',
    ordinanceNo: 'OLD-2026', amount: 1000, status: 'enacted', departmentId: department.id, recordedById: officer.id });
  const goal = await m.DevelopmentGoal.create({ title: 'Old goal', sector: 'social' });
  const aip = await m.AipEntry.create({ title: 'Old investment', estimatedCost: 500,
    developmentGoalId: goal.id, implementingUnitId: department.id });
  const project = await m.AppEntry.create({ projectTitle: 'Old project', abc: 500, fiscalYear: 2026,
    appropriationId: appropriation.id, aipEntryId: aip.id, implementingUnitId: department.id,
    category: 'goods', targetStartQuarter: 'Q1', targetCompletionQuarter: 'Q4', createdById: officer.id });
  const request = await m.BudgetControlRequest.create({ kind: 'allocation', fiscalYear: 2026, amount: 400,
    sourceProjectId: project.id, sourceAppropriationId: appropriation.id, requesterId: officer.id,
    approverId: otherAdmin.id, reason: 'Old allocation', authorityReference: 'OLD-AUTHORITY', status: 'approved' });
  await m.ProjectAllocation.create({ appEntryId: project.id, appropriationId: appropriation.id,
    fiscalYear: 2026, amount: 400, sourceRequestId: request.id, approvedById: otherAdmin.id });
  const documentBytes = Buffer.from('%PDF-old-budget-authority-blob');
  const document = await m.Document.create({ filename: 'old-authority.pdf', mimeType: 'application/pdf',
    content: documentBytes, sizeBytes: documentBytes.length, checksum: crypto.createHash('sha256').update(documentBytes).digest('hex'),
    entityRef: 'budgetControlRequest', entityId: request.id, uploadedAt: originalDate, uploadedById: officer.id });
  await request.update({ supportingDocumentIds: [document.id] });
  const rfq = await m.Rfq.create({ referenceNo: 'OLD-RFQ', title: 'Old solicitation', abc: 500,
    closingDate: new Date('2026-12-31'), appEntryId: project.id, procurementModeId: mode.id, publishedById: officer.id });
  const attempt = await m.ProcurementAttempt.create({ projectKey: `app:${project.id}`, attemptNumber: 1,
    rfqId: rfq.id, responsibleUserId: officer.id, startedAt: originalDate });
  await m.FailureRecord.create({ failureNumber: 'OLD-FAILURE', attemptId: attempt.id, createdById: officer.id,
    reason: 'No bidders', category: 'noBids', explanation: 'Old bidding record', approvedById: otherAdmin.id });
  await m.ObserverOrganization.create({ name: 'Old observer roster', sector: 'coa' });
  await m.MutationReceipt.create({ id: 'c'.repeat(64), actorId: officer.id, actorScope: 'old-session',
    requestHash: 'd'.repeat(64), status: 'completed', statusCode: 200, responseBody: { oldRecord: project.id } });
  await recordAudit({ actionType: 'old.workflow', actorId: officer.id, actorName: officer.name,
    actorRole: budgetRole.key, entityRef: 'budgetControlRequest', entityId: request.id,
    summary: 'Old retained-in-backup history', afterState: { amount: 400 } }, { strict: true });
  await rebaseline();

  const snapshot = async () => {
    const result = {};
    for (const model of Object.values(m.sequelize.models)) result[model.name] = await model.findAll({
      raw: true, order: model.primaryKeyAttributes.map(key => [key, 'ASC']),
    });
    return result;
  };
  const before = await snapshot();
  // The service receives backup metadata as a dependency. The CLI's real backup
  // helper is tested separately; no fixture metadata may authorize a live reset.
  let backupCalls = 0;
  const backupMetadata = { path: `/test-fixture/${scratch}.sql`, bytes: 1024, sha256: 'f'.repeat(64) };
  const createBackup = async () => { backupCalls++; return backupMetadata; };
  const options = { adminEmail: administrator.email, confirmDatabase: scratch, maintenanceConfirmed: true, createBackup };
  const assertUnchanged = async () => assert.deepEqual(await snapshot(), before);

  await t.test('preview identifies exact retention without changing any record', async () => {
    const plan = await planV2Reset({ adminEmail: administrator.email });
    assert.equal(plan.database, scratch);
    assert.equal(plan.admin.id, administrator.id);
    assert.equal(plan.rows.find(row => row.model === 'User').retained, 1);
    assert.equal(plan.rows.find(row => row.model === 'User').removed, 2);
    for (const name of ['Document', 'ProjectAllocation', 'BudgetControlRequest', 'MutationReceipt', 'ProcurementAttempt', 'FailureRecord', 'RateLimitBucket']) {
      const row = plan.rows.find(item => item.model === name);
      assert.ok(row.total > 0, `${name} fixture must exercise deletion`);
      assert.equal(row.retained, 0);
    }
    assert.deepEqual(plan.removedSettingKeys.sort(), ['budget.reenactedReplacement.1', 'oldWorkflow.counter', 'recordLock.appropriationYear.2026']);
    assert.equal(backupCalls, 0);
    await assertUnchanged();
  });

  await t.test('an incompatible encryption key refuses reset before backup and preserves administrator MFA', async () => {
    const correctKey = process.env.MFA_ENCRYPTION_KEY;
    process.env.MFA_ENCRYPTION_KEY = 'a-different-test-key';
    try { await assert.rejects(applyV2Reset(options), /MFA|encryption|authenticator/i); }
    finally { process.env.MFA_ENCRYPTION_KEY = correctKey; }
    assert.equal(backupCalls, 0);
    await assertUnchanged();
  });

  await t.test('wrong database, unconfirmed maintenance, and invalid administrator never reach backup', async () => {
    await assert.rejects(applyV2Reset({ ...options, confirmDatabase: `${scratch}_wrong` }), /confirm-database/);
    await assert.rejects(applyV2Reset({ ...options, maintenanceConfirmed: false }), /maintenance-confirmed/);
    await assert.rejects(applyV2Reset({ ...options, adminEmail: officer.email }), /active System Administrator/);
    await assert.rejects(planV2Reset({ adminEmail: administrator.email, adminDate: 'yesterday' }), /admin-date/);
    assert.equal(backupCalls, 0);
    await assertUnchanged();
  });

  await t.test('unexpected tables and missing required schema fail before any mutation', async () => {
    await m.sequelize.query('CREATE TABLE v2_unknown_fixture (id INT PRIMARY KEY) ENGINE=InnoDB');
    try { await assert.rejects(applyV2Reset(options), /Unknown tables: v2_unknown_fixture/); }
    finally { await m.sequelize.query('DROP TABLE v2_unknown_fixture'); }
    await m.sequelize.query('RENAME TABLE ratelimitbuckets TO v2_missing_fixture');
    try { await assert.rejects(applyV2Reset(options), /Missing tables.*ratelimitbuckets/); }
    finally { await m.sequelize.query('RENAME TABLE v2_missing_fixture TO ratelimitbuckets'); }
    const qi = m.sequelize.getQueryInterface();
    await qi.renameColumn('users', 'textSizePreference', 'v2MissingColumn');
    try { await assert.rejects(applyV2Reset(options), /Missing users.textSizePreference/); }
    finally { await qi.renameColumn('users', 'v2MissingColumn', 'textSizePreference'); }
    assert.equal(backupCalls, 0);
    await assertUnchanged();
  });

  await t.test('failed backup and invalid backup proof preserve the complete original database', async () => {
    await assert.rejects(applyV2Reset({ ...options, createBackup: async () => { throw new Error('Backup fixture unavailable'); } }), /Backup fixture unavailable/);
    await assert.rejects(applyV2Reset({ ...options, createBackup: async () => ({ ...backupMetadata, bytes: 0 }) }), /Backup verification failed/);
    await assertUnchanged();
  });

  await t.test('failure writing the final audit rolls back deleted users, documents, settings and the preserve-date branch', async () => {
    let reachedAudit = false;
    m.AuditLog.addHook('beforeCreate', 'v2ResetAuditFailure', row => {
      if (row.actionType === 'system.v2.reset') {
        reachedAudit = true;
        assert.equal(new Date(row.afterState.administratorCreatedAt).toISOString(), originalDate.toISOString());
        throw new Error('Reset audit fixture unavailable');
      }
    });
    try { await assert.rejects(applyV2Reset({ ...options, adminDate: 'preserve' }), /Reset audit fixture unavailable/); }
    finally { m.AuditLog.removeHook('beforeCreate', 'v2ResetAuditFailure'); }
    assert.equal(reachedAudit, true);
    await assertUnchanged();
    assert.equal((await verifyChain({})).intact, true);
  });

  let reset;
  await t.test('successful reset keeps one usable administrator and static configuration, and records today', async () => {
    const startedAt = Date.now() - 1000;
    const calls = backupCalls;
    const concurrent = await Promise.allSettled([applyV2Reset(options), applyV2Reset(options)]);
    assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
    assert.match(concurrent.find(result => result.status === 'rejected').reason.message, /already completed/);
    assert.equal(backupCalls, calls + 1, 'concurrent reset requests may create only one backup and reset');
    reset = concurrent.find(result => result.status === 'fulfilled').value;
    const remaining = await m.User.findAll();
    assert.equal(remaining.length, 1);
    const current = remaining[0];
    assert.equal(current.id, administrator.id);
    assert.equal(current.password, before.User.find(user => user.id === administrator.id).password);
    assert.equal(await current.comparePassword(password), true);
    assert.equal(current.status, 'active');
    assert.equal(current.roleId, adminRole.id);
    assert.equal(current.departmentId, department.id);
    assert.equal(current.passwordChangedAt.toISOString(), originalDate.toISOString());
    assert.equal(current.activatedAt.toISOString(), originalDate.toISOString());
    assert.ok(current.createdAt.getTime() >= startedAt && current.createdAt.getTime() <= Date.now(),
      `Stored administrator creation ${current.createdAt.toISOString()} must match reset time ${reset.completedAt}`);
    assert.equal(reset.localDate, new Date(reset.completedAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }));
    assert.equal(new Date(reset.originalAdministratorCreatedAt).toISOString(), originalDate.toISOString());
    assert.deepEqual(await m.MfaEnrollment.findAll({ raw: true }), before.MfaEnrollment.filter(row => row.userId === administrator.id));
    assert.deepEqual(await m.MfaRecoveryCode.findAll({ raw: true }), before.MfaRecoveryCode.filter(row => row.userId === administrator.id));
    for (const name of ['Role', 'Permission', 'RolePermission', 'ProcurementMode', 'ProcurementLimit']) {
      assert.deepEqual(await m[name].findAll({ raw: true, order: m[name].primaryKeyAttributes.map(key => [key, 'ASC']) }), before[name]);
    }
    assert.equal(await m.Department.count(), before.Department.length);
    assert.equal((await department.reload()).headUserId, null);
    assert.equal((await secondDepartment.reload()).headUserId, null);
    for (const [index, fixture] of templates.entries()) {
      const template = await fixture.template.reload(), version = await fixture.version.reload();
      assert.equal(template.createdById, index === 0 ? administrator.id : null);
      assert.equal(version.createdById, index === 0 ? administrator.id : null);
      assert.equal(template.activeVersionId, version.id);
      assert.equal(version.bodyHtml, '<p>Reference template</p>');
    }
    assert.equal(await m.DocumentTemplate.count(), 2);
    assert.equal(await m.DocumentTemplateVersion.count(), 2);
    const settings = new Map((await m.SystemSetting.findAll()).map(row => [row.key, row.value]));
    assert.equal(settings.size, 5);
    assert.equal(settings.get(m.SETTING_KEYS.SYSTEM_NAME), 'Retained municipality system');
    assert.equal(settings.get(m.SETTING_KEYS.SESSION_DURATION_MINUTES), '60');
    assert.equal(settings.get('migration.budgetControls.v1'), 'complete');
    assert.deepEqual(JSON.parse(settings.get(m.SETTING_KEYS.PROCUREMENT_POLICY)), { ...initialPolicy, memberIds: [] });
    assert.equal(JSON.parse(settings.get(V2_RESET_MARKER)).originalAdministratorCreatedAt, originalDate.toISOString());
    assert.deepEqual(reset.backup, backupMetadata);
  });

  await t.test('all operational records and old sessions disappear while the new audit and baseline verify', async () => {
    const references = new Set(['Department', 'Role', 'Permission', 'RolePermission', 'ProcurementMode', 'ProcurementLimit',
      'DocumentTemplate', 'DocumentTemplateVersion', 'SystemSetting', 'User', 'MfaEnrollment', 'MfaRecoveryCode', 'AuditLog', 'RecordFingerprint']);
    for (const model of Object.values(m.sequelize.models)) if (!references.has(model.name)) {
      assert.equal(await model.count(), 0, `${model.name} must be empty`);
    }
    const logs = await m.AuditLog.findAll();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].actionType, 'system.v2.reset');
    assert.equal(logs[0].sequence, 1);
    assert.equal(logs[0].prevHash, GENESIS_HASH);
    assert.equal(logs[0].beforeState.administratorCreatedAt, originalDate.toISOString());
    assert.equal((await verifyChain({})).intact, true);
    assert.equal(await m.RecordFingerprint.count(), before.Role.length + 1);
    const userFingerprint = await m.RecordFingerprint.findOne({ where: { entityRef: 'user', entityId: administrator.id } });
    assert.equal(userFingerprint.fingerprint, fingerprintOf('user', await administrator.reload()));
    for (const role of [adminRole, budgetRole]) {
      const fingerprint = await m.RecordFingerprint.findOne({ where: { entityRef: 'rolePermissions', entityId: role.id } });
      assert.equal(fingerprint.fingerprint, await roleGrantFingerprint(role.id));
    }
    assert.deepEqual(await sweep(), []);
  });

  await t.test('repeat reset refuses to remove newly entered V2 data or take another backup', async () => {
    await m.ObserverOrganization.create({ name: 'New V2 organization', sector: 'coa' });
    const after = await snapshot(), calls = backupCalls;
    await assert.rejects(applyV2Reset(options), /already completed/);
    assert.equal(backupCalls, calls);
    assert.deepEqual(await snapshot(), after);
  });
});
