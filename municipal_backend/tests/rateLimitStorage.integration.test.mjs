import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { Sequelize } from "sequelize";

test("MySQL rate limits share concurrent ceilings across pools and survive a fresh Node process", {
  skip: process.env.RUN_PROCUREMENT_DB_TESTS !== "1", timeout: 60000,
}, async t => {
  const scratch = `impbbms_rate_limits_${crypto.randomBytes(8).toString("hex")}`;
  const port = Number(process.env.PROCUREMENT_TEST_DB_PORT ?? 33317);
  Object.assign(process.env, { DB_HOST: "127.0.0.1", DB_PORT: String(port), DB_NAME: scratch, DB_USER: "root", DB_PASSWORD: "", NODE_ENV: "test", SESSION_SECRET: "rate-limit-isolated-test-secret" });
  delete process.env.CLOUDFLARE_WORKER;
  const admin = await mysql.createConnection({ host: "127.0.0.1", port, user: "root", password: "" });
  await admin.query(`CREATE DATABASE \`${scratch}\``);
  let primary, second;
  t.after(async () => {
    if (second) await second.close();
    if (primary) await primary.close();
    assert.match(scratch, /^impbbms_rate_limits_[a-f0-9]{16}$/);
    await admin.query(`DROP DATABASE \`${scratch}\``);
    await admin.end();
  });
  const { RateLimitBucket } = await import("../models/rateLimitModel.js");
  primary = RateLimitBucket.sequelize;
  await RateLimitBucket.sync();
  second = new Sequelize(scratch, "root", "", { host: "127.0.0.1", port, dialect: "mysql", logging: false });
  const { takeAttempt } = await import("../middleware/rateLimitMiddleware.js");
  const { clearDatabaseRateLimit } = await import("../services/databaseRateLimiter.js");
  const now = Date.now();
  const results = await Promise.all(Array.from({ length: 25 }, (_, i) =>
    takeAttempt("login", "shared-account", 10, { mysql: i % 2 ? second : primary, now })));
  assert.equal(results.filter(result => result.allowed).length, 10);
  const row = await RateLimitBucket.findOne();
  assert.equal(row.attempts, 11, "saturate the counter instead of overflowing");
  assert.match(row.id, /^[a-f0-9]{64}$/);
  assert.equal(Number(row.expiresAt), now + 900000);

  const childScript = `
    const { takeAttempt } = await import('./middleware/rateLimitMiddleware.js');
    const { sequelize } = await import('./models/db.js');
    try { console.log(JSON.stringify(await takeAttempt('login', 'shared-account', 10))); }
    finally { await sequelize.close(); }
  `;
  const fresh = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", childScript], {
    cwd: fileURLToPath(new URL("..", import.meta.url)), env: { ...process.env, NODE_ENV: "production" }, timeout: 20000,
  });
  assert.equal(JSON.parse(fresh.stdout.trim()).allowed, false, "restarting a worker must retain blocked attempts");
  assert.equal((await takeAttempt("recovery", "shared-account", 10, { mysql: second, now })).allowed, true);
  assert.equal((await takeAttempt("login", "shared-account", 10, { mysql: second, now: now + 900000 })).allowed, true);
  await clearDatabaseRateLimit(row.id, second);
  assert.equal(await RateLimitBucket.count({ where: { id: row.id } }), 0);
  assert.equal((await takeAttempt("login", "shared-account", 10, { mysql: primary, now })).allowed, true);
});
