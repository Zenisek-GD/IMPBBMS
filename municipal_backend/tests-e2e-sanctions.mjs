// Third conformance harness: the sanctions and contract-implementation layer.
// Blacklisting (Sec. 69), failure of bidding (Sec. 64), variation orders and
// termination (Sec. 71), warranty security (Sec. 68), and the APP's 4%
// contingency ceiling and GPPB submission (Sec. 7.7).
//
// Run against a seeded demo database:
//   node migrate.js --force --yes && node seed.js && node seedDemo.js
//   DB_NAME=... PORT=3100 node index.js
//   node tests-e2e-sanctions.mjs

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
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
};
const login = async (who, email) => {
  const r = await req(who, "POST", "/auth/login", { email, password: "Passw0rd!" });
  if (r.status !== 200) throw new Error(`login ${email}: ${JSON.stringify(r.body)}`);
};
const section = (t) => console.log(`\n=== ${t} ===`);

const run = async () => {
  for (const [who, email] of [
    ["hope", "hope@procurenance.com"],
    ["sec", "bacsecretariat@procurenance.com"],
    ["chair", "bacchairperson@procurenance.com"],
    ["vendor", "vendor@procurenance.com"],
  ])
    await login(who, email);

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  section("RA 12009 Sec. 69 â€” blacklisting");

  const vendors = await req("sec", "GET", "/vendors");
  const target = vendors.body?.find((v) => v.registrationStatus === "verified");
  check("a verified supplier is on the roster", Boolean(target), JSON.stringify(vendors.body ?? {}).slice(0, 140));

  const noGrounds = await req("hope", "POST", `/vendors/${target.id}/blacklist`, {
    grounds: "bad",
    orderNo: "BL-2026-001",
  });
  check("blacklisting without written grounds is refused", noGrounds.status === 400, `got ${noGrounds.status}`);

  const noOrder = await req("hope", "POST", `/vendors/${target.id}/blacklist`, {
    grounds: "The supplier abandoned the contract after receiving the Notice to Proceed and failed to respond to three written demands.",
  });
  check("blacklisting without an order number is refused", noOrder.status === 400, `got ${noOrder.status}`);

  const bySecretariat = await req("sec", "POST", `/vendors/${target.id}/blacklist`, {
    grounds: "The supplier abandoned the contract after receiving the Notice to Proceed and failed to respond to three written demands.",
    orderNo: "BL-2026-001",
  });
  check("the Secretariat cannot issue a Blacklisting Order", bySecretariat.status === 403, `got ${bySecretariat.status}`);

  const blacklisted = await req("hope", "POST", `/vendors/${target.id}/blacklist`, {
    grounds: "The supplier abandoned the contract after receiving the Notice to Proceed and failed to respond to three written demands.",
    orderNo: "BL-2026-001",
  });
  check("HoPE issues the Blacklisting Order", blacklisted.status === 200, JSON.stringify(blacklisted.body).slice(0, 160));
  check("first offence carries a one-year term", blacklisted.body?.termYears === 1, `got ${blacklisted.body?.termYears}`);

  const again = await req("hope", "POST", `/vendors/${target.id}/blacklist`, {
    grounds: "Duplicate order attempt for the same conduct already sanctioned above.",
    orderNo: "BL-2026-002",
  });
  check("a second concurrent blacklisting is refused", again.status === 409, `got ${again.status}`);

  const lifted = await req("hope", "POST", `/vendors/${target.id}/blacklist/lift`, {
    reason: "Set aside on appeal; the abandonment was caused by a right-of-way problem outside the supplier's control.",
  });
  check("blacklisting can be lifted with a reason", lifted.status === 200, JSON.stringify(lifted.body).slice(0, 140));
  check("the prior status is restored, not assumed", lifted.body?.registrationStatus === "verified",
    `restored to ${lifted.body?.registrationStatus}`);

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  section("RA 12009 Sec. 64 â€” failure of bidding");

  const rfqs = await req("sec", "GET", "/bidding/rfqs");
  const open = rfqs.body?.find((r) => r.status === "published");
  if (open) {
    const noReason = await req("chair", "POST", `/bidding/rfqs/${open.id}/declare-failure`, {});
    check("a failure without a stated ground is refused", noReason.status === 400, `got ${noReason.status}`);

    const failure = await req("chair", "POST", `/bidding/rfqs/${open.id}/declare-failure`, {
      reason: "No bids were received by the deadline for submission.",
    });
    check("first failure of bidding declared", failure.status === 200, JSON.stringify(failure.body).slice(0, 160));
    check("first failure does NOT yet open Negotiated Procurement", failure.body?.mayNegotiate === false,
      `mayNegotiate=${failure.body?.mayNegotiate}`);
    check("the failure is numbered", failure.body?.failureNumber === 1, `got ${failure.body?.failureNumber}`);
  } else {
    console.log("  (no published solicitation in the demo data â€” skipped)");
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  section("RA 12009 Sec. 71 â€” variation orders and termination");

  const contracts = await req("sec", "GET", "/contracts");
  const active = contracts.body?.find((c) => c.status === "active");
  check("an active contract exists in the demo data", Boolean(active),
    JSON.stringify(contracts.body?.map((c) => c.status) ?? []).slice(0, 120));

  if (active) {
    const original = Number(active.amount);

    const noJustification = await req("hope", "POST", `/contracts/${active.id}/variation-order`, {
      amount: 1000,
    });
    check("a variation order without justification is refused", noJustification.status === 400,
      `got ${noJustification.status}`);

    // Above the 10% cumulative ceiling.
    const overCeiling = await req("hope", "POST", `/contracts/${active.id}/variation-order`, {
      amount: Math.round(original * 0.2),
      justification: "Additional scope discovered during excavation requiring substantial extra work beyond the original design.",
    });
    check("a variation above the 10% cumulative ceiling is refused (Sec. 71)",
      overCeiling.status === 409, JSON.stringify(overCeiling.body?.message ?? "").slice(0, 180));

    // Within the ceiling, but the performance security has not been topped up.
    const withinCeiling = await req("hope", "POST", `/contracts/${active.id}/variation-order`, {
      amount: Math.round(original * 0.05),
      justification: "Additional scope discovered during excavation requiring extra work within the allowable variation.",
    });
    check("a variation is refused until the performance security is updated (Sec. 68.1)",
      withinCeiling.status === 409, JSON.stringify(withinCeiling.body?.message ?? "").slice(0, 180));

    const badGround = await req("hope", "POST", `/contracts/${active.id}/terminate`, {
      ground: "boredom",
      reason: "This ground is not one the IRR recognises and should be refused outright.",
    });
    check("an unrecognised termination ground is refused", badGround.status === 400, `got ${badGround.status}`);

    const terminated = await req("hope", "POST", `/contracts/${active.id}/terminate`, {
      ground: "default",
      reason: "The supplier failed to mobilise within thirty days of the Notice to Proceed and did not answer written demands.",
    });
    check("contract terminated for default", terminated.status === 200, JSON.stringify(terminated.body).slice(0, 160));
    check("termination for default forfeits the performance security",
      terminated.body?.securityForfeited === true, `forfeited=${terminated.body?.securityForfeited}`);
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  section("IRR Sec. 7.7 â€” APP contingency ceiling and GPPB submission");

  const contingency = await req("sec", "GET", "/app-entries/contingency?fiscalYear=2026");
  check("contingency ceiling reported", contingency.status === 200, JSON.stringify(contingency.body).slice(0, 180));
  check("ceiling is 4% of enacted MOOE",
    contingency.body?.rate === 0.04 &&
      Math.abs(contingency.body.ceiling - contingency.body.mooeAppropriations * 0.04) < 1,
    JSON.stringify(contingency.body ?? {}).slice(0, 180));

  const gppb = await req("sec", "POST", "/app-entries/gppb-submission", {
    fiscalYear: 2026,
    reference: "GPPB-APP-2026-0042",
  });
  check("approved APP submitted to the GPPB", gppb.status === 200, JSON.stringify(gppb.body).slice(0, 180));
  check("the end-of-January deadline is evaluated", typeof gppb.body?.onTime === "boolean",
    `onTime=${gppb.body?.onTime}`);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`PASSED ${passed}   FAILED ${failed}`);
  if (failures.length) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log("  - " + f));
  }
  process.exit(failed > 0 ? 1 : 0);
};

run().catch((e) => {
  console.error("HARNESS ERROR:", e);
  process.exit(2);
});

