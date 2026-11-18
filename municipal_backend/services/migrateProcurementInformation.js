import { sequelize } from "../models/db.js";
import { AppEntry, AppEvidenceWorksheet } from "../models/appEntryModel.js";
import { PrHeader, PrLineItem } from "../models/prModel.js";
import { Rfq, Award } from "../models/biddingModel.js";
import { Vendor } from "../models/vendorModel.js";
import { Obligation } from "../models/appropriationModel.js";

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
  for (const [model, field] of [
    ...["abc", "targetStartQuarter", "targetCompletionQuarter", "procurementMode"].map((field) => [AppEntry, field]),
    [PrHeader, "dateRequired"],
    [Rfq, "closingDate"],
    [PrHeader, "isEmergency"],
    [PrLineItem, "hasUsefulLifeOverOneYear"],
  ]) {
    const table = model.getTableName();
    if (!tables.has(table)) continue;
    const columns = await qi.describeTable(table);
    if (columns[field] && !columns[field].allowNull) {
      await qi.changeColumn(table, field, model.getAttributes()[field]);
      changed.push(`${table}.${field}`);
    }
  }
  const obligationTable = Obligation.getTableName();
  if (tables.has(obligationTable)) {
    const { particulars } = await qi.describeTable(obligationTable);
    if (/^VARCHAR\(/i.test(particulars?.type ?? "")) {
      await qi.changeColumn(obligationTable, "particulars", Obligation.getAttributes().particulars);
      changed.push(`${obligationTable}.particulars`);
    }
  }
  if (tables.has(AppEntry.getTableName()) && !tables.has(AppEvidenceWorksheet.getTableName())) {
    await AppEvidenceWorksheet.sync();
    added.push(AppEvidenceWorksheet.getTableName());
  }
  return { added, changed };
};
