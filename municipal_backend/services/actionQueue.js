import { Op } from "sequelize";
import { ProjectAllocation, BudgetControlRequest } from "../models/budgetControlModel.js";
import { createDocumentFiscalYearResolver } from "./documentFiscalYear.js";
import { fundingIncludes, fundingYearOf } from "./fundingYear.js";
import { Appropriation } from "../models/appropriationModel.js";
import { AppEntry } from "../models/appEntryModel.js";
import { PrHeader } from "../models/prModel.js";
import { DevelopmentPlan } from "../models/developmentPlanModel.js";
import { InvestmentProgram } from "../models/investmentProgramModel.js";
import { Rfq, Bid, Evaluation, Award } from "../models/biddingModel.js";
import { Department } from "../models/departmentModel.js";
import { ExecutiveBudget, BudgetProposal } from "../models/budgetPreparationModel.js";
import { GeneratedDocument } from "../models/generatedDocumentModel.js";
import { Contract, Delivery } from "../models/contractModel.js";
import { Invoice, Payment } from "../models/paymentModel.js";
import { TwgAssessment } from "../models/twgModel.js";
import { sequelize } from "../models/db.js";
import { BUDGET_TRANSITIONS } from "./budgetPreparationWorkflow.js";
import { isPublishableType } from "./documentTypes.js";
import { evaluationQueues } from "./pendingCountsPolicy.js";
import { Vendor } from "../models/vendorModel.js";
import { FailureRecord, ProcurementAttempt, NegotiatedReview, BacDecisionVote } from "../models/procurementAttemptModel.js";
import { ScheduleAmendment } from "../models/scheduleAmendmentModel.js";
import { EvaluatorDeclaration } from "../models/evaluationWorkflowModel.js";
import { BAC_ROLE_KEYS } from "./bacCommittee.js";
import { permissionsOf } from "../middleware/permissionMiddleware.js";
import { APP_TRANSITIONS } from "./appWorkflow.js";
import { PR_TRANSITIONS } from "./prWorkflow.js";
import { anyPermission, planScope } from "./reportPolicy.js";

const fiscalYearOf = (row) => fundingYearOf(row) ?? row?.fiscalYear ?? null;
const rfqYearInclude = fundingIncludes();
const contractYearInclude = [{ model: Award, as: "award", include: [{ model: Rfq, as: "rfq", include: rfqYearInclude }] }];
const contractYear = (row) => fiscalYearOf(row?.award?.rfq);

export const selectedActionYear = (value, now = new Date()) => {
  if (value === "all") return "all";
  if (value == null || value === "") return Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Manila" }).format(now));
  if (!/^\d{4}$/.test(String(value)) || Number(value) < 1900 || Number(value) > 9999) throw Object.assign(new Error("Choose a valid fiscal year or explicitly select all years."), { status: 400 });
  return Number(value);
};

export const actionUrgency = (dueAt, now = Date.now()) => {
  if (!dueAt) return "normal";
  // A municipal date-only deadline runs through the end of that local day.
  const deadline = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(String(dueAt)) ? `${dueAt}T23:59:59.999+08:00` : dueAt);
  if (!Number.isFinite(deadline)) return "normal";
  return deadline < now ? "overdue" : deadline - now <= 3 * 86400000 ? "urgent" : "normal";
};

export const finalizeActionQueue = (rows, { user, query = {}, queues = {}, initialCounts = {}, now = new Date() }) => {
  const fiscalYear = selectedActionYear(query.fiscalYear, now);
  const unique = new Map(rows.filter((row) => fiscalYear === "all" || (row.yearScope === "general" || (row.startYear != null && fiscalYear >= row.startYear && fiscalYear <= row.endYear)) || Number(row.fiscalYear) === fiscalYear).map((row) => [row.id, row]));
  const items = [...unique.values()].map((row) => ({ ...row, urgency: actionUrgency(row.dueAt, now.getTime()), responsibleRole: row.responsibleRole || user.Role?.name || user.Role?.key || "Authorized officer", responsibleUserId: row.responsibleUserId || user.id }));
  const ranks = { overdue: 0, urgent: 1, normal: 2 };
  items.sort((a, b) => ranks[a.urgency] - ranks[b.urgency] || (Date.parse(a.dueAt) || Infinity) - (Date.parse(b.dueAt) || Infinity) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  const counts = Object.fromEntries(Object.keys(initialCounts).map((key) => [key, 0]));
  // Only visible, authorized records contribute. A read notification never
  // clears a task; completing its workflow action removes it on refresh.
  for (const row of items) {
    const href = row.href.split("?")[0];
    counts[href] = (counts[href] || 0) + 1;
  }
  for (const key of ["technical", "bac", "postQualification", "evaluation", "award"]) {
    if (queues[key] != null) queues[key] = items.filter((row) => key === "evaluation" ? row.type === "evaluation" : key === "award" ? row.type === "award" : row.queue?.includes(key)).length;
  }
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 100, 1), 1000);
  const offset = Math.max(Number.parseInt(query.offset, 10) || 0, 0);
  return { items: items.slice(offset, offset + limit), total: items.length, counts, queues, fiscalYear, offset, limit, overdue: items.filter((row) => row.urgency === "overdue").length, urgent: items.filter((row) => row.urgency === "urgent").length, generatedAt: now.toISOString() };
};

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

export const actionItem = ({ type, id, title, subtitle, stage, href, amount = null, dueAt = null, fiscalYear = null, action, actionLabel = "Open item", responsibleRole = null, responsibleUserId = null, queue = null, yearScope = null, startYear = null, endYear = null }) => ({
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
  actionLabel, fiscalYear, responsibleRole, responsibleUserId, queue, yearScope, startYear, endYear,
});

const ACTION_LABELS = {
  draft: "Continue preparation",
  pendingMayorEndorsement: "Endorse the investment program",
  pendingSanggunianAdoption: "Adopt the investment program",
};

export const projectBudgetTasks = ({ projects, allocations, requests, contracts }) => {
  const result = [];
  for (const project of projects) {
    const allocation = allocations.find(row => Number(row.appEntryId) === Number(project.id));
    const pending = kind => requests.some(row => row.kind === kind && Number(row.sourceProjectId) === Number(project.id) && ['draft', 'submitted'].includes(row.status));
    if (!allocation && project.status !== 'cancelled' && !pending('allocation')) result.push(actionItem({
      type: 'projectAllocation', id: project.id, title: project.projectTitle, subtitle: 'Approved procurement project awaiting funding reservation',
      stage: 'Allocation required', fiscalYear: project.fiscalYear, amount: project.abc, href: `/budget/controls?project=${project.id}&action=allocation`,
      action: 'Prepare the project allocation for approval', actionLabel: 'Prepare allocation', responsibleRole: 'Requesting Budget Officer',
    }));
    const projectContracts = contracts.filter(row => Number(row.award?.rfq?.purchaseRequisition?.appEntryId ?? row.award?.rfq?.appEntryId) === Number(project.id));
    if (allocation?.status === 'active' && !pending('closeout') && (project.status === 'cancelled' || (projectContracts.length && projectContracts.every(row => ['completed', 'cancelled', 'rescinded'].includes(row.status))))) result.push(actionItem({
      type: 'projectCloseout', id: project.id, title: project.projectTitle, subtitle: 'Final accounts and outstanding liabilities need review',
      stage: 'Financial closeout required', fiscalYear: project.fiscalYear, href: `/budget/controls?project=${project.id}&action=closeout`,
      action: 'Reconcile final accounts and prepare documented financial closeout', actionLabel: 'Prepare closeout', responsibleRole: 'Requesting Budget Officer',
    }));
  }
  return result;
};

export const buildActionQueue = async ({ user, permissions = permissionsOf(user), query = {} }) => {
    selectedActionYear(query.fiscalYear);
    const rows = [];
    const queues = {};
    const initialCounts = {};
    const jobs = [];

    if (permissions.has("app.view") && Object.values(APP_TRANSITIONS).some((entry) => entry.permission && permissions.has(entry.permission))) {
      initialCounts['/app-entries'] = 0;
      jobs.push((async () => {
        const scope = planScope(user, permissions);
        const where = scope.departmentId != null ? { implementingUnitId: scope.departmentId } : {};
        const entries = await AppEntry.findAll({
          where,
          attributes: ["id", "projectTitle", "status", "abc", "createdById", "updatedAt", "fiscalYear"],
          order: [["updatedAt", "ASC"]],
        });
        for (const entry of entries) {
          const action = actionableTransition(APP_TRANSITIONS, permissions, entry.status, user.id, entry.createdById);
          if (action) rows.push(actionItem({
            type: "app", id: entry.id, title: entry.projectTitle, subtitle: "Annual Procurement Plan entry",
            stage: entry.status, href: "/app-entries", amount: entry.abc, fiscalYear: entry.fiscalYear,
            action: action.label, actionLabel: "Open APP entry",
          }));
        }
      })());
    }

    if (permissions.has("pr.view")) {
      jobs.push((async () => {
        const departments = await Department.findAll({ where: { headUserId: user.id }, attributes: ["id"] });
        const headed = new Set(departments.map((row) => Number(row.id)));
        const broad = anyPermission(permissions, ["pr.certify", "pr.obligate", "pr.certifyCash", "pr.review", "pr.determineMode", "pr.approve", "audit.viewAll"]);
        const where = broad ? {} : { departmentId: { [Op.in]: [...new Set([user.departmentId, ...headed].filter(Boolean))] } };
        const entries = await PrHeader.findAll({
          where,
          attributes: ["id", "prNumber", "purpose", "status", "totalAmount", "dateRequired", "requesterId", "updatedAt", "departmentId"],
          include: [{ model: AppEntry, as: "appEntry", attributes: ["fiscalYear"], include: [{ model: Appropriation, as: "appropriation", attributes: ["fiscalYear"] }] }],
          order: [["dateRequired", "ASC"], ["updatedAt", "ASC"]],
        });
        for (const entry of entries) {
          const scoped = new Set(permissions);
          if (headed.has(Number(entry.departmentId))) scoped.add("pr.endorse");
          else if (Number(user.departmentId) !== Number(entry.departmentId)) scoped.delete("pr.endorse");
          const action = actionableTransition(PR_TRANSITIONS, scoped, entry.status, user.id, entry.requesterId);
          if (action) rows.push(actionItem({
            type: "pr", id: entry.id, title: entry.prNumber, subtitle: entry.purpose || "Purchase requisition",
            stage: entry.status, href: "/purchase-requisitions", amount: entry.totalAmount, fiscalYear: fiscalYearOf(entry),
            dueAt: entry.dateRequired || null, action: action.label, actionLabel: "Open requisition",
          }));
        }
      })());
    }

    if (permissions.has("planning.view") && anyPermission(permissions, ["planning.manageCdp", "planning.manageAip", "planning.setPriorities", "planning.adoptAip"])) {
      jobs.push((async () => {
        if (permissions.has("planning.manageCdp")) {
          const plans = await DevelopmentPlan.findAll({ where: { status: "draft" }, attributes: ["id", "title", "startYear", "endYear"], order: [["updatedAt", "ASC"]] });
          for (const plan of plans) rows.push(actionItem({
            type: "cdp", id: plan.id, startYear: plan.startYear, endYear: plan.endYear, title: plan.title, subtitle: "Comprehensive Development Plan",
            stage: "draft", href: "/planning", action: "Continue preparing the development plan", actionLabel: "Open plan",
          }));
        }
        const statuses = [];
        if (permissions.has("planning.manageAip")) statuses.push("draft", "returned");
        if (permissions.has("planning.setPriorities")) statuses.push("pendingMayorEndorsement");
        if (permissions.has("planning.adoptAip")) statuses.push("pendingSanggunianAdoption");
        if (statuses.length) {
          const programs = await InvestmentProgram.findAll({ where: { status: { [Op.in]: statuses } }, attributes: ["id", "title", "status", "fiscalYear"], order: [["updatedAt", "ASC"]] });
          for (const program of programs) rows.push(actionItem({
            type: "aip", id: program.id, title: program.title, subtitle: "Annual Investment Program", fiscalYear: program.fiscalYear,
            stage: program.status, href: "/planning", action: ACTION_LABELS[program.status] ?? "Correct and resubmit the investment program", actionLabel: "Open program",
          }));
        }
      })());
    }

    if (permissions.has("bidding.publish") && permissions.has("bidding.view")) {
      jobs.push((async () => {
        const rfqs = await Rfq.findAll({
          where: { [Op.or]: [{ status: { [Op.in]: ["draft", "closed"] } }, { status: "published", closingDate: { [Op.lte]: new Date() } }] },
          include: rfqYearInclude,
          attributes: ["id", "referenceNo", "title", "status", "abc", "closingDate"], order: [["closingDate", "ASC"]],
        });
        for (const rfq of rfqs) rows.push(actionItem({
          type: "rfq", id: rfq.id, title: rfq.referenceNo, subtitle: rfq.title, stage: rfq.status,
          href: "/secretariat/rfq", amount: rfq.abc, fiscalYear: fiscalYearOf(rfq), dueAt: rfq.closingDate || null,
          action: rfq.status === "draft" ? "Complete the solicitation and publication requirements" : "Record bid opening or submit failure documents", actionLabel: "Open solicitation",
        }));
      })());
    }

    if (permissions.has("bidding.view") && anyPermission(permissions, ["bidding.publish", "bidding.chairEvaluation", "bidding.evaluate"])) {
      jobs.push((async () => {
        const officer = permissions.has("bidding.chairEvaluation") && ["bacChairperson", "bacViceChairperson"].includes(user.Role?.key);
        const member = BAC_ROLE_KEYS.includes(user.Role?.key) && anyPermission(permissions, ["bidding.evaluate", "bidding.chairEvaluation"]);
        const canPrepare = permissions.has("bidding.publish");
        const failures = await FailureRecord.findAll({ where: { status: { [Op.in]: ["draft", "submitted", "reviewed"] } }, include: [{ model: ProcurementAttempt, as: "attempt", include: [{ model: Rfq, as: "rfq", include: rfqYearInclude }] }] });
        for (const failure of failures) {
          const vote = failure.status === "reviewed" ? await BacDecisionVote.findOne({ where: { subjectType: "failure", subjectId: failure.id, userId: user.id } }) : null;
          const present = failure.committeeReview?.attendingMemberIds?.some((id) => Number(id) === Number(user.id));
          const action = failure.status === "draft" && canPrepare ? "Complete and submit failure documents" : failure.status === "submitted" && officer && Number(failure.createdById) !== Number(user.id) ? "Review failure documents and record BAC attendance" : failure.status === "reviewed" && member && present && !vote ? "Record your personal BAC decision" : failure.status === "reviewed" && officer && Number(failure.createdById) !== Number(user.id) ? "Review committee decisions and finalization requirements" : null;
          if (action) rows.push(actionItem({ type: "failure", id: failure.id, fiscalYear: fiscalYearOf(failure.attempt?.rfq), title: failure.failureNumber, subtitle: failure.attempt?.rfq?.title, stage: failure.status, href: "/secretariat/rfq", action, actionLabel: "Open procurement history" }));
        }
        if (officer) {
          const amendments = await ScheduleAmendment.findAll({ where: { status: "submitted", requestedById: { [Op.ne]: user.id } }, include: [{ model: Rfq, as: "rfq", include: rfqYearInclude }] });
          for (const amendment of amendments) rows.push(actionItem({ type: "scheduleAmendment", id: amendment.id, fiscalYear: fiscalYearOf(amendment.rfq), title: amendment.referenceNo, subtitle: amendment.rfq?.title, stage: "For schedule approval", href: "/secretariat/rfq", action: "Review proposed dates and supporting document", actionLabel: "Open schedule review" }));
          const schedules = await Rfq.findAll({ where: { status: "draft", scheduleApprovedAt: null, schedulePreparedById: { [Op.ne]: user.id } }, attributes: ["id", "referenceNo", "title", "closingDate"], include: rfqYearInclude });
          for (const schedule of schedules) rows.push(actionItem({ type: "schedule", id: schedule.id, fiscalYear: fiscalYearOf(schedule), title: schedule.referenceNo, subtitle: schedule.title, stage: "For schedule approval", dueAt: schedule.closingDate, href: "/secretariat/rfq", action: "Review and approve the procurement schedule", actionLabel: "Open schedule" }));
          const conflicts = await EvaluatorDeclaration.findAll({ where: { reassignmentRequired: true }, include: [{ model: Rfq, as: "rfq", include: rfqYearInclude }] });
          for (const conflict of conflicts) rows.push(actionItem({ type: "evaluatorConflict", id: conflict.id, fiscalYear: fiscalYearOf(conflict.rfq), title: conflict.rfq?.referenceNo ?? "Evaluator conflict", subtitle: conflict.rfq?.title, stage: "Reassignment required", href: "/evaluation", action: "Assign an unconflicted evaluator to complete the review", actionLabel: "Open evaluation" }));
        }
        if (member) {
          const reviews = await NegotiatedReview.findAll({ where: { status: "pending" }, include: [{ model: ProcurementAttempt, as: "sourceAttempt", include: [{ model: Rfq, as: "rfq", include: rfqYearInclude }] }] });
          for (const review of reviews) {
            const vote = await BacDecisionVote.findOne({ where: { subjectType: "negotiated", subjectId: review.id, userId: user.id } });
            const present = review.committeeReview?.attendingMemberIds?.some((id) => Number(id) === Number(user.id));
            if ((officer && Number(review.reviewerId) !== Number(user.id)) || (present && !vote)) rows.push(actionItem({ type: "negotiatedReview", id: review.id, fiscalYear: fiscalYearOf(review.sourceAttempt?.rfq), title: review.sourceAttempt?.rfq?.referenceNo ?? "Negotiated Procurement", subtitle: review.sourceAttempt?.rfq?.title, stage: "Negotiated Procurement eligibility review", href: "/secretariat/rfq", action: "Review eligibility documents and required BAC decisions", actionLabel: "Open procurement history" }));
          }
        }
      })());
    }

    if (permissions.has("bidding.award") && permissions.has("bidding.view")) {
      jobs.push((async () => {
        const awards = await Award.findAll({ where: { status: "pendingHopeApproval", recommendedById: { [Op.ne]: user.id } }, attributes: ["id", "noaNumber", "amount"], include: [{ model: Rfq, as: "rfq", include: rfqYearInclude }], order: [["createdAt", "ASC"]] });
        for (const award of awards) rows.push(actionItem({
          type: "award", id: award.id, fiscalYear: fiscalYearOf(award.rfq), title: award.noaNumber, subtitle: "Notice of award recommendation", stage: "pendingHopeApproval",
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
          rows.push(actionItem({
            type: "vendor", id: vendor.id, yearScope: "general", title: vendor.businessName, subtitle: vendor.contactEmail || "Supplier registration",
            stage: issueAccount ? "verified" : vendor.registrationStatus,
            href: issueAccount ? "/admin/bidder-accounts" : "/secretariat/vendors",
            action: issueAccount ? "Issue the bidder account" : "Review the supplier registration",
            actionLabel: issueAccount ? "Open account issuance" : "Open registration",
          }));
        }
      })());
    }

    if (anyPermission(permissions, ["bidding.technicalInput", "bidding.evaluate", "bidding.chairEvaluation"])) {
      jobs.push((async () => {
        Object.assign(queues, { technical: 0, bac: 0, postQualification: 0, evaluation: 0 });
        const rfqs = await Rfq.findAll({ where: { status: { [Op.in]: ["opened", "evaluated"] } }, include: [...rfqYearInclude,
          { model: Bid, as: "bids", attributes: ["id", "status"], include: [{ model: Evaluation, as: "evaluations", attributes: ["evaluatorId", "status"] }, { model: TwgAssessment, as: "twgAssessments", attributes: ["memberId", "status", "recommendation", "excludedForConflict"] }] }] });
        const conflicts = await EvaluatorDeclaration.findAll({ where: { userId: user.id, reassignmentRequired: true }, attributes: ["rfqId"] });
        const conflicted = new Set(conflicts.map((row) => Number(row.rfqId)));
        for (const rfq of rfqs) {
          const eligiblePermissions = new Set(permissions);
          if (conflicted.has(Number(rfq.id))) { eligiblePermissions.delete("bidding.evaluate"); eligiblePermissions.delete("bidding.technicalInput"); }
          const pending = evaluationQueues([rfq], eligiblePermissions, user.id);
          if (pending.evaluation) rows.push(actionItem({ type: "evaluation", id: rfq.id, title: rfq.referenceNo, subtitle: rfq.title, stage: rfq.status, fiscalYear: fiscalYearOf(rfq), href: "/evaluation",
            queue: ["technical", "bac", "postQualification"].filter((key) => pending[key]),
            action: pending.technical ? "Complete your technical assessment" : pending.postQualification ? "Complete post-qualification and recommendation" : "Complete your BAC review or finalize the evaluation", actionLabel: "Open evaluation" }));
        }
      })());
    }

    if (permissions.has("bidding.view") && permissions.has("bidding.publish")) {
      jobs.push((async () => {
        const attempts = await ProcurementAttempt.findAll({ order: [["attemptNumber", "DESC"]], include: [{ model: Rfq, as: "rfq", include: rfqYearInclude }, { model: FailureRecord, as: "failureRecords" }] });
        const latest = new Map();
        for (const attempt of attempts) if (!latest.has(attempt.projectKey)) latest.set(attempt.projectKey, attempt);
        for (const attempt of latest.values()) {
          if (attempt.status !== "failed") continue;
          const approved = attempt.failureRecords?.find((failure) => failure.status === "approved" && failure.approvedById && failure.approvedAt && failure.bacResolutionId === attempt.bacResolutionId);
          if (!approved) continue;
          const review = await NegotiatedReview.findOne({ where: { sourceAttemptId: attempt.id } });
          if (review && ["pending", "started"].includes(review.status)) continue;
          rows.push(actionItem({ type: review?.status === "approved" ? "negotiatedStart" : "rebid", id: attempt.id, title: attempt.rfq.referenceNo, subtitle: attempt.rfq.title, fiscalYear: fiscalYearOf(attempt.rfq), stage: "Approved failure — next procurement action", href: "/secretariat/rfq",
            action: review?.status === "approved" ? "Start the approved Negotiated Procurement" : attempt.nextAction?.includes("Negotiated") ? "Prepare the Negotiated Procurement eligibility review or authorized rebid" : "Prepare the authorized rebid", actionLabel: "Open procurement history" }));
        }
      })());
    }

    if (permissions.has("budget.view")) {
      jobs.push((async () => {
        const budgets = await ExecutiveBudget.findAll({ where: { status: { [Op.ne]: "enacted" } } });
        for (const budget of budgets) {
          const transition = Object.entries(BUDGET_TRANSITIONS).find(([action, entry]) => !["return", "openForProposals"].includes(action) && entry.from.includes(budget.status) && permissions.has(entry.permission));
          if (transition && !(transition[0] === "approveExecutive" && Number(budget.preparedById) === Number(user.id))) rows.push(actionItem({ type: "budget", id: budget.id, title: budget.title, subtitle: "Annual budget preparation", stage: budget.status, fiscalYear: budget.fiscalYear, dueAt: budget.status === "pendingProvincialReview" ? null : budget.status === "pendingSanggunianAction" ? `${budget.fiscalYear - 1}-12-31` : `${budget.fiscalYear - 1}-10-16`, href: "/budget/preparation", action: transition[1].label, actionLabel: "Open budget" }));
        }
        if (anyPermission(permissions, ["budget.proposeBudget", "budget.prepareExecutive"])) {
          const proposals = await BudgetProposal.findAll({ where: { ...(permissions.has("budget.prepareExecutive") ? {} : { departmentId: user.departmentId ?? -1 }), status: { [Op.in]: ["draft", "returned"] } }, include: [{ model: ExecutiveBudget, as: "budget" }] });
          for (const proposal of proposals) if (["draft", "returned"].includes(proposal.budget?.status)) rows.push(actionItem({ type: "proposal", id: proposal.id, title: proposal.budget.title, subtitle: "Department budget proposal", stage: proposal.status, fiscalYear: proposal.fiscalYear, dueAt: `${proposal.fiscalYear - 1}-07-15`, href: "/budget/preparation", action: "Complete and submit the department proposal", actionLabel: "Open proposal" }));
        }
        if (permissions.has("budget.requestControl")) {
          const fiscalYear = selectedActionYear(query.fiscalYear);
          const projects = await AppEntry.findAll({ where: { ...(fiscalYear === 'all' ? {} : { fiscalYear }), planCycle: 'final', status: { [Op.in]: ['approved', 'locked', 'cancelled'] } }, include: [{ model: Appropriation, as: 'appropriation', required: true, where: { status: 'enacted' }, attributes: ['id', 'fiscalYear'] }] });
          const validProjects = projects.filter(row => Number(row.fiscalYear) === Number(row.appropriation?.fiscalYear));
          const ids = validProjects.map(row => row.id);
          if (ids.length) {
            const [allocations, requests, contracts] = await Promise.all([
              ProjectAllocation.findAll({ where: { appEntryId: { [Op.in]: ids } } }),
              BudgetControlRequest.findAll({ where: { sourceProjectId: { [Op.in]: ids }, kind: { [Op.in]: ['allocation', 'closeout'] }, status: { [Op.in]: ['draft', 'submitted'] } } }),
              Contract.findAll({ include: contractYearInclude }),
            ]);
            rows.push(...projectBudgetTasks({ projects: validProjects, allocations, requests, contracts }));
          }
        }
        const Request = sequelize.models.BudgetControlRequest;
        if (Request && anyPermission(permissions, ["budget.requestControl", "budget.approveControl"])) {
          const requests = await Request.findAll({ where: { [Op.or]: [
            ...(permissions.has("budget.requestControl") ? [{ status: "draft", requesterId: user.id }] : []),
            ...(permissions.has("budget.approveControl") ? [{ status: "submitted", requesterId: { [Op.ne]: user.id } }] : []),
          ] } });
          for (const request of requests) rows.push(actionItem({ type: "budgetControl", id: request.id, title: `${readableStage(request.kind)} #${request.id}`, subtitle: request.reason, fiscalYear: request.fiscalYear, stage: request.status, amount: request.amount, href: `/budget/controls?request=${request.id}`, action: request.status === "submitted" ? `Review the ${readableStage(request.kind).toLowerCase()} and its authority` : "Complete supporting documents and submit for approval", actionLabel: "Open budget request" }));
        }
      })());
    }

    if (anyPermission(permissions, ["document.generate", "document.approve", "document.publish"])) {
      jobs.push((async () => {
        const resolveDocumentYear = createDocumentFiscalYearResolver();
        const documents = await GeneratedDocument.findAll({ where: { status: { [Op.in]: ["draft", "approved"] } }, attributes: ["id", "documentNo", "title", "status", "documentType", "isPublic", "generatedById", "entityRef", "entityId"] });
        for (const document of documents) {
          const action = document.status === "draft" && permissions.has("document.approve") && Number(document.generatedById) !== Number(user.id) ? "Review and approve the document" : document.status === "draft" && permissions.has("document.generate") ? "Complete the document for independent approval" : document.status === "approved" && !document.isPublic && isPublishableType(document.documentType) && permissions.has("document.publish") ? "Publish the approved document" : null;
          if (!action) continue;
          const year = await resolveDocumentYear(document);
          rows.push(actionItem({ type: "document", id: document.id, title: document.documentNo, subtitle: document.title, stage: document.status, fiscalYear: year, href: "/documents", action, actionLabel: "Open document" }));
        }
      })());
    }

    if (anyPermission(permissions, ["contract.draft", "contract.sign", "delivery.submitInvoice", "delivery.report", "payment.certify", "payment.release"])) {
      jobs.push((async () => {
        const vendor = permissions.has("delivery.submitInvoice") ? await Vendor.findOne({ where: { userId: user.id } }) : null;
        const internal = anyPermission(permissions, ["contract.draft", "contract.sign", "delivery.report", "payment.certify", "payment.release"]);
        const contracts = await Contract.findAll({ where: { ...(internal ? {} : { vendorId: vendor?.id ?? -1 }), status: { [Op.in]: ["draft", "pendingSignatures", "active"] } }, include: contractYearInclude });
        for (const contract of contracts) {
          const ownSupplier = vendor && Number(contract.vendorId) === Number(vendor.id);
          const action = contract.status === "draft" && permissions.has("contract.draft") ? "Complete and issue the contract for signatures" : contract.status === "pendingSignatures" && permissions.has("contract.sign") && !contract.signedByLguAt ? "Sign the contract for the municipality" : contract.status === "pendingSignatures" && ownSupplier && !contract.signedByVendorAt ? "Sign your contract" : contract.status === "active" && !contract.noticeToProceedAt && permissions.has("contract.sign") ? "Issue the Notice to Proceed" : null;
          if (action) rows.push(actionItem({ type: "contract", id: contract.id, title: contract.contractNo, subtitle: "Contract implementation", stage: contract.status, fiscalYear: contractYear(contract), amount: contract.amount, href: "/contracts", action, actionLabel: "Open contract" }));
        }
        if (permissions.has("delivery.report")) {
          const deliveries = await Delivery.findAll({ where: { status: { [Op.in]: ["reported", "underInspection"] }, reportedById: { [Op.ne]: user.id } }, include: [{ model: Contract, as: "contract", include: contractYearInclude }] });
          for (const delivery of deliveries) if (delivery.contract?.status === "active") rows.push(actionItem({ type: "delivery", id: delivery.id, title: delivery.contract.contractNo, subtitle: delivery.description, stage: delivery.status, fiscalYear: contractYear(delivery.contract), href: "/deliveries", action: "Inspect and record the delivery decision", actionLabel: "Open delivery" }));
        }
        if (vendor) {
          const returned = await Invoice.findAll({ where: { status: "returned" }, include: [{ model: Contract, as: "contract", required: true, where: { vendorId: vendor.id, status: "active" }, include: contractYearInclude }] });
          for (const invoice of returned) rows.push(actionItem({ type: "invoiceCorrection", id: invoice.id, title: invoice.invoiceNo, subtitle: invoice.contract?.contractNo, stage: "returned", fiscalYear: contractYear(invoice.contract), amount: invoice.amount, href: "/invoices", action: "Correct and resubmit the returned invoice", actionLabel: "Open invoice", responsibleUserId: user.id }));
        }
        if (permissions.has("payment.certify")) {
          const invoices = await Invoice.findAll({ where: { status: "submitted" }, include: [{ model: Contract, as: "contract", include: contractYearInclude }] });
          for (const invoice of invoices) rows.push(actionItem({ type: "invoice", id: invoice.id, title: invoice.invoiceNo, subtitle: invoice.contract?.contractNo, stage: "submitted", fiscalYear: contractYear(invoice.contract), amount: invoice.amount, href: "/invoices", action: "Review the invoice and prepare its voucher", actionLabel: "Open invoice" }));
        }
        if (permissions.has("payment.release")) {
          const payments = await Payment.findAll({ where: { status: "prepared", preparedById: { [Op.ne]: user.id } }, include: [{ model: Invoice, as: "invoice", where: { status: "certified" }, include: [{ model: Contract, as: "contract", include: contractYearInclude }] }] });
          for (const payment of payments) rows.push(actionItem({ type: "payment", id: payment.id, title: payment.disbursementNo, subtitle: payment.invoice?.invoiceNo, stage: "prepared", fiscalYear: contractYear(payment.invoice?.contract), amount: payment.amount, href: "/invoices", action: "Review and release the supplier payment", actionLabel: "Open voucher" }));
        }
      })());
    }

    await Promise.all(jobs);
    return finalizeActionQueue(rows, { user, query, queues, initialCounts });
};
