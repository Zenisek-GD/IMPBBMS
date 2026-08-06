// End-to-end conformance harness for the RA 12009 features added on the
// hardening-and-conformance branch. Runs against DB_NAME=impbbms_audit on :3100.
const BASE = "http://localhost:3100/api";

let passed = 0;
let failed = 0;
const failures = [];

const check = (name, condition, detail = "") => {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(`${name} ${detail}`);
    console.log(`  FAIL  ${name} ${detail}`);
  }
};

const jars = {};

const req = async (who, method, path, body) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(jars[who] ? { Cookie: jars[who] } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) jars[who] = setCookie.map((c) => c.split(";")[0]).join("; ");
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
};

const login = async (who, email) => {
  const res = await req(who, "POST", "/auth/login", { email, password: "Passw0rd!" });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(res.body)}`);
  return res.body;
};

const section = (title) => console.log(`\n=== ${title} ===`);

const run = async () => {
  // â”€â”€ Sign in every actor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await login("dr", "departmentrequester@civicbid.com");
  await login("sec", "bacsecretariat@civicbid.com");
  await login("bo", "budgetofficer@civicbid.com");
  await login("hope", "hope@civicbid.com");
  await login("acct", "municipalaccountant@civicbid.com");
  await login("treas", "municipaltreasurer@civicbid.com");
  await login("chair", "bacchairperson@civicbid.com");
  await login("vice", "bacvicechairperson@civicbid.com");
  await login("member", "bacmember@civicbid.com");
  await login("obs", "observer@civicbid.com");
  await login("vendor", "vendor@civicbid.com");

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  section("LGC Sec. 323 â€” reenacted budget");

  // Nothing enacted for 2027, and 2026 has enacted PS/MOOE lines seeded by SQL.
  const reenact = await req("bo", "POST", "/finance/appropriations/reenact", { fiscalYear: 2027 });
  check("reenacts prior year", reenact.status === 201, JSON.stringify(reenact.body).slice(0, 160));
  if (reenact.status === 201) {
    check(
      "capital outlay is NOT carried over",
      reenact.body.notice?.includes("Capital Outlay was not reenacted"),
      reenact.body.notice ?? ""
    );
  }
  const reenactAgain = await req("bo", "POST", "/finance/appropriations/reenact", { fiscalYear: 2027 });
  check("refuses a second reenactment", reenactAgain.status === 409, `got ${reenactAgain.status}`);

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  section("IRR Sec. 7.7 â€” indicative APP cycle");

  const indicative = await req("dr", "POST", "/app-entries", {
    projectTitle: "Ambulance procurement (EPA)",
    abc: 2500000,
    targetStartQuarter: "Q1",
    targetCompletionQuarter: "Q2",
    aipEntryId: 1,
    fiscalYear: 2026,
    planCycle: "indicative",
    earlyProcurement: true,
    procurementMode: "competitiveBidding",
  });
  check("indicative line created without an appropriation", indicative.status === 201,
    JSON.stringify(indicative.body).slice(0, 200));
  const indicativeId = indicative.body?.id;
  if (indicativeId) {
    check("cycle is indicative", indicative.body.planCycle === "indicative");
    check("EPA flag carried", indicative.body.earlyProcurement === true);
  }

  const badIndicative = await req("dr", "POST", "/app-entries", {
    projectTitle: "Bad indicative",
    abc: 100000,
    targetStartQuarter: "Q1",
    targetCompletionQuarter: "Q2",
    aipEntryId: 1,
    appropriationId: 1,
    fiscalYear: 2026,
    planCycle: "indicative",
  });
  check("indicative line citing an appropriation is refused", badIndicative.status === 400,
    JSON.stringify(badIndicative.body).slice(0, 160));

  // Walk the indicative line to approved so an EPA solicitation can be raised.
  for (const [who, action] of [["dr", "submit"], ["sec", "consolidate"], ["bo", "certify"], ["hope", "approve"]]) {
    const t = await req(who, "POST", `/app-entries/${indicativeId}/transition`, { action });
    if (t.status !== 200) console.log(`     (indicative ${action} -> ${t.status} ${JSON.stringify(t.body).slice(0, 140)})`);
  }
  const indicativeNow = (await req("sec", "GET", `/app-entries?fiscalYear=2026`)).body?.find((e) => e.id === indicativeId);
  check("approved indicative line becomes updatedIndicativeApp",
    indicativeNow?.planStage === "updatedIndicativeApp", `stage=${indicativeNow?.planStage}`);

  // A requisition cannot be raised against an indicative line.
  const prOnIndicative = await req("dr", "POST", "/purchase-requisitions", {
    appEntryId: indicativeId,
    purpose: "Should be refused",
    dateRequired: "2026-12-01",
    lineItems: [{ description: "x", quantity: 1, unitCost: 1000, hasUsefulLifeOverOneYear: false }],
  });
  check("requisition against an indicative line is refused", prOnIndicative.status === 409,
    `got ${prOnIndicative.status}`);

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  section("EPA solicitation and the award gate");

  const epaRfq = await req("sec", "POST", "/bidding/rfqs", {
    appEntryId: indicativeId,
    title: "Ambulance (EPA)",
    category: "goods",
    closingDate: new Date(Date.now() + 20 * 864e5).toISOString(),
  });
  check("EPA solicitation created from the indicative APP", epaRfq.status === 201,
    JSON.stringify(epaRfq.body).slice(0, 200));
  const epaRfqId = epaRfq.body?.id;
  if (epaRfqId) {
    check("flagged as early procurement", epaRfq.body.earlyProcurement === true);
    check("pre-bid required at ABC 2.5M? (no, floor is 3M)", epaRfq.body.prebidRequired === false,
      `prebidRequired=${epaRfq.body.prebidRequired}`);
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  section("IRR Sec. 43 â€” observers");

  const org1 = await req("sec", "POST", "/observers/organizations", {
    name: "Commission on Audit â€” Resident Auditor",
    sector: "coa",
  });
  check("COA observer needs no SEC/CDA registration", org1.status === 201,
    JSON.stringify(org1.body).slice(0, 160));

  const orgBad = await req("sec", "POST", "/observers/organizations", {
    name: "Unregistered Chamber",
    sector: "privateGroup",
  });
  check("private group without registration is refused", orgBad.status === 400,
    `got ${orgBad.status}`);

  const org2 = await req("sec", "POST", "/observers/organizations", {
    name: "Oriental Mindoro Chamber of Commerce",
    sector: "privateGroup",
    registrationNo: "SEC-CN-2019-11234",
  });
  const org3 = await req("sec", "POST", "/observers/organizations", {
    name: "Bantay Bayan Citizens' Council",
    sector: "csoOrPo",
    registryBody: "sec",
    registrationNo: "SEC-CN-2015-00987",
  });
  check("private group and CSO added", org2.status === 201 && org3.status === 201);

  // Sec. 43.2 â€” five calendar days' notice.
  const shortNotice = await req("sec", "POST", `/observers/rfqs/${epaRfqId}/invitations`, {
    stage: "bidEvaluation",
    scheduledAt: new Date(Date.now() + 2 * 864e5).toISOString(),
    organizationIds: [org1.body.id, org2.body.id, org3.body.id],
  });
  check("invitation with 2 days' notice is refused (Sec. 43.2)", shortNotice.status === 409,
    JSON.stringify(shortNotice.body).slice(0, 160));

  const goodNotice = await req("sec", "POST", `/observers/rfqs/${epaRfqId}/invitations`, {
    stage: "bidEvaluation",
    scheduledAt: new Date(Date.now() + 8 * 864e5).toISOString(),
    organizationIds: [org1.body.id, org2.body.id, org3.body.id],
  });
  check("invitation with 8 days' notice is accepted", goodNotice.status === 201,
    JSON.stringify(goodNotice.body).slice(0, 160));

  const coverage = await req("sec", "GET", `/observers/rfqs/${epaRfqId}/coverage`);
  const evalStage = coverage.body?.stages?.find((s) => s.stage === "bidEvaluation");
  check("coverage reports COA + private group + CSO present",
    evalStage?.hasCoa && evalStage?.hasPrivateGroup && evalStage?.hasCsoOrPo,
    JSON.stringify(evalStage ?? {}).slice(0, 200));
  check("bid evaluation stage is Sec. 43.1 compliant", evalStage?.compliant === true);

  const invitations = await req("sec", "GET", `/observers/invitations?rfqId=${epaRfqId}`);
  const firstInvitation = invitations.body?.[0];

  // Sec. 43.5 â€” confidentiality agreement before attending.
  const noConfidentiality = await req("sec", "POST", `/observers/invitations/${firstInvitation.id}/attendance`, {
    attendance: "attended",
  });
  check("attendance without a confidentiality agreement is refused (Sec. 43.5)",
    noConfidentiality.status === 409, `got ${noConfidentiality.status}`);

  const attended = await req("sec", "POST", `/observers/invitations/${firstInvitation.id}/attendance`, {
    attendance: "attended",
    confidentialityAgreed: true,
    representativeName: "Atty. M. Reyes",
  });
  check("attendance recorded with confidentiality agreement", attended.status === 200,
    JSON.stringify(attended.body).slice(0, 160));

  // Sec. 43.4(c) â€” inhibition needs a written reason.
  const secondInvitation = invitations.body?.[1];
  const inhibitNoReason = await req("sec", "POST", `/observers/invitations/${secondInvitation.id}/attendance`, {
    attendance: "inhibited",
  });
  check("inhibition without a reason is refused (Sec. 43.4(c))", inhibitNoReason.status === 400,
    `got ${inhibitNoReason.status}`);

  // Sec. 43.4(a) â€” only an attendee may file, and the report needs an assessment.
  const reportByNonAttendee = await req("obs", "POST", `/observers/invitations/${secondInvitation.id}/report`, {
    complianceAssessment: "Looked fine.",
  });
  check("non-attendee cannot file an observation report", reportByNonAttendee.status === 409,
    `got ${reportByNonAttendee.status}`);

  const report = await req("obs", "POST", `/observers/invitations/${firstInvitation.id}/report`, {
    complianceAssessment:
      "The BAC opened bids in the presence of observers and read the abstract aloud. Eligibility " +
      "documents were examined in order. No procedural lapse observed.",
    findingsRegular: true,
    furnishedTo: { hope: true, philgeps: true, coa: true, gppb: true, ombudsman: true },
  });
  check("observer files an observation report", report.status === 201,
    JSON.stringify(report.body).slice(0, 160));

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  section("IRR Sec. 83â€“85 â€” protest mechanism");

  const feeOptions = await req("vendor", "GET", "/protests/options?abc=2500000");
  check("protest fee is 0.75% of ABC at or below â‚±50M",
    feeOptions.body?.protestFee === 18750, `got ${feeOptions.body?.protestFee}`);

  const recon = await req("vendor", "POST", `/protests/rfqs/${epaRfqId}/reconsideration`, {
    challengedDecision: "Declaration of ineligibility at post-qualification",
    notifiedAt: new Date(Date.now() - 1 * 864e5).toISOString(),
    grounds: "The Net Financial Contracting Capacity was computed on the wrong audited financial statement.",
  });
  check("bidder files a request for reconsideration", recon.status === 201,
    JSON.stringify(recon.body).slice(0, 160));
  const reconId = recon.body?.id;
  check("filed within 3 calendar days is on time", recon.body?.filedOnTime === true,
    `filingDays=${recon.body?.filingDays}`);

  // A protest cannot be filed while reconsideration is undecided.
  const earlyProtest = await req("vendor", "POST", "/protests", {
    reconsiderationId: reconId,
    grounds: "x",
    verifiedByAffidavit: true,
    noForumShoppingCertified: true,
    protestFeeReference: "OR-1",
  });
  check("protest before the BAC decides is refused", earlyProtest.status === 409,
    `got ${earlyProtest.status}`);

  // The HoPE must not decide a request for reconsideration â€” that is the BAC's.
  const hopeDecidesRecon = await req("hope", "POST", `/protests/${reconId}/resolve`, {
    outcome: "denied",
    decision: "This decision is long enough to satisfy the thirty character minimum requirement.",
  });
  check("HoPE cannot decide a request for reconsideration", hopeDecidesRecon.status === 403,
    `got ${hopeDecidesRecon.status}`);

  const bareOutcome = await req("chair", "POST", `/protests/${reconId}/resolve`, { outcome: "denied", decision: "No." });
  check("a decision without factual and legal bases is refused (Sec. 84.1)",
    bareOutcome.status === 400, `got ${bareOutcome.status}`);

  const denied = await req("chair", "POST", `/protests/${reconId}/resolve`, {
    outcome: "denied",
    decision:
      "The NFCC was computed on the 2025 audited financial statement as required by the Bidding " +
      "Documents. The request is denied for lack of merit.",
  });
  check("BAC denies the request for reconsideration", denied.status === 200,
    JSON.stringify(denied.body).slice(0, 160));

  const unverified = await req("vendor", "POST", "/protests", {
    reconsiderationId: reconId,
    grounds: "The denial did not address the ground raised.",
    verifiedByAffidavit: false,
    noForumShoppingCertified: true,
    protestFeeReference: "OR-2026-0001",
  });
  check("unverified position paper is refused (Sec. 83.3)", unverified.status === 400,
    `got ${unverified.status}`);

  const noFee = await req("vendor", "POST", "/protests", {
    reconsiderationId: reconId,
    grounds: "The denial did not address the ground raised.",
    verifiedByAffidavit: true,
    noForumShoppingCertified: true,
  });
  check("protest without the fee is refused with 402 (Sec. 83.2)", noFee.status === 402,
    `got ${noFee.status}, fee=${noFee.body?.protestFee}`);

  const protest = await req("vendor", "POST", "/protests", {
    reconsiderationId: reconId,
    grounds: "The denial did not address the ground raised, namely the choice of financial statement.",
    verifiedByAffidavit: true,
    noForumShoppingCertified: true,
    protestFeeReference: "OR-2026-0001",
  });
  check("protest filed with fee and verification", protest.status === 201,
    JSON.stringify(protest.body).slice(0, 160));

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  section("Abstract of Bids");

  const abstract = await req("sec", "GET", `/bidding/rfqs/${epaRfqId}/abstract`);
  check("abstract refused while the solicitation is still a draft", abstract.status === 409,
    `got ${abstract.status}`);

  const abstractByObserver = await req("obs", "GET", `/bidding/rfqs/${epaRfqId}/abstract`);
  check("observer may reach the abstract (Sec. 43.5)", abstractByObserver.status !== 403,
    `got ${abstractByObserver.status}`);

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log(`\n${"=".repeat(60)}`);
  console.log(`PASSED ${passed}   FAILED ${failed}`);
  if (failures.length) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log("  - " + f));
  }
  process.exit(failed > 0 ? 1 : 0);
};

run().catch((error) => {
  console.error("HARNESS ERROR:", error);
  process.exit(2);
});

