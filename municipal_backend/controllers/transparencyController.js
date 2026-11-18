import { Op } from "sequelize";
import { archivedHistoricalIds, isFy2025HistoricalAward } from "../services/historicalAwards.js";
import { AppEntry } from "../models/appEntryModel.js";
import { Department } from "../models/departmentModel.js";
import { Rfq, Award, Bid } from "../models/biddingModel.js";
import { PrHeader } from "../models/prModel.js";
import { ProcurementMode } from "../models/procurementModeModel.js";
import { Vendor } from "../models/vendorModel.js";
import { Contract } from "../models/contractModel.js";
import { getLguProfile } from "../models/systemSettingModel.js";
import { canViewAcademicCase, outsideAcademicCase, solicitationVisibility } from "../services/academicCase.js";

// Design doc Section 2.2: "Observers can view only records marked
// Approved/Published — never drafts, internal remarks, or pre-award data."
//
// Every query here is filtered to published states at the source rather than
// filtered in the UI, and the serialisers deliberately omit internal fields
// (return remarks, evaluator scores, justifications) even where the underlying
// row has them.

const PUBLISHED_APP_STATES = ["approved", "locked"];
const PUBLISHED_RFQ_STATES = ["published", "closed", "opened", "evaluated", "awarded"];

export const getTransparencyOverview = async (req, res) => {
  const lgu = await getLguProfile();
  const fiscalYear = Number(req.query.fiscalYear) || new Date().getFullYear();
  const includeAcademic = await canViewAcademicCase(req);

  const [appCount, procurements, awards, archivedContracts] = await Promise.all([
    AppEntry.count({ where: { fiscalYear, status: { [Op.in]: PUBLISHED_APP_STATES }, ...(includeAcademic ? {} : outsideAcademicCase) } }),
    Rfq.findAll({ where: { status: { [Op.in]: PUBLISHED_RFQ_STATES }, ...solicitationVisibility(includeAcademic) }, attributes: ["id", "appEntryId", "prHeaderId"], include: [
      { model: AppEntry, as: "appEntry", attributes: ["fiscalYear"] },
      { model: PrHeader, as: "purchaseRequisition", attributes: ["id"], include: [{ model: AppEntry, as: "appEntry", attributes: ["fiscalYear"] }] },
    ] }),
    Award.findAll({ where: { status: { [Op.in]: ["issued", "accepted"] } }, attributes: ["id", "rfqId", "amount"] }),
    archivedHistoricalIds("contractId"),
  ]);
  const rfqIds = new Set(procurements.filter((row) => (row.purchaseRequisition?.appEntry?.fiscalYear ?? row.appEntry?.fiscalYear) === fiscalYear).map((row) => row.id));
  const issued = awards.filter((award) => rfqIds.has(award.rfqId));
  const awardedContracts = await Contract.count({ where: { awardId: { [Op.in]: issued.map((award) => award.id) }, status: { [Op.in]: ["active", "completed"] }, id: { [Op.notIn]: archivedContracts } } });

  res.json({
    lgu,
    fiscalYear,
    publishedAppEntries: appCount,
    publishedProcurements: rfqIds.size,
    issuedAwards: issued.length,
    awardedContracts,
    totalAwardedValue: issued.reduce((sum, award) => sum + Number(award.amount), 0),
  });
};

export const listPublishedApp = async (req, res) => {
  const fiscalYear = Number(req.query.fiscalYear) || new Date().getFullYear();
  const includeAcademic = await canViewAcademicCase(req);

  const entries = await AppEntry.findAll({
    where: { fiscalYear, status: { [Op.in]: PUBLISHED_APP_STATES }, ...(includeAcademic ? {} : outsideAcademicCase) },
    include: [{ model: Department, as: "implementingUnit" }],
    order: [["projectTitle", "ASC"]],
  });

  // Note the omissions: no justification, no return remarks, no creator.
  res.json(
    entries.map((entry) => ({
      id: entry.id,
      projectTitle: entry.projectTitle,
      implementingUnit: entry.implementingUnit?.name ?? null,
      procurementMode: entry.procurementMode,
      abc: Number(entry.abc),
      targetStartQuarter: entry.targetStartQuarter,
      targetCompletionQuarter: entry.targetCompletionQuarter,
      fiscalYear: entry.fiscalYear,
      status: entry.status === "locked" ? "approved" : entry.status,
    }))
  );
};

export const listPublishedProcurements = async (req, res) => {
  const includeAcademic = await canViewAcademicCase(req);
  const rfqs = await Rfq.findAll({
    where: { status: { [Op.in]: PUBLISHED_RFQ_STATES }, ...solicitationVisibility(includeAcademic) },
    include: [{ model: ProcurementMode, as: "mode" }],
    order: [["createdAt", "DESC"]],
  });

  // Bid counts are public (they evidence competition); bidder identities and
  // prices before award are not.
  const counts = new Map();
  for (const bid of await Bid.findAll({ attributes: ["rfqId"] })) {
    counts.set(bid.rfqId, (counts.get(bid.rfqId) ?? 0) + 1);
  }

  res.json(
    rfqs.map((rfq) => ({
      id: rfq.id,
      referenceNo: rfq.referenceNo,
      title: rfq.title,
      mode: rfq.mode?.name ?? null,
      category: rfq.category,
      abc: Number(rfq.abc),
      publishDate: rfq.publishDate,
      closingDate: rfq.closingDate,
      status: rfq.status,
      bidsReceived: counts.get(rfq.id) ?? 0,
    }))
  );
};

export const listPublishedAwards = async (req, res) => {
  const includeAcademic = await canViewAcademicCase(req);
  const awards = await Award.findAll({
    where: { status: { [Op.in]: ["issued", "accepted"] } },
    include: [
      { model: Vendor, as: "vendor" },
      { model: Rfq, as: "rfq", ...(includeAcademic ? {} : { where: solicitationVisibility(false) }), include: [{ model: ProcurementMode, as: "mode" }, { model: AppEntry, as: "appEntry" }] },
    ],
    order: [["noaDate", "DESC"]],
  });

  const contracts = await Contract.findAll({
    where: { status: { [Op.in]: ["active", "completed"] }, id: { [Op.notIn]: await archivedHistoricalIds("contractId") } },
  });
  const contractByAward = new Map(contracts.map((contract) => [contract.awardId, contract]));

  res.json(
    awards.map((award) => {
      const contract = contractByAward.get(award.id);
      const app = award.rfq?.appEntry;
      const sourceAward = isFy2025HistoricalAward(app) && app.recoveryImport.historicalAward.id === award.id ? app.recoveryImport.historicalAward : null;
      return {
        id: award.id,
        noaNumber: award.noaNumber,
        noaDate: award.noaDate,
        amount: Number(award.amount),
        awardedTo: sourceAward?.supplierMismatch ? null : sourceAward?.recommendedSupplier ?? award.vendor?.businessName ?? null,
        ...(sourceAward && { clientReported: true, supplierMismatch: sourceAward.supplierMismatch }),
        referenceNo: award.rfq?.referenceNo ?? null,
        projectTitle: award.rfq?.title ?? null,
        mode: award.rfq?.mode?.name ?? null,
        abc: award.rfq ? Number(award.rfq.abc) : null,
        contractNo: contract?.contractNo ?? null,
        contractStatus: contract?.status ?? null,
      };
    })
  );
};
