import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';

test('shared record history survives parallel and bulk mutations with integrity hooks enabled', { skip: process.env.RUN_PROCUREMENT_DB_TESTS !== '1', timeout: 180000 }, async t => {
  const scratch = `impbbms_record_audit_${crypto.randomBytes(8).toString('hex')}`;
  const port = Number(process.env.PROCUREMENT_TEST_DB_PORT ?? 33317);
  Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: scratch, DB_USER: 'root', DB_PASSWORD: '', NODE_ENV: 'test' });
  const admin = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: '' });
  assert.match(scratch, /^impbbms_record_audit_[a-f0-9]{16}$/);
  await admin.query(`CREATE DATABASE \`${scratch}\``);
  let m;
  t.after(async () => {
    if (m) await m.sequelize.close();
    assert.match(scratch, /^impbbms_record_audit_[a-f0-9]{16}$/);
    await admin.query(`DROP DATABASE \`${scratch}\``); await admin.end();
  });
  m = await import('../models/index.js'); await m.sequelize.sync();
  const { attachRecordChangeAudit, withRecordChangeAudit } = await import('../services/recordChangeAudit.js');
  const { attachIntegrityHooks, fingerprintOf } = await import('../services/integrityMonitor.js');
  const { withAuditTransaction, verifyChain } = await import('../services/auditLog.js');
  const { RecordFingerprint } = await import('../models/integrityModel.js');
  const role = await m.Role.create({ key: 'recordAuditTest', name: 'History reviewer' });
  const actor = await m.User.create({ name: 'History reviewer', email: 'history@example.test', password: 'ExamplePassword123!', roleId: role.id }); actor.Role = role;
  const req = { currentUser: actor, ip: '127.0.0.1' };
  attachRecordChangeAudit(); await attachIntegrityHooks();
  const history = (entityRef, entityId, actionType) => m.AuditLog.findAll({ where: { entityRef, entityId, actionType }, order: [['sequence', 'ASC']] });
  const auditWork = work => withRecordChangeAudit(req, () => withAuditTransaction(work));
  let offices, appropriations;

  await t.test('parallel creates in one existing transaction append distinct chained entries', async () => {
    offices = await withRecordChangeAudit(req, () => m.sequelize.transaction(transaction => Promise.all([
      m.Department.create({ code: 'ONE', name: 'First office' }, { transaction }),
      m.Department.create({ code: 'TWO', name: 'Second office' }, { transaction }),
      m.Department.create({ code: 'THREE', name: 'Third office' }, { transaction }),
    ])));
    for (const office of offices) {
      const rows = await history('department', office.id, 'record.created');
      assert.equal(rows.length, 1); assert.equal(rows[0].actorId, actor.id);
      assert.equal(rows[0].afterState.name, office.name); assert.equal(rows[0].beforeState, null);
    }
    assert.equal((await verifyChain({})).intact, true);
  });

  await t.test('bulk updates and deletion retain complete prior values without duplicate history', async () => {
    await auditWork(transaction => m.Department.update({ status: 'inactive' }, { where: { id: offices.map(row => row.id) }, transaction }));
    for (const office of offices) {
      const updates = await history('department', office.id, 'record.updated');
      assert.equal(updates.length, 1); assert.equal(updates[0].beforeState.status, 'active'); assert.equal(updates[0].afterState.status, 'inactive');
      assert.equal(updates[0].beforeState.name, office.name); assert.equal(updates[0].afterState.code, office.code);
    }
    await auditWork(transaction => m.Department.destroy({ where: { id: offices[2].id }, transaction }));
    const removed = await history('department', offices[2].id, 'record.deleted');
    assert.equal(removed.length, 1); assert.equal(removed[0].beforeState.name, 'Third office'); assert.equal(removed[0].afterState, null);
  });

  await t.test('integrity per-row bulk hooks preserve original amounts and matching fingerprints', async () => {
    appropriations = await auditWork(transaction => m.Appropriation.bulkCreate([1000, 2000].map((amount, index) => ({ fiscalYear: 2030, ordinanceNo: 'ORD-2030', title: `Authority ${index + 1}`, amount, departmentId: offices[index].id })), { transaction }));
    await auditWork(transaction => m.Appropriation.update({ amount: 3000 }, { where: { id: appropriations.map(row => row.id) }, transaction }));
    for (const [index, appropriation] of appropriations.entries()) {
      const updates = await history('appropriation', appropriation.id, 'record.updated');
      assert.equal(updates.length, 1); assert.equal(Number(updates[0].beforeState.amount), (index + 1) * 1000); assert.equal(Number(updates[0].afterState.amount), 3000);
      const current = await m.Appropriation.findByPk(appropriation.id);
      const fingerprint = await RecordFingerprint.findOne({ where: { entityRef: 'appropriation', entityId: appropriation.id } });
      assert.equal(fingerprint.fingerprint, fingerprintOf('appropriation', current));
    }
  });

  await t.test('audit failure rolls back business values, prior fingerprints, and the complete history batch', async () => {
    const priorCount = await m.AuditLog.count();
    const priorFingerprints = await RecordFingerprint.findAll({ where: { entityRef: 'appropriation' }, order: [['entityId', 'ASC']], raw: true });
    m.AuditLog.addHook('beforeCreate', 'failHistoryBatch', row => { if (row.entityRef === 'appropriation' && row.entityId === appropriations[1].id && row.actionType === 'record.updated') throw new Error('History storage unavailable'); });
    try { await assert.rejects(auditWork(transaction => m.Appropriation.update({ amount: 5000 }, { where: { id: appropriations.map(row => row.id) }, transaction })), /History storage unavailable/); }
    finally { m.AuditLog.removeHook('beforeCreate', 'failHistoryBatch'); }
    assert.equal(await m.AuditLog.count(), priorCount);
    for (const appropriation of appropriations) assert.equal(Number((await m.Appropriation.findByPk(appropriation.id)).amount), 3000);
    const currentFingerprints = await RecordFingerprint.findAll({ where: { entityRef: 'appropriation' }, order: [['entityId', 'ASC']], raw: true });
    assert.deepEqual(currentFingerprints, priorFingerprints);
    assert.equal((await verifyChain({})).intact, true);
  });
});
