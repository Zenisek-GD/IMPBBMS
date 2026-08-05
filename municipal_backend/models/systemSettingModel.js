import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

// Simple key/value store for LGU-wide configuration. Values that regulators
// periodically adjust (LGU income classification, which drives the Sec. 34.2
// procurement ceilings) live here rather than in code, so an administrator can
// update them without a redeploy.
export const SystemSetting = sequelize.define("SystemSetting", {
  key: { type: DataTypes.STRING, allowNull: false, unique: true },
  value: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.STRING, allowNull: true },
});

export const SETTING_KEYS = {
  LGU_NAME: "lgu.name",
  LGU_TYPE: "lgu.type",
  LGU_INCOME_CLASS: "lgu.incomeClass",
  // COA's capitalisation threshold: an item with a useful life beyond one year
  // costing at least this much is Capital Outlay and is capitalised as PPE;
  // below it, the item is still property but is carried as semi-expendable and
  // expensed on issue. COA Circular 2022-004 raised this to ₱50,000, and it has
  // moved before, so it is configuration rather than a constant.
  CAPITALIZATION_THRESHOLD: "accounting.capitalizationThreshold",
};

export const DEFAULT_CAPITALIZATION_THRESHOLD = 50000;

export const getLguProfile = async () => {
  const rows = await SystemSetting.findAll({
    where: { key: Object.values(SETTING_KEYS) },
  });
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  const threshold = Number(map[SETTING_KEYS.CAPITALIZATION_THRESHOLD]);

  return {
    name: map[SETTING_KEYS.LGU_NAME] ?? "Municipality",
    lguType: map[SETTING_KEYS.LGU_TYPE] ?? "municipality",
    incomeClass: map[SETTING_KEYS.LGU_INCOME_CLASS] ?? "1st",
    capitalizationThreshold:
      Number.isFinite(threshold) && threshold > 0 ? threshold : DEFAULT_CAPITALIZATION_THRESHOLD,
  };
};

export { sequelize };
