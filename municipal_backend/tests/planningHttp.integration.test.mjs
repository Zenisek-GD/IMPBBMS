import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mysql from "mysql2/promise";

// Exercise the actual application entry point, session store, permission
// middleware, mutation receipts, and audit hooks. Never connect to the app DB.
test("planning HTTP workflows use real authorization, durable receipts, and atomic history", {
  skip: process.env.RUN_PROCUREMENT_DB_TESTS !== "1", timeout: 180_000,
}, async (t) => {
  const scratch = `impbbms_planning_http_${crypto.randomBytes(8).toString("hex")}`;
  const port = Number(process.env.PROCUREMENT_TEST_DB_PORT ?? 33317);
  Object.assign(process.env, {
    DB_HOST: "127.0.0.1", DB_PORT: String(port), DB_NAME: scratch, DB_USER: "root", DB_PASSWORD: "",
    NODE_ENV: "test", ELECTRON: "1", CLOUDFLARE_WORKER: "false", SECURITY_SCAN_MINUTES: "0",
    SESSION_SECRET: crypto.randomBytes(32).toString("hex"),
  });
  const admin = await mysql.createConnection({ host: "127.0.0.1", port, user: "root", password: "" });
  assert.match(scratch, /^impbbms_planning_http_[a-f0-9]{16}$/);
  await admin.query(`CREATE DATABASE \`${scratch}\``);
  let m, server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (m) await m.sequelize.close();
    assert.match(scratch, /^impbbms_planning_http_[a-f0-9]{16}$/);
    await admin.query(`DROP DATABASE \`${scratch}\``);
    await admin.end();
  });

  m = await import("../models/index.js");
  await m.sequelize.sync();
  const { default: app } = await import("../index.js");
  const { AUDIT_ACTIONS, verifyChain } = await import("../services/auditLog.js");
  server = await new Promise(resolve => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const password = "PlanningHttpPassword123!";
  const department = await m.Department.create({ name: "Planning HTTP office", code: "HTTP-MPDO" });
  const permissionRows = new Map();
  for (const key of ["planning.view", "planning.manageCdp", "planning.manageAip", "planning.setPriorities", "planning.adoptAip"]) {
    permissionRows.set(key, await m.Permission.create({ key, module: "planning", description: key }));
  }
  const fixture = async (key, grants) => {
    const role = await m.Role.create({ key, name: key, twoFactorRequired: false });
    await role.setPermissions(grants.map(grant => permissionRows.get(grant)));
    const user = await m.User.create({ name: key, email: `${key}@example.test`, password, roleId: role.id, departmentId: department.id, status: "active" });
    return { role, user, jar: new Map() };
  };
  const planner = await fixture("planningOfficer", ["planning.view", "planning.manageCdp", "planning.manageAip"]);
  const secondPlanner = await fixture("planningDeputy", ["planning.view", "planning.manageCdp"]);
  const mayor = await fixture("hope", ["planning.view", "planning.setPriorities"]);
  const clerk = await fixture("sanggunianSecretary", ["planning.view", "planning.adoptAip"]);
  const viewer = await fixture("endUser", ["planning.view"]);
  const request = async (person, method, path, body, key, headers = {}) => {
    const jar = person?.jar ?? new Map();
    const response = await fetch(base + path, {
      method, signal: AbortSignal.timeout(15_000),
      headers: {
        "content-type": "application/json", "x-requested-with": "XMLHttpRequest",
        cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
        ...(key ? { "Idempotency-Key": key } : {}), ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0], separator = pair.indexOf("=");
      if (pair.slice(separator + 1)) jar.set(pair.slice(0, separator), pair.slice(separator + 1));
      else jar.delete(pair.slice(0, separator));
    }
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
  const expectStatus = (response, status) => assert.equal(response.status, status, JSON.stringify(response.body));
  const events = (entityRef, entityId, actionType) => m.AuditLog.findAll({
    where: { entityRef, entityId, ...(actionType ? { actionType } : {}) }, order: [["sequence", "ASC"]],
  });
  const planInput = title => ({
    title, startYear: 2030, endYear: 2032, vision: "Reliable public service",
    goals: [{ title: "Improve municipal service", sector: "general", description: "Complete approved projects" }],
  });
  let plan, creationKey, creationInput;

  await t.test("production request protection and real login authorize only explicit grants", async () => {
    expectStatus(await request(null, "POST", "/planning/plans", planInput("Anonymous"), crypto.randomUUID()), 401);
    for (const person of [planner, secondPlanner, mayor, clerk, viewer]) {
      const signedIn = await request(person, "POST", "/auth/login", { email: person.user.email, password });
      expectStatus(signedIn, 200);
      assert.equal(signedIn.body.mfaRequired, undefined);
      assert.ok(person.jar.has("connect.sid"));
    }
    assert.equal(await m.LoginSession.count({ where: { endedAt: null } }), 5);
    expectStatus(await request(planner, "POST", "/planning/plans", planInput("Wrong origin"), crypto.randomUUID(), { "x-requested-with": "" }), 403);
    expectStatus(await request(viewer, "POST", "/planning/plans", planInput("Unauthorized"), crypto.randomUUID()), 403);
    assert.equal(await m.DevelopmentPlan.count(), 0);
    assert.equal(await m.MutationReceipt.count(), 0, "authorization runs before claiming a mutation");
  });

  await t.test("concurrent double submission and later replay create one plan and one set of audit events", async () => {
    creationKey = crypto.randomUUID(); creationInput = planInput("HTTP municipal development plan");
    const submissions = await Promise.all([
      request(planner, "POST", "/planning/plans", creationInput, creationKey),
      request(planner, "POST", "/planning/plans", creationInput, creationKey),
    ]);
    const success = submissions.find(result => result.status === 201);
    assert.ok(success, JSON.stringify(submissions)); plan = success.body;
    for (const result of submissions) {
      if (result.status === 409) assert.equal(result.body.code, "ACTION_IN_PROGRESS");
      else { expectStatus(result, 201); assert.equal(result.body.id, plan.id); }
    }
    assert.equal(await m.DevelopmentPlan.count({ where: { title: creationInput.title } }), 1);
    assert.equal(await m.DevelopmentGoal.count({ where: { developmentPlanId: plan.id } }), 1);
    assert.equal((await events("developmentPlan", plan.id, AUDIT_ACTIONS.CDP_RECORDED)).length, 1);
    assert.equal((await events("developmentPlan", plan.id, "record.created")).length, 1);
    const auditCount = await m.AuditLog.count();
    const replay = await request(planner, "POST", "/planning/plans", creationInput, creationKey);
    expectStatus(replay, 201); assert.deepEqual(replay.body, plan);
    assert.equal(replay.headers.get("idempotency-replayed"), "true");
    assert.equal(await m.AuditLog.count(), auditCount, "replay does not append duplicate domain or detailed history");
    const receipt = await m.MutationReceipt.findOne({ where: { actorId: planner.user.id } });
    assert.equal(receipt.status, "completed"); assert.equal(receipt.responseBody.id, plan.id);
    const changed = await request(planner, "POST", "/planning/plans", { ...creationInput, title: "Different content" }, creationKey);
    expectStatus(changed, 409); assert.equal(changed.body.code, "ACTION_REFERENCE_CONFLICT");
  });

  await t.test("revoked permissions deny a previously completed replay before its response is released", async () => {
    await planner.role.removePermission(permissionRows.get("planning.manageCdp"));
    const denied = await request(planner, "POST", "/planning/plans", creationInput, creationKey);
    expectStatus(denied, 403); assert.deepEqual(denied.body.required, ["planning.manageCdp"]);
    assert.equal(denied.headers.get("idempotency-replayed"), null);
    await planner.role.addPermission(permissionRows.get("planning.manageCdp"));
    expectStatus(await request(planner, "POST", "/planning/plans", creationInput, creationKey), 201);
  });

  await t.test("edits preserve old values and adoption requires the correct role and valid state", async () => {
    const edited = await request(planner, "PATCH", `/planning/plans/${plan.id}`, { vision: "Improved municipal service" }, crypto.randomUUID());
    expectStatus(edited, 200);
    const event = (await events("developmentPlan", plan.id, "planning.cdp.updated")).at(-1);
    assert.equal(event.actorId, planner.user.id); assert.equal(event.actorRole, "planningOfficer");
    assert.ok(event.recordedAt); assert.equal(event.beforeState.vision, creationInput.vision);
    assert.equal(event.afterState.vision, "Improved municipal service");
    expectStatus(await request(planner, "POST", `/planning/plans/${plan.id}/adopt`, { resolutionNo: "2030-HTTP" }, crypto.randomUUID()), 403);
    const key = crypto.randomUUID(), body = { resolutionNo: "2030-HTTP" };
    const adopted = await request(clerk, "POST", `/planning/plans/${plan.id}/adopt`, body, key);
    expectStatus(adopted, 200); assert.equal(adopted.body.status, "adopted");
    expectStatus(await request(clerk, "POST", `/planning/plans/${plan.id}/adopt`, body, key), 200);
    expectStatus(await request(clerk, "POST", `/planning/plans/${plan.id}/adopt`, body, crypto.randomUUID()), 409);
    expectStatus(await request(planner, "PATCH", `/planning/plans/${plan.id}`, { vision: "Rewrite approved plan" }, crypto.randomUUID()), 409);
    assert.equal((await events("developmentPlan", plan.id, AUDIT_ACTIONS.CDP_ADOPTED)).length, 1);
    assert.equal((await m.DevelopmentPlan.findByPk(plan.id)).vision, "Improved municipal service");
  });

  await t.test("the full AIP route sequence enforces responsibility, freezes review edits, and preserves a documented return", async () => {
    const created = await request(planner, "POST", "/planning/investment-programs", { fiscalYear: 2030 }, crypto.randomUUID());
    expectStatus(created, 201); const program = created.body;
    const entryResponse = await request(planner, "POST", `/planning/investment-programs/${program.id}/entries`, {
      title: "Service equipment", reference: "HTTP-AIP-1", estimatedCost: 30000,
      developmentGoalId: plan.goals[0].id, implementingUnitId: department.id,
    }, crypto.randomUUID());
    expectStatus(entryResponse, 201); const entry = entryResponse.body;
    const transition = (person, action, extra = {}) => request(person, "POST", `/planning/investment-programs/${program.id}/transition`, { action, ...extra }, crypto.randomUUID());
    expectStatus(await transition(planner, "submit"), 200);
    expectStatus(await transition(planner, "endorse"), 403);
    expectStatus(await request(planner, "PATCH", `/planning/aip-entries/${entry.id}`, { estimatedCost: 40000 }, crypto.randomUUID()), 409);
    expectStatus(await transition(mayor, "endorse"), 200);
    expectStatus(await transition(mayor, "adopt", { resolutionNo: "2030-AIP-HTTP" }), 403);
    expectStatus(await transition(clerk, "return", { remarks: "Clarify the equipment estimate" }), 200);
    const returned = await m.InvestmentProgram.findByPk(program.id);
    assert.equal(returned.status, "returned"); assert.equal(returned.endorsedAt, null);
    const event = (await events("investmentProgram", program.id, AUDIT_ACTIONS.AIP_TRANSITION)).at(-1);
    assert.equal(event.actorId, clerk.user.id); assert.ok(event.beforeState.endorsedAt);
    assert.equal(event.afterState.returnRemarks, "Clarify the equipment estimate");
    expectStatus(await request(planner, "PATCH", `/planning/aip-entries/${entry.id}`, { estimatedCost: 32000, remarks: "Estimate clarified" }, crypto.randomUUID()), 200);
    expectStatus(await transition(planner, "submit"), 200);
    expectStatus(await transition(mayor, "endorse"), 200);
    expectStatus(await transition(clerk, "adopt", { resolutionNo: "2030-AIP-HTTP" }), 200);
    expectStatus(await transition(planner, "submit"), 409);
    const shared = await request(viewer, "GET", "/planning/investment-programs");
    expectStatus(shared, 200); assert.equal(shared.body.find(item => item.id === program.id).status, "adopted");
  });

  await t.test("audit errors return promptly, roll back business changes, and leave failed retries blocked", async () => {
    const input = planInput("HTTP audit failure must roll back"), key = crypto.randomUUID();
    const auditCount = await m.AuditLog.count();
    m.AuditLog.addHook("beforeCreate", "httpAuditFailure", row => {
      if (row.entityRef === "developmentPlan" && row.afterState?.title === input.title) throw new Error("Injected audit storage failure");
    });
    try {
      expectStatus(await request(planner, "POST", "/planning/plans", input, key), 500);
    } finally { m.AuditLog.removeHook("beforeCreate", "httpAuditFailure"); }
    assert.equal(await m.DevelopmentPlan.count({ where: { title: input.title } }), 0);
    assert.equal(await m.AuditLog.count(), auditCount);
    const retry = await request(planner, "POST", "/planning/plans", input, key);
    expectStatus(retry, 409); assert.equal(retry.body.code, "ACTION_OUTCOME_UNCERTAIN");
    expectStatus(await request(planner, "GET", "/planning/plans"), 200, "server remains usable after async rejection");
  });

  await t.test("concurrent officers retain their own actor identity in both kinds of history", async () => {
    const results = await Promise.all([planner, secondPlanner].map(person =>
      request(person, "POST", "/planning/plans", planInput(`Plan by ${person.user.name}`), crypto.randomUUID())));
    for (const [index, person] of [planner, secondPlanner].entries()) {
      expectStatus(results[index], 201);
      const rows = await events("developmentPlan", results[index].body.id);
      assert.equal(rows.length, 2);
      for (const row of rows) { assert.equal(row.actorId, person.user.id); assert.equal(row.actorRole, person.role.key); }
    }
    assert.equal((await verifyChain({})).intact, true);
  });
});
