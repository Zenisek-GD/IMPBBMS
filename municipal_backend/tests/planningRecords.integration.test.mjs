import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mysql from "mysql2/promise";
import { AIP_TRANSITIONS, evaluateTransition, permissionForTransition, isEditable } from "../services/aipWorkflow.js";
import { ROLE_PERMISSIONS } from "../config/permissionMatrix.js";

test("AIP transitions expose only the actual stage's responsible permission", () => {
  const statuses = ["draft", "returned", "pendingMayorEndorsement", "pendingSanggunianAdoption", "adopted"];
  for (const [action, policy] of Object.entries(AIP_TRANSITIONS)) {
    for (const currentStatus of statuses) assert.equal(evaluateTransition({ action, currentStatus, remarks: "Recorded decision" }).ok, policy.from.includes(currentStatus), `${action} from ${currentStatus}`);
  }
  assert.equal(permissionForTransition("return", "pendingMayorEndorsement"), "planning.setPriorities");
  assert.equal(permissionForTransition("return", "pendingSanggunianAdoption"), "planning.adoptAip");
  assert.equal(evaluateTransition({ action: "return", currentStatus: "pendingMayorEndorsement", remarks: 8 }).ok, false);
  assert.equal(evaluateTransition({ action: "skipApproval", currentStatus: "draft" }).ok, false);
  assert.equal(isEditable("pendingMayorEndorsement"), false);
  assert.equal(isEditable("returned"), true);
});

test("planning records are audited atomically and retain correct workflow responsibility", { skip: process.env.RUN_PROCUREMENT_DB_TESTS !== "1", timeout: 180000 }, async (t) => {
  const scratch = `impbbms_planning_records_${crypto.randomBytes(8).toString("hex")}`;
  const port = Number(process.env.PROCUREMENT_TEST_DB_PORT ?? 33317);
  Object.assign(process.env, { DB_HOST: "127.0.0.1", DB_PORT: String(port), DB_NAME: scratch, DB_USER: "root", DB_PASSWORD: "", NODE_ENV: "test" });
  const admin = await mysql.createConnection({ host: "127.0.0.1", port, user: "root", password: "" });
  assert.match(scratch, /^impbbms_planning_records_[a-f0-9]{16}$/);
  await admin.query(`CREATE DATABASE \`${scratch}\``);
  let m;
  t.after(async () => { if (m) await m.sequelize.close(); assert.match(scratch, /^impbbms_planning_records_[a-f0-9]{16}$/); await admin.query(`DROP DATABASE \`${scratch}\``); await admin.end(); });
  m = await import("../models/index.js");
  await m.sequelize.sync();
  const api = await import("../controllers/planningController.js");
  const { AUDIT_ACTIONS, verifyChain } = await import("../services/auditLog.js");
  const dept = await m.Department.create({ name: "Planning", code: "MPDO" });
  const otherDept = await m.Department.create({ name: "Engineering", code: "MEO" });
  const inactiveDept = await m.Department.create({ name: "Inactive office", code: "OLD", status: "inactive" });
  const users = {};
  for (const key of ["planningOfficer", "hope", "sanggunianSecretary", "endUser"]) {
    const role = await m.Role.create({ key, name: key });
    const user = await m.User.create({ name: key, email: `${key}@example.test`, password: "ExampleTestPassword123!", roleId: role.id, departmentId: dept.id, status: "active" });
    user.Role = role; users[key] = user;
  }
  const planner = users.planningOfficer, mayor = users.hope, clerk = users.sanggunianSecretary, office = users.endUser;
  const call = async (handler, user, params = {}, body = {}, query = {}) => {
    let result;
    const req = { currentUser: user, permissions: new Set(ROLE_PERMISSIONS[user.Role.key] ?? []), params, body, query, ip: "127.0.0.1" };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { result = value; return this; } };
    await handler(req, res); return result;
  };
  const goalInput = { title: "Improve access to public services", sector: "general", description: "Measured through completed projects" };
  const createPlan = (title, startYear = 2030, endYear = 2032) => call(api.createPlan, planner, {}, { title, startYear, endYear, vision: "A responsive municipality", goals: [goalInput, { ...goalInput, title: "Resilient infrastructure", sector: "infrastructure" }] });
  const events = (entityRef, entityId, actionType) => m.AuditLog.findAll({ where: { entityRef, entityId, ...(actionType ? { actionType } : {}) }, order: [["sequence", "ASC"]] });
  let plan, program, entry;

  await t.test("creation and edits have complete actor and timestamped snapshots; failed audit rolls back all changes", async () => {
    await assert.rejects(call(api.createPlan, office, {}, { title: "Unauthorized", startYear: 2030, endYear: 2032 }), /permission/);
    plan = await createPlan("Municipal development plan");
    const created = (await events("developmentPlan", plan.id, AUDIT_ACTIONS.CDP_RECORDED))[0];
    assert.equal(created.beforeState, null); assert.equal(created.afterState.title, plan.title);
    assert.equal(created.actorId, planner.id); assert.equal(created.actorRole, "planningOfficer"); assert.ok(created.recordedAt); assert.ok(created.afterState.createdAt);
    assert.equal((await events("developmentGoal", plan.goals[0].id, "planning.goal.created"))[0].afterState.description, goalInput.description);
    await call(api.updatePlan, planner, { id: plan.id }, { vision: "Updated long-term direction" });
    const update = (await events("developmentPlan", plan.id, "planning.cdp.updated"))[0];
    assert.equal(update.beforeState.vision, "A responsive municipality"); assert.equal(update.afterState.vision, "Updated long-term direction");
    m.AuditLog.addHook("beforeCreate", "planningAuditFailure", () => { throw new Error("Planning audit unavailable"); });
    try {
      await assert.rejects(call(api.updatePlan, planner, { id: plan.id }, { title: "Must roll back" }), /audit unavailable/);
      await assert.rejects(createPlan("Must never persist", 2038, 2040), /audit unavailable/);
    } finally { m.AuditLog.removeHook("beforeCreate", "planningAuditFailure"); }
    assert.equal((await m.DevelopmentPlan.findByPk(plan.id)).title, plan.title);
    assert.equal(await m.DevelopmentPlan.count({ where: { title: "Must never persist" } }), 0);
    await assert.rejects(call(api.updateGoal, planner, { goalId: plan.goals[0].id }, { status: "achieved", progressRemarks: "Premature completion" }), /Adopt/);
  });

  await t.test("concurrent adoption records one logical transition and supersession is atomic and explicitly audited", async () => {
    await assert.rejects(call(api.adoptPlan, planner, { id: plan.id }, { resolutionNo: "2030-001" }), /permission/);
    const attempts = await Promise.allSettled([call(api.adoptPlan, clerk, { id: plan.id }, { resolutionNo: "2030-001" }), call(api.adoptPlan, clerk, { id: plan.id }, { resolutionNo: "2030-001" })]);
    assert.equal(attempts.filter((row) => row.status === "fulfilled").length, 1);
    assert.equal((await events("developmentPlan", plan.id, AUDIT_ACTIONS.CDP_ADOPTED)).length, 1);
    const successor = await createPlan("Revised municipal development plan");
    m.AuditLog.addHook("beforeCreate", "rejectAdoption", (row) => { if (row.actionType === AUDIT_ACTIONS.CDP_ADOPTED) throw new Error("Adoption audit failed"); });
    try { await assert.rejects(call(api.adoptPlan, clerk, { id: successor.id }, { resolutionNo: "2030-002" }), /Adoption audit failed/); } finally { m.AuditLog.removeHook("beforeCreate", "rejectAdoption"); }
    assert.equal((await m.DevelopmentPlan.findByPk(plan.id)).status, "adopted");
    assert.equal((await m.DevelopmentPlan.findByPk(successor.id)).status, "draft");
    await call(api.adoptPlan, clerk, { id: successor.id }, { resolutionNo: "2030-002" });
    const superseded = (await events("developmentPlan", plan.id, "planning.cdp.superseded"))[0];
    assert.equal(superseded.beforeState.status, "adopted"); assert.equal(superseded.afterState.status, "superseded"); assert.equal(superseded.afterState.supersededByPlanId, successor.id);
    await assert.rejects(call(api.updateGoal, planner, { goalId: plan.goals[0].id }, { title: "Change historical goal" }), /historical/);
    await assert.rejects(call(api.createGoal, planner, { id: successor.id }, goalInput), /draft/);
    plan = successor;
  });

  await t.test("goal progress and priority changes validate scope and retain the replaced rankings", async () => {
    const goal = plan.goals[0];
    await assert.rejects(call(api.updateGoal, planner, { goalId: goal.id }, { status: "unknown" }), /Active, Achieved or Dropped/);
    await assert.rejects(call(api.updateGoal, planner, { goalId: goal.id }, { status: "achieved" }), /reason/);
    await assert.rejects(call(api.updateGoal, planner, { goalId: goal.id }, { title: "Rewrite approved target" }), /approved content/);
    await call(api.updateGoal, planner, { goalId: goal.id }, { status: "achieved", progressRemarks: "All approved milestones have been completed." });
    const progress = (await events("developmentGoal", goal.id, "planning.goal.progressUpdated"))[0];
    assert.equal(progress.beforeState.status, "active"); assert.equal(progress.afterState.status, "achieved"); assert.match(progress.afterState.progressRemarks, /milestones/);
    await assert.rejects(call(api.setPriorities, mayor, {}, { fiscalYear: 2030, goalIds: [goal.id] }), /active goals/);
    await call(api.updateGoal, planner, { goalId: goal.id }, { status: "active", progressRemarks: "Additional implementation milestones approved." });
    await assert.rejects(call(api.setPriorities, mayor, {}, { fiscalYear: 2038, goalIds: [goal.id] }), /fiscal year/);
    await call(api.setPriorities, mayor, {}, { fiscalYear: 2030, goalIds: [goal.id, plan.goals[1].id] });
    const count = await m.AuditLog.count();
    await call(api.setPriorities, mayor, {}, { fiscalYear: 2030, goalIds: [goal.id, plan.goals[1].id] });
    assert.equal(await m.AuditLog.count(), count, "repeating an identical priority set creates no duplicate action");
    await call(api.setPriorities, mayor, {}, { fiscalYear: 2030, goalIds: [plan.goals[1].id] });
    const changed = await events("developmentGoal", goal.id, "planning.goal.priorityChanged");
    assert.equal(changed.at(-1).beforeState.priorityRank, 1); assert.equal(changed.at(-1).afterState.isMayorPriority, false);
  });

  await t.test("AIP headers and projects are audited and duplicate fiscal years and references are prevented", async () => {
    const created = await Promise.allSettled([call(api.createProgram, planner, {}, { fiscalYear: 2030 }), call(api.createProgram, planner, {}, { fiscalYear: 2030 })]);
    assert.equal(created.filter((row) => row.status === "fulfilled").length, 1);
    program = created.find((row) => row.status === "fulfilled").value;
    await call(api.updateProgram, planner, { id: program.id }, { title: "AIP for implementation", remarks: "Prepared with the implementing offices" });
    const header = (await events("investmentProgram", program.id, "planning.aip.updated"))[0];
    assert.equal(header.beforeState.title, "Annual Investment Program 2030"); assert.equal(header.afterState.title, "AIP for implementation");
    const input = { title: "Municipal project", reference: "PROJECT-1", estimatedCost: 1000, developmentGoalId: plan.goals[0].id, implementingUnitId: otherDept.id };
    await assert.rejects(call(api.createAipEntry, office, { id: program.id }, input), /permission/);
    await assert.rejects(call(api.createAipEntry, planner, { id: program.id }, { ...input, startQuarter: "Q5" }), /quarter/);
    await assert.rejects(call(api.createAipEntry, planner, { id: program.id }, { ...input, implementingUnitId: inactiveDept.id }), /active implementing/);
    const entries = await Promise.allSettled([call(api.createAipEntry, planner, { id: program.id }, input), call(api.createAipEntry, planner, { id: program.id }, input)]);
    assert.equal(entries.filter((row) => row.status === "fulfilled").length, 1); entry = entries.find((row) => row.status === "fulfilled").value;
    await call(api.updateAipEntry, planner, { entryId: entry.id }, { estimatedCost: 1200, remarks: "Updated initial estimate" });
    const update = (await events("aipEntry", entry.id, "planning.aipEntry.updated"))[0];
    assert.equal(Number(update.beforeState.estimatedCost), 1000); assert.equal(Number(update.afterState.estimatedCost), 1200); assert.equal(update.afterState.implementingUnitId, otherDept.id);
    await assert.rejects(call(api.updateAipEntry, planner, { entryId: entry.id }, { status: "awarded" }), /Planned or Dropped/);
    await assert.rejects(call(api.updateAipEntry, planner, { entryId: entry.id }, { implementingUnitId: 99999 }), /active implementing/);
  });

  await t.test("review stages freeze edits and preserve the Mayor and Sanggunian responsibilities", async () => {
    await assert.rejects(call(api.transitionProgram, clerk, { id: program.id }, { action: "submit" }), /permission/);
    await call(api.transitionProgram, planner, { id: program.id }, { action: "submit" });
    await assert.rejects(call(api.updateAipEntry, planner, { entryId: entry.id }, { estimatedCost: 5000 }), /under review/);
    await assert.rejects(call(api.updateProgram, planner, { id: program.id }, { title: "Change pending record" }), /draft or returned/);
    await assert.rejects(call(api.transitionProgram, planner, { id: program.id }, { action: "endorse" }), /permission/);
    await call(api.transitionProgram, mayor, { id: program.id }, { action: "endorse" });
    await assert.rejects(call(api.transitionProgram, mayor, { id: program.id }, { action: "adopt", resolutionNo: "AIP-1" }), /permission/);
    await assert.rejects(call(api.transitionProgram, mayor, { id: program.id }, { action: "return", remarks: "Outside mayor stage" }), /permission/);
    await call(api.transitionProgram, clerk, { id: program.id }, { action: "return", remarks: "Clarify the project estimate" });
    let row = await m.InvestmentProgram.findByPk(program.id); assert.equal(row.status, "returned"); assert.equal(row.endorsedAt, null); assert.equal(row.endorsedById, null);
    const returned = (await events("investmentProgram", program.id, AUDIT_ACTIONS.AIP_TRANSITION)).at(-1);
    assert.ok(returned.beforeState.endorsedAt); assert.equal(returned.afterState.returnRemarks, "Clarify the project estimate");
    await call(api.updateAipEntry, planner, { entryId: entry.id }, { remarks: "Estimate clarified with supporting evidence" });
    await call(api.transitionProgram, planner, { id: program.id }, { action: "submit" });
    await call(api.transitionProgram, mayor, { id: program.id }, { action: "endorse" });
    const adoption = await Promise.allSettled([call(api.transitionProgram, clerk, { id: program.id }, { action: "adopt", resolutionNo: "2030-AIP" }), call(api.transitionProgram, clerk, { id: program.id }, { action: "adopt", resolutionNo: "2030-AIP" })]);
    assert.equal(adoption.filter((result) => result.status === "fulfilled").length, 1);
    row = await m.InvestmentProgram.findByPk(program.id); assert.equal(row.status, "adopted");
    await assert.rejects(call(api.updateAipEntry, planner, { entryId: entry.id }, { estimatedCost: 9000 }), /locked/);
    await assert.rejects(call(api.deleteAipEntry, planner, { entryId: entry.id }), /no longer a draft/);
    await call(api.updateAipEntry, planner, { entryId: entry.id }, { remarks: "Implementation monitoring note" });
    const shared = await call(api.listPrograms, office); assert.ok(shared.some((item) => item.id === program.id && item.entries.some((project) => project.implementingUnitId === otherDept.id)), "shared municipal planning visibility is retained");
    const filtered = await call(api.listAipEntries, office, {}, {}, { implementingUnitId: String(dept.id) }); assert.equal(filtered.length, 0);
  });

  await t.test("draft deletion and adopted dropping preserve history and roll back on audit failure", async () => {
    const next = await call(api.createProgram, planner, {}, { fiscalYear: 2031 });
    const project = await call(api.createAipEntry, planner, { id: next.id }, { title: "Draft-only project", estimatedCost: 1500, developmentGoalId: plan.goals[1].id });
    m.AuditLog.addHook("beforeCreate", "rejectDelete", (row) => { if (row.actionType === "planning.aipEntry.deleted") throw new Error("Deletion audit failed"); });
    try { await assert.rejects(call(api.deleteAipEntry, planner, { entryId: project.id }), /Deletion audit failed/); } finally { m.AuditLog.removeHook("beforeCreate", "rejectDelete"); }
    assert.ok(await m.AipEntry.findByPk(project.id));
    await call(api.deleteAipEntry, planner, { entryId: project.id });
    const deletion = (await events("aipEntry", project.id, "planning.aipEntry.deleted"))[0];
    assert.equal(deletion.beforeState.title, "Draft-only project"); assert.equal(deletion.afterState.deleted, true); assert.ok(deletion.afterState.deletedAt);
    await assert.rejects(call(api.updateAipEntry, planner, { entryId: entry.id }, { status: "dropped" }), /reason/);
    await call(api.updateAipEntry, planner, { entryId: entry.id }, { status: "dropped", remarks: "Project deferred under the recorded reprogramming decision." });
    const dropped = (await events("aipEntry", entry.id, "planning.aipEntry.statusChanged"))[0];
    assert.equal(dropped.beforeState.status, "planned"); assert.equal(dropped.afterState.status, "dropped"); assert.equal(Number(dropped.afterState.estimatedCost), 1200);
    await assert.rejects(call(api.updateAipEntry, planner, { entryId: entry.id }, { status: "planned", remarks: "Try direct reinstatement" }), /reinstated/);
    assert.equal((await verifyChain({})).intact, true);
  });
});
