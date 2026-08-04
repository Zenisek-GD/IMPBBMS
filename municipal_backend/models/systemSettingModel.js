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
};

export const getLguProfile = async () => {
  const rows = await SystemSetting.findAll({
    where: { key: Object.values(SETTING_KEYS) },
  });
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  return {
    name: map[SETTING_KEYS.LGU_NAME] ?? "Municipality",
    lguType: map[SETTING_KEYS.LGU_TYPE] ?? "municipality",
    incomeClass: map[SETTING_KEYS.LGU_INCOME_CLASS] ?? "1st",
  };
};

export { sequelize };
