import "./config/env.js";
import { sequelize } from "./models/db.js";
import { Role } from "./models/roleModel.js";
import { Department } from "./models/departmentModel.js";
import { User } from "./models/userModel.js";
import { Permission } from "./models/permissionModel.js";
import { SystemSetting, SETTING_KEYS } from "./models/systemSettingModel.js";
import { ProcurementMode } from "./models/procurementModeModel.js";
import { PERMISSIONS, ROLE_PERMISSIONS } from "./config/permissionMatrix.js";

// One row per role from the system design doc, Section 2.1. `key` must match
// municipal-frontend/src/config/navigation.js's ROLE_NAV keys and
// src/config/roleLanding.js's landing-route map.
const ROLES = [
  { key: "systemAdministrator", name: "System Administrator" },
  { key: "hope", name: "HOPE (Municipal Mayor)" },
  { key: "bacChairperson", name: "BAC Chairperson" },
  { key: "bacMember", name: "BAC Member" },
  { key: "bacSecretariat", name: "BAC Secretariat" },
  { key: "twgMember", name: "TWG Member" },
  { key: "departmentRequester", name: "Department Requester" },
  { key: "budgetOfficer", name: "Budget Officer" },
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
  bacMember: "BAC",
  bacSecretariat: "BACSEC",
  twgMember: "TWG",
  departmentRequester: "ENGR",
  budgetOfficer: "BUDGET",
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

    const email = `${role.key.toLowerCase()}@civicbid.test`;
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
  }

  console.log(`\nAll seed accounts use the password: ${SEED_PASSWORD}`);
  console.log("Dev-only — do not reuse these accounts or password outside local development.");
} catch (err) {
  console.error("❌ Seed failed:", err);
} finally {
  process.exit();
}
