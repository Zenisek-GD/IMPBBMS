import "./config/env.js";
import { sequelize } from "./models/db.js";
import { Role } from "./models/roleModel.js";
import { Department } from "./models/departmentModel.js";
import { User } from "./models/userModel.js";
import { Permission } from "./models/permissionModel.js";
import { SystemSetting, SETTING_KEYS } from "./models/systemSettingModel.js";
import { ProcurementMode } from "./models/procurementModeModel.js";
import { ObserverOrganization } from "./models/observerModel.js";
import { PERMISSIONS, ROLE_PERMISSIONS } from "./config/permissionMatrix.js";
import {
  DocumentTemplate,
  DocumentTemplateVersion,
  nextVersionNo,
} from "./models/documentTemplateModel.js";
import { isPublishableType } from "./services/documentTypes.js";
import { DEFAULT_TEMPLATES } from "./config/defaultTemplates.js";

// One row per role from the system design doc, Section 2.1. `key` must match
// municipal-frontend/src/config/navigation.js's ROLE_NAV keys and
// src/config/roleLanding.js's landing-route map.
const ROLES = [
  { key: "systemAdministrator", name: "System Administrator" },
  { key: "hope", name: "HOPE (Municipal Mayor)" },
  { key: "bacChairperson", name: "BAC Chairperson" },
  // The quorum rule turns on this office: a majority constitutes a quorum
  // "provided that the Chairperson or the Vice-Chairperson should be present in
  // all meetings and deliberations". Without the role a committee whose
  // Chairperson was absent could never lawfully sit.
  { key: "bacViceChairperson", name: "BAC Vice-Chairperson" },
  { key: "bacMember", name: "BAC Member" },
  { key: "bacSecretariat", name: "BAC Secretariat" },
  { key: "twgMember", name: "TWG Member" },
  // The office head who endorses what their staff prepare (step 15). Two people,
  // not one: the controller refuses a requester who endorses their own request,
  // so without this role every requisition stopped at the endorsement stage.
  { key: "headOfOffice", name: "Head of Office" },
  { key: "departmentRequester", name: "Department Requester" },
  { key: "budgetOfficer", name: "Budget Officer" },
  // The two offices the planning and budget-legislation chain runs through.
  // Without them the process began at "a Budget Officer types in the enacted
  // figures", with no development plan behind it and no legislature in front.
  { key: "planningOfficer", name: "Municipal Planning and Development Coordinator" },
  { key: "sanggunianSecretary", name: "Secretary to the Sangguniang Bayan" },
  // Two roles, not one. A single "Finance Officer" holding both certification
  // and release meant either that one person controlled a whole disbursement,
  // or — once the same-person rule was enforced — that no payment could be
  // released at all, because there was nobody else to release it.
  { key: "municipalAccountant", name: "Municipal Accountant" },
  { key: "municipalTreasurer", name: "Municipal Treasurer" },
  { key: "vendor", name: "Vendor / Supplier" },
  { key: "observer", name: "Observer / Public Auditor" },
  { key: "internalAuditor", name: "Internal Auditor" },
];

// Typical municipal LGU offices. Section 7.7 of the design doc expects non-BAC
// offices such as the GSO and IT Office to raise their own procurement, so they
// are seeded as end-user departments alongside the committee and support units.
const DEPARTMENTS = [
  { code: "OMAYOR", name: "Office of the Mayor", type: "executive" },
  { code: "SB", name: "Office of the Sangguniang Bayan", type: "executive" },
  { code: "MPDO", name: "Municipal Planning and Development Office", type: "support" },
  { code: "BAC", name: "Bids and Awards Committee", type: "committee" },
  { code: "BACSEC", name: "BAC Secretariat", type: "committee" },
  { code: "TWG", name: "Technical Working Group", type: "committee" },
  { code: "BUDGET", name: "Municipal Budget Office", type: "support" },
  { code: "ACCTG", name: "Municipal Accounting Office", type: "support" },
  { code: "TREAS", name: "Municipal Treasurer's Office", type: "support" },
  { code: "GSO", name: "General Services Office (GSO)", type: "endUser" },
  { code: "ENGR", name: "Municipal Engineering Office", type: "endUser" },
  { code: "HEALTH", name: "Municipal Health Office", type: "endUser" },
  { code: "IT", name: "Information Technology Office", type: "endUser" },
  { code: "INTAUDIT", name: "Internal Audit Service", type: "support" },
];

// The office each role normally sits in. Used for two things: seeding the demo
// accounts, and setting Role.defaultDepartmentId so the admin's create-user
// form pre-fills a sensible department. Vendor and Observer are external to the
// LGU and deliberately have none.
const ROLE_DEPARTMENT = {
  systemAdministrator: "IT",
  hope: "OMAYOR",
  bacChairperson: "BAC",
  bacViceChairperson: "BAC",
  bacMember: "BAC",
  bacSecretariat: "BACSEC",
  twgMember: "TWG",
  headOfOffice: "ENGR",
  departmentRequester: "ENGR",
  budgetOfficer: "BUDGET",
  planningOfficer: "MPDO",
  sanggunianSecretary: "SB",
  municipalAccountant: "ACCTG",
  municipalTreasurer: "TREAS",
  internalAuditor: "INTAUDIT",
};

// The 11 modes from design doc Section 3, with the IRR sections that define
// them. Competitive Bidding is the default and needs no justification; every
// other mode is an alternative mode requiring documented justification, and a
// few require prior HOPE approval.
// Each mode now declares how it actually reaches an award. `minimumOffers` and
// `allowsDirectAward` are what the bidding controller branches on, so choosing
// Direct Contracting no longer silently runs a sealed competitive bidding.
const PROCUREMENT_MODES = [
  { key: "competitiveBidding", name: "Competitive Bidding", isDefault: true, requiresJustification: false, requiresHopeApproval: false, citation: "IRR Sec. 26", sortOrder: 1,
    requiresCompetitiveBidding: true, minimumOffers: 2, allowsDirectAward: false, requiresBidSecurity: true },

  { key: "limitedSourceBidding", name: "Limited Source Bidding", requiresHopeApproval: true, citation: "IRR Sec. 28", sortOrder: 2,
    requiresCompetitiveBidding: true, minimumOffers: 2, allowsDirectAward: false, requiresBidSecurity: true },

  { key: "competitiveDialogue", name: "Competitive Dialogue", requiresHopeApproval: true, citation: "IRR Sec. 29", sortOrder: 3,
    requiresCompetitiveBidding: true, minimumOffers: 2, allowsDirectAward: false, requiresBidSecurity: true },

  { key: "unsolicitedOffer", name: "Unsolicited Offer with Bid Matching", requiresHopeApproval: true, citation: "IRR Sec. 30", sortOrder: 4,
    requiresCompetitiveBidding: true, minimumOffers: 1, allowsDirectAward: false, requiresBidSecurity: true },

  // Single-source: the BAC resolves to buy from one named supplier and
  // documents why. There is no bidding, so no bid security and no contest.
  { key: "directContracting", name: "Direct Contracting", requiresHopeApproval: true, citation: "IRR Sec. 31", sortOrder: 5,
    requiresCompetitiveBidding: false, minimumOffers: 1, allowsDirectAward: true, requiresBidSecurity: false },

  { key: "directAcquisition", name: "Direct Acquisition", requiresHopeApproval: false, citation: "IRR Sec. 32", sortOrder: 6,
    requiresCompetitiveBidding: false, minimumOffers: 1, allowsDirectAward: true, requiresBidSecurity: false },

  // Re-awards a previous contract at the same unit price — nothing to bid.
  { key: "repeatOrder", name: "Repeat Order", requiresHopeApproval: true, citation: "IRR Sec. 33", sortOrder: 7,
    requiresCompetitiveBidding: false, minimumOffers: 1, allowsDirectAward: true, requiresBidSecurity: false },

  // Three quotations, not sealed two-envelope bids.
  { key: "smallValueProcurement", name: "Small Value Procurement", requiresHopeApproval: false, citation: "IRR Sec. 34", sortOrder: 8,
    requiresCompetitiveBidding: false, minimumOffers: 3, allowsDirectAward: false, requiresBidSecurity: false },

  { key: "negotiatedProcurement", name: "Negotiated Procurement", requiresHopeApproval: true, citation: "IRR Sec. 35", sortOrder: 9,
    requiresCompetitiveBidding: false, minimumOffers: 1, allowsDirectAward: true, requiresBidSecurity: false },

  { key: "directSales", name: "Direct Sales", requiresHopeApproval: true, citation: "IRR Sec. 36", sortOrder: 10,
    requiresCompetitiveBidding: false, minimumOffers: 1, allowsDirectAward: true, requiresBidSecurity: false },

  { key: "stiProcurement", name: "Direct Procurement for Science, Technology, and Innovation", requiresHopeApproval: true, citation: "IRR Sec. 37", sortOrder: 11,
    requiresCompetitiveBidding: false, minimumOffers: 1, allowsDirectAward: true, requiresBidSecurity: false },
];

// ── The observer roster (RA 12009 Sec. 43.1) ─────────────────────────────────
// The BAC invites, in addition to the COA representative, at least two
// observers: one from "a duly recognized private group in a sector or
// discipline relevant to the procurement at hand", and one from a civil society
// or people's organisation.
//
// `relevantCategories` is what makes "relevant to the procurement at hand"
// operable — a constructors' association observes infrastructure, a PCCI
// chamber member observes goods, and a PRC-recognised professional body
// observes consulting services. The CSO and COA sit on everything.
//
// Sec. 43.1.2 requires the private group or CSO/PO to be registered with the
// SEC or the CDA. The registration numbers below are placeholders for a
// demonstration LGU; a real deployment replaces them with the actual
// registrations of the bodies it has accredited.
const OBSERVER_ORGANIZATIONS = [
  {
    name: "Commission on Audit — Resident Auditor, Municipal Office",
    sector: "coa",
    registryBody: "coa",
    registrationNo: null,
    relevantCategories: ["goods", "infrastructure", "consulting"],
    contactPerson: "Office of the Resident Auditor",
    status: "active",
  },
  {
    name: "Philippine Constructors Association, Inc. (PCA)",
    sector: "privateGroup",
    registryBody: "sec",
    registrationNo: "SEC-PCA-000123",
    relevantCategories: ["infrastructure"],
    status: "active",
  },
  {
    name: "National Constructors Association of the Philippines, Inc. (NACAP)",
    sector: "privateGroup",
    registryBody: "sec",
    registrationNo: "SEC-NACAP-000456",
    relevantCategories: ["infrastructure"],
    status: "active",
  },
  {
    name: "Philippine Chamber of Commerce and Industry — Provincial Chapter",
    sector: "privateGroup",
    registryBody: "sec",
    registrationNo: "SEC-PCCI-000789",
    relevantCategories: ["goods"],
    status: "active",
  },
  {
    name: "Philippine Institute of Civil Engineers (PICE) — Provincial Chapter",
    sector: "privateGroup",
    registryBody: "sec",
    registrationNo: "SEC-PICE-001011",
    relevantCategories: ["infrastructure", "consulting"],
    status: "active",
  },
  {
    name: "Philippine Institute of Certified Public Accountants (PICPA)",
    sector: "privateGroup",
    registryBody: "sec",
    registrationNo: "SEC-PICPA-001213",
    relevantCategories: ["consulting"],
    status: "active",
  },
  {
    name: "Municipal Federation of Peoples Organizations",
    sector: "csoOrPo",
    registryBody: "cda",
    registrationNo: "CDA-MFPO-001415",
    relevantCategories: ["goods", "infrastructure", "consulting"],
    status: "active",
  },
  {
    name: "Parish Social Action Council — Diocesan Commission on Governance",
    sector: "csoOrPo",
    registryBody: "sec",
    registrationNo: "SEC-PSAC-001617",
    relevantCategories: ["goods", "infrastructure", "consulting"],
    status: "active",
  },
];

// Dev-only seed password for every demo account below. This is not a real
// credential — print a reminder and change it before any non-local use.
const SEED_PASSWORD = "Passw0rd!";

// The LGU's own classification drives the Sec. 34.2 procurement ceilings, so
// it is configuration rather than a constant. Adjust to match the actual LGU.
const LGU_SETTINGS = [
  {
    key: SETTING_KEYS.LGU_NAME,
    value: "Municipality of Roxas, Oriental Mindoro",
    description: "Name of the local government unit",
  },
  {
    key: SETTING_KEYS.LGU_ADDRESS,
    value: "Municipal Hall Compound, Poblacion, Roxas, Oriental Mindoro",
    description: "Office address printed on generated documents and contract party clauses",
  },
  {
    key: SETTING_KEYS.LGU_TYPE,
    value: "municipality",
    description: "province | city | municipality | barangay — drives IRR Sec. 34.2 thresholds",
  },
  {
    // Roxas, Oriental Mindoro is recorded as a 2nd class municipality; a
    // December 2024 DOF order reportedly reclassified it to 1st. Either way the
    // IRR Sec. 34.2 SVP ceiling for a municipality is the same (₱400,000) for
    // 1st through 3rd class, so the operative threshold is unaffected. The
    // administrator can correct this from the System Settings screen.
    key: SETTING_KEYS.LGU_INCOME_CLASS,
    value: "2nd",
    description: "1st–5th income class — drives IRR Sec. 34.2 thresholds",
  },
  {
    key: SETTING_KEYS.CAPITALIZATION_THRESHOLD,
    value: "50000",
    description:
      "Peso threshold at or above which a long-lived item is Capital Outlay; below it, semi-expendable (COA Circular 2022-004)",
  },
];

try {
  await sequelize.authenticate();

  for (const setting of LGU_SETTINGS) {
    const [row, created] = await SystemSetting.findOrCreate({
      where: { key: setting.key },
      defaults: setting,
    });
    // Keep seeded identity current even if the row already existed.
    if (!created && row.value !== setting.value) {
      row.value = setting.value;
      row.description = setting.description;
      await row.save();
    }
    console.log(`${created ? "✅ created" : "↷ updated"} setting: ${setting.key} = ${setting.value}`);
  }

  for (const mode of PROCUREMENT_MODES) {
    const [record, created] = await ProcurementMode.findOrCreate({
      where: { key: mode.key },
      defaults: mode,
    });
    if (!created) {
      await record.update(mode);
    }
  }
  console.log(`✅ ${PROCUREMENT_MODES.length} procurement modes registered`);

  // The observer roster. Without at least one organisation of each of the three
  // constituencies the BAC has nobody to invite, and the Sec. 43 machinery —
  // which is the most visible transparency control in the whole process — is
  // present but unusable. Seeded as reference data for the same reason the
  // procurement modes are: it is a list every Procuring Entity needs and none
  // of them should have to type from scratch.
  for (const organization of OBSERVER_ORGANIZATIONS) {
    const [record, created] = await ObserverOrganization.findOrCreate({
      where: { name: organization.name },
      defaults: organization,
    });
    if (!created) {
      await record.update(organization);
    }
  }
  console.log(`✅ ${OBSERVER_ORGANIZATIONS.length} observer organisations on the roster`);

  const permissionsByKey = {};
  for (const permission of PERMISSIONS) {
    const [record] = await Permission.findOrCreate({
      where: { key: permission.key },
      defaults: permission,
    });
    permissionsByKey[permission.key] = record;
  }
  console.log(`✅ ${PERMISSIONS.length} permissions registered`);

  const departmentsByCode = {};
  for (const department of DEPARTMENTS) {
    const [record, created] = await Department.findOrCreate({
      where: { code: department.code },
      defaults: department,
    });
    if (!created && record.name !== department.name) {
      record.name = department.name;
      await record.save();
    }
    departmentsByCode[department.code] = record;
    console.log(`${created ? "✅ created" : "↷ updated"} department: ${department.code} — ${department.name}`);
  }

  for (const role of ROLES) {
    const [record] = await Role.findOrCreate({ where: { key: role.key }, defaults: role });

    const departmentCode = ROLE_DEPARTMENT[role.key];
    const departmentId = departmentCode ? departmentsByCode[departmentCode].id : null;

    // Keep the role's default department in step on re-runs.
    if (record.defaultDepartmentId !== departmentId) {
      record.defaultDepartmentId = departmentId;
      await record.save();
    }

    // Replace rather than append, so removing a permission from the matrix
    // actually revokes it on the next seed run.
    const grantedKeys = ROLE_PERMISSIONS[role.key] ?? [];
    await record.setPermissions(grantedKeys.map((key) => permissionsByKey[key]));

    const email = `${role.key.toLowerCase()}@procurenance.com`;
    const [user, created] = await User.findOrCreate({
      where: { email },
      defaults: {
        name: role.name,
        email,
        password: SEED_PASSWORD,
        status: "active",
        roleId: record.id,
        departmentId,
      },
    });

    // Backfill the department on accounts seeded before departments existed.
    if (!created && user.departmentId !== departmentId) {
      user.departmentId = departmentId;
      await user.save();
    }

    console.log(
      `${created ? "✅ created" : "↷ exists"}: ${email} (${role.name})` +
        `${departmentCode ? ` → ${departmentCode}` : " → external"} · ${grantedKeys.length} permission(s)`
    );

    // ── Designate the office head ────────────────────────────────────────────
    // Endorsement (step 15) is decided by *headship* — `Department.headUserId` —
    // not by permission, and the controller refuses a requester who endorses
    // their own requisition. With no head designated anywhere, every requisition
    // stopped at `pendingDepartmentHeadEndorsement` with no officer able to move
    // it and no screen to fix it. The Head of Office account is designated here
    // so the chain runs end to end out of the box.
    if (role.key === "headOfOffice" && departmentId) {
      const office = await Department.findByPk(departmentId);
      if (office && office.headUserId !== user.id) {
        office.headUserId = user.id;
        await office.save();
        console.log(`   ↳ designated as Head of ${departmentCode}`);
      }
    }
  }

  // ── Document templates ─────────────────────────────────────────────────────
  // Seeded system templates are refreshed on re-run so a wording fix ships,
  // but only ever by adding a *new version* — the old one stays, because
  // documents already generated from it must remain explicable. Anything an
  // official authored is left alone entirely.
  for (const spec of DEFAULT_TEMPLATES) {
    const [template, created] = await DocumentTemplate.findOrCreate({
      where: { key: spec.key },
      defaults: {
        key: spec.key,
        name: spec.name,
        documentType: spec.documentType,
        description: spec.description,
        status: "active",
        publishable: isPublishableType(spec.documentType),
        isSystemTemplate: true,
      },
    });

    const current = template.activeVersionId
      ? await DocumentTemplateVersion.findByPk(template.activeVersionId)
      : null;

    const unchanged =
      current &&
      current.bodyHtml === spec.bodyHtml &&
      (current.footerHtml ?? null) === (spec.footerHtml ?? null) &&
      (current.css ?? null) === (spec.css ?? null);

    if (unchanged) {
      console.log(`↷ template up to date: ${spec.key} (v${current.versionNo})`);
      continue;
    }

    const version = await DocumentTemplateVersion.create({
      documentTemplateId: template.id,
      versionNo: await nextVersionNo(template.id),
      bodyHtml: spec.bodyHtml,
      headerHtml: spec.headerHtml ?? null,
      footerHtml: spec.footerHtml ?? null,
      css: spec.css ?? null,
      pageSize: spec.pageSize ?? "A4",
      landscape: Boolean(spec.landscape),
      margins: spec.margins ?? null,
      changeNote: created ? "Seeded with the system" : "Refreshed from the seeded default",
    });

    await template.update({
      activeVersionId: version.id,
      name: spec.name,
      description: spec.description,
      publishable: isPublishableType(spec.documentType),
    });

    console.log(`${created ? "✅ created" : "↷ updated"} template: ${spec.key} → v${version.versionNo}`);
  }
  console.log(`✅ ${DEFAULT_TEMPLATES.length} document templates registered`);

  // ── Integrity baseline ────────────────────────────────────────────────────
  // Must come last, after every row above exists. The monitor treats a row with
  // no fingerprint as an unauthorised insert, so seeding without this would make
  // the first scan report the entire seeded database as tampering.
  const { rebaseline } = await import("./services/integrityMonitor.js");
  const counts = await rebaseline();
  const fingerprinted = Object.values(counts).reduce((sum, n) => sum + n, 0);
  console.log(`✅ integrity baseline set over ${fingerprinted} records`);

  console.log(`\nAll seed accounts use the password: ${SEED_PASSWORD}`);
  console.log("Dev-only — do not reuse these accounts or password outside local development.");
} catch (err) {
  console.error("❌ Seed failed:", err);
} finally {
  process.exit();
}
