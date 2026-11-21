import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mysql from "mysql2/promise";

const FORBIDDEN_SIGNALS = /\b(demo|mock|seed|seeded|simulat\w*|sample|fictional|test|testing|example|sandbox|placeholder|dummy)\b/i;

test("survey demo seed builds a clean, repeatable evaluation database with 1 completed + 2 ongoing projects", {
  skip: process.env.RUN_SURVEY_DB_TEST !== "1",
  timeout: 180_000,
}, async (t) => {
  const scratch = `impbbms_survey_${crypto.randomBytes(6).toString("hex")}`;
  const host = process.env.DB_HOST ?? "127.0.0.1";
  const port = Number(process.env.SURVEY_TEST_DB_PORT ?? process.env.DB_PORT ?? 3306);
  const user = process.env.DB_USER ?? "root";
  const password = process.env.DB_PASSWORD ?? "";

  Object.assign(process.env, {
    DB_HOST: host,
    DB_PORT: String(port),
    DB_NAME: scratch,
    DB_USER: user,
    DB_PASSWORD: password,
    NODE_ENV: "test",
    ELECTRON: "1",
    CLOUDFLARE_WORKER: "false",
    SECURITY_SCAN_MINUTES: "0",
    SURVEY_SANDBOX_MODE: "true",
    SESSION_SECRET: crypto.randomBytes(32).toString("hex"),
    MFA_ENCRYPTION_KEY: crypto.randomBytes(32).toString("hex"),
  });

  const admin = await mysql.createConnection({ host, port, user, password });
  assert.match(scratch, /^impbbms_survey_[a-f0-9]{12}$/);
  await admin.query(`CREATE DATABASE \`${scratch}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  let m, server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (m) await m.sequelize.close();
    await admin.query(`DROP DATABASE IF EXISTS \`${scratch}\``);
    await admin.end();
  });

  m = await import("../models/index.js");
  await m.sequelize.sync();

  const { seedSurveyDemo } = await import("../scripts/seedSurveyDemo.mjs");
  const { SURVEY_DEFAULT_PASSWORD, ACCOUNTS } = await import("../scripts/surveyDemoData.mjs");
  const { listPublicProjects, getPublicSummary } = await import("../services/projectLifecycle.js");
  const { getBacContext } = await import("../services/procurementGovernance.js");
  const { verifyChain } = await import("../services/auditLog.js");
  const { sweep } = await import("../services/integrityMonitor.js");
  const { default: app } = await import("../index.js");

  // 1. Refuse wrong confirmation database name.
  await assert.rejects(seedSurveyDemo({ confirmDatabase: "wrong_name", quiet: true }), /confirm-database/);

  // 2. First seed run.
  const firstRun = await seedSurveyDemo({ confirmDatabase: scratch, quiet: true });
  assert.equal(firstRun.accounts, 19);
  assert.equal(firstRun.bacCommitteeSize, 5);
  assert.equal(firstRun.auditChainIntact, true);
  assert.equal(firstRun.integrityFindings, 0);

  // 3. Second seed run must cleanly reset everything without FK errors.
  const secondRun = await seedSurveyDemo({ confirmDatabase: scratch, quiet: true });
  assert.equal(secondRun.accounts, 19);
  assert.equal(secondRun.auditChainIntact, true);
  assert.equal(secondRun.integrityFindings, 0);

  // 4. Verify BAC quorum composition has zero warnings.
  const bac = await getBacContext();
  assert.equal(bac.committee.length, 5);
  assert.equal(bac.policy.quorumCount, 3);

  // 5. Verify public projects: strictly 1 completed + 2 ongoing = 3 total.
  const publicProjects = await listPublicProjects({ detailed: true });
  assert.equal(publicProjects.length, 3);
  assert.equal(publicProjects.filter((p) => p.category === "completed").length, 1);
  assert.equal(publicProjects.filter((p) => p.category === "ongoing").length, 2);

  const summary = await getPublicSummary();
  assert.equal(summary.totalProjects, 3);
  assert.equal(summary.completed, 1);
  assert.equal(summary.ongoing, 2);
  assert.equal(summary.upcoming, 0);

  // 6. Verify HTTP login works for every seeded role with MFA disabled,
  // and verify public API payloads contain zero demo/mock/simulated strings.
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const headers = {
    "Content-Type": "application/json",
    Origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
    "X-Requested-With": "XMLHttpRequest",
  };

  for (const account of ACCOUNTS) {
    const res = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email: account.email, password: SURVEY_DEFAULT_PASSWORD }),
    });
    assert.equal(res.status, 200, `Login failed for ${account.email}`);
    const body = await res.json();
    assert.equal(body.email, account.email);
    assert.equal(body.mfaRequired, undefined, `MFA challenge must be off for ${account.email}`);
    assert.equal(body.mfaEnrollmentRequired, false, `MFA enrollment must be off for ${account.email}`);
  }

  // Verify public endpoints contain zero forbidden tell-tale words.
  for (const path of ["/public/projects", "/public/projects/overview", "/public/announcements", "/public/officials"]) {
    const res = await fetch(`${base}${path}`);
    assert.equal(res.status, 200, path);
    const text = await res.text();
    assert.doesNotMatch(text, FORBIDDEN_SIGNALS, `Forbidden word found in ${path}`);
  }

  for (const project of publicProjects) {
    const timelineRes = await fetch(`${base}/public/projects/${project.id}/timeline`);
    assert.equal(timelineRes.status, 200);
    const timelineText = await timelineRes.text();
    assert.doesNotMatch(timelineText, FORBIDDEN_SIGNALS, `Forbidden word in timeline for project ${project.id}`);

    const docsRes = await fetch(`${base}/public/projects/${project.id}/documents`);
    assert.equal(docsRes.status, 200);
    const docs = await docsRes.json();
    assert.ok(docs.length >= 1, `Project ${project.id} should have public ITB PDF attached`);
  }

  // 7. Verify audit chain and integrity sweep remain 100% clean after logins.
  const chain = await verifyChain();
  assert.equal(chain.intact, true);
  assert.deepEqual(chain.problems, []);
  const findings = await sweep();
  assert.deepEqual(findings, []);

  // 8. Exercise live evaluator workflows end-to-end over HTTP:
  const loginAs = async (email) => {
    const res = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password: SURVEY_DEFAULT_PASSWORD }),
    });
    assert.equal(res.status, 200, `Login failed for ${email}`);
    const cookie = res.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie, `Missing session cookie for ${email}`);
    return { ...headers, Cookie: cookie };
  };

  // 8a. Shared account protections block lockouts by admin evaluators.
  const adminHeaders = await loginAs("admin@roxas-lgu.ph");
  const mayorUser = await m.User.findOne({ where: { email: "mayor@roxas-lgu.ph" } });
  const deactivateRes = await fetch(`${base}/users/${mayorUser.id}`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ status: "inactive" }),
  });
  assert.equal(deactivateRes.status, 403, "Built-in account deactivation must be blocked");

  const rolesRes = await fetch(`${base}/security/authentication`, { headers: adminHeaders });
  assert.equal(rolesRes.status, 200);
  const { roles: securityRoles } = await rolesRes.json();
  const enableMfaRes = await fetch(`${base}/security/authentication`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({
      roles: [{ id: securityRoles[0].id, twoFactorRequired: true, expectedVersion: securityRoles[0].twoFactorVersion }],
      applyMode: "nextLogin",
    }),
  });
  assert.equal(enableMfaRes.status, 403, "Role 2FA enablement must be blocked in survey sandbox mode");

  // 8b. BAC Chairperson can immediately finalize evaluation on Ongoing Project #1 with 3/5 quorum.
  const chairHeaders = await loginAs("bac.chair@roxas-lgu.ph");
  const biddingRfq = await m.Rfq.findOne({ where: { referenceNo: "ITB-2026-0002" } });
  const closeEvalRes = await fetch(`${base}/bidding/rfqs/${biddingRfq.id}/close-evaluation`, {
    method: "POST",
    headers: chairHeaders,
    body: JSON.stringify({
      attendingMemberIds: bac.committee.slice(0, 3).map((member) => member.id),
      presidingMemberId: bac.committee[0].id,
    }),
  });
  assert.equal(closeEvalRes.status, 200, `Finalize evaluation failed: ${await closeEvalRes.clone().text()}`);

  // 8c. Head of Office can inspect Tranche 2 Delivery on Ongoing Project #2.
  const headHeaders = await loginAs("office.head@roxas-lgu.ph");
  const reportedDelivery = await m.Delivery.findOne({ where: { status: "reported" } });
  const inspectRes = await fetch(`${base}/contracts/deliveries/${reportedDelivery.id}/inspect`, {
    method: "POST",
    headers: headHeaders,
    body: JSON.stringify({
      result: "accepted",
      acceptedQuantityNote: "Remaining 15 solar assemblies inspected and accepted.",
      acceptedValue: 770000,
      remarks: "All units verified operational.",
    }),
  });
  assert.equal(inspectRes.status, 200, `Inspect delivery failed: ${await inspectRes.clone().text()}`);

  // 8d. Accountant certifies Invoice INV-2026-0002 and Treasurer releases Payment.
  const acctHeaders = await loginAs("accountant@roxas-lgu.ph");
  const submittedInvoice = await m.Invoice.findOne({ where: { invoiceNo: "INV-2026-0002" } });
  const certifyRes = await fetch(`${base}/finance/invoices/${submittedInvoice.id}/certify`, {
    method: "POST",
    headers: acctHeaders,
    body: JSON.stringify({ decision: "certify" }),
  });
  assert.equal(certifyRes.status, 200, `Certify invoice failed: ${await certifyRes.clone().text()}`);
  const certifiedBody = await certifyRes.json();

  const treasHeaders = await loginAs("treasurer@roxas-lgu.ph");
  const releaseRes = await fetch(`${base}/finance/payments/${certifiedBody.payment.id}/release`, {
    method: "POST",
    headers: treasHeaders,
    body: JSON.stringify({ method: "bankTransfer", reference: "ADA-2026-0002" }),
  });
  assert.equal(releaseRes.status, 200, `Release payment failed: ${await releaseRes.clone().text()}`);

  // 8e. Department Requester can create a brand-new PR immediately from the remaining ENGR APP balance.
  const reqHeaders = await loginAs("requester@roxas-lgu.ph");
  const engrApp = await m.AppEntry.findOne({ where: { papCode: "PAP-ENGR-2026-012" } });
  const createPrRes = await fetch(`${base}/purchase-requisitions`, {
    method: "POST",
    headers: reqHeaders,
    body: JSON.stringify({
      appEntryId: engrApp.id,
      purpose: "Phase 2 additional solar streetlight spare assemblies for Barangay Poblacion.",
      dateRequired: "2026-12-28",
      isEmergency: false,
      justificationStatus: "notApplicable",
      lineItems: [
        {
          description: "Complete 120W Solar LED Streetlight Assembly",
          technicalSpecifications: "IP66 luminaire with LiFePO4 battery and galvanized pole",
          unit: "set",
          quantity: 4,
          unitCost: 55000,
          hasUsefulLifeOverOneYear: true,
        },
      ],
    }),
  });
  assert.equal(createPrRes.status, 201, `Create PR failed: ${await createPrRes.clone().text()}`);

  // 9. Resetting restores the clean 1 completed + 2 ongoing baseline with 0 integrity alerts.
  const resetRun = await seedSurveyDemo({ confirmDatabase: scratch, quiet: true });
  assert.equal(resetRun.auditChainIntact, true);
  assert.equal(resetRun.integrityFindings, 0);
  const restoredProjects = await listPublicProjects();
  assert.equal(restoredProjects.length, 3);
  assert.equal(restoredProjects.filter((p) => p.category === "completed").length, 1);
  assert.equal(restoredProjects.filter((p) => p.category === "ongoing").length, 2);
});
