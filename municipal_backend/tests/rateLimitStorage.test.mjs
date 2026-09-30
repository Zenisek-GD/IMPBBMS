import test, { after } from "node:test";
import assert from "node:assert/strict";
import { sequelize } from "../models/db.js";
import { takeAttempt } from "../middleware/rateLimitMiddleware.js";

after(() => sequelize.close());

test("standalone production fails closed when its shared MySQL store is unavailable", async t => {
  const previousMode = process.env.NODE_ENV;
  const previousWorker = process.env.CLOUDFLARE_WORKER;
  process.env.NODE_ENV = "production";
  delete process.env.CLOUDFLARE_WORKER;
  t.after(() => {
    if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode;
    if (previousWorker === undefined) delete process.env.CLOUDFLARE_WORKER; else process.env.CLOUDFLARE_WORKER = previousWorker;
  });
  let attempts = 0;
  t.mock.method(sequelize, "transaction", async () => { attempts++; throw new Error("store offline"); });
  await assert.rejects(takeAttempt("login", "unavailable-store", 5), /store offline/);
  await assert.rejects(takeAttempt("login", "unavailable-store", 5), /store offline/);
  assert.equal(attempts, 2, "must retry storage rather than silently use the memory map");
});

test("development memory counters still enforce ceilings and expire", async () => {
  const options = { mysql: null, db: null, now: 1000 };
  assert.equal((await takeAttempt("unit-memory", "account", 1, options)).allowed, true);
  assert.equal((await takeAttempt("unit-memory", "account", 1, options)).allowed, false);
  assert.equal((await takeAttempt("unit-memory", "account", 1, { ...options, now: 901000 })).allowed, true);
});
