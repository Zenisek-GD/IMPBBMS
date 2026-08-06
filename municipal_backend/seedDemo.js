import "./config/env.js";
import { sequelize } from "./models/db.js";
import { User } from "./models/userModel.js";
import { Role } from "./models/roleModel.js";
import { Department } from "./models/departmentModel.js";
import { AppEntry } from "./models/appEntryModel.js";
import { PrHeader, PrLineItem } from "./models/prModel.js";
import { Rfq, Bid, BidOpeningRecord, Award } from "./models/biddingModel.js";
import { ProcurementMode } from "./models/procurementModeModel.js";
import { Vendor } from "./models/vendorModel.js";
import { Contract, Delivery } from "./models/contractModel.js";
import { Invoice, Payment } from "./models/paymentModel.js";
import { Appropriation, Obligation } from "./models/appropriationModel.js";
import { DevelopmentPlan, DevelopmentGoal } from "./models/developmentPlanModel.js";
import { InvestmentProgram, AipEntry } from "./models/investmentProgramModel.js";
import { Security, requiredBidSecurity, requiredPerformanceSecurity } from "./models/securityModel.js";
import { BacResolution } from "./models/bacResolutionModel.js";
import {
  ObserverOrganization,
  ObserverInvitation,
  ObservationReport,
  OBSERVER_NOTICE_DAYS,
  OBSERVATION_REPORT_DAYS,
} from "./models/observerModel.js";
import { recordAudit, AUDIT_ACTIONS } from "./services/auditLog.js";
import { computeDeductions } from "./services/deductions.js";

// ── DEMONSTRATION DATA ───────────────────────────────────────────────────────
// `npm run seed` creates the reference data the system needs to run: roles,
// departments, permissions, procurement modes, one account per role. It creates
// no procurement activity, so every screen that reads transactional data — and
// the whole public portal — renders empty.
//
// This script fills that gap. It walks six projects through the real lifecycle
// so the portal has completed, ongoing and upcoming work to show, and writes a
// genuine audit entry for each decision along the way, with the acting officer
// and a historical timestamp. The public timeline is therefore reading the same
// tamper-evident chain a live action would produce, not a fixture.
//
// Safe to re-run: it clears only the records it creates, and never touches
// users, roles, departments or settings.
//
//   npm run seed:demo

const YEAR = new Date().getFullYear();
const at = (month, day, hour = 9, minute = 0) => new Date(YEAR, month - 1, day, hour, minute, 0);
const dateOnly = (date) => date.toISOString().slice(0, 10);

// Relative to today, for the one project that is meant to be open for bidding
// right now. Fixed calendar dates would leave it advertised with a closing date
// already in the past, which is not a state the BAC would ever be in.
const daysFromNow = (days, hour = 9) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
};

const peso = (value) => `₱${Number(value).toLocaleString("en-PH")}`;

// ── The six projects ─────────────────────────────────────────────────────────
// `reach` is how far each one is driven through the lifecycle. Together they
// cover every category the public page filters on and every phase the timeline
// renders.
const PROJECTS = [
  {
    reach: "completed",
    department: "HEALTH",
    appropriation: "healthCO",
    aipEntry: "health",
    projectTitle: "Supply and Delivery of Medical Equipment for the Municipal Health Office",
    description:
      "Procurement of diagnostic and treatment equipment for the Rural Health Unit, including patient monitors, " +
      "nebulisers, an ECG machine and examination furniture, to restore full service capacity at the main health station.",
    category: "Goods",
    abc: 2850000,
    winningBid: 2703500,
    fundSource: "General Fund — 20% Development Fund",
    papCode: "PAP-HLTH-2024-011",
    quarters: ["Q1", "Q3"],
    rfqCategory: "goods",
    vendorKey: "medline",
  },
  {
    reach: "completed",
    department: "ENGR",
    appropriation: "infraCO",
    aipEntry: "roads",
    projectTitle: "Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1)",
    description:
      "Concreting of 1.2 kilometres of farm-to-market road serving four upland barangays, including drainage " +
      "canals and road shoulders, to reduce haulage cost for local produce.",
    category: "Infrastructure",
    abc: 8400000,
    winningBid: 8127000,
    fundSource: "Local Development Fund",
    papCode: "PAP-INFR-2024-004",
    quarters: ["Q1", "Q2"],
    rfqCategory: "infrastructure",
    vendorKey: "sierra",
  },
  {
    reach: "contract",
    department: "HEALTH",
    appropriation: "healthCO",
    aipEntry: "health",
    projectTitle: "Construction of Barangay Malitbog Health Station",
    description:
      "Construction of a one-storey barangay health station with consultation rooms, a birthing area, a " +
      "pharmacy counter and a potable water system.",
    category: "Infrastructure",
    abc: 4200000,
    winningBid: 4085000,
    fundSource: "General Fund — 20% Development Fund",
    papCode: "PAP-HLTH-2024-019",
    quarters: ["Q2", "Q4"],
    rfqCategory: "infrastructure",
    vendorKey: "sierra",
  },
  {
    reach: "bidding",
    department: "IT",
    appropriation: "itMOOE",
    aipEntry: "digital",
    projectTitle: "Supply and Delivery of Information Technology Equipment for Municipal Offices",
    description:
      "Procurement of desktop computers, network switches and uninterruptible power supplies to replace " +
      "end-of-life units across the Municipal Hall, in support of the digitalisation programme.",
    category: "Goods",
    abc: 1950000,
    fundSource: "General Fund — MOOE",
    papCode: "PAP-ITO-2024-007",
    quarters: ["Q3", "Q4"],
    rfqCategory: "goods",
  },
  {
    reach: "upcoming",
    department: "GSO",
    appropriation: "gsoCO",
    aipEntry: "disaster",
    projectTitle: "Procurement of Two (2) Units Garbage Compactor Truck",
    description:
      "Acquisition of two garbage compactor trucks to expand solid waste collection coverage to the remaining " +
      "eight barangays under the Ecological Solid Waste Management Plan.",
    category: "Goods",
    abc: 11500000,
    fundSource: "General Fund — Capital Outlay",
    papCode: "PAP-GSO-2024-002",
    quarters: ["Q4", "Q4"],
    rfqCategory: "goods",
  },
  {
    reach: "upcoming",
    department: "ENGR",
    appropriation: "infraCO",
    aipEntry: "disaster",
    projectTitle: "Construction of Municipal Evacuation Center",
    description:
      "Construction of a disaster-resilient evacuation centre with a capacity of 500 persons, including " +
      "sanitation facilities, a generator set and a rainwater collection system.",
    category: "Infrastructure",
    abc: 15750000,
    fundSource: "Local Disaster Risk Reduction and Management Fund",
    papCode: "PAP-INFR-2024-021",
    quarters: ["Q4", "Q4"],
    rfqCategory: "infrastructure",
  },
];

// ── The Appropriation Ordinance ──────────────────────────────────────────────
// The authority behind every project below. One line per office and expense
// class, as an actual annual budget ordinance is structured. Each is
// deliberately larger than the projects charged against it, so the register
// shows a realistic unprogrammed balance rather than everything at exactly
// 100%.
const APPROPRIATIONS = [
  {
    key: "healthCO",
    department: "HEALTH",
    title: "Health Facilities and Medical Equipment Outlay",
    fund: "generalFund",
    expenseClass: "capitalOutlay",
    papCode: "PAP-HLTH-CO-01",
    uacsCode: "5-02-13-990",
    amount: 9_500_000,
  },
  {
    key: "infraCO",
    department: "ENGR",
    title: "Local Roads and Public Infrastructure Outlay",
    fund: "generalFund",
    expenseClass: "capitalOutlay",
    papCode: "PAP-INFR-CO-01",
    uacsCode: "5-02-13-060",
    amount: 32_000_000,
  },
  {
    key: "itMOOE",
    department: "IT",
    title: "Information Technology Equipment and Systems",
    fund: "generalFund",
    expenseClass: "mooe",
    papCode: "PAP-ITO-MOOE-04",
    uacsCode: "5-02-03-010",
    amount: 3_400_000,
  },
  {
    key: "gsoCO",
    department: "GSO",
    title: "General Services Motor Vehicle and Equipment Outlay",
    fund: "generalFund",
    expenseClass: "capitalOutlay",
    papCode: "PAP-GSO-CO-02",
    uacsCode: "5-02-13-050",
    amount: 14_000_000,
  },
  {
    // A Special Education Fund line, so the register demonstrates that fund
    // separation is modelled and not just an enum. Nothing is charged to it —
    // SEF money cannot pay for the projects below, which is the point.
    key: "sefMOOE",
    department: "HEALTH",
    title: "Special Education Fund — School Health Programme",
    fund: "specialEducationFund",
    expenseClass: "mooe",
    papCode: "PAP-SEF-MOOE-01",
    uacsCode: "5-02-99-990",
    amount: 2_200_000,
  },
];

const VENDORS = {
  medline: {
    businessName: "Medline Diagnostics Trading Corporation",
    tin: "008-421-773-000",
    organizationType: "corporation",
    philgepsRegistrationNo: "PG-2021-004118",
    isVatRegistered: true,
    taxClassification: "goods",
    contactEmail: "bids@medline-diagnostics.example",
    contactPhone: "+63 43 288 4410",
    address: "142 Roxas Boulevard, Calapan City, Oriental Mindoro",
  },
  sierra: {
    businessName: "Sierra Verde Construction and Supply, Inc.",
    tin: "221-908-455-000",
    organizationType: "corporation",
    philgepsRegistrationNo: "PG-2020-009823",
    isVatRegistered: true,
    taxClassification: "services",
    contactEmail: "office@sierraverde.example",
    contactPhone: "+63 43 286 1177",
    address: "Km. 12 National Highway, Roxas, Oriental Mindoro",
  },
  pinnacle: {
    businessName: "Pinnacle Office Systems Enterprises",
    tin: "410-556-201-000",
    organizationType: "soleProprietorship",
    philgepsRegistrationNo: "PG-2022-001904",
    // Not VAT-registered: no VAT is withheld and the EWT base is the gross.
    isVatRegistered: false,
    taxClassification: "goods",
    contactEmail: "sales@pinnacleoffice.example",
    contactPhone: "+63 917 442 8890",
    address: "Unit 5, Mabini Commercial Center, Roxas, Oriental Mindoro",
  },
};

// `npm run seed` names each demo account after its role ("Budget Officer"),
// which is fine for signing in but reads badly on a public timeline: every
// entry becomes "Budget Officer · Budget Officer", and the point of naming the
// actor is lost. These give the officials names.
//
// Applied only to accounts still carrying the seed default, so a real name
// entered by an administrator is never overwritten.
const OFFICIAL_NAMES = {
  systemAdministrator: "Joel R. Fabricante",
  hope: "Hon. Teresita M. Alcantara",
  bacChairperson: "Atty. Rodel V. Manalo",
  bacMember: "Engr. Cristina P. Bautista",
  bacSecretariat: "Marilou D. Ceniza",
  twgMember: "Engr. Noel A. Villamor",
  departmentRequester: "Dr. Anna Liza R. Cortez",
  budgetOfficer: "Elena S. Villaflor",
  municipalAccountant: "Ramon T. Delos Reyes",
  municipalTreasurer: "Lorna F. Aguinaldo",
  internalAuditor: "Grace B. Mendoza",
  observer: "Fr. Antonio L. Perez",
  vendor: "Medline Diagnostics Trading Corporation",
};

// Every audit entry names a real officer. Loaded once and reused so the trail
// is internally consistent — the same Budget Officer certifies every project.
const actorFor = (users, roleKey) => {
  const user = users.get(roleKey);
  return {
    actorId: user.id,
    actorName: user.name,
    actorRole: roleKey,
    ipAddress: "127.0.0.1",
  };
};

const log = (users, roleKey, payload) => recordAudit({ ...actorFor(users, roleKey), ...payload });

// ── Lifecycle writers ────────────────────────────────────────────────────────
// Each stage writes the record and the audit entry that a controller would have
// written, in the same shape, so the public timeline reads identically to one
// produced by real use.

const runAppStage = async (users, spec, department, timing, appropriation, aipEntry) => {
  const entry = await AppEntry.create({
    appropriationId: appropriation.id,
    // The other half of the authority: the appropriation says the money exists,
    // this says the municipality programmed it for this purpose. The controller
    // requires it on creation, so seeded rows carry it too — otherwise the demo
    // data would be in a state the application itself would refuse to produce.
    aipEntryId: aipEntry?.id ?? null,
    projectTitle: spec.projectTitle,
    description: spec.description,
    papCode: spec.papCode,
    category: spec.category,
    procurementMode: "competitiveBidding",
    abc: spec.abc,
    fundSource: spec.fundSource,
    targetStartQuarter: spec.quarters[0],
    targetCompletionQuarter: spec.quarters[1],
    fiscalYear: YEAR,
    status: "locked",
    // These entries are seeded already approved, so they have completed the
    // PPMP → indicative APP → final APP progression the controller drives.
    planStage: "finalApp",
    lockedAt: timing.appApproved,
    implementingUnitId: department.id,
    createdById: users.get("departmentRequester").id,
  });

  const transition = (roleKey, action, from, to, when, remarks = null) =>
    log(users, roleKey, {
      actionType: AUDIT_ACTIONS.APP_TRANSITION,
      entityRef: "appEntry",
      entityId: entry.id,
      summary: `${spec.projectTitle}: ${action}`,
      beforeState: { status: from },
      afterState: { status: to, remarks },
      recordedAt: when,
    });

  await transition(
    "departmentRequester",
    "submit",
    "draft",
    "pendingConsolidation",
    timing.appSubmitted,
    `Included in the ${YEAR} Annual Procurement Plan for the ${department.name}.`
  );
  await transition(
    "bacSecretariat",
    "consolidate",
    "pendingConsolidation",
    "pendingBudgetCertification",
    timing.appConsolidated,
    "Consolidated into the indicative APP and forwarded for funding certification."
  );
  await transition(
    "budgetOfficer",
    "certify",
    "pendingBudgetCertification",
    "pendingHopeApproval",
    timing.appCertified,
    `Funds available under ${appropriation.ordinanceNo} — ${appropriation.title}. ` +
      `Certified in the amount of ${peso(spec.abc)}.`
  );
  await transition(
    "hope",
    "approve",
    "pendingHopeApproval",
    "approved",
    timing.appApproved,
    "Approved. The entry is locked and may now be requisitioned against."
  );

  return entry;
};

const runPrStage = async (users, spec, entry, department, timing, index, appropriation, mode) => {
  const prNumber = `PR-${YEAR}-${String(index + 1).padStart(4, "0")}`;
  const obligationNo = `ORS-${YEAR}-${String(index + 1).padStart(4, "0")}`;

  const pr = await PrHeader.create({
    prNumber,
    purpose: spec.projectTitle,
    dateRequired: dateOnly(timing.prRequired),
    totalAmount: spec.abc,
    status: "approved",
    appEntryId: entry.id,
    requesterId: users.get("departmentRequester").id,
    departmentId: department.id,
    submittedAt: timing.prSubmitted,

    // Each signature, on the record. A seeded requisition that reached
    // "approved" must carry the same columns a real one would, or the printed
    // form and the audit timeline would disagree about who signed what.
    cashCertifiedAt: timing.prCashCertified,
    cashCertifiedById: users.get("municipalTreasurer").id,
    mayorApprovedAt: timing.prMayorApproved,
    mayorApprovedById: users.get("hope").id,

    // LGC Sec. 344's three officers, each on their own column. The Budget
    // Officer certifies that the appropriation exists; the Accountant obligates
    // it. These used to be one act by one officer.
    appropriationCertifiedAt: timing.prCertified,
    appropriationCertifiedById: users.get("budgetOfficer").id,
    fundsReservedAt: timing.prCertified,
    obligatedById: users.get("municipalAccountant").id,
    fundSource: appropriation.fund,

    procurementModeId: mode.id,
    modeDeterminedAt: timing.prModeDetermined,
    // The determination is the committee's, so it is stamped with the
    // Chairperson rather than the Secretariat that staffs it.
    modeDeterminedById: users.get("bacChairperson").id,
    suggestedModeKey: mode.key,
    modeJustification: `Determined per ${mode.citation}: the ABC exceeds this LGU's Small Value Procurement ceiling, so competitive bidding applies.`,
  });

  await PrLineItem.create({
    description: spec.projectTitle,
    unit: "lot",
    quantity: 1,
    unitCost: spec.abc,
    lineTotal: spec.abc,
    prHeaderId: pr.id,
  });

  const transition = (roleKey, action, from, to, when, remarks = null) =>
    log(users, roleKey, {
      actionType: AUDIT_ACTIONS.PR_TRANSITION,
      entityRef: "pr",
      entityId: pr.id,
      summary: `${prNumber}: ${action}`,
      beforeState: { status: from },
      afterState: { status: to, remarks },
      recordedAt: when,
    });

  await transition(
    "departmentRequester",
    "submit",
    "draft",
    "pendingDepartmentHeadEndorsement",
    timing.prSubmitted,
    "Requisition raised against the approved APP entry."
  );
  await transition(
    "bacChairperson",
    "endorse",
    "pendingDepartmentHeadEndorsement",
    "pendingCashCertification",
    timing.prEndorsed,
    "Endorsed by the Head of Office."
  );
  // Step 16 — the Treasurer, on the cash. A separate question from the Budget
  // Officer's below: an appropriation can be intact while collections have not
  // come in, which is what this signature exists to catch.
  await transition(
    "municipalTreasurer",
    "certifyCash",
    "pendingCashCertification",
    "pendingMayorApproval",
    timing.prCashCertified,
    `Funds available in the ${appropriation.fund === "generalFund" ? "General Fund" : appropriation.fund}. ${peso(spec.abc)} certified.`
  );
  // Step 17 — the Local Chief Executive approves the request itself. Nothing is
  // obligated until after this, so a refused request never holds budget.
  await transition(
    "hope",
    "approve",
    "pendingMayorApproval",
    "pendingBudgetCertification",
    timing.prMayorApproved,
    "Approved. Forwarded to the Budget Office for certification of appropriation."
  );

  // Step 18 — the Budget Office certifies that an appropriation exists and
  // names the fund. It does not obligate: LGC Sec. 344 gives that to the
  // Accountant, and the two are separate stages below.
  await transition(
    "budgetOfficer",
    "certify",
    "pendingBudgetCertification",
    "pendingAccountantObligation",
    timing.prCertified,
    `Appropriation certified against ${appropriation.ordinanceNo}. Referred to the Accountant for obligation.`
  );

  // Step 18b — the Accountant. The ORS is what actually commits the money
  // against the ordinance line; the requisition status alone commits nothing.
  await Obligation.create({
    obligationNo,
    amount: spec.abc,
    status: "obligated",
    certifiedAt: timing.prCertified,
    certifiedById: users.get("municipalAccountant").id,
    particulars: spec.projectTitle,
    appropriationId: appropriation.id,
    prHeaderId: pr.id,
  });

  await transition(
    "municipalAccountant",
    "obligate",
    "pendingAccountantObligation",
    "pendingModeDetermination",
    timing.prCertified,
    `${obligationNo} issued against ${appropriation.ordinanceNo}. ${peso(spec.abc)} obligated.`
  );

  // Step 19 — the committee's determination, logged under its own action type
  // so an auditor can filter for every mode decision in the year. Recorded
  // under the Chairperson: the determination is the BAC's, not its Secretariat's.
  await log(users, "bacChairperson", {
    actionType: AUDIT_ACTIONS.PR_MODE_DETERMINED,
    entityRef: "pr",
    entityId: pr.id,
    summary: `${prNumber}: mode determined — ${mode.name} (${mode.citation})`,
    beforeState: { status: "pendingModeDetermination" },
    afterState: {
      status: "approved",
      mode: mode.key,
      suggestedMode: mode.key,
      departedFromSuggestion: false,
      citation: mode.citation,
    },
    recordedAt: timing.prModeDetermined,
  });

  return pr;
};

const runSolicitationStage = async (users, spec, pr, mode, timing, index, finalStatus) => {
  const referenceNo = `ITB-${YEAR}-${String(index + 1).padStart(3, "0")}`;

  const rfq = await Rfq.create({
    referenceNo,
    title: spec.projectTitle,
    abc: spec.abc,
    category: spec.rfqCategory,
    publishDate: dateOnly(timing.rfqPublished),
    closingDate: timing.rfqClosing,
    // IRR Sec. 51.1 makes a pre-bid conference mandatory at ₱3,000,000 and above.
    prebidRequired: spec.abc >= 3000000,
    prebidAt: spec.abc >= 3000000 ? timing.prebid : null,
    postingRequired: true,
    status: finalStatus,
    prHeaderId: pr.id,
    procurementModeId: mode.id,
    publishedById: users.get("bacSecretariat").id,
  });

  await log(users, "bacSecretariat", {
    actionType: AUDIT_ACTIONS.RFQ_PUBLISHED,
    entityRef: "rfq",
    entityId: rfq.id,
    summary: `${referenceNo} advertised — ${spec.projectTitle}`,
    afterState: {
      status: "published",
      remarks: `Posted on the PhilGEPS portal and the municipal bulletin board. ABC ${peso(spec.abc)}.`,
    },
    recordedAt: timing.rfqPublished,
  });

  return rfq;
};

const runBidStage = async (users, spec, rfq, vendors, timing, opened) => {
  // Three bidders, so the record evidences genuine competition. The winner is
  // the vendor named on the project; the other two are drawn from the pool.
  const roster = [
    vendors[spec.vendorKey ?? "pinnacle"],
    ...Object.values(vendors).filter((vendor) => vendor.key !== (spec.vendorKey ?? "pinnacle")),
  ].slice(0, 3);

  const base = spec.winningBid ?? Math.round(spec.abc * 0.96);
  const bids = [];

  for (const [position, vendor] of roster.entries()) {
    const price = position === 0 ? base : Math.round(base * (1 + 0.018 * position));
    const bid = await Bid.create({
      rfqId: rfq.id,
      vendorId: vendor.id,
      technicalSubmitted: true,
      financialSealed: !opened,
      totalBidPrice: opened ? price : null,
      submittedAt: timing.bidSubmitted,
      blindLabel: opened ? `Bidder ${String.fromCharCode(65 + position)}` : null,
      status: opened ? (position === 0 ? "postQualified" : "lost") : "submitted",
    });
    bids.push(bid);

    // Every bid carries security. Without it a bidder can walk away from a
    // winning bid at no cost, which is precisely what it exists to prevent.
    const form = position === 0 ? "suretyBond" : "cash";
    await Security.create({
      type: "bid",
      form,
      amount: requiredBidSecurity(spec.abc, form),
      percentage: form === "suretyBond" ? 0.05 : 0.02,
      referenceNo: `BS-${YEAR}-${rfq.id}-${position + 1}`,
      issuer: form === "suretyBond" ? "Pioneer Insurance & Surety Corporation" : "Cash deposit",
      postedAt: timing.bidSubmitted,
      validUntil: dateOnly(timing.rfqClosing),
      // Losing bidders get their security back once the award is made.
      status: opened && position !== 0 ? "released" : "posted",
      releasedAt: opened && position !== 0 ? timing.awardApproved : null,
      entityRef: "bid",
      entityId: bid.id,
      vendorId: vendor.id,
      recordedById: users.get("bacSecretariat").id,
    });
  }

  // ── Observers (RA 12009 Sec. 43) ───────────────────────────────────────────
  // The opening record below has always *said* a COA representative and two
  // civil society observers witnessed the session. Now they exist as records:
  // invited in writing with the statutory five days' notice, marked present,
  // and — for the stages that have already happened — having filed the
  // observation report Sec. 43.4 obliges them to file.
  //
  // Without this the Observers screen is empty for every demo project, and the
  // most visible transparency control in the process looks unimplemented.
  await seedObserversFor({ rfq, spec, timing, users, opened });

  if (!opened) return bids;

  await BidOpeningRecord.create({
    rfqId: rfq.id,
    openedAt: timing.bidOpened,
    witnesses: "COA representative, two (2) observers from accredited civil society organisations",
    remarks: "All envelopes received intact and opened in public session.",
    bidsReceived: bids.length,
    openedById: users.get("bacChairperson").id,
  });

  await log(users, "bacChairperson", {
    actionType: AUDIT_ACTIONS.BIDS_OPENED,
    entityRef: "rfq",
    entityId: rfq.id,
    summary: `${bids.length} bids opened for ${rfq.referenceNo}`,
    afterState: {
      status: "opened",
      remarks: "Opened in public session, witnessed by a COA representative and two civil society observers.",
    },
    recordedAt: timing.bidOpened,
  });

  // Evaluation is recorded as an act of the committee. The public timeline
  // suppresses the evaluator's name and the score — blind evaluation only works
  // if the scorer stays unidentified.
  await log(users, "bacMember", {
    actionType: AUDIT_ACTIONS.EVALUATION_SUBMITTED,
    entityRef: "bid",
    entityId: bids[0].id,
    summary: `Technical evaluation submitted for ${rfq.referenceNo}`,
    afterState: { status: "evaluated" },
    recordedAt: timing.evaluated,
  });

  await log(users, "bacChairperson", {
    actionType: AUDIT_ACTIONS.EVALUATION_CLOSED,
    entityRef: "rfq",
    entityId: rfq.id,
    summary: `Evaluation concluded for ${rfq.referenceNo}`,
    afterState: {
      status: "evaluated",
      remarks:
        "Lowest calculated responsive bid identified and referred for post-qualification under IRR Sec. 60.",
    },
    recordedAt: timing.evaluated,
  });

  return bids;
};

const runAwardStage = async (users, spec, rfq, bid, vendor, timing, index) => {
  const noaNumber = `NOA-${YEAR}-${String(index + 1).padStart(4, "0")}`;

  const award = await Award.create({
    noaNumber,
    noaDate: dateOnly(timing.awardApproved),
    amount: spec.winningBid,
    status: "accepted",
    rfqId: rfq.id,
    bidId: bid.id,
    vendorId: vendor.id,
    recommendedById: users.get("bacChairperson").id,
    approvedById: users.get("hope").id,
  });

  // The BAC acts by resolution, signed by its members — not by one click.
  const committee = [
    { key: "bacChairperson", label: "Chairperson" },
    { key: "bacMember", label: "Member" },
    { key: "twgMember", label: "TWG" },
  ]
    .filter((entry) => users.has(entry.key))
    .map((entry) => ({
      userId: users.get(entry.key).id,
      name: users.get(entry.key).name,
      role: entry.key,
      concurred: true,
    }));

  const resolution = await BacResolution.create({
    resolutionNo: `BAC-RES-${YEAR}-${String(index + 1).padStart(4, "0")}`,
    type: "recommendAward",
    title: `Resolution recommending award of ${rfq.referenceNo} to ${vendor.businessName}`,
    recitals:
      `Three (3) bids were received and opened in public session. The bid of ${vendor.businessName} at ` +
      `${peso(spec.winningBid)} was determined to be the Lowest Calculated Responsive Bid and passed ` +
      `post-qualification under IRR Sec. 60.`,
    resolvedAt: timing.awardRecommended,
    members: committee,
    quorumMet: committee.length >= 2,
    chairpersonId: users.get("bacChairperson").id,
    entityRef: "award",
    entityId: award.id,
  });

  await log(users, "bacChairperson", {
    actionType: AUDIT_ACTIONS.AWARD_RECOMMENDED,
    entityRef: "award",
    entityId: award.id,
    summary: `${resolution.resolutionNo} — award recommended to ${vendor.businessName}`,
    afterState: {
      status: "pendingHopeApproval",
      remarks: `Post-qualification passed. Recommended at ${peso(spec.winningBid)}, ${peso(
        spec.abc - spec.winningBid
      )} below the approved budget.`,
    },
    recordedAt: timing.awardRecommended,
  });

  await log(users, "hope", {
    actionType: AUDIT_ACTIONS.AWARD_APPROVED,
    entityRef: "award",
    entityId: award.id,
    summary: `${noaNumber} issued to ${vendor.businessName}`,
    afterState: {
      status: "issued",
      remarks: `Notice of Award approved and issued in the amount of ${peso(spec.winningBid)}.`,
    },
    recordedAt: timing.awardApproved,
  });

  return award;
};

const runContractStage = async (users, spec, award, vendor, timing, index, status) => {
  const contractNo = `CON-${YEAR}-${String(index + 1).padStart(4, "0")}`;

  // Goods go out on a Purchase Order, infrastructure on a Contract — different
  // instruments with different securities and retention rules.
  const isInfra = spec.rfqCategory === "infrastructure";
  const contractDays = isInfra ? 120 : 60;

  const contract = await Contract.create({
    contractNo,
    instrumentType: isInfra ? "contract" : "purchaseOrder",
    category: spec.rfqCategory,
    amount: spec.winningBid,
    startDate: dateOnly(timing.contractStart),
    deliveryDeadline: dateOnly(timing.deliveryDeadline),
    // Contract time runs from the Notice to Proceed, which is what makes delay
    // — and therefore liquidated damages — computable.
    noticeToProceedAt: timing.contractStart,
    contractDays,
    terms: "Payment upon delivery, inspection and acceptance, subject to the usual government deductions.",
    status,
    awardId: award.id,
    vendorId: vendor.id,
    draftedById: users.get("bacSecretariat").id,
    signedByLguAt: timing.contractSigned,
    signedByVendorAt: timing.contractSigned,
  });

  // Performance security must be posted before the contract takes effect. It is
  // what protects the LGU against non-performance.
  const performanceForm = isInfra ? "suretyBond" : "cash";
  await Security.create({
    type: "performance",
    form: performanceForm,
    amount: requiredPerformanceSecurity(spec.winningBid, spec.rfqCategory, performanceForm),
    percentage: isInfra ? 0.3 : 0.05,
    referenceNo: `PS-${YEAR}-${String(index + 1).padStart(4, "0")}`,
    issuer: isInfra ? "Pioneer Insurance & Surety Corporation" : "Land Bank of the Philippines",
    postedAt: timing.contractSigned,
    validUntil: dateOnly(timing.deliveryDeadline),
    status: "posted",
    entityRef: "contract",
    entityId: contract.id,
    vendorId: vendor.id,
    recordedById: users.get("bacSecretariat").id,
  });

  // Signed for the LGU by the Local Chief Executive. LGC Sec. 22(c) puts the
  // signature there, not with the BAC Chairperson who chaired the committee
  // that recommended the award.
  await log(users, "hope", {
    actionType: AUDIT_ACTIONS.CONTRACT_SIGNED,
    entityRef: "contract",
    entityId: contract.id,
    summary: `${contractNo} signed with ${vendor.businessName}`,
    afterState: {
      status: "active",
      remarks: `Contract executed at ${peso(spec.winningBid)}. Delivery due ${dateOnly(timing.deliveryDeadline)}.`,
    },
    recordedAt: timing.contractSigned,
  });

  // The Notice to Proceed is a separate instrument from the signature: it is
  // the day contract time starts running, and therefore the day from which
  // delay and liquidated damages are measured.
  await log(users, "hope", {
    actionType: AUDIT_ACTIONS.NOTICE_TO_PROCEED_ISSUED,
    entityRef: "contract",
    entityId: contract.id,
    summary: `Notice to Proceed issued on ${contractNo} — ${contractDays} calendar days`,
    afterState: {
      noticeToProceedAt: timing.contractStart,
      contractDays,
    },
    recordedAt: timing.contractStart,
  });

  return contract;
};

const runDeliveryStage = async (users, contract, timing, accepted) => {
  const delivery = await Delivery.create({
    contractId: contract.id,
    deliveredAt: timing.delivered,
    inspectedAt: accepted ? timing.inspected : null,
    description: accepted ? "Full delivery received and inspected." : "Partial delivery received; inspection pending.",
    status: accepted ? "accepted" : "underInspection",
    acceptedQuantityNote: accepted ? "Delivered in full, conforming to specification." : null,
    reportedById: users.get("departmentRequester").id,
    inspectedById: accepted ? users.get("bacSecretariat").id : null,
  });

  if (accepted) {
    await log(users, "bacSecretariat", {
      actionType: AUDIT_ACTIONS.DELIVERY_INSPECTED,
      entityRef: "contract",
      entityId: contract.id,
      summary: `Delivery inspected and accepted under ${contract.contractNo}`,
      afterState: {
        status: "accepted",
        remarks: "Inspected by the General Services Office and accepted in full. No deductions applied.",
      },
      recordedAt: timing.inspected,
    });
  }

  return delivery;
};

const runPaymentStage = async (users, spec, contract, delivery, vendor, timing, index) => {
  const invoice = await Invoice.create({
    invoiceNo: `INV-${YEAR}-${String(index + 1).padStart(4, "0")}`,
    supplierInvoiceRef: `SI-${1200 + index}`,
    amount: spec.winningBid,
    submittedAt: timing.invoiced,
    status: "paid",
    contractId: contract.id,
    deliveryId: delivery.id,
    vendorId: vendor.id,
  });

  await log(users, "municipalAccountant", {
    actionType: AUDIT_ACTIONS.INVOICE_CERTIFIED,
    entityRef: "invoice",
    entityId: invoice.id,
    summary: `${invoice.invoiceNo} certified for payment`,
    afterState: {
      status: "certified",
      remarks: "Supporting documents complete. Certified for disbursement.",
    },
    recordedAt: timing.invoiceCertified,
  });

  // Prepared by the Accountant, released by the Treasurer — two different
  // officers, matching the rule the controller enforces. Seeding both sides as
  // the same person would have written demonstration data that the live system
  // would refuse to produce.
  // The voucher is computed by the same engine the live system uses, so the
  // seeded figures are not invented — gross, withholding, retention and net all
  // reconcile exactly as they would on a real disbursement.
  const deductions = computeDeductions({
    grossAmount: spec.winningBid,
    vendor,
    contract,
    asOf: timing.invoiceCertified,
  });

  const payment = await Payment.create({
    disbursementNo: `DV-${YEAR}-${String(index + 1).padStart(4, "0")}`,
    grossAmount: deductions.grossAmount,
    ewtAmount: deductions.ewtAmount,
    vatWithheldAmount: deductions.vatWithheldAmount,
    retentionAmount: deductions.retentionAmount,
    liquidatedDamages: deductions.liquidatedDamages,
    deductionBreakdown: deductions.breakdown,
    amount: deductions.netAmount,
    preparedAt: timing.invoiceCertified,
    releasedAt: timing.paid,
    status: "released",
    method: "Check",
    reference: `LBP-${480000 + index}`,
    invoiceId: invoice.id,
    preparedById: users.get("municipalAccountant").id,
    releasedById: users.get("municipalTreasurer").id,
  });

  await log(users, "municipalTreasurer", {
    actionType: AUDIT_ACTIONS.PAYMENT_RELEASED,
    entityRef: "payment",
    entityId: payment.id,
    summary: `${payment.disbursementNo} released to ${vendor.businessName}`,
    afterState: {
      status: "released",
      remarks:
        `Gross ${peso(deductions.grossAmount)} less ${peso(deductions.totalDeductions)} in deductions — ` +
        `net ${peso(deductions.netAmount)} released by cheque ${payment.reference}.`,
      gross: deductions.grossAmount,
      ewt: deductions.ewtAmount,
      vatWithheld: deductions.vatWithheldAmount,
      retention: deductions.retentionAmount,
      netReleased: deductions.netAmount,
    },
    recordedAt: timing.paid,
  });

  // The contract is discharged by the gross — retention and withheld tax still
  // satisfy the obligation, they simply did not go to the supplier.
  await contract.update({
    amountPaid: spec.winningBid,
    retentionHeld: deductions.retentionAmount,
    status: "completed",
    actualCompletionAt: timing.inspected,
  });

  return { invoice, payment };
};

// Stage dates, staggered per project so the portal shows a realistic spread
// rather than six identical histories.
const timingFor = (offset) => ({
  appSubmitted: at(1, 8 + offset, 9, 15),
  appConsolidated: at(1, 15 + offset, 10, 40),
  appCertified: at(1, 22 + offset, 14, 5),
  appApproved: at(1, 29 + offset, 11, 20),

  // The requisition's five signatures, in the order the form collects them:
  // the office submits, the head endorses, the Treasurer certifies the funds
  // are available, the Mayor approves, the Budget Office certifies the
  // appropriation and obligates it, and the BAC determines the mode.
  prSubmitted: at(2, 5 + offset, 8, 50),
  prEndorsed: at(2, 8 + offset, 9, 40),
  prCashCertified: at(2, 11 + offset, 13, 30),
  prMayorApproved: at(2, 15 + offset, 10, 5),
  prCertified: at(2, 17 + offset, 15, 10),
  prModeDetermined: at(2, 21 + offset, 11, 25),
  prRequired: at(5, 1 + offset),

  rfqPublished: at(3, 3 + offset, 8, 0),
  prebid: at(3, 11 + offset, 10, 0),
  rfqClosing: at(3, 24 + offset, 14, 0),
  bidSubmitted: at(3, 23 + offset, 16, 30),
  bidOpened: at(3, 24 + offset, 14, 30),
  evaluated: at(4, 2 + offset, 15, 45),

  awardRecommended: at(4, 9 + offset, 11, 0),
  awardApproved: at(4, 16 + offset, 9, 30),

  contractStart: at(5, 2 + offset),
  contractSigned: at(4, 28 + offset, 14, 20),
  deliveryDeadline: at(6, 30 + offset),

  delivered: at(6, 12 + offset, 10, 15),
  inspected: at(6, 16 + offset, 13, 40),
  invoiced: at(6, 20 + offset, 9, 5),
  invoiceCertified: at(7, 1 + offset, 11, 25),
  paid: at(7, 9 + offset, 14, 50),
});

// Clears previously seeded demonstration activity so the script is repeatable.
// Order matters: children before parents, or the foreign keys refuse.
const DAY_MS = 24 * 60 * 60 * 1000;

// ── Observers for one procurement (RA 12009 Sec. 43) ─────────────────────────
// Sec. 43.1 requires the COA representative plus at least two observers — one
// from a private group relevant to the procurement at hand, one from a CSO or
// PO. "Relevant to the procurement at hand" is what `relevantCategories` on the
// roster expresses, so an infrastructure project draws the constructors'
// association and a goods procurement draws the chamber of commerce.
//
// Invitations are backdated to the statutory five days before each activity,
// because an invitation issued later than that does not discharge the duty and
// the demo should not model a non-compliant LGU.
const seedObserversFor = async ({ rfq, spec, timing, users, opened }) => {
  const roster = await ObserverOrganization.findAll({ where: { status: "active" } });

  const relevantTo = (sector) =>
    roster.find(
      (organization) =>
        organization.sector === sector &&
        (organization.sector === "coa" ||
          (organization.relevantCategories ?? []).includes(spec.rfqCategory))
    ) ?? roster.find((organization) => organization.sector === sector);

  const invitees = ["coa", "privateGroup", "csoOrPo"].map(relevantTo).filter(Boolean);
  if (invitees.length === 0) return;

  // The stages this procurement actually reached. A solicitation still open for
  // bids has not been evaluated, so inviting observers to an evaluation that
  // has not happened would be inventing a record.
  const stages = [
    { stage: "eligibilityChecking", at: timing.bidOpened },
    ...(rfq.prebidRequired && rfq.prebidAt ? [{ stage: "prebidConference", at: timing.prebid }] : []),
    ...(opened
      ? [
          { stage: "preliminaryExamination", at: timing.bidOpened },
          { stage: "bidEvaluation", at: timing.evaluated },
          { stage: "postQualification", at: timing.evaluated },
        ]
      : []),
  ];

  for (const { stage, at } of stages) {
    if (!at) continue;
    const scheduledAt = new Date(at);
    const invitedAt = new Date(scheduledAt.getTime() - (OBSERVER_NOTICE_DAYS + 2) * DAY_MS);
    const noticeDays = Math.floor((scheduledAt - invitedAt) / DAY_MS);

    for (const organization of invitees) {
      const invitation = await ObserverInvitation.create({
        rfqId: rfq.id,
        stage,
        scheduledAt,
        invitedAt,
        noticeDays,
        noticeCompliant: noticeDays >= OBSERVER_NOTICE_DAYS,
        observerOrganizationId: organization.id,
        representativeName: organization.contactPerson ?? null,
        // Sec. 43.5 — a confidentiality agreement is entered into in all
        // instances, so an observer recorded as present has one.
        confidentialityAgreedAt: invitedAt,
        attendance: "attended",
        attendedAt: scheduledAt,
        invitedById: users.get("bacSecretariat").id,
      });

      // Sec. 43.4 — the report is due within seven calendar days of the
      // activity. Filed only where that window has already closed; a stage that
      // happened yesterday should still be showing as awaiting a report.
      const dueAt = new Date(scheduledAt.getTime() + OBSERVATION_REPORT_DAYS * DAY_MS);
      if (dueAt < new Date()) {
        await ObservationReport.create({
          invitationId: invitation.id,
          complianceAssessment:
            `The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the ` +
            `${stage} stage for ${rfq.referenceNo}. Documents were made available on request and the ` +
            `proceedings were conducted in the presence of the invited observers.`,
          areasForImprovement:
            "Copies of the abstract of bids could be circulated to observers before the session closes.",
          findingsRegular: true,
          submittedAt: new Date(scheduledAt.getTime() + 3 * DAY_MS),
          dueAt,
          submittedLate: false,
          furnishedTo: { hope: true, philgeps: true, coa: true, gppb: true, ombudsman: true },
        });
      }
    }
  }
};

const clearDemoData = async () => {
  await Security.destroy({ where: {} });
  await BacResolution.destroy({ where: {} });
  await Obligation.destroy({ where: {} });
  await Payment.destroy({ where: {} });
  await Invoice.destroy({ where: {} });
  await Delivery.destroy({ where: {} });
  await Contract.destroy({ where: {} });
  await Award.destroy({ where: {} });
  await BidOpeningRecord.destroy({ where: {} });
  await Bid.destroy({ where: {} });
  await ObservationReport.destroy({ where: {} });
  await ObserverInvitation.destroy({ where: {} });
  await Rfq.destroy({ where: {} });
  await PrLineItem.destroy({ where: {} });
  await PrHeader.destroy({ where: {} });
  await AppEntry.destroy({ where: {} });
  await Appropriation.destroy({ where: {} });
  // The planning layer, innermost first: AIP entries hang off the programme and
  // off a goal, and goals hang off the plan.
  await AipEntry.destroy({ where: {} });
  await InvestmentProgram.destroy({ where: {} });
  await DevelopmentGoal.destroy({ where: {} });
  await DevelopmentPlan.destroy({ where: {} });
  await Vendor.destroy({ where: {} });
  console.log("↷ cleared previous demonstration records");
};

try {
  await sequelize.authenticate();

  const accounts = await User.findAll({ include: [Role] });
  const users = new Map(accounts.filter((user) => user.Role).map((user) => [user.Role.key, user]));

  const required = [
    "departmentRequester",
    "bacSecretariat",
    "budgetOfficer",
    "hope",
    "bacChairperson",
    "bacMember",
    "municipalAccountant",
    "municipalTreasurer",
    "vendor",
  ];
  const missing = required.filter((roleKey) => !users.has(roleKey));
  if (missing.length) {
    console.error(`❌ Missing seeded accounts for: ${missing.join(", ")}. Run "npm run seed" first.`);
    process.exit(1);
  }

  const departments = new Map(
    (await Department.findAll()).map((department) => [department.code, department])
  );
  const mode = await ProcurementMode.findOne({ where: { key: "competitiveBidding" } });
  if (!mode) {
    console.error('❌ Procurement mode "competitiveBidding" not found. Run "npm run seed" first.');
    process.exit(1);
  }

  await clearDemoData();

  // Give the officials names, so the public timeline attributes each decision
  // to a person rather than repeating the role twice.
  let renamed = 0;
  for (const [roleKey, name] of Object.entries(OFFICIAL_NAMES)) {
    const user = users.get(roleKey);
    if (!user || user.name !== user.Role.name) continue;
    user.name = name;
    await user.save();
    renamed += 1;
  }
  if (renamed) console.log(`✅ named ${renamed} demo officials`);

  // Suppliers. The first is linked to the seeded vendor account so signing in
  // as vendor@civicbid.test lands on a profile with real history behind it.
  const vendors = {};
  for (const [key, profile] of Object.entries(VENDORS)) {
    const vendor = await Vendor.create({
      ...profile,
      philgepsExpiry: dateOnly(at(12, 31)),
      registrationStatus: "verified",
      userId: key === "medline" ? users.get("vendor").id : null,
    });
    vendor.key = key;
    vendors[key] = vendor;
  }
  console.log(`✅ ${Object.keys(vendors).length} suppliers registered`);

  // ── The planning layer ─────────────────────────────────────────────────────
  // This used to start at the Appropriation Ordinance, which left the whole
  // layer above it empty: no development plan, no investment programme, no AIP
  // entries. That was invisible on the seeded projects — they were written
  // straight into the database — but it made the system unusable for anyone
  // trying to file their *own* plan line, because an APP entry must cite a live
  // AIP entry and there were none to cite.
  //
  // Every peso in the demonstration data now traces up to a development goal.
  const plan = await DevelopmentPlan.create({
    title: `Comprehensive Development Plan ${YEAR - 2}–${YEAR + 3}`,
    startYear: YEAR - 2,
    endYear: YEAR + 3,
    vision:
      "A resilient, healthy and productive municipality where every barangay is reachable by " +
      "all-weather road and served by a functioning health station.",
    resolutionNo: `SB Res. No. ${YEAR - 2}-014`,
    adoptedAt: dateOnly(at(1, 5)),
    status: "adopted",
    preparedById: users.get("planningOfficer")?.id ?? null,
  });

  const GOALS = [
    ["health", "social", "Universal access to primary health care in every barangay"],
    ["roads", "infrastructure", "All-weather road access between the poblacion and upland barangays"],
    ["disaster", "environment", "Disaster-resilient evacuation and solid waste management"],
    ["digital", "institutional", "Digitalised frontline services in all municipal offices"],
  ];

  const goals = {};
  for (const [key, sector, title] of GOALS) {
    goals[key] = await DevelopmentGoal.create({
      developmentPlanId: plan.id,
      sector,
      title,
      status: "active",
      // The Mayor's priorities for the year (step 2). Named against the adopted
      // plan, which is the only thing a priority may be set against.
      isMayorPriority: key === "health" || key === "roads",
      priorityRank: key === "health" ? 1 : key === "roads" ? 2 : null,
      priorityFiscalYear: key === "health" || key === "roads" ? YEAR : null,
      prioritisedAt: key === "health" || key === "roads" ? at(1, 8) : null,
      prioritisedById: key === "health" || key === "roads" ? users.get("hope")?.id ?? null : null,
    });
  }

  // The Annual Investment Program: the year's costed list of projects, drawn
  // from the plan's goals and adopted by the Sanggunian.
  const program = await InvestmentProgram.create({
    fiscalYear: YEAR,
    title: `Annual Investment Program ${YEAR}`,
    status: "adopted",
    endorsedAt: at(1, 10),
    adoptedAt: at(1, 14),
    resolutionNo: `SB Res. No. ${YEAR}-002`,
    developmentPlanId: plan.id,
    preparedById: users.get("planningOfficer")?.id ?? null,
    endorsedById: users.get("hope")?.id ?? null,
  });

  // Entries deliberately costed ABOVE what the demonstration projects consume,
  // so there is headroom left for anyone walking the flow themselves.
  const aipEntries = {};
  for (const entry of [
    { key: "health", goal: "health", dept: "HEALTH", title: "Health facilities and medical equipment", cost: 9_500_000, expenseClass: "capitalOutlay" },
    { key: "roads", goal: "roads", dept: "ENGR", title: "Local roads and public infrastructure", cost: 32_000_000, expenseClass: "capitalOutlay" },
    { key: "disaster", goal: "disaster", dept: "GSO", title: "Solid waste and evacuation facilities", cost: 14_000_000, expenseClass: "capitalOutlay" },
    { key: "digital", goal: "digital", dept: "IT", title: "Municipal digitalisation programme", cost: 3_400_000, expenseClass: "mooe" },
    { key: "schoolHealth", goal: "health", dept: "HEALTH", title: "School health and nutrition programme", cost: 2_200_000, expenseClass: "mooe" },
  ]) {
    aipEntries[entry.key] = await AipEntry.create({
      investmentProgramId: program.id,
      developmentGoalId: goals[entry.goal].id,
      implementingUnitId: departments.get(entry.dept)?.id ?? null,
      reference: `AIP-${YEAR}-${entry.key.toUpperCase().slice(0, 6)}`,
      title: entry.title,
      expectedOutput: entry.title,
      expenseClass: entry.expenseClass,
      fund: entry.key === "schoolHealth" ? "specialEducationFund" : "generalFund",
      estimatedCost: entry.cost,
      startQuarter: "Q1",
      endQuarter: "Q4",
      status: "planned",
    });
  }
  console.log(
    `✅ development plan adopted, ${Object.keys(aipEntries).length} AIP entries under ${program.title}`
  );

  // The Appropriation Ordinance comes next — nothing downstream can exist
  // without a budget line to charge against.
  const ordinanceNo = `Ord. No. ${YEAR}-01`;
  const appropriations = {};
  let appropriatedTotal = 0;
  for (const line of APPROPRIATIONS) {
    const office = departments.get(line.department);
    const record = await Appropriation.create({
      fiscalYear: YEAR,
      ordinanceNo,
      ordinanceDate: dateOnly(at(1, 5)),
      type: "annual",
      fund: line.fund,
      expenseClass: line.expenseClass,
      papCode: line.papCode,
      uacsCode: line.uacsCode,
      title: line.title,
      amount: line.amount,
      status: "enacted",
      departmentId: office?.id ?? null,
      recordedById: users.get("budgetOfficer").id,
    });
    appropriations[line.key] = record;
    appropriatedTotal += line.amount;
  }
  console.log(
    `✅ ${APPROPRIATIONS.length} appropriation lines enacted under ${ordinanceNo} — ${peso(appropriatedTotal)}`
  );

  for (const [index, spec] of PROJECTS.entries()) {
    const department = departments.get(spec.department);
    if (!department) {
      console.warn(`⚠ skipped "${spec.projectTitle}" — department ${spec.department} not seeded`);
      continue;
    }

    const appropriation = appropriations[spec.appropriation];
    if (!appropriation) {
      console.warn(`⚠ skipped "${spec.projectTitle}" — no appropriation line ${spec.appropriation}`);
      continue;
    }

    const timing = timingFor(index);
    const entry = await runAppStage(users, spec, department, timing, appropriation, aipEntries[spec.aipEntry]);

    if (spec.reach === "upcoming") {
      console.log(`✅ ${spec.projectTitle} — upcoming (approved plan)`);
      continue;
    }

    // The mode is determined on the requisition (step 19) and the solicitation
    // inherits it, so it has to be resolved before the PR stage rather than at
    // RFQ time as it used to be.
    const pr = await runPrStage(users, spec, entry, department, timing, index, appropriation, mode);

    if (spec.reach === "bidding") {
      // Still accepting bids, so its dates straddle today rather than sitting
      // in the fixed calendar the finished projects use.
      const openTiming = {
        ...timing,
        rfqPublished: daysFromNow(-9, 8),
        prebid: daysFromNow(-2, 10),
        rfqClosing: daysFromNow(12, 14),
        bidSubmitted: daysFromNow(-3, 15),
      };
      const rfq = await runSolicitationStage(users, spec, pr, mode, openTiming, index, "published");
      await runBidStage(users, spec, rfq, vendors, openTiming, false);
      console.log(`✅ ${spec.projectTitle} — ongoing (open for bidding, closes in 12 days)`);
      continue;
    }

    const rfq = await runSolicitationStage(users, spec, pr, mode, timing, index, "awarded");
    const bids = await runBidStage(users, spec, rfq, vendors, timing, true);
    const vendor = vendors[spec.vendorKey];
    const award = await runAwardStage(users, spec, rfq, bids[0], vendor, timing, index);

    if (spec.reach === "contract") {
      const contract = await runContractStage(users, spec, award, vendor, timing, index, "active");
      await runDeliveryStage(users, contract, timing, false);
      console.log(`✅ ${spec.projectTitle} — ongoing (contract in force)`);
      continue;
    }

    // Created active, closed by the payment stage — the same order the live
    // system produces, since a contract now closes on final payment rather
    // than being born complete.
    const contract = await runContractStage(users, spec, award, vendor, timing, index, "active");
    const delivery = await runDeliveryStage(users, contract, timing, true);
    await runPaymentStage(users, spec, contract, delivery, vendor, timing, index);
    console.log(`✅ ${spec.projectTitle} — completed`);
  }

  console.log("\nDemonstration data ready. Open http://localhost:5173/ to view the public portal.");
} catch (err) {
  console.error("❌ Demo seed failed:", err);
  process.exitCode = 1;
} finally {
  process.exit();
}
