import { sequelize } from "../models/db.js";
import { FailureRecord, BacDecisionVote, NegotiatedReview } from "../models/procurementAttemptModel.js";

// Additive only. Historical records remain evidence; this migration does not
// infer personal approvals from old attendance or manufacture approved failures.
export const migrateFailureGovernance = async () => {
  const qi = sequelize.getQueryInterface();
  const added = [];
  const tables = new Set((await qi.showAllTables()).map((table) => String(typeof table === "string" ? table : table.tableName).toLowerCase()));
  if (tables.has(String(NegotiatedReview.getTableName()).toLowerCase())) {
    const columns = await qi.describeTable(NegotiatedReview.getTableName());
    if (!columns.committeeReview) {
      await qi.addColumn(NegotiatedReview.getTableName(), "committeeReview", NegotiatedReview.getAttributes().committeeReview);
      added.push(`${NegotiatedReview.getTableName()}.committeeReview`);
    }
  } else await NegotiatedReview.sync();
  await FailureRecord.sync();
  await BacDecisionVote.sync();
  return { added };
};
