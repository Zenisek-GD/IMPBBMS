import { sequelize } from "../models/db.js";
import { AppEntry } from "../models/appEntryModel.js";
import { PrHeader, PrLineItem } from "../models/prModel.js";

// Targeted and repeatable. No broad sync/alter, business value changes, or
// migrations into later procurement modules.
export const migrateProcurementRecovery = async () => {
  const qi = sequelize.getQueryInterface(), added = [], changed = [];
  let columns = await qi.describeTable(AppEntry.getTableName());
  for (const field of ["recoveryKey", "recoveryImport"]) {
    if (columns[field]) continue;
    const { unique: _unique, ...attribute } = AppEntry.getAttributes()[field];
    await qi.addColumn(AppEntry.getTableName(), field, attribute);
    added.push(`appentries.${field}`);
  }
  const indexes = await qi.showIndex(AppEntry.getTableName());
  if (!indexes.some((index) => index.unique && index.fields.length === 1 && index.fields[0].attribute === "recoveryKey")) {
    await qi.addIndex(AppEntry.getTableName(), ["recoveryKey"], { unique: true, name: "appentries_recovery_key_unique" });
  }
  for (const [Model, fields] of [[AppEntry, ["earlyProcurement"]], [PrHeader, ["totalAmount"]], [PrLineItem, ["quantity", "unitCost", "lineTotal", "assetClass", "hasUsefulLifeOverOneYear"]]]) {
    columns = await qi.describeTable(Model.getTableName());
    for (const field of fields) {
      if (!columns[field]) throw new Error(`Required existing column is missing: ${Model.getTableName()}.${field}`);
      if (columns[field].allowNull) continue;
      await qi.changeColumn(Model.getTableName(), field, Model.getAttributes()[field]);
      changed.push(`${Model.getTableName()}.${field}`);
    }
  }
  return { added, changed };
};
