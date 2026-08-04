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
import { Security, requiredBidSecurity, requiredPerformanceSecurity } from "./models/securityModel.js";
import { BacResolution } from "./models/bacResolutionModel.js";
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

const runAppStage = async (users, spec, department, timing, appropriation) => {
  const entry = await AppEntry.create({
    appropriationId: appropriation.id,
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

const runPrStage = async (users, spec, entry, department, timing, index, appropriation) => {
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
    fundsReservedAt: timing.prCertified,
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
  // Certification is the obligation. The ORS is what actually commits the money
  // against the ordinance line — the requisition status alone commits nothing.
  await Obligation.create({
    obligationNo,
    amount: spec.abc,
    status: "obligated",
    certifiedAt: timing.prCertified,
    certifiedById: users.get("budgetOfficer").id,
    particulars: spec.projectTitle,
    appropriationId: appropriation.id,
    prHeaderId: pr.id,
  });

  await transition(
    "budgetOfficer",
    "certify",
    "pendingBudgetCertification",
    "pendingSecretariatReview",
    timing.prCertified,
    `${obligationNo} issued against ${appropriation.ordinanceNo}. ${peso(spec.abc)} obligated.`
  );
  await transition(
    "bacSecretariat",
    "review",
    "pendingSecretariatReview",
    "pendingHopeApproval",
    timing.prReviewed,
    "Technical specifications reviewed and found complete."
  );
  await transition(
    "hope",
    "approve",
    "pendingHopeApproval",
    "approved",
    timing.prApproved,
    "Approved for procurement through competitive bidding."
  );

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

  await log(users, "bacChairperson", {
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

  prSubmitted: at(2, 5 + offset, 8, 50),
  prCertified: at(2, 11 + offset, 13, 30),
  prReviewed: at(2, 17 + offset, 15, 10),
  prApproved: at(2, 21 + offset, 10, 5),
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
  await Rfq.destroy({ where: {} });
  await PrLineItem.destroy({ where: {} });
  await PrHeader.destroy({ where: {} });
  await AppEntry.destroy({ where: {} });
  await Appropriation.destroy({ where: {} });
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

  // The Appropriation Ordinance comes first — nothing downstream can exist
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
    const entry = await runAppStage(users, spec, department, timing, appropriation);

    if (spec.reach === "upcoming") {
      console.log(`✅ ${spec.projectTitle} — upcoming (approved plan)`);
      continue;
    }

    const pr = await runPrStage(users, spec, entry, department, timing, index, appropriation);

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
