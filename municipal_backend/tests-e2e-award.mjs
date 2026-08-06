// Second conformance harness: the award and contract path.
// LCRB enforcement, protest blocking award, performance security, NTP.
import { execFileSync } from "node:child_process";

const BASE = "http://localhost:3100/api";
const MYSQL = "C:/laragon/bin/mysql/mysql-8.4.3-winx64/bin/mysql.exe";

const sql = (statement) =>
  // Follows DB_NAME so the harness runs against whatever throwaway database the
  // backend under test was started with, rather than a name hardcoded here.
  execFileSync(MYSQL, ["-u", "root", "-D", process.env.DB_NAME ?? "impbbms_scratch", "-N", "-e", statement], {
    encoding: "utf8",
  }).trim();

let passed = 0;
let failed = 0;
const failures = [];
const check = (name, condition, detail = "") => {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(`${name} â€” ${detail}`);
    console.log(`  FAIL  ${name} ${detail}`);
  }
};

const jars = {};
const req = async (who, method, path, body) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(jars[who] ? { Cookie: jars[who] } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const sc = res.headers.getSetCookie?.() ?? [];
  if (sc.length) jars[who] = sc.map((c) => c.split(";")[0]).join("; ");
  let json = null;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, body: json };
};
const login = async (who, email) => {
  const r = await req(who, "POST", "/auth/login", { email, password: "Passw0rd!" });
  if (r.status !== 200) throw new Error(`login ${email}: ${JSON.stringify(r.body)}`);
};
const section = (t) => console.log(`\n=== ${t} ===`);

const run = async () => {
  for (const [who, email] of [
    ["dr", "departmentrequester@civicbid.com"],
    ["sec", "bacsecretariat@civicbid.com"],
    ["bo", "budgetofficer@civicbid.com"],
    ["hope", "hope@civicbid.com"],
    ["acct", "municipalaccountant@civicbid.com"],
    ["treas", "municipaltreasurer@civicbid.com"],
    ["chair", "bacchairperson@civicbid.com"],
    ["vendor", "vendor@civicbid.com"],
  ]) await login(who, email);

  // The endorsing head must not be the requester.
  sql("UPDATE Departments SET headUserId=(SELECT id FROM Users WHERE email='budgetofficer@civicbid.com') WHERE code='ENGR';");

  section("Build a final APP line and an approved requisition");

  const app = await req("dr", "POST", "/app-entries", {
    projectTitle: "Barangay road concreting",
    abc: 4000000,
    targetStartQuarter: "Q1",
    targetCompletionQuarter: "Q3",
    appropriationId: 1,
    aipEntryId: 1,
    fiscalYear: 2026,
    procurementMode: "competitiveBidding",
  });
  check("final APP line created", app.status === 201, JSON.stringify(app.body).slice(0, 180));
  const appId = app.body?.id;

  for (const [who, action] of [["dr", "submit"], ["sec", "consolidate"], ["bo", "certify"], ["hope", "approve"]]) {
    const t = await req(who, "POST", `/app-entries/${appId}/transition`, { action });
    if (t.status !== 200) console.log(`     (app ${action} -> ${t.status} ${JSON.stringify(t.body).slice(0, 120)})`);
  }

  const pr = await req("dr", "POST", "/purchase-requisitions", {
    appEntryId: appId,
    purpose: "Concreting materials",
    dateRequired: "2026-12-01",
    lineItems: [{ description: "Ready-mix concrete", unit: "cu.m", quantity: 800, unitCost: 5000, hasUsefulLifeOverOneYear: false }],
  });
  check("requisition created at â‚±4,000,000", pr.status === 201 && pr.body.totalAmount === 4000000,
    JSON.stringify(pr.body).slice(0, 180));
  const prId = pr.body?.id;

  for (const [who, action] of [["dr", "submit"], ["bo", "endorse"], ["treas", "certifyCash"], ["hope", "approve"], ["bo", "certify"], ["acct", "obligate"]]) {
    const t = await req(who, "POST", `/purchase-requisitions/${prId}/transition`, { action });
    if (t.status !== 200) console.log(`     (pr ${action} -> ${t.status} ${JSON.stringify(t.body).slice(0, 140)})`);
  }
  const mode = await req("chair", "POST", `/purchase-requisitions/${prId}/transition`, { action: "determineMode", procurementModeKey: "competitiveBidding" });
  check("requisition approved after 5 separate signatures", mode.body?.status === "approved",
    JSON.stringify(mode.body).slice(0, 160));

  section("IRR Sec. 51.1 â€” mandatory pre-bid conference at ABC â‰¥ â‚±3M");

  const rfq = await req("sec", "POST", "/bidding/rfqs", {
    prHeaderId: prId,
    title: "Barangay road concreting",
    category: "infrastructure",
    closingDate: new Date(Date.now() + 10 * 864e5).toISOString(),
  });
  const rfqId = rfq.body?.id;
  check("pre-bid marked mandatory at â‚±4M", rfq.body?.prebidRequired === true, JSON.stringify(rfq.body).slice(0, 160));

  const pubNoPrebid = await req("sec", "POST", `/bidding/rfqs/${rfqId}/publish`, {});
  check("publish refused with no pre-bid scheduled", pubNoPrebid.status === 409,
    JSON.stringify(pubNoPrebid.body).slice(0, 160));

  sql(`UPDATE Rfqs SET prebidAt = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 3 DAY) WHERE id=${rfqId};`);
  const pub = await req("sec", "POST", `/bidding/rfqs/${rfqId}/publish`, { philgepsReference: "PHILGEPS-2026-004411" });
  check("publish succeeds once the pre-bid is scheduled", pub.status === 200, JSON.stringify(pub.body).slice(0, 160));
  const posted = sql(`SELECT philgepsReference FROM Rfqs WHERE id=${rfqId};`);
  check("PhilGEPS posting reference recorded", posted === "PHILGEPS-2026-004411", posted);

  section("Bidding closes only at the advertised deadline");

  const earlyClose = await req("sec", "POST", `/bidding/rfqs/${rfqId}/close`, {});
  check("early close refused", earlyClose.status === 409, JSON.stringify(earlyClose.body).slice(0, 140));

  // Simulate the deadline passing.
  sql(`UPDATE Rfqs SET closingDate = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR) WHERE id=${rfqId};`);

  // Three bids, inserted directly: this harness exercises the award rules, not
  // the OTP-gated submission path.
  const vendorId = sql("SELECT id FROM Vendors LIMIT 1;");
  sql(`INSERT INTO Vendors (businessName,registrationStatus,createdAt,updatedAt) VALUES
      ('Rivera Construction Corp','verified',NOW(),NOW()),
      ('Sunrise Builders Inc','verified',NOW(),NOW());`);
  const v2 = sql("SELECT id FROM Vendors WHERE businessName='Rivera Construction Corp';");
  const v3 = sql("SELECT id FROM Vendors WHERE businessName='Sunrise Builders Inc';");

  sql(`INSERT INTO Bids (rfqId,vendorId,technicalSubmitted,financialSealed,totalBidPrice,submittedAt,status,createdAt,updatedAt) VALUES
      (${rfqId},${vendorId},1,1,3200000,NOW(),'submitted',NOW(),NOW()),
      (${rfqId},${v2},1,1,3900000,NOW(),'submitted',NOW(),NOW()),
      (${rfqId},${v3},1,1,3550000,NOW(),'submitted',NOW(),NOW());`);

  await req("sec", "POST", `/bidding/rfqs/${rfqId}/close`, {});
  const open = await req("sec", "POST", `/bidding/rfqs/${rfqId}/open`, { witnesses: "BAC, COA, observers" });
  check("bids opened", open.status === 200 && open.body.bidsReceived === 3, JSON.stringify(open.body).slice(0, 140));

  section("RA 12009 Sec. 65 â€” the award must go to the LCRB");

  const bids = await req("chair", "GET", `/bidding/rfqs/${rfqId}/bids`);
  const ids = {};
  for (const row of sql(`SELECT id,totalBidPrice FROM Bids WHERE rfqId=${rfqId} ORDER BY totalBidPrice;`).split("\n")) {
    const [id, price] = row.split("\t");
    ids[Number(price)] = Number(id);
  }
  const lowest = ids[3200000];
  const highest = ids[3900000];

  // Infrastructure is rated PASS/FAIL on the technical requirements, not scored.
  // RA 12009 Sec. 65 then awards to the lowest calculated responsive bid.
  const rubricAttempt = await req("chair", "POST", `/bidding/bids/${lowest}/evaluations`, {
    noConflictDeclared: true,
    criteriaBreakdown: { compliance: 70, capacity: 70 },
  });
  check("a rubric score is refused on an infrastructure bid", rubricAttempt.status === 400,
    JSON.stringify(rubricAttempt.body?.message ?? "").slice(0, 180));

  const noDeclaration = await req("chair", "POST", `/bidding/bids/${lowest}/evaluations`, {
    verdict: "passed",
  });
  check("scoring without a conflict-of-interest declaration is refused",
    noDeclaration.status === 400, `got ${noDeclaration.status}`);

  for (const bidId of [lowest, ids[3550000], highest]) {
    const e = await req("chair", "POST", `/bidding/bids/${bidId}/evaluations`, {
      verdict: "passed",
      noConflictDeclared: true,
    });
    if (e.status !== 201) console.log(`     (evaluation ${bidId} -> ${e.status} ${JSON.stringify(e.body).slice(0,120)})`);
  }

  const closeEval = await req("chair", "POST", `/bidding/rfqs/${rfqId}/close-evaluation`, {});
  check("evaluation closed", closeEval.status === 200, JSON.stringify(closeEval.body).slice(0, 140));

  // Post-qualify the highest-scoring (most expensive) bid.
  const pqHigh = await req("chair", "POST", `/bidding/bids/${highest}/post-qualification`, { result: "passed" });
  check("most expensive bid post-qualified", pqHigh.status === 201, JSON.stringify(pqHigh.body).slice(0, 140));

  const wrongAward = await req("chair", "POST", `/bidding/bids/${highest}/recommend-award`, {});
  check("award to the highest-scoring but most expensive bid is REFUSED on LCRB grounds",
    wrongAward.status === 409 && wrongAward.body?.basis === "LCRB",
    JSON.stringify(wrongAward.body?.message ?? wrongAward.body).slice(0, 220));
  check("refusal names the entitled bidder and its price",
    wrongAward.body?.entitled?.totalBidPrice === 3200000,
    JSON.stringify(wrongAward.body?.entitled ?? {}));

  const pqLow = await req("chair", "POST", `/bidding/bids/${lowest}/post-qualification`, { result: "passed" });
  check("lowest bid post-qualified", pqLow.status === 201, JSON.stringify(pqLow.body).slice(0, 140));

  section("Sec. 84 â€” protests must be resolved before any award");

  const recon = await req("vendor", "POST", `/protests/rfqs/${rfqId}/reconsideration`, {
    challengedDecision: "Bid evaluation result",
    notifiedAt: new Date().toISOString(),
    grounds: "The technical rating did not account for the submitted equipment schedule.",
  });
  check("bidder files a request for reconsideration", recon.status === 201, JSON.stringify(recon.body).slice(0, 140));

  const blockedAward = await req("chair", "POST", `/bidding/bids/${lowest}/recommend-award`, {});
  check("award recommendation blocked by the live protest", blockedAward.status === 409,
    JSON.stringify(blockedAward.body?.message ?? "").slice(0, 180));

  await req("chair", "POST", `/protests/${recon.body.id}/resolve`, {
    outcome: "denied",
    decision: "The equipment schedule was rated under criterion 2 as recorded in the abstract. Denied for lack of merit.",
  });

  const award = await req("chair", "POST", `/bidding/bids/${lowest}/recommend-award`, {});
  check("award to the LCRB succeeds once the protest is resolved", award.status === 201,
    JSON.stringify(award.body?.message ?? award.body).slice(0, 180));
  check("award basis recorded as LCRB", sql(`SELECT awardBasis FROM Awards WHERE id=${award.body?.id};`) === "LCRB");
  check("BAC resolution records quorum", award.body?.resolution?.quorumMet === true,
    JSON.stringify(award.body?.resolution ?? {}));
  const awardId = award.body?.id;

  section("Sec. 66 â€” HoPE may disapprove on written grounds");

  const bareDisapproval = await req("hope", "POST", `/bidding/awards/${awardId}/disapprove`, { grounds: "No." });
  check("disapproval without written grounds is refused", bareDisapproval.status === 400,
    `got ${bareDisapproval.status}`);

  const approve = await req("hope", "POST", `/bidding/awards/${awardId}/approve`, {});
  check("HoPE approves the award", approve.status === 200, JSON.stringify(approve.body).slice(0, 140));

  section("Sec. 68 â€” performance security before signing; then the NTP");

  const noDays = await req("sec", "POST", "/contracts", { awardId });
  check("contract without a contract period is refused", noDays.status === 400,
    JSON.stringify(noDays.body?.message ?? "").slice(0, 140));

  const contract = await req("sec", "POST", "/contracts", {
    awardId, contractDays: 120, deliveryDeadline: "2026-12-31",
  });
  check("contract created with a 120-day period", contract.status === 201, JSON.stringify(contract.body).slice(0, 160));
  const contractId = contract.body?.id;
  check("performance security amount quoted at drafting",
    contract.body?.performanceSecurity?.amountBySuretyBond === 960000,
    JSON.stringify(contract.body?.performanceSecurity ?? {}));

  await req("sec", "POST", `/contracts/${contractId}/issue`, {});

  const signNoSecurity = await req("hope", "POST", `/contracts/${contractId}/sign`, {});
  check("signing refused with no performance security posted", signNoSecurity.status === 409,
    JSON.stringify(signNoSecurity.body?.message ?? "").slice(0, 180));

  const shortSecurity = await req("sec", "POST", `/contracts/${contractId}/performance-security`, {
    form: "suretyBond", amount: 100000, referenceNo: "SB-001",
  });
  check("under-value performance security is refused (Sec. 68.4)", shortSecurity.status === 400,
    JSON.stringify(shortSecurity.body?.message ?? "").slice(0, 180));

  const security = await req("sec", "POST", `/contracts/${contractId}/performance-security`, {
    form: "suretyBond", referenceNo: "SB-2026-0091", issuer: "Philippine Surety Co.",
  });
  check("correct performance security accepted (30% of â‚±3.2M = â‚±960,000)",
    security.status === 201 && security.body.amount === 960000, JSON.stringify(security.body).slice(0, 160));

  const lguSign = await req("hope", "POST", `/contracts/${contractId}/sign`, {});
  check("LGU signs once security is posted", lguSign.status === 200, JSON.stringify(lguSign.body?.message ?? "").slice(0, 140));

  const ntpTooEarly = await req("hope", "POST", `/contracts/${contractId}/notice-to-proceed`, {});
  check("NTP refused before the contract is in force", ntpTooEarly.status === 409,
    JSON.stringify(ntpTooEarly.body?.message ?? "").slice(0, 160));

  const vendorSign = await req("vendor", "POST", `/contracts/${contractId}/sign`, {});
  check("supplier countersigns and the contract becomes active",
    vendorSign.body?.status === "active", JSON.stringify(vendorSign.body?.status ?? vendorSign.body).slice(0, 140));

  const deliveryBeforeNtp = await req("vendor", "POST", `/contracts/${contractId}/deliveries`, { description: "First pour" });
  check("delivery refused before a Notice to Proceed", deliveryBeforeNtp.status === 409,
    JSON.stringify(deliveryBeforeNtp.body?.message ?? "").slice(0, 160));

  const ntp = await req("hope", "POST", `/contracts/${contractId}/notice-to-proceed`, {});
  check("NTP issued and contract time starts", ntp.status === 200 && ntp.body.contractDays === 120,
    JSON.stringify(ntp.body).slice(0, 180));

  const delivery = await req("vendor", "POST", `/contracts/${contractId}/deliveries`, { description: "First pour" });
  check("delivery accepted after the NTP", delivery.status === 201, JSON.stringify(delivery.body).slice(0, 140));

  console.log(`\n${"=".repeat(60)}`);
  console.log(`PASSED ${passed}   FAILED ${failed}`);
  if (failures.length) { console.log("\nFailures:"); failures.forEach((f) => console.log("  - " + f)); }
  process.exit(failed > 0 ? 1 : 0);
};

run().catch((e) => { console.error("HARNESS ERROR:", e); process.exit(2); });

