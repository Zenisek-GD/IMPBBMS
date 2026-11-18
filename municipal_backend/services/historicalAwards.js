import { Op } from "sequelize";
import { AppEntry } from "../models/appEntryModel.js";
import { workflowError } from "./workflowSupport.js";

export const FY2025_AWARD_KEYS = ["GSO-2025-001", "MICTO-2025-002", "MEO-2025-003"]
  .map((code) => `form-2025:${code}`);

export const isFy2025HistoricalAward = (entry) => entry?.fiscalYear === 2025
  && FY2025_AWARD_KEYS.includes(entry.recoveryKey)
  && Boolean(entry.recoveryImport?.historicalAward?.id);

export const historicalSourceValues = (entry) => isFy2025HistoricalAward(entry)
  ? Object.fromEntries((entry.recoveryImport.reviewedForm?.fields ?? entry.recoveryImport.sourceFields ?? []).map(({ label, value }) => [label, value]))
  : null;

export const archivedHistoricalIds = async (key) => {
  const entries = await AppEntry.findAll({
    where: { fiscalYear: 2025, recoveryKey: { [Op.in]: FY2025_AWARD_KEYS } },
    attributes: ["fiscalYear", "recoveryKey", "recoveryImport"],
  });
  return entries.filter(isFy2025HistoricalAward)
    .map((entry) => entry.recoveryImport.demonstrationCompletion?.[key])
    .filter(Number.isSafeInteger);
};

export const assertOperationalContract = async (contractId) => {
  if (contractId && (await archivedHistoricalIds("contractId")).includes(Number(contractId))) {
    throw workflowError("This contract is an archived demonstration record.", 409);
  }
};
