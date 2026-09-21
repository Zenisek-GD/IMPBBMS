import { sequelize } from "../models/db.js";
import { Evaluation } from "../models/biddingModel.js";
import { TwgAssessment } from "../models/twgModel.js";
import { EvaluationPlan, EvaluatorDeclaration, EvaluationReturn, EvaluationCriteriaAmendment } from "../models/evaluationWorkflowModel.js";

// Add columns and tables only. Legacy submissions stay unchanged and visible;
// no historical criteria or approvals are fabricated during migration.
export const migrateEvaluationWorkflow = async () => {
  const qi = sequelize.getQueryInterface();
  const table = Evaluation.getTableName();
  const columns = await qi.describeTable(table);
  const added = [];
  const twgColumns = await qi.describeTable(TwgAssessment.getTableName());
  if (!twgColumns.excludedForConflict) {
    await qi.addColumn(TwgAssessment.getTableName(), "excludedForConflict", TwgAssessment.getAttributes().excludedForConflict);
    added.push(`${TwgAssessment.getTableName()}.excludedForConflict`);
  }
  for (const field of ["status", "failureReason", "failureExplanation", "requirementRemarks", "recommendation", "supportingDocuments", "evaluationPlanId"]) {
    if (columns[field]) continue;
    await qi.addColumn(table, field, Evaluation.getAttributes()[field]);
    added.push(`${table}.${field}`);
  }
  for (const model of [EvaluationPlan, EvaluatorDeclaration, EvaluationReturn, EvaluationCriteriaAmendment]) await model.sync();
  const planColumns = await qi.describeTable(EvaluationPlan.getTableName());
  if (!planColumns.revision) {
    await qi.addColumn(EvaluationPlan.getTableName(), "revision", EvaluationPlan.getAttributes().revision);
    added.push(`${EvaluationPlan.getTableName()}.revision`);
  }
  return { added };
};
