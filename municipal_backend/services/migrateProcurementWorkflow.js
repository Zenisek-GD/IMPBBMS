import { Op } from "sequelize";
import { sequelize } from "../models/db.js";
import { Rfq, Bid, Evaluation } from "../models/biddingModel.js";
import { TwgDeclaration, TwgAssessment } from "../models/twgModel.js";
import { ProcurementAttempt, NegotiatedReview } from "../models/procurementAttemptModel.js";
import { ProcurementLimit } from "../models/procurementLimitModel.js";
import { backfillProcurementAttempts } from "./backfillProcurementAttempts.js";

// Additive and resumable: never sync({alter:true}), drop, rename, or rewrite an
// existing evaluation, resolution, award, bid, attachment, or audit record.
export const migrateProcurementWorkflow = async () => {
  const qi = sequelize.getQueryInterface();
  const tables = new Set((await qi.showAllTables()).map((row) => typeof row === "string" ? row.toLowerCase() : row.tableName.toLowerCase()));
  const additions = [
    [Rfq, ["openingDate", "qualityWeight", "financialWeight", "consultingPassingScore", "twgRequired"]],
    [Bid, ["qualityScore", "financialScore", "combinedScore"]],
    [Evaluation, ["noConflictDeclared", "declaredAt"]],
  ];
  const added = [];
  for (const [model, fields] of additions) {
    if (!tables.has(model.getTableName())) continue;
    const columns = await qi.describeTable(model.getTableName());
    for (const field of fields) {
      if (columns[field]) continue;
      const attribute = model.getAttributes()[field];
      await qi.addColumn(model.getTableName(), field, attribute);
      added.push(`${model.getTableName()}.${field}`);
      if (model === Rfq && field === "twgRequired") {
        await qi.bulkUpdate(model.getTableName(), { twgRequired: false }, { status: { [Op.in]: ["evaluated", "awarded", "failed", "cancelled"] } });
      }
    }
  }
  for (const model of [TwgDeclaration, TwgAssessment, ProcurementAttempt, NegotiatedReview, ProcurementLimit]) {
    await model.sync();
  }
  const history = await backfillProcurementAttempts();
  return { added, ...history };
};
