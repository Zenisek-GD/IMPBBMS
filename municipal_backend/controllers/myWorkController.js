import { Op } from "sequelize";
import { AppEntry } from "../models/appEntryModel.js";
import { PrHeader } from "../models/prModel.js";
import { DevelopmentPlan } from "../models/developmentPlanModel.js";
import { InvestmentProgram } from "../models/investmentProgramModel.js";
import { Rfq, Award } from "../models/biddingModel.js";
import { Vendor } from "../models/vendorModel.js";
import { FailureRecord, ProcurementAttempt, NegotiatedReview, BacDecisionVote } from "../models/procurementAttemptModel.js";
import { ScheduleAmendment } from "../models/scheduleAmendmentModel.js";
import { EvaluatorDeclaration } from "../models/evaluationWorkflowModel.js";
import { BAC_ROLE_KEYS } from "../services/bacCommittee.js";
import { permissionsOf } from "../middleware/permissionMiddleware.js";
import { APP_TRANSITIONS } from "../services/appWorkflow.js";
import { PR_TRANSITIONS } from "../services/prWorkflow.js";
import { anyPermission, planScope } from "../services/reportPolicy.js";

// The dashboard used to download several whole modules and decide in the
// browser which records were actionable.  That made the UI a second, weaker
// implementation of the approval workflow.  This controller is deliberately
// narrow: it returns only enough non-sensitive data to name a record, describe
// the current server-authorised action, and take the officer to its workspace.

export const actionableTransition = (transitions, permissions, status, userId, creatorId) => {
  for (const [action, transition] of Object.entries(transitions)) {
    if (["return", "revise", "cancel"].includes(action) || !transition.permission) continue;
    if (!transition.from.includes(status) || !permissions.has(transition.permission)) continue;
    // Submit/re-submit belongs to the record's requester.  Every review action
    // must be performed by somebody else, preserving the existing separation
    // of preparation from approval.
    const createdByCurrentUser = Number(creatorId) === Number(userId);
    if ((action === "submit" && !createdByCurrentUser) || (action !== "submit" && createdByCurrentUser)) continue;
    return { action, label: transition.label };
  }
  return null;
};

const readableStage = (stage) => String(stage ?? "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());

const item = ({ type, id, title, subtitle, stage, href, amount = null, dueAt = null, action, actionLabel = "Open item" }) => ({
  id: `${type}-${id}`,
  type,
  recordId: id,
  title,
  subtitle,
  stage: readableStage(stage),
  href,
  amount: amount == null ? null : Number(amount),
  dueAt,
  action,
  actionLabel,
});

const ACTION_LABELS = {
  draft: "Continue preparation",
  pendingMayorEndorsement: "Endorse the investment program",
  pendingSanggunianAdoption: "Adopt the investment program",
};

export const getMyWork = async (req, res, next) => {
  try {
    const user = req.currentUser;
    const permissions = permissionsOf(user);
    const rows = [];
    const jobs = [];

    if (permissions.has("app.view") && Object.values(APP_TRANSITIONS).some((entry) => entry.permission && permissions.has(entry.permission))) {
      jobs.push((async () => {
        const scope = planScope(user, permissions);
        const where = scope.departmentId != null ? { implementingUnitId: scope.departmentId } : {};
        const entries = await AppEntry.findAll({
          where,
          attributes: ["id", "projectTitle", "status", "abc", "createdById", "updatedAt"],
          order: [["updatedAt", "ASC"]],
        });
        for (const entry of entries) {
          const action = actionableTransition(APP_TRANSITIONS, permissions, entry.status, user.id, entry.createdById);
          if (action) rows.push(item({
            type: "app", id: entry.id, title: entry.projectTitle, subtitle: "Annual Procurement Plan entry",
            stage: entry.status, href: "/app-entries", amount: entry.abc,
            action: action.label, actionLabel: "Open APP entry",
          }));
        }
      })());
    }

    if (permissions.has("pr.view") && Object.values(PR_TRANSITIONS).some((entry) => entry.permission && permissions.has(entry.permission))) {
      jobs.push((async () => {
        const broad = anyPermission(permissions, ["pr.certify", "pr.obligate", "pr.certifyCash", "pr.review", "pr.determineMode", "pr.approve", "audit.viewAll"]);
        const where = broad ? {} : { departmentId: user.departmentId ?? -1 };
        const entries = await PrHeader.findAll({
          where,
          attributes: ["id", "prNumber", "purpose", "status", "totalAmount", "dateRequired", "requesterId", "updatedAt"],
          order: [["dateRequired", "ASC"], ["updatedAt", "ASC"]],
        });
        for (const entry of entries) {
          const action = actionableTransition(PR_TRANSITIONS, permissions, entry.status, user.id, entry.requesterId);
          if (action) rows.push(item({
            type: "pr", id: entry.id, title: entry.prNumber, subtitle: entry.purpose || "Purchase requisition",
            stage: entry.status, href: "/purchase-requisitions", amount: entry.totalAmount,
            dueAt: entry.dateRequired || null, action: action.label, actionLabel: "Open requisition",
          }));
        }
      })());
    }

    if (permissions.has("planning.view") && anyPermission(permissions, ["planning.manageCdp", "planning.manageAip", "planning.setPriorities", "planning.adoptAip"])) {
      jobs.push((async () => {
        if (permissions.has("planning.manageCdp")) {
          const plans = await DevelopmentPlan.findAll({ where: { status: "draft" }, attributes: ["id", "title"], order: [["updatedAt", "ASC"]] });
          for (const plan of plans) rows.push(item({
            type: "cdp", id: plan.id, title: plan.title, subtitle: "Comprehensive Development Plan",
            stage: "draft", href: "/planning", action: "Continue preparing the development plan", actionLabel: "Open plan",
          }));
        }
        const statuses = [];
        if (permissions.has("planning.manageAip")) statuses.push("draft", "returned");
        if (permissions.has("planning.setPriorities")) statuses.push("pendingMayorEndorsement");
        if (permissions.has("planning.adoptAip")) statuses.push("pendingSanggunianAdoption");
        if (statuses.length) {
          const programs = await InvestmentProgram.findAll({ where: { status: { [Op.in]: statuses } }, attributes: ["id", "title", "status"], order: [["updatedAt", "ASC"]] });
          for (const program of programs) rows.push(item({
            type: "aip", id: program.id, title: program.title, subtitle: "Annual Investment Program",
            stage: program.status, href: "/planning", action: ACTION_LABELS[program.status] ?? "Correct and resubmit the investment program", actionLabel: "Open program",
          }));
        }
      })());
    }

    if (permissions.has("bidding.publish") && permissions.has("bidding.view")) {
      jobs.push((async () => {
        const rfqs = await Rfq.findAll({
          where: { [Op.or]: [{ status: { [Op.in]: ["draft", "closed", "failed", "cancelled"] } }, { status: "published", closingDate: { [Op.lte]: new Date() } }] },
          attributes: ["id", "referenceNo", "title", "status", "abc", "closingDate"], order: [["closingDate", "ASC"]],
        });
        for (const rfq of rfqs) rows.push(item({
          type: "rfq", id: rfq.id, title: rfq.referenceNo, subtitle: rfq.title, stage: rfq.status,
          href: "/secretariat/rfq", amount: rfq.abc, dueAt: rfq.closingDate || null,
          action: rfq.status === "failed" ? "Review approved failure history and the authorized next action" : rfq.status === "cancelled" ? "Review procurement preparation" : "Continue the solicitation", actionLabel: "Open solicitation",
        }));
      })());
    }

    if (permissions.has("bidding.view") && anyPermission(permissions, ["bidding.publish", "bidding.chairEvaluation", "bidding.evaluate"])) {
      jobs.push((async () => {
        const officer = permissions.has("bidding.chairEvaluation") && ["bacChairperson", "bacViceChairperson"].includes(user.Role?.key);
        const member = BAC_ROLE_KEYS.includes(user.Role?.key) && anyPermission(permissions, ["bidding.evaluate", "bidding.chairEvaluation"]);
        const canPrepare = permissions.has("bidding.publish");
        const failures = await FailureRecord.findAll({ where: { status: { [Op.in]: ["draft", "submitted", "reviewed"] } }, include: [{ model: ProcurementAttempt, as: "attempt", include: [{ model: Rfq, as: "rfq" }] }] });
        for (const failure of failures) {
          const vote = failure.status === "reviewed" ? await BacDecisionVote.findOne({ where: { subjectType: "failure", subjectId: failure.id, userId: user.id } }) : null;
          const present = failure.committeeReview?.attendingMemberIds?.some((id) => Number(id) === user.id);
          const action = failure.status === "draft" && canPrepare ? "Complete and submit failure documents" : failure.status === "submitted" && officer ? "Review failure documents and record BAC attendance" : failure.status === "reviewed" && member && present && !vote ? "Record your personal BAC decision" : failure.status === "reviewed" && officer ? "Review committee decisions and finalization requirements" : null;
          if (action) rows.push(item({ type: "failure", id: failure.id, title: failure.failureNumber, subtitle: failure.attempt?.rfq?.title, stage: failure.status, href: "/secretariat/rfq", action, actionLabel: "Open procurement history" }));
        }
        if (officer) {
          const amendments = await ScheduleAmendment.findAll({ where: { status: "submitted", requestedById: { [Op.ne]: user.id } }, include: [{ model: Rfq, as: "rfq" }] });
          for (const amendment of amendments) rows.push(item({ type: "scheduleAmendment", id: amendment.id, title: amendment.referenceNo, subtitle: amendment.rfq?.title, stage: "For schedule approval", href: "/secretariat/rfq", action: "Review proposed dates and supporting document", actionLabel: "Open schedule review" }));
          const schedules = await Rfq.findAll({ where: { status: "draft", scheduleApprovedAt: null, schedulePreparedById: { [Op.ne]: user.id } }, attributes: ["id", "referenceNo", "title", "closingDate"] });
          for (const schedule of schedules) rows.push(item({ type: "schedule", id: schedule.id, title: schedule.referenceNo, subtitle: schedule.title, stage: "For schedule approval", dueAt: schedule.closingDate, href: "/secretariat/rfq", action: "Review and approve the procurement schedule", actionLabel: "Open schedule" }));
          const conflicts = await EvaluatorDeclaration.findAll({ where: { reassignmentRequired: true }, include: [{ model: Rfq, as: "rfq" }] });
          for (const conflict of conflicts) rows.push(item({ type: "evaluatorConflict", id: conflict.id, title: conflict.rfq?.referenceNo ?? "Evaluator conflict", subtitle: conflict.rfq?.title, stage: "Reassignment required", href: "/evaluation", action: "Assign an unconflicted evaluator to complete the review", actionLabel: "Open evaluation" }));
        }
        if (member) {
          const reviews = await NegotiatedReview.findAll({ where: { status: "pending" }, include: [{ model: ProcurementAttempt, as: "sourceAttempt", include: [{ model: Rfq, as: "rfq" }] }] });
          for (const review of reviews) {
            const vote = await BacDecisionVote.findOne({ where: { subjectType: "negotiated", subjectId: review.id, userId: user.id } });
            const present = review.committeeReview?.attendingMemberIds?.some((id) => Number(id) === user.id);
            if (officer || (present && !vote)) rows.push(item({ type: "negotiatedReview", id: review.id, title: review.sourceAttempt?.rfq?.referenceNo ?? "Negotiated Procurement", subtitle: review.sourceAttempt?.rfq?.title, stage: "Negotiated Procurement eligibility review", href: "/secretariat/rfq", action: "Review eligibility documents and required BAC decisions", actionLabel: "Open procurement history" }));
          }
        }
      })());
    }

    if (permissions.has("bidding.award") && permissions.has("bidding.view")) {
      jobs.push((async () => {
        const awards = await Award.findAll({ where: { status: "pendingHopeApproval", recommendedById: { [Op.ne]: user.id } }, attributes: ["id", "noaNumber", "amount"], order: [["createdAt", "ASC"]] });
        for (const award of awards) rows.push(item({
          type: "award", id: award.id, title: award.noaNumber, subtitle: "Notice of award recommendation", stage: "pendingHopeApproval",
          href: "/evaluation", amount: award.amount, action: "Approve or disapprove the award with grounds", actionLabel: "Open award review",
        }));
      })());
    }

    if (anyPermission(permissions, ["bidders.createAccount", "bidding.publish", "vendor.determineEligibility"])) {
      jobs.push((async () => {
        const conditions = [];
        if (anyPermission(permissions, ["bidding.publish", "vendor.determineEligibility"])) conditions.push({ registrationStatus: "submitted" });
        if (permissions.has("bidders.createAccount")) conditions.push({ registrationStatus: "verified", accountCreatedAt: { [Op.is]: null } });
        if (!conditions.length) return;
        const vendors = await Vendor.findAll({ where: { [Op.or]: conditions }, attributes: ["id", "businessName", "contactEmail", "registrationStatus", "accountCreatedAt"], order: [["updatedAt", "ASC"]] });
        for (const vendor of vendors) {
          const issueAccount = vendor.registrationStatus === "verified" && !vendor.accountCreatedAt;
          rows.push(item({
            type: "vendor", id: vendor.id, title: vendor.businessName, subtitle: vendor.contactEmail || "Supplier registration",
            stage: issueAccount ? "verified" : vendor.registrationStatus,
            href: issueAccount ? "/admin/bidder-accounts" : "/secretariat/vendors",
            action: issueAccount ? "Issue the bidder account" : "Review the supplier registration",
            actionLabel: issueAccount ? "Open account issuance" : "Open registration",
          }));
        }
      })());
    }

    await Promise.all(jobs);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
    // The source records use different clocks.  Date-required items are
    // prioritized at render time; this stable order prevents rows jumping on
    // every refresh when no record changed.
    rows.sort((left, right) => left.type.localeCompare(right.type) || String(left.title).localeCompare(String(right.title)));
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ items: rows.slice(0, limit), total: rows.length, generatedAt: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
};
