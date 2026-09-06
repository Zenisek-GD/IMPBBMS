import test, { after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import express from "express";
import { parseDocument } from "htmlparser2";
import { sanitizeHtml } from "../services/htmlSanitizer.js";
import { assembleDocument } from "../services/templateRenderer.js";
import { protectRequests } from "../middleware/securityMiddleware.js";
import { validateProductionConfig } from "../config/security.js";
import { takeAttempt, rateLimit } from "../middleware/rateLimitMiddleware.js";
import { asyncHandler, errorHandler, wrapRouterStack } from "../middleware/asyncHandler.js";
import { validateFileContent } from "../services/documentStore.js";
import { credentialStamp, passwordSessionValid } from "../middleware/permissionMiddleware.js";
import { requireMfaEnrollment } from "../middleware/mfaMiddleware.js";
import { MfaEnrollment, MfaRecoveryCode } from "../models/mfaModel.js";
import { OtpChallenge } from "../models/otpChallengeModel.js";
import { User } from "../models/userModel.js";
import { sequelize } from "../models/db.js";
import { consumeTicket } from "../services/otp.js";
import { consumeRecoveryCode } from "../controllers/mfaController.js";
import { logout } from "../controllers/authController.js";
import { validatePassword } from "../controllers/passwordResetController.js";
import { accessFor } from "../controllers/documentController.js";
import { Bid } from "../models/biddingModel.js";
import { Vendor } from "../models/vendorModel.js";
import { reportDelivery } from "../controllers/contractController.js";
import { Contract } from "../models/contractModel.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import { Payment, Invoice } from "../models/paymentModel.js";
import { releasePayment, certifyInvoice } from "../controllers/paymentController.js";

after(() => sequelize.close());
test('logout and public reads do not query the MFA database', async (t) => {
  t.mock.method(MfaEnrollment, 'findOne', async () => { assert.fail('Unexpected MFA lookup'); });
  for (const path of ['/api/auth/logout', '/api/public/announcements']) {
    let continued = false;
    await requireMfaEnrollment({ path, session: { userId: 1 } }, {}, () => { continued = true; });
    assert.equal(continued, true);
  }
});
test('logout revokes its session even when MySQL is unavailable', async (t) => {
  t.mock.method(User, 'findByPk', async () => { throw new Error('Private SQL diagnostic must not escape'); });
  t.mock.method(console, 'error', (...args) => { assert.doesNotMatch(args.join(' '), /Private SQL/); });
  let destroyed = false, cleared = false, replied = false;
  await logout({ session: { userId: 1, destroy(callback) { destroyed = true; callback(null); } } }, {
    clearCookie() { cleared = true; }, json(body) { replied = body.message === 'Logged out.'; },
  });
  assert.ok(destroyed && cleared && replied);
});
const walk = (node, fn) => { fn(node); for (const child of node.children ?? []) walk(child, fn); };
test("HTML injection payloads cannot create executable attributes or elements", () => {
  const payloads = [
    `<img src='data:image/png;base64,AAAA" onerror="alert(1)'>`,
    `<p style='color:red" onmouseover="alert(1)'>text</p>`,
    `<p style="background:u\\72l(https://attacker.test)">test</p>`,
    `<p style="background:&#117;rl(https://attacker.test)">test</p>`,
    `<svg><g/onload=alert(1)//<p>`,
    `<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>">`,
    `<iframe srcdoc="<script>alert(1)</script>"></iframe><script>alert(1)</script>`,
  ];
  for (const input of payloads) {
    const output = sanitizeHtml(input);
    walk(parseDocument(output), (node) => {
      assert.ok(!["script", "iframe", "svg", "math", "object", "style"].includes(node.name));
      for (const [name, value] of Object.entries(node.attribs ?? {})) {
        assert.ok(!name.startsWith("on"), output);
        if (name === "src") assert.match(value, /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i);
        if (name === "style") assert.doesNotMatch(value, /url\(|\\|javascript:/i);
      }
    });
  }
});
test("document formatting, seal images and template tokens survive sanitation", () => {
  const clean = sanitizeHtml('<table><tr><td colspan="2" style="text-align:center;font-weight:bold">{supplier_name}</td></tr></table><img src="data:image/png;base64,AAAA" />');
  assert.match(clean, /colspan="2"/); assert.match(clean, /text-align:center/);
  assert.match(clean, /\{supplier_name\}/); assert.match(clean, /data:image\/png/);
});
test("CSS cannot escape the style element or fetch external resources", () => {
  for (const css of ['</style><script>alert(1)</script>', '@import "https://attacker.test";', 'p{background:u\\72l(https://attacker.test)}']) {
    const html = assembleDocument({ bodyHtml: '<p>OK</p>', css, title: '<script>' });
    assert.doesNotMatch(html, /attacker\.test|<script>/);
  }
});
const env = { NODE_ENV: "production", CLOUDFLARE_WORKER: "true", SESSION_SECRET: "s".repeat(64), MFA_ENCRYPTION_KEY: "m".repeat(64), FRONTEND_ORIGIN: "https://municipality.example", SMTP_HOST: "smtp.example", SMTP_USER: "test", SMTP_PASSWORD: "test" };
test("production rejects absent keys, console mail, bad origins and volatile stores", () => {
  assert.doesNotThrow(() => validateProductionConfig(env));
  for (const key of ["SESSION_SECRET", "MFA_ENCRYPTION_KEY", "FRONTEND_ORIGIN", "SMTP_PASSWORD", "CLOUDFLARE_WORKER"]) assert.throws(() => validateProductionConfig({ ...env, [key]: "" }));
  assert.throws(() => validateProductionConfig({ ...env, MFA_ENCRYPTION_KEY: env.SESSION_SECRET }));
  assert.throws(() => validateProductionConfig({ ...env, FRONTEND_ORIGIN: "https://example.test/path" }));
});

test("HTTP mutations reject forms and hostile origins, but accept the configured UI", async () => {
  const app = express(); app.use(protectRequests); app.post("/", (req, res) => res.json({ ok: true })); app.get("/", (req, res) => res.json({ ok: true }));
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/`;
    assert.equal((await fetch(url, { method: "POST" })).status, 403);
    assert.equal((await fetch(url, { method: "POST", headers: { Origin: "https://attacker.test", "X-Requested-With": "XMLHttpRequest" } })).status, 403);
    assert.equal((await fetch(url, { method: "POST", headers: { Origin: "null", "X-Requested-With": "XMLHttpRequest" } })).status, 403);
    assert.equal((await fetch(url, { method: "POST", headers: { Origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173", "X-Requested-With": "XMLHttpRequest" } })).status, 200);
    const response = await fetch(url); assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test("D1 rate-limit SQL enforces concurrent ceilings and expiry", async () => {
  const sql = new DatabaseSync(":memory:");
  sql.exec("CREATE TABLE rate_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL)");
  const db = { prepare: query => ({ bind: (...args) => ({ first: async () => sql.prepare(query).get(...args) }) }) };
  try {
    const results = await Promise.all(Array.from({ length: 25 }, () => takeAttempt("login", "address", 10, { db, now: 1000 })));
    assert.equal(results.filter(r => r.allowed).length, 10);
    assert.equal((await takeAttempt("login", "address", 10, { db, now: 901000 })).allowed, true);
    assert.equal((await takeAttempt("reset", "address", 10, { db, now: 1000 })).allowed, true);
  } finally { sql.close(); }
});
test("rate-limit storage errors fail closed", async () => {
  await assert.rejects(takeAttempt("login", "ip", 10, { db: { prepare() { throw new Error("offline"); } } }), /offline/);
});
test("credentials and privilege changes revoke sessions immediately", () => {
  const user = { password: "bcrypt-hash", email: "a@example.test", roleId: 1, departmentId: 1, status: "active" };
  const req = { session: { credentialHash: credentialStamp(user), authAt: Date.now() } };
  assert.equal(passwordSessionValid(req, user), true);
  for (const key of ["password", "email", "roleId", "departmentId", "status"]) assert.equal(passwordSessionValid(req, { ...user, [key]: "changed" }), false);
  assert.equal(passwordSessionValid({ session: { ...req.session, authAt: Date.now() - 9 * 3600000 } }, user), false);
  assert.equal(passwordSessionValid({ session: {} }, user), false);
});
test("role-only admin routes reject revoked password sessions", async (t) => {
  t.mock.method(User, "findByPk", async () => ({ password: "changed", status: "active", Role: { key: "systemAdministrator" } }));
  let status; const res = { status(code) { status = code; return this; }, json() {} };
  await requireRole("systemAdministrator")({ session: { userId: 1, credentialHash: "old", authAt: Date.now() } }, res, () => assert.fail("revoked admin session accepted"));
  assert.equal(status, 401);
});
test("MFA reset and enrollment replacement block previously verified sessions", async (t) => {
  let enrollment = null;
  t.mock.method(MfaEnrollment, "findOne", async () => enrollment);
  let destroyed = false;
  const req = { session: { userId: 1, mfaVerified: true, mfaEnrollmentId: 2, destroy(callback) { destroyed = true; callback(); } }, path: "/api/finance/invoices" };
  let status; const res = { status(code) { status = code; return this; }, json() {} };
  await requireMfaEnrollment(req, res, () => assert.fail("MFA bypass")); assert.equal(status, 401); assert.equal(destroyed, true);
  enrollment = { id: 3, status: "active" }; await requireMfaEnrollment(req, res, () => assert.fail("stale enrollment accepted"));
  enrollment = { id: 2, status: "active" }; let passed = false; await requireMfaEnrollment(req, res, () => { passed = true; }); assert.equal(passed, true);
});
test("one-time tickets and recovery codes reject concurrent second consumption", async (t) => {
  let used = false;
  const ticket = "random-ticket";
  t.mock.method(OtpChallenge, "findOne", async () => ({ id: 1, userId: 7, purpose: "passwordReset", consumedAt: new Date(), ticketHash: crypto.createHash("sha256").update(ticket).digest("hex"), ticketExpiresAt: new Date(Date.now() + 10000) }));
  t.mock.method(OtpChallenge, "update", async (_values, options) => { assert.equal(options.where.ticketUsedAt, null); if (used) return [0]; used = true; return [1]; });
  const results = await Promise.all([1, 2].map(() => consumeTicket({ reference: "ref", ticket, userId: 7, purpose: "passwordReset" })));
  assert.equal(results.filter(r => r.ok).length, 1);
  used = false;
  t.mock.method(MfaRecoveryCode, "findOne", async () => ({ id: 1 }));
  t.mock.method(MfaRecoveryCode, "update", async (_values, options) => { assert.equal(options.where.usedAt, null); if (used) return [0]; used = true; return [1]; });
  t.mock.method(MfaRecoveryCode, "count", async () => 0);
  const recovery = await Promise.all([1, 2].map(() => consumeRecoveryCode(7, "ABCD")));
  assert.equal(recovery.filter(r => r.ok).length, 1);
});
test("bid attachments remain sealed and immutable after submission", async (t) => {
  let bid = { vendorId: 2, financialSealed: true, submittedAt: new Date(), rfq: { status: "opened" } };
  t.mock.method(Bid, "findByPk", async () => bid);
  t.mock.method(Vendor, "findOne", async () => ({ id: 2 }));
  const reviewer = { permissions: new Set(["bidding.view", "bidding.evaluate"]), currentUser: { id: 1 } };
  assert.equal(Boolean((await accessFor(reviewer, "bid", 1)).read), false);
  const owner = { permissions: new Set(["bidding.submitBid"]), currentUser: { id: 2 } };
  const ownAccess = await accessFor(owner, "bid", 1); assert.equal(ownAccess.read, true); assert.equal(Boolean(ownAccess.write), false);
  bid = { ...bid, financialSealed: false, rfq: { status: "evaluated" } };
  assert.equal((await accessFor(reviewer, "bid", 1)).read, true);
});
test("vendors cannot report delivery against a competitor's contract", async (t) => {
  t.mock.method(Contract, "findByPk", async () => ({ id: 1, vendorId: 77, status: "active" }));
  t.mock.method(Vendor, "findOne", async () => ({ id: 2 }));
  let status; const res = { status(code) { status = code; return this; }, json() {} };
  await reportDelivery({ body: {}, params: { id: 1 }, currentUser: { id: 2 }, permissions: new Set(["delivery.submitInvoice"]) }, res);
  assert.equal(status, 403);
});
test("file signatures reject MIME spoofing and Office active content", () => {
  assert.ok(validateFileContent({ buffer: Buffer.from('<script>alert(1)</script>'), mimetype: "application/pdf" }));
  assert.ok(validateFileContent({ buffer: Buffer.from('PK'), mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  assert.equal(validateFileContent({ buffer: Buffer.from('%PDF-1.7\n'), mimetype: "application/pdf" }), null);
});
test("payment release rechecks status under a database lock", async (t) => {
  const transaction = { LOCK: { UPDATE: "UPDATE" } };
  const payment = { status: "prepared", preparedById: 9, grossAmount: 10,
    async reload(options) { assert.equal(options.transaction, transaction); assert.equal(options.lock, "UPDATE"); this.status = "released"; },
    async update() { assert.fail("A stale payment must never release again"); } };
  t.mock.method(Payment, "findByPk", async () => payment);
  t.mock.method(sequelize, "transaction", async (fn) => fn(transaction));
  await assert.rejects(releasePayment({ body: {}, params: { paymentId: 1 }, currentUser: { id: 3 } }, {}), { code: "WORKFLOW_CONFLICT" });
});
test("invoice return refuses a concurrently certified invoice", async (t) => {
  const transaction = { LOCK: { UPDATE: "UPDATE" } };
  const invoice = { status: "submitted", async reload(options) { assert.equal(options.lock, "UPDATE"); this.status = "certified"; }, async update() { assert.fail("Must not overwrite certification"); } };
  t.mock.method(Invoice, "findByPk", async () => invoice);
  t.mock.method(sequelize, "transaction", async fn => fn(transaction));
  await assert.rejects(certifyInvoice({ body: { decision: "return", remarks: "test" }, params: { id: 1 } }, {}), { code: "WORKFLOW_CONFLICT" });
});
test("password policy rejects bcrypt truncation including multibyte strings", () => {
  assert.ok(validatePassword("Short123")); assert.ok(validatePassword("a".repeat(72) + "1")); assert.ok(validatePassword("é".repeat(36) + "A1"));
  assert.equal(validatePassword("LongPassword123!"), null);
});
test("nested async routes forward errors without exposing database details", async () => {
  const app = express(); const root = express.Router(); const nested = express.Router();
  nested.get("/error", async () => { throw new Error("SELECT secret FROM private_table"); }); root.use("/nested", nested); wrapRouterStack(root); app.use(root); app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  try { const result = await fetch(`http://127.0.0.1:${server.address().port}/nested/error`); assert.equal(result.status, 500); assert.doesNotMatch(await result.text(), /SELECT|private_table|secret/); }
  finally { await new Promise(resolve => server.close(resolve)); }
});
