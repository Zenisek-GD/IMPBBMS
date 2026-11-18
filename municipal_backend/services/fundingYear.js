import { Op } from "sequelize";
import { Appropriation } from "../models/appropriationModel.js";
import { AppEntry } from "../models/appEntryModel.js";
import { PrHeader } from "../models/prModel.js";
import { fiscalYearFilter } from "./financialCalculations.js";

// Legacy solicitations may link directly to the APP. New procurements carry
// the PR link. In either case the enacted funding year wins over creation date.
export const fundingIncludes = ({ includeProvenance = false } = {}) => {
  const appAttributes = ["id", "fiscalYear", "appropriationId"];
  if (includeProvenance) appAttributes.push("recoveryImport");
  return [
    { model: PrHeader, as: "purchaseRequisition", attributes: ["id", "appEntryId"], include: [
      { model: AppEntry, as: "appEntry", attributes: appAttributes, include: [
        { model: Appropriation, as: "appropriation", attributes: ["id", "fiscalYear"] },
      ] },
    ] },
    { model: AppEntry, as: "appEntry", attributes: appAttributes, include: [
      { model: Appropriation, as: "appropriation", attributes: ["id", "fiscalYear"] },
    ] },
  ];
};

export const procurementProvenanceOf = (rfq) =>
  (rfq?.purchaseRequisition?.appEntry ?? rfq?.appEntry)?.recoveryImport ?? null;

export const fundingYearOf = (rfq) => {
  const app = rfq?.purchaseRequisition?.appEntry ?? rfq?.appEntry;
  return app?.appropriation?.fiscalYear ?? app?.fiscalYear ?? null;
};

export function fundingYearCondition(value, prefix = "award.rfq") {
  const year = fiscalYearFilter(value);
  if (year === null) return null;
  const base = prefix ? `${prefix}.` : "";
  const pr = `${base}purchaseRequisition.appEntry`;
  const direct = `${base}appEntry`;
  const matches = (path) => ({ [Op.or]: [
    { [`$${path}.appropriation.fiscalYear$`]: year },
    { [`$${path}.appropriationId$`]: null, [`$${path}.fiscalYear$`]: year },
  ] });
  return { [Op.or]: [matches(pr), { [`$${pr}.id$`]: null, ...matches(direct) }] };
}
