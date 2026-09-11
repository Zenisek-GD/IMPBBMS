import { Op } from "sequelize";
import { AppEntry } from "../models/appEntryModel.js";
import { PrHeader } from "../models/prModel.js";
import { DevelopmentPlan } from "../models/developmentPlanModel.js";
import { InvestmentProgram } from "../models/investmentProgramModel.js";
import { Rfq, Bid, Evaluation, Award } from "../models/biddingModel.js";
import { TwgAssessment } from "../models/twgModel.js";
import { Vendor } from "../models/vendorModel.js";
import { APP_TRANSITIONS } from "../services/appWorkflow.js";
import { PR_TRANSITIONS } from "../services/prWorkflow.js";
import { planScope, anyPermission } from "../services/reportPolicy.js";
import { pendingTransitionRows, evaluationQueues } from "../services/pendingCountsPolicy.js";

export async function getPendingCounts(req, res) {
  const permissions = req.permissions;
  const user = req.currentUser;
  const counts = {};
  const queues = {};
  const jobs = [];

  if (permissions.has("app.view") && Object.values(APP_TRANSITIONS).some((transition) => transition.permission && permissions.has(transition.permission))) {
    jobs.push((async () => {
      const scope = planScope(user, permissions);
      const where = scope.departmentId != null ? { implementingUnitId: scope.departmentId } : {};
      const entries = await AppEntry.findAll({ where, attributes: ["id", "status", "createdById"] });
      counts["/app-entries"] = pendingTransitionRows(entries, APP_TRANSITIONS, permissions, user.id, "createdById").length;
    })());
  }
  if (permissions.has("pr.view") && Object.values(PR_TRANSITIONS).some((transition) => transition.permission && permissions.has(transition.permission))) {
    jobs.push((async () => {
      const broad = anyPermission(permissions, ["pr.certify", "pr.obligate", "pr.certifyCash", "pr.review", "pr.determineMode", "pr.approve", "audit.viewAll"]);
      const where = broad ? {} : { departmentId: user.departmentId ?? -1 };
      const entries = await PrHeader.findAll({ where, attributes: ["id", "status", "requesterId"] });
      counts["/purchase-requisitions"] = pendingTransitionRows(entries, PR_TRANSITIONS, permissions, user.id, "requesterId").length;
    })());
  }
  if (permissions.has("planning.view") && anyPermission(permissions, ["planning.manageCdp", "planning.manageAip", "planning.setPriorities", "planning.adoptAip"])) {
    jobs.push((async () => {
      let count = 0;
      if (permissions.has("planning.manageCdp")) count += await DevelopmentPlan.count({ where: { status: "draft" } });
      const statuses = new Set();
      if (permissions.has("planning.manageAip")) ["draft", "returned"].forEach((value) => statuses.add(value));
      if (permissions.has("planning.setPriorities")) statuses.add("pendingMayorEndorsement");
      if (permissions.has("planning.adoptAip")) statuses.add("pendingSanggunianAdoption");
      if (statuses.size) count += await InvestmentProgram.count({ where: { status: { [Op.in]: [...statuses] } } });
      counts["/planning"] = count;
    })());
  }
  if (permissions.has("bidding.publish") && permissions.has("bidding.view")) {
    jobs.push((async () => {
      counts["/secretariat/rfq"] = await Rfq.count({ where: { [Op.or]: [{ status: { [Op.in]: ["draft", "closed"] } }, { status: "published", closingDate: { [Op.lte]: new Date() } }] } });
    })());
  }
  if (anyPermission(permissions, ["bidding.technicalInput", "bidding.evaluate", "bidding.chairEvaluation"])) {
    jobs.push((async () => {
      const rfqs = await Rfq.findAll({ where: { status: { [Op.in]: ["opened", "evaluated"] } }, include: [{ model: Bid, as: "bids", attributes: ["id", "status"], include: [{ model: Evaluation, as: "evaluations", attributes: ["evaluatorId"] }, { model: TwgAssessment, as: "twgAssessments", attributes: ["memberId", "status", "recommendation"] }] }] });
      Object.assign(queues, evaluationQueues(rfqs, permissions, user.id));
      counts["/evaluation"] = queues.evaluation;
    })());
  }
  if (permissions.has("bidding.award") && permissions.has("bidding.view")) {
    jobs.push((async () => {
      queues.award = await Award.count({ where: { status: "pendingHopeApproval", recommendedById: { [Op.ne]: user.id } } });
    })());
  }
  if (anyPermission(permissions, ["bidders.createAccount", "bidding.publish", "vendor.determineEligibility"])) {
    jobs.push((async () => {
      if (permissions.has("bidders.createAccount")) counts["/admin/bidder-accounts"] = await Vendor.count({ where: { registrationStatus: "verified", accountCreatedAt: { [Op.is]: null } } });
      if (anyPermission(permissions, ["bidding.publish", "vendor.determineEligibility"])) counts["/secretariat/vendors"] = await Vendor.count({ where: { registrationStatus: "submitted" } });
    })());
  }
  await Promise.all(jobs);
  if (queues.award != null) counts["/evaluation"] = (counts["/evaluation"] || 0) + queues.award;
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ counts, queues, generatedAt: new Date().toISOString() });
}
