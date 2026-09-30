import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mysql from "mysql2/promise";

test("invoice corrections and payments preserve ownership, state, amounts and atomic audit history", {
  skip: process.env.RUN_PROCUREMENT_DB_TESTS !== "1", timeout: 180000,
}, async (t) => {
  const scratch = `impbbms_payment_records_${crypto.randomBytes(8).toString("hex")}`;
  const port = Number(process.env.PROCUREMENT_TEST_DB_PORT ?? 33317);
  Object.assign(process.env, { DB_HOST: "127.0.0.1", DB_PORT: String(port), DB_NAME: scratch,
    DB_USER: "root", DB_PASSWORD: "", NODE_ENV: "test" });
  const admin = await mysql.createConnection({ host: "127.0.0.1", port, user: "root", password: "" });
  assert.match(scratch, /^impbbms_payment_records_[a-f0-9]{16}$/);
  await admin.query(`CREATE DATABASE \`${scratch}\``);
  let db;
  t.after(async () => {
    await db?.close();
    assert.match(scratch, /^impbbms_payment_records_[a-f0-9]{16}$/);
    await admin.query(`DROP DATABASE \`${scratch}\``);
    await admin.end();
  });
  const m = await import("../models/index.js");
  db = m.sequelize;
  await db.sync();
  const api = await import("../controllers/paymentController.js");
  const { verifyChain, AUDIT_ACTIONS } = await import("../services/auditLog.js");
  const roles = {};
  const makeActor = async (name, key) => {
    const role = roles[key] ??= await m.Role.create({ key, name: key });
    const actor = await m.User.create({ name, email: `${name}@example.test`, password: "ExamplePassword123!",
      roleId: role.id, status: "active" });
    actor.Role = role;
    return actor;
  };
  const supplier = await makeActor("supplier", "supplier");
  const unrelated = await makeActor("unrelated", "supplier");
  const accountant = await makeActor("accountant", "municipalAccountant");
  const treasurer = await makeActor("treasurer", "municipalTreasurer");
  const vendor = await m.Vendor.create({ businessName: "Invoice supplier", userId: supplier.id,
    registrationStatus: "verified", isVatRegistered: true, taxClassification: "goods" });
  await m.Vendor.create({ businessName: "Unrelated supplier", userId: unrelated.id, registrationStatus: "verified" });
  let serial = 0;
  const makeContract = (amount = 1000, category = "goods") => m.Contract.create({
    contractNo: `CON-PAYMENT-TEST-${++serial}`, amount, vendorId: vendor.id, status: "active", category,
  });
  const makeClaim = async ({ contract, amount = 500, status = "returned", acceptedValue = amount,
    deliveryStatus = "accepted" } = {}) => {
    contract ??= await makeContract();
    const delivery = await m.Delivery.create({ contractId: contract.id, acceptedValue, status: deliveryStatus });
    const invoice = await m.Invoice.create({ invoiceNo: `INV-PAYMENT-TEST-${++serial}`, amount, status,
      submittedAt: new Date("2026-01-01T00:00:00Z"), supplierInvoiceRef: "OLD-SUPPLIER-REF",
      remarks: status === "returned" ? "Correct the claim reference and amount." : null,
      contractId: contract.id, deliveryId: delivery.id, vendorId: vendor.id });
    return { contract, delivery, invoice };
  };
  const call = async (handler, actor, params, body) => {
    let status = 200, output;
    await handler({ currentUser: actor, params, body, query: {}, ip: "127.0.0.1" }, {
      status(code) { status = code; return this; },
      json(value) { output = value; return this; },
    });
    if (status >= 400) throw Object.assign(new Error(output?.message ?? "Request rejected"), { status });
    return output;
  };
  const resubmit = (invoice, amount, actor = supplier) => call(api.resubmitInvoice, actor, { id: invoice.id },
    { amount, supplierInvoiceRef: "CORRECTED-SUPPLIER-REF" });
  const certify = (invoice) => call(api.certifyInvoice, accountant, { id: invoice.id }, { decision: "certify" });
  const release = (payment, actor = treasurer) => call(api.releasePayment, actor, { paymentId: payment.id },
    { method: "bankTransfer", reference: "TREASURY-REFERENCE" });
  const rejectAudit = async (work) => {
    m.AuditLog.addHook("beforeCreate", "paymentRecordsAuditFailure", () => { throw new Error("audit storage unavailable"); });
    try { await assert.rejects(work, /audit storage unavailable/); }
    finally { m.AuditLog.removeHook("beforeCreate", "paymentRecordsAuditFailure"); }
  };

  await t.test("only the supplier owning a returned claim can correct it", async () => {
    const { invoice } = await makeClaim();
    await assert.rejects(resubmit(invoice, 500, unrelated), (error) => error.status === 403);
    await assert.rejects(resubmit(invoice, 500, accountant), (error) => error.status === 403);
    const beforeCount = await m.Invoice.count();
    const corrected = await resubmit(invoice, 500);
    assert.equal(corrected.id, invoice.id);
    assert.equal(corrected.status, "submitted");
    assert.equal(corrected.supplierInvoiceRef, "CORRECTED-SUPPLIER-REF");
    assert.equal(corrected.remarks, null);
    assert.equal(await m.Invoice.count(), beforeCount);
    await assert.rejects(resubmit(invoice, 500), (error) => error.code === "WORKFLOW_CONFLICT");
    const audit = await m.AuditLog.findOne({ where: { actionType: "invoice.resubmitted", entityId: invoice.id } });
    assert.equal(audit.beforeState.status, "returned");
    assert.equal(audit.beforeState.supplierInvoiceRef, "OLD-SUPPLIER-REF");
    assert.equal(audit.beforeState.remarks, "Correct the claim reference and amount.");
    assert.equal(audit.afterState.status, "submitted");
    assert.equal(audit.afterState.supplierInvoiceRef, "CORRECTED-SUPPLIER-REF");
    assert.equal(audit.actorId, supplier.id);
    assert.equal(audit.actorRole, "supplier");
    assert.ok(audit.recordedAt);
  });

  await t.test("corrected totals exclude their previous amount while retaining delivery and contract ceilings", async () => {
    const contract = await makeContract(1000);
    const { invoice } = await makeClaim({ contract, amount: 800, acceptedValue: 1000 });
    await makeClaim({ contract, amount: 100, status: "submitted" });
    const corrected = await resubmit(invoice, 900);
    assert.equal(corrected.amount, 900);
    const constrained = await makeClaim({ amount: 300, acceptedValue: 400 });
    await assert.rejects(resubmit(constrained.invoice, 401), /value accepted/);
    await assert.rejects(resubmit(constrained.invoice, 0), /positive invoice amount/);
    const full = await makeContract(1000);
    const claim = await makeClaim({ contract: full, amount: 500, acceptedValue: 1000 });
    await makeClaim({ contract: full, amount: 400, status: "returned" });
    await assert.rejects(resubmit(claim.invoice, 601), /remaining contract amount/);
    assert.equal((await claim.invoice.reload()).status, "returned");
    assert.equal(Number(claim.invoice.amount), 500);
    await claim.delivery.update({ status: "rejected" });
    await assert.rejects(resubmit(claim.invoice, 500), /accepted delivery/);
  });

  await t.test("audit failures roll back invoice corrections and returned decisions", async () => {
    const { invoice } = await makeClaim({ amount: 500, acceptedValue: 1000 });
    const before = (await invoice.reload()).get({ plain: true });
    await rejectAudit(() => resubmit(invoice, 600));
    assert.deepEqual((await invoice.reload()).get({ plain: true }), before);
    assert.equal(await m.AuditLog.count({ where: { actionType: "invoice.resubmitted", entityId: invoice.id } }), 0);
    const submitted = await makeClaim({ status: "submitted" });
    await rejectAudit(() => call(api.certifyInvoice, accountant, { id: submitted.invoice.id },
      { decision: "return", remarks: "Please correct the reference." }));
    assert.equal((await submitted.invoice.reload()).status, "submitted");
    assert.equal(await m.Payment.count({ where: { invoiceId: submitted.invoice.id } }), 0);
  });

  await t.test("simultaneous supplier corrections produce one resubmission", async () => {
    const { invoice } = await makeClaim();
    const results = await Promise.allSettled([resubmit(invoice, 500), resubmit(invoice, 500)]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(await m.AuditLog.count({ where: { actionType: "invoice.resubmitted", entityId: invoice.id } }), 1);
  });

  await t.test("simultaneous certification creates one voucher and preserves both financial audit records", async () => {
    const { invoice } = await makeClaim({ status: "submitted" });
    const results = await Promise.allSettled([certify(invoice), certify(invoice)]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal((await invoice.reload()).status, "certified");
    assert.equal(await m.Payment.count({ where: { invoiceId: invoice.id } }), 1);
    const payment = await m.Payment.findOne({ where: { invoiceId: invoice.id } });
    const invoiceAudit = await m.AuditLog.findOne({ where: { actionType: AUDIT_ACTIONS.INVOICE_CERTIFIED, entityId: invoice.id } });
    const voucherAudit = await m.AuditLog.findOne({ where: { actionType: "payment.prepared", entityId: payment.id } });
    assert.equal(invoiceAudit.beforeState.status, "submitted");
    assert.equal(invoiceAudit.afterState.status, "certified");
    assert.equal(voucherAudit.actorId, accountant.id);
    assert.equal(Number(voucherAudit.afterState.grossAmount), 500);
    assert.equal(voucherAudit.afterState.status, "prepared");
    assert.ok(Number(payment.amount) < Number(payment.grossAmount));
  });

  await t.test("failed certification audits leave no voucher or certified invoice", async () => {
    const { invoice } = await makeClaim({ status: "submitted" });
    await rejectAudit(() => certify(invoice));
    assert.equal((await invoice.reload()).status, "submitted");
    assert.equal(await m.Payment.count({ where: { invoiceId: invoice.id } }), 0);
    assert.equal(await m.AuditLog.count({ where: { actionType: AUDIT_ACTIONS.INVOICE_CERTIFIED, entityId: invoice.id } }), 0);
  });

  await t.test("separate officers release a voucher once and audit gross, net and all deductions", async () => {
    const contract = await makeContract(1000, "infrastructure");
    const { invoice } = await makeClaim({ contract, amount: 1000, status: "submitted" });
    await certify(invoice);
    const payment = await m.Payment.findOne({ where: { invoiceId: invoice.id } });
    await assert.rejects(release(payment, accountant), (error) => error.status === 403);
    const results = await Promise.allSettled([release(payment), release(payment)]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal((await invoice.reload()).status, "paid");
    assert.equal((await payment.reload()).status, "released");
    await contract.reload();
    assert.equal(Number(contract.amountPaid), 1000);
    assert.equal(Number(contract.retentionHeld), Number(payment.retentionAmount));
    assert.equal(contract.status, "completed");
    assert.equal(await m.AuditLog.count({ where: { actionType: AUDIT_ACTIONS.PAYMENT_RELEASED, entityId: payment.id } }), 1);
    const audit = await m.AuditLog.findOne({ where: { actionType: AUDIT_ACTIONS.PAYMENT_RELEASED, entityId: payment.id } });
    assert.equal(audit.beforeState.status, "prepared");
    assert.equal(audit.afterState.status, "released");
    assert.equal(audit.actorId, treasurer.id);
    assert.equal(audit.afterState.gross, 1000);
    assert.equal(audit.afterState.netReleased, Number(payment.amount));
    assert.equal(audit.afterState.ewt, Number(payment.ewtAmount));
    assert.equal(audit.afterState.vatWithheld, Number(payment.vatWithheldAmount));
    assert.equal(audit.afterState.retention, Number(payment.retentionAmount));
    assert.equal(audit.afterState.liquidatedDamages, Number(payment.liquidatedDamages));
    assert.equal(audit.afterState.contractOutstanding, 0);
  });

  await t.test("a failed release audit rolls back the voucher, invoice and contract together", async () => {
    const { invoice, contract } = await makeClaim({ status: "submitted" });
    await certify(invoice);
    const payment = await m.Payment.findOne({ where: { invoiceId: invoice.id } });
    await rejectAudit(() => release(payment));
    assert.equal((await payment.reload()).status, "prepared");
    assert.equal(payment.releasedAt, null);
    assert.equal((await invoice.reload()).status, "certified");
    await contract.reload();
    assert.equal(Number(contract.amountPaid), 0);
    assert.equal(Number(contract.retentionHeld), 0);
    assert.equal(contract.status, "active");
    assert.equal(await m.AuditLog.count({ where: { actionType: AUDIT_ACTIONS.PAYMENT_RELEASED, entityId: payment.id } }), 0);
  });

  assert.equal((await verifyChain({})).intact, true);
});
