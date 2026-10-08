import { sequelize } from "../models/db.js";
import { AppEntry } from "../models/appEntryModel.js";
import { PrHeader, PrLineItem } from "../models/prModel.js";
import { Rfq, Award } from "../models/biddingModel.js";
import { Vendor } from "../models/vendorModel.js";

// Preserve every existing value. New optional fields stay NULL; existing No
// answers remain false. The only column changes permit unanswered drafts.
export const migrateProcurementInformation = async () => {
  const qi = sequelize.getQueryInterface();
  const tables = new Set((await qi.showAllTables()).map((table) => typeof table === "string" ? table.toLowerCase() : table.tableName.toLowerCase()));
  const added = [], changed = [];
  for (const [model, fields] of [
    [AppEntry, ["categoryDetails", "justificationStatus"]],
    [PrHeader, ["justificationStatus", "modeJustificationStatus"]],
    [PrLineItem, ["technicalSpecifications"]],
    [Vendor, ["supplierCategory"]],
    [Rfq, ["openingVenue", "procurementContactPerson", "procurementContactEmail", "requiredSupplierDocuments"]],
    [Award, ["externalNoaNumber", "supplierReceivedAt", "receiptRecordedById", "receiptRecordedAt"]],
  ]) {
    const table = model.getTableName();
    if (!tables.has(table)) continue;
    const columns = await qi.describeTable(table);
    for (const field of fields) {
      if (columns[field]) continue;
      await qi.addColumn(table, field, model.getAttributes()[field]);
      added.push(`${table}.${field}`);
    }
  }
  for (const [model, field] of [[PrHeader, "isEmergency"], [PrLineItem, "hasUsefulLifeOverOneYear"]]) {
    const table = model.getTableName();
    if (!tables.has(table)) continue;
    const columns = await qi.describeTable(table);
    if (columns[field] && !columns[field].allowNull) {
      await qi.changeColumn(table, field, model.getAttributes()[field]);
      changed.push(`${table}.${field}`);
    }
  }
  return { added, changed };
};
