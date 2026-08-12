import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

// Simple key/value store for LGU-wide configuration. Values that regulators
// periodically adjust (LGU income classification, which drives the Sec. 34.2
// procurement ceilings) live here rather than in code, so an administrator can
// update them without a redeploy.
export const SystemSetting = sequelize.define("SystemSetting", {
  key: { type: DataTypes.STRING, allowNull: false, unique: true },
  // TEXT instead of STRING: the nav-shortcuts value is a JSON object keyed by
  // role, and some branding values (the transparency footer) are multi-sentence.
  value: { type: DataTypes.TEXT, allowNull: false },
  description: { type: DataTypes.STRING, allowNull: true },
});

export const SETTING_KEYS = {
  LGU_NAME: "lgu.name",
  // The office address, for the party clause and letterhead of generated
  // documents. A contract naming the municipality has to say where it sits, and
  // there was previously nowhere to hold that.
  LGU_ADDRESS: "lgu.address",
  LGU_TYPE: "lgu.type",
  LGU_INCOME_CLASS: "lgu.incomeClass",
  // COA's capitalisation threshold: an item with a useful life beyond one year
  // costing at least this much is Capital Outlay and is capitalised as PPE;
  // below it, the item is still property but is carried as semi-expendable and
  // expensed on issue. COA Circular 2022-004 raised this to ₱50,000, and it has
  // moved before, so it is configuration rather than a constant.
  CAPITALIZATION_THRESHOLD: "accounting.capitalizationThreshold",

  // ── Branding ─────────────────────────────────────────────────────────────
  // The system name, transparency portal title, and transparency footer are
  // configurable so the system can be rebranded for a different LGU deployment.
  SYSTEM_NAME: "branding.systemName",
  TRANSPARENCY_TITLE: "branding.transparencyTitle",
  TRANSPARENCY_FOOTER: "branding.transparencyFooter",

  // ── Navigation shortcuts ─────────────────────────────────────────────────
  // A single JSON blob keyed by role name → array of { href, shortcut } pairs.
  // The frontend merges these on top of the hardcoded defaults.
  NAV_SHORTCUTS: "nav.shortcuts",
};

export const DEFAULT_CAPITALIZATION_THRESHOLD = 50000;

// ── Default branding values ────────────────────────────────────────────────
export const DEFAULT_SYSTEM_NAME = "Procurenance";
export const DEFAULT_TRANSPARENCY_TITLE = "Transparency Portal";
export const DEFAULT_TRANSPARENCY_FOOTER =
  "Published under the Implementing Rules and Regulations of RA No. 12009 " +
  "(New Government Procurement Act). These pages show approved and published " +
  "records only. Drafts, internal deliberations, evaluator identities and " +
  "individual bid scores are not published — blind evaluation depends on the " +
  "scorer remaining unidentified. Figures are as recorded by the Bids and " +
  "Awards Committee. For records not shown here, file a request with the " +
  "BAC Secretariat.";

export const getLguProfile = async () => {
  const rows = await SystemSetting.findAll({
    where: { key: Object.values(SETTING_KEYS) },
  });
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  const threshold = Number(map[SETTING_KEYS.CAPITALIZATION_THRESHOLD]);

  return {
    name: map[SETTING_KEYS.LGU_NAME] ?? "Municipality",
    address: map[SETTING_KEYS.LGU_ADDRESS] ?? "",
    lguType: map[SETTING_KEYS.LGU_TYPE] ?? "municipality",
    incomeClass: map[SETTING_KEYS.LGU_INCOME_CLASS] ?? "1st",
    capitalizationThreshold:
      Number.isFinite(threshold) && threshold > 0 ? threshold : DEFAULT_CAPITALIZATION_THRESHOLD,
  };
};

// ── Branding helpers ───────────────────────────────────────────────────────
export const getSystemBranding = async () => {
  const keys = [
    SETTING_KEYS.SYSTEM_NAME,
    SETTING_KEYS.TRANSPARENCY_TITLE,
    SETTING_KEYS.TRANSPARENCY_FOOTER,
  ];
  const rows = await SystemSetting.findAll({ where: { key: keys } });
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  return {
    systemName: map[SETTING_KEYS.SYSTEM_NAME] || DEFAULT_SYSTEM_NAME,
    transparencyTitle: map[SETTING_KEYS.TRANSPARENCY_TITLE] || DEFAULT_TRANSPARENCY_TITLE,
    transparencyFooter: map[SETTING_KEYS.TRANSPARENCY_FOOTER] || DEFAULT_TRANSPARENCY_FOOTER,
  };
};

// ── Nav shortcut helpers ───────────────────────────────────────────────────
// Returns the stored overrides as a plain object { roleName: [{ href, shortcut }] }
// or an empty object when the admin has never customised shortcuts.
export const getNavShortcuts = async () => {
  const row = await SystemSetting.findOne({
    where: { key: SETTING_KEYS.NAV_SHORTCUTS },
  });
  if (!row) return {};
  try {
    return JSON.parse(row.value);
  } catch {
    return {};
  }
};

export const setNavShortcuts = async (shortcuts) => {
  const value = JSON.stringify(shortcuts);
  const [row] = await SystemSetting.findOrCreate({
    where: { key: SETTING_KEYS.NAV_SHORTCUTS },
    defaults: {
      key: SETTING_KEYS.NAV_SHORTCUTS,
      value,
      description: "Admin-customised keyboard shortcuts for sidebar navigation, keyed by role.",
    },
  });
  row.value = value;
  await row.save();
};

export { sequelize };
