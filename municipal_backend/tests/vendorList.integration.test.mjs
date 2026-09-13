import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mysql from "mysql2/promise";

// The list endpoint is exercised against a unique, loopback-only scratch
// schema. It never connects to, syncs, seeds, or deletes the configured app
// database. The exact name guard also prevents a cleanup typo becoming broad.
const scratch = `impbbms_vendor_list_test_${crypto.randomBytes(8).toString("hex")}`;
process.env.DB_HOST = "127.0.0.1";
process.env.DB_PORT = "3306";
process.env.DB_NAME = scratch;
process.env.DB_USER = "root";
process.env.DB_PASSWORD = "";
process.env.NODE_ENV = "test";

const response = () => ({
  statusCode: 200,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test("vendor, invoice, message, official-document, award, and contract lists page, filter, and retain scoped operational data", { timeout: 60_000 }, async (t) => {
  const admin = await mysql.createConnection({ host: "127.0.0.1", port: 3306, user: "root", password: "" });
  assert.match(scratch, /^impbbms_vendor_list_test_[a-f0-9]{16}$/);
  await admin.query(`CREATE DATABASE \`${scratch}\``);

  let sequelize;
  t.after(async () => {
    if (sequelize) await sequelize.close();
    assert.match(scratch, /^impbbms_vendor_list_test_[a-f0-9]{16}$/);
    await admin.query(`DROP DATABASE \`${scratch}\``);
    await admin.end();
  });

  const models = await import("../models/index.js");
  sequelize = models.sequelize;
  const { Vendor, VendorDocument } = await import("../models/vendorModel.js");
  const { listVendors } = await import("../controllers/vendorController.js");
  const { Invoice, Payment } = await import("../models/paymentModel.js");
  const { listInvoices } = await import("../controllers/paymentController.js");
  const { PublicMessage } = await import("../models/publicMessageModel.js");
  const { listPublicMessages } = await import("../controllers/publicMessageController.js");
  const { GeneratedDocument } = await import("../models/generatedDocumentModel.js");
  const { listDocuments } = await import("../controllers/generatedDocumentController.js");
  const { Award } = await import("../models/biddingModel.js");
  const { listAwards } = await import("../controllers/biddingController.js");
  const { Contract } = await import("../models/contractModel.js");
  const { listContracts } = await import("../controllers/contractController.js");
  await sequelize.sync();

  const submitted = await Vendor.create({
    businessName: "Actionable Supplies",
    organizationType: "corporation",
    registrationStatus: "submitted",
    contactEmail: "actionable@example.test",
    contactPerson: "Action Officer",
    submittedAt: new Date("2026-01-03T00:00:00Z"),
  });
  await VendorDocument.create({ vendorId: submitted.id, docType: "philgeps", label: "PhilGEPS", status: "attached" });
  await Vendor.create({
    businessName: "Approved Without Account",
    organizationType: "cooperative",
    registrationStatus: "verified",
    contactEmail: "approved@example.test",
    submittedAt: new Date("2026-01-02T00:00:00Z"),
  });
  await Vendor.create({
    businessName: "Archived Partnership",
    organizationType: "partnership",
    registrationStatus: "returned",
    contactEmail: "returned@example.test",
    submittedAt: new Date("2026-01-01T00:00:00Z"),
  });

  const all = response();
  await listVendors({ query: { page: "1", pageSize: "2" } }, all);
  assert.equal(all.statusCode, 200);
  assert.equal(all.body.total, 3);
  assert.equal(all.body.rows.length, 2);
  assert.equal(all.body.page, 1);
  assert.equal(all.body.pageSize, 2);
  assert.equal(all.body.summary.pending, 1);
  assert.equal(all.body.summary.awaitingAccount, 1);
  assert.equal(all.body.rows[0].businessName, "Actionable Supplies");
  assert.equal(all.body.rows[0].documents.length, 1);

  const filtered = response();
  await listVendors(
    { query: { page: "1", pageSize: "25", registrationStatus: "verified", hasAccount: "false", organizationType: "cooperative" } },
    filtered
  );
  assert.equal(filtered.body.total, 1);
  assert.equal(filtered.body.rows[0].businessName, "Approved Without Account");
  assert.equal(filtered.body.rows[0].canCreateAccount, true);

  const legacy = response();
  await listVendors({ query: {} }, legacy);
  assert.ok(Array.isArray(legacy.body));
  assert.equal(legacy.body.length, 3);

  const unpaidInvoice = await Invoice.create({
    invoiceNo: "INV-TEST-001",
    amount: 1000,
    submittedAt: new Date("2026-01-03T00:00:00Z"),
    status: "submitted",
    vendorId: submitted.id,
  });
  const preparedInvoice = await Invoice.create({
    invoiceNo: "INV-TEST-002",
    amount: 2000,
    submittedAt: new Date("2026-01-04T00:00:00Z"),
    status: "certified",
    vendorId: submitted.id,
  });
  await Payment.create({
    invoiceId: preparedInvoice.id,
    disbursementNo: "DV-TEST-001",
    grossAmount: 2000,
    amount: 2000,
    status: "prepared",
  });

  const invoices = response();
  await listInvoices(
    { query: { page: "1", pageSize: "25", paymentStatus: "prepared", search: "TEST-002" }, permissions: new Set(["payment.view"]), currentUser: {} },
    invoices
  );
  assert.equal(invoices.body.total, 1);
  assert.equal(invoices.body.rows[0].id, preparedInvoice.id);
  assert.equal(invoices.body.rows[0].payment.status, "prepared");

  const withoutVoucher = response();
  await listInvoices(
    { query: { page: "1", pageSize: "25", paymentStatus: "none" }, permissions: new Set(["payment.view"]), currentUser: {} },
    withoutVoucher
  );
  assert.equal(withoutVoucher.body.total, 1);
  assert.equal(withoutVoucher.body.rows[0].id, unpaidInvoice.id);

  await PublicMessage.create({
    category: "projectEnquiry",
    routedToPermission: "bidding.publish",
    subject: "Question about an advertised project",
    body: "Please clarify the advertised procurement project schedule.",
    status: "new",
  });
  await PublicMessage.create({
    category: "siteProblem",
    routedToPermission: "settings.manage",
    subject: "Unrelated system issue",
    body: "This message must not be visible to a BAC Secretariat reader.",
    status: "new",
  });
  const messages = response();
  await listPublicMessages(
    { query: { page: "1", pageSize: "25", status: "new", search: "advertised" }, permissions: new Set(["bidding.publish"]) },
    messages
  );
  assert.equal(messages.body.total, 1);
  assert.equal(messages.body.rows[0].subject, "Question about an advertised project");
  assert.equal(messages.body.summary.unread, 1);

  await GeneratedDocument.create({
    documentNo: "NOA-TEST-001",
    documentType: "noticeOfAward",
    title: "Notice of award for office supplies",
    entityRef: "award",
    entityId: 1,
    renderedHtml: "<html><body>Award</body></html>",
    status: "approved",
  });
  await GeneratedDocument.create({
    documentNo: "PR-TEST-001",
    documentType: "purchaseRequest",
    title: "Purchase request for toner",
    entityRef: "pr",
    entityId: 2,
    renderedHtml: "<html><body>Request</body></html>",
    status: "draft",
  });

  const documents = response();
  await listDocuments(
    { query: { page: "1", pageSize: "1", status: "approved", search: "award", sort: "documentNo:asc" } },
    documents
  );
  assert.equal(documents.body.total, 1);
  assert.equal(documents.body.rows.length, 1);
  assert.equal(documents.body.rows[0].documentNo, "NOA-TEST-001");
  assert.equal(documents.body.rows[0].renderedHtml, undefined);

  const legacyDocuments = response();
  await listDocuments({ query: {} }, legacyDocuments);
  assert.ok(Array.isArray(legacyDocuments.body));
  assert.equal(legacyDocuments.body.length, 2);

  await Award.create({
    noaNumber: "NOA-TEST-001",
    noaDate: "2026-01-05",
    amount: 2000,
    status: "pendingHopeApproval",
    vendorId: submitted.id,
  });
  const awards = response();
  await listAwards(
    { query: { page: "1", pageSize: "25", status: "pendingHopeApproval", search: "Actionable" }, permissions: new Set(["bidding.view"]) },
    awards
  );
  assert.equal(awards.body.total, 1);
  assert.equal(awards.body.rows[0].noaNumber, "NOA-TEST-001");
  assert.equal(awards.body.rows[0].vendorName, "Actionable Supplies");

  const restrictedAwards = response();
  await listAwards(
    { query: { page: "1", pageSize: "25", status: "pendingHopeApproval" }, permissions: new Set(["bidding.viewPublished"]) },
    restrictedAwards
  );
  assert.equal(restrictedAwards.body.total, 0);

  const legacyAwards = response();
  await listAwards({ query: {}, permissions: new Set(["bidding.view"]) }, legacyAwards);
  assert.ok(Array.isArray(legacyAwards.body));
  assert.equal(legacyAwards.body.length, 1);

  await Contract.create({
    contractNo: "CT-TEST-001",
    amount: 2000,
    status: "active",
    vendorId: submitted.id,
    signedByLguAt: new Date("2026-01-06T00:00:00Z"),
  });
  await Contract.create({
    contractNo: "CT-TEST-002",
    amount: 1000,
    status: "draft",
    vendorId: submitted.id,
  });
  const contracts = response();
  await listContracts(
    { query: { page: "1", pageSize: "25", signatures: "lgu", search: "CT-TEST" }, permissions: new Set(["contract.view"]), currentUser: {} },
    contracts
  );
  assert.equal(contracts.body.total, 1);
  assert.equal(contracts.body.rows[0].contractNo, "CT-TEST-001");

  const publishedContracts = response();
  await listContracts(
    { query: { page: "1", pageSize: "25", status: "draft" }, permissions: new Set(["contract.viewPublished"]), currentUser: {} },
    publishedContracts
  );
  assert.equal(publishedContracts.body.total, 1);
  assert.equal(publishedContracts.body.rows[0].contractNo, "CT-TEST-001");
});
