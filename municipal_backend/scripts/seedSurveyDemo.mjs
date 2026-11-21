import "../config/env.js";
import assert from "node:assert/strict";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { QueryTypes } from "sequelize";
import {
  sequelize,
  Role,
  Department,
  User,
  Permission,
  SystemSetting,
  SETTING_KEYS,
  ProcurementMode,
  ObserverOrganization,
  ObserverInvitation,
  ObservationReport,
  OBSERVER_NOTICE_DAYS,
  OBSERVATION_REPORT_DAYS,
  DocumentTemplate,
  DocumentTemplateVersion,
  DevelopmentPlan,
  DevelopmentGoal,
  InvestmentProgram,
  AipEntry,
  ExecutiveBudget,
  BudgetProposal,
  BudgetProposalLine,
  BudgetProceeding,
  Appropriation,
  Obligation,
  AppEntry,
  ProjectAllocation,
  BudgetControlRequest,
  PrHeader,
  PrLineItem,
  Rfq,
  Announcement,
  Vendor,
  Bid,
  BidOpeningRecord,
  TwgDeclaration,
  TwgAssessment,
  EvaluatorDeclaration,
  Evaluation,
  PostQualification,
  BacResolution,
  Award,
  ProcurementAttempt,
  Contract,
  Delivery,
  Security,
  requiredPerformanceSecurity,
  Invoice,
  Payment,
  Document,
} from "../models/index.js";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../config/permissionMatrix.js";
import { DEFAULT_TEMPLATES } from "../config/defaultTemplates.js";
import { isPublishableType } from "../services/documentTypes.js";
import { DEFAULT_PROCUREMENT_POLICY, validateProcurementPolicy } from "../services/bacCommittee.js";
import { DEFAULT_LANDING_FAQS } from "../services/landingFaqs.js";
import { deletionOrder } from "../services/v2Reset.js";
import { withAuditTransaction, verifyChain } from "../services/auditLog.js";
import { rebaseline, sweep } from "../services/integrityMonitor.js";
import { checksumOf, validateFileContent } from "../services/documentStore.js";
import { computeDeductions } from "../services/deductions.js";
import { announcementSchedule, scheduleValidationError } from "../services/procurementSchedulePolicy.js";
import { complianceRequirementsFor, evaluationError } from "../services/evaluationPolicy.js";
import { projectKeyFor } from "../services/procurementGovernance.js";
import { renderSurveyPdf } from "./surveyDemoPdf.mjs";
import {
  SURVEY_DEFAULT_PASSWORD,
  FISCAL_YEAR,
  atManila,
  dateOnly,
  ROLES,
  DEPARTMENTS,
  ROLE_DEFAULT_DEPARTMENT,
  END_USER_HEADED_DEPARTMENTS,
  ACCOUNTS,
  PROCUREMENT_MODES,
  OBSERVER_ORGANIZATIONS,
  LGU_SETTINGS,
  VENDORS,
  DEVELOPMENT_PLAN,
  AIP_ENTRIES,
  APPROPRIATIONS,
  PUBLIC_PROJECTS,
  INTERNAL_DRAFT_APP,
  PUBLIC_GENERAL_ANNOUNCEMENT,
} from "./surveyDemoData.mjs";

const PROTECTED_PRODUCTION_DATABASES = new Set(["municipal_backend"]);
const peso = (amount) => `PHP ${Number(amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const quote = (name) => sequelize.getQueryInterface().queryGenerator.quoteIdentifier(name);
const tableOf = (model) => String(model.getTableName());
const DAY_MS = 86_400_000;

const select = (sql, replacements = {}, transaction) =>
  sequelize.query(sql, { replacements, transaction, type: QueryTypes.SELECT });

async function clearAllTables(transaction) {
  const database = sequelize.getDatabaseName();
  const registry = Object.values(sequelize.models);
  const tables = await select(
    "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = :database",
    { database },
    transaction
  );
  const actual = new Set(tables.map((row) => row.name));
  const missing = registry.map(tableOf).filter((name) => !actual.has(name));
  if (missing.length) {
    throw new Error(`Missing schema tables (${missing.join(", ")}). Run "npm run migrate" first.`);
  }

  const foreignKeys = (
    await select(
      `SELECT k.TABLE_NAME AS child, k.COLUMN_NAME AS columnName, k.REFERENCED_TABLE_NAME AS parent,
              c.IS_NULLABLE AS nullable
       FROM information_schema.KEY_COLUMN_USAGE k
       JOIN information_schema.COLUMNS c
         ON c.TABLE_SCHEMA = k.TABLE_SCHEMA AND c.TABLE_NAME = k.TABLE_NAME AND c.COLUMN_NAME = k.COLUMN_NAME
       WHERE k.REFERENCED_TABLE_NAME IS NOT NULL AND k.TABLE_SCHEMA = :database`,
      { database },
      transaction
    )
  ).map((row) => ({ ...row, nullable: row.nullable === "YES" }));

  for (const fk of foreignKeys) {
    if (fk.nullable) {
      await sequelize.query(`UPDATE ${quote(fk.child)} SET ${quote(fk.columnName)} = NULL`, { transaction });
    }
  }

  const order = deletionOrder(
    registry.map(tableOf),
    foreignKeys
  );
  for (const table of order) {
    await sequelize.query(`DELETE FROM ${quote(table)}`, { transaction });
  }
}

async function attachPdf(transaction, { entityRef, entityId, filename, label, docType = "supportingRecord", uploadedById, uploadedAt, pdfSpec }) {
  const buffer = renderSurveyPdf(pdfSpec);
  const validationError = validateFileContent({ buffer, mimetype: "application/pdf" });
  assert.equal(validationError, null, `Generated PDF invalid for ${filename}: ${validationError}`);
  return Document.create(
    {
      entityRef,
      entityId,
      filename,
      label,
      docType,
      mimeType: "application/pdf",
      sizeBytes: buffer.length,
      checksum: checksumOf(buffer),
      content: buffer,
      uploadedById: uploadedById ?? null,
      uploadedAt,
    },
    { transaction }
  );
}

async function seedReferenceAndAccounts(transaction) {
  for (const setting of LGU_SETTINGS) {
    await SystemSetting.create(setting, { transaction });
  }
  await SystemSetting.create(
    {
      key: SETTING_KEYS.LANDING_FAQS,
      value: JSON.stringify(DEFAULT_LANDING_FAQS),
      description: "Ordered landing-page FAQ content managed by the System Administrator",
    },
    { transaction }
  );

  const modesByKey = {};
  for (const mode of PROCUREMENT_MODES) {
    modesByKey[mode.key] = await ProcurementMode.create(mode, { transaction });
  }

  const observerOrgs = [];
  for (const org of OBSERVER_ORGANIZATIONS) {
    observerOrgs.push(await ObserverOrganization.create(org, { transaction }));
  }

  const permissionsByKey = {};
  for (const perm of PERMISSIONS) {
    permissionsByKey[perm.key] = await Permission.create(perm, { transaction });
  }

  const departmentsByCode = {};
  for (const dept of DEPARTMENTS) {
    departmentsByCode[dept.code] = await Department.create(dept, { transaction });
  }

  const rolesByKey = {};
  for (const role of ROLES) {
    const defaultDeptCode = ROLE_DEFAULT_DEPARTMENT[role.key];
    const record = await Role.create(
      {
        ...role,
        twoFactorRequired: false,
        twoFactorVersion: 0,
        sessionVersion: 0,
        defaultDepartmentId: defaultDeptCode ? departmentsByCode[defaultDeptCode].id : null,
      },
      { transaction }
    );
    const grantedKeys = ROLE_PERMISSIONS[role.key] ?? [];
    await record.setPermissions(
      grantedKeys.map((key) => permissionsByKey[key]),
      { transaction }
    );
    rolesByKey[role.key] = record;
  }

  const usersByEmail = new Map();
  const usersByRole = new Map();
  const bacMembers = [];
  const seededAt = atManila("2026-01-05T08:30");

  for (const spec of ACCOUNTS) {
    const role = rolesByKey[spec.roleKey];
    const departmentId = spec.departmentCode ? departmentsByCode[spec.departmentCode].id : null;
    const user = await User.create(
      {
        name: spec.name,
        email: spec.email.toLowerCase(),
        password: SURVEY_DEFAULT_PASSWORD,
        status: "active",
        roleId: role.id,
        departmentId,
        passwordChangedAt: seededAt,
      },
      { transaction }
    );
    usersByEmail.set(user.email, user);
    if (!usersByRole.has(spec.roleKey)) usersByRole.set(spec.roleKey, user);
    if (["bacChairperson", "bacViceChairperson", "bacMember"].includes(spec.roleKey)) {
      bacMembers.push({ user, roleKey: spec.roleKey });
    }
  }

  // Designate Head of Office across end-user departments so any department PR can be endorsed.
  const headUser = usersByRole.get("headOfOffice");
  for (const code of END_USER_HEADED_DEPARTMENTS) {
    await departmentsByCode[code].update({ headUserId: headUser.id }, { transaction });
  }

  // Configure the 5-member BAC committee policy cleanly so quorum works with zero warnings.
  const validatedPolicy = validateProcurementPolicy({
    ...DEFAULT_PROCUREMENT_POLICY,
    membershipCount: bacMembers.length,
    quorumCount: 3,
    requirePresidingOfficer: true,
    memberIds: bacMembers.map(({ user }) => user.id),
  });
  assert.equal(validatedPolicy.ok, true, `Invalid BAC policy: ${validatedPolicy.errors.join("; ")}`);
  await SystemSetting.create(
    {
      key: SETTING_KEYS.PROCUREMENT_POLICY,
      value: JSON.stringify(validatedPolicy.policy),
      description: "Approved BAC composition, quorum and procurement attempt requirements",
    },
    { transaction }
  );

  // Seed official document templates.
  for (const spec of DEFAULT_TEMPLATES) {
    const template = await DocumentTemplate.create(
      {
        key: spec.key,
        name: spec.name,
        documentType: spec.documentType,
        description: spec.description,
        status: "active",
        publishable: isPublishableType(spec.documentType),
        isSystemTemplate: true,
      },
      { transaction }
    );
    const version = await DocumentTemplateVersion.create(
      {
        documentTemplateId: template.id,
        versionNo: 1,
        bodyHtml: spec.bodyHtml,
        headerHtml: spec.headerHtml ?? null,
        footerHtml: spec.footerHtml ?? null,
        css: spec.css ?? null,
        pageSize: spec.pageSize ?? "A4",
        landscape: Boolean(spec.landscape),
        margins: spec.margins ?? null,
        changeNote: "Initial system template",
      },
      { transaction }
    );
    await template.update({ activeVersionId: version.id }, { transaction });
  }

  // Seed 5 verified suppliers; link the primary supplier to the supplier login account.
  const vendorsByKey = {};
  const secretariat = usersByRole.get("bacSecretariat");
  const vendorUser = usersByRole.get("vendor");
  for (const [key, spec] of Object.entries(VENDORS)) {
    const { linkToVendorUser, ...fields } = spec;
    vendorsByKey[key] = await Vendor.create(
      {
        ...fields,
        registrationStatus: "verified",
        receivedAt: atManila("2026-01-12T09:00"),
        reviewedAt: atManila("2026-01-15T14:30"),
        reviewedById: secretariat.id,
        userId: linkToVendorUser ? vendorUser.id : null,
      },
      { transaction }
    );
  }

  return {
    modesByKey,
    observerOrgs,
    departmentsByCode,
    rolesByKey,
    usersByEmail,
    usersByRole,
    bacMembers,
    vendorsByKey,
  };
}

async function seedPlanningAndBudget(ctx, transaction) {
  const { departmentsByCode, usersByRole } = ctx;
  const planner = usersByRole.get("planningOfficer");
  const mayor = usersByRole.get("hope");
  const budgetOfficer = usersByRole.get("budgetOfficer");
  const sbSecretary = usersByRole.get("sanggunianSecretary");
  const treasurer = usersByRole.get("municipalTreasurer");

  const plan = await DevelopmentPlan.create(
    {
      title: DEVELOPMENT_PLAN.title,
      startYear: DEVELOPMENT_PLAN.startYear,
      endYear: DEVELOPMENT_PLAN.endYear,
      vision: DEVELOPMENT_PLAN.vision,
      resolutionNo: DEVELOPMENT_PLAN.resolutionNo,
      adoptedAt: DEVELOPMENT_PLAN.adoptedAt,
      status: "adopted",
      preparedById: planner.id,
    },
    { transaction }
  );

  const goalsByKey = {};
  for (const goal of DEVELOPMENT_PLAN.goals) {
    goalsByKey[goal.key] = await DevelopmentGoal.create(
      {
        developmentPlanId: plan.id,
        sector: goal.sector,
        subsector: goal.subsector,
        title: goal.title,
        description: goal.description,
        status: "active",
      },
      { transaction }
    );
  }

  const program = await InvestmentProgram.create(
    {
      fiscalYear: FISCAL_YEAR,
      title: `Annual Investment Program — FY ${FISCAL_YEAR}`,
      resolutionNo: "SB Res. No. 2025-114",
      adoptedAt: "2025-11-12",
      status: "adopted",
      developmentPlanId: plan.id,
      preparedById: planner.id,
      remarks: "Adopted by the Sangguniang Bayan for FY 2026 implementation.",
    },
    { transaction }
  );

  const aipByKey = {};
  for (const entry of AIP_ENTRIES) {
    aipByKey[entry.key] = await AipEntry.create(
      {
        reference: entry.reference,
        title: entry.title,
        description: entry.description,
        expectedOutput: entry.expectedOutput,
        expenseClass: entry.expenseClass,
        fund: entry.fund,
        papCode: entry.papCode,
        estimatedCost: entry.estimatedCost,
        startQuarter: entry.startQuarter,
        endQuarter: entry.endQuarter,
        status: "planned",
        investmentProgramId: program.id,
        developmentGoalId: goalsByKey[entry.goalKey].id,
        implementingUnitId: departmentsByCode[entry.department].id,
      },
      { transaction }
    );
  }

  const executiveBudget = await ExecutiveBudget.create(
    {
      fiscalYear: FISCAL_YEAR,
      type: "annual",
      title: `FY ${FISCAL_YEAR} Annual Executive Budget`,
      status: "enacted",
      estimatedIncome: 195000000,
      expenditureCeiling: 192000000,
      regularIncomePriorYear: 184000000,
      nationalTaxAllotment: 158000000,
      ceilingGrowthPct: 5,
      mbcReviewedAt: atManila("2025-10-08T10:00"),
      consolidatedAt: atManila("2025-10-14T15:00"),
      forumHeldAt: atManila("2025-10-20T09:30"),
      hearingConcludedAt: atManila("2025-11-04T16:00"),
      finalisedAt: atManila("2025-11-18T14:00"),
      mayorApprovedAt: atManila("2025-11-24T10:00"),
      ordinanceNo: "Appropriation Ordinance No. 2025-09",
      ordinanceDate: "2025-12-10",
      sanggunianActedAt: atManila("2025-12-10T15:30"),
      provincialReviewOutcome: "approved",
      provincialReviewedAt: atManila("2025-12-22T11:00"),
      provincialRemarks: "Reviewed and found operative in full by the Sangguniang Panlalawigan.",
      enactedAt: atManila("2025-12-23T09:00"),
      investmentProgramId: program.id,
      preparedById: budgetOfficer.id,
      approvedById: mayor.id,
    },
    { transaction }
  );

  // Record the three statutory budget proceedings (Forum, Hearing, Deliberation).
  const attendees = [
    { userId: mayor.id, name: mayor.name, office: "Office of the Mayor", capacity: "Municipal Mayor" },
    { userId: budgetOfficer.id, name: budgetOfficer.name, office: "Municipal Budget Office", capacity: "Budget Officer" },
    { userId: planner.id, name: planner.name, office: "MPDO", capacity: "Planning Coordinator" },
    { userId: treasurer.id, name: treasurer.name, office: "Municipal Treasurer's Office", capacity: "Municipal Treasurer" },
  ];
  await BudgetProceeding.bulkCreate(
    [
      {
        executiveBudgetId: executiveBudget.id,
        type: "forum",
        scheduledAt: atManila("2025-10-20T09:00"),
        heldAt: atManila("2025-10-20T09:30"),
        venue: "Sangguniang Bayan Session Hall",
        agenda: "FY 2026 revenue projections, National Tax Allotment ceiling, and office expenditure allocations.",
        minutes: "Local Finance Committee certified income estimates and approved department ceilings aligned with the FY 2026 AIP.",
        attendees,
        recordedById: budgetOfficer.id,
      },
      {
        executiveBudgetId: executiveBudget.id,
        type: "hearing",
        scheduledAt: atManila("2025-11-04T09:00"),
        heldAt: atManila("2025-11-04T09:30"),
        venue: "Sangguniang Bayan Session Hall",
        agenda: "Departmental budget hearings for Health, Engineering, and Information Technology capital projects.",
        minutes: "Implementing units defended equipment costs and project schedules against AIP targets.",
        attendees,
        departmentId: departmentsByCode.ENGR.id,
        recordedById: budgetOfficer.id,
      },
      {
        executiveBudgetId: executiveBudget.id,
        type: "deliberation",
        scheduledAt: atManila("2025-11-18T13:30"),
        heldAt: atManila("2025-11-18T14:00"),
        venue: "Sangguniang Bayan Session Hall",
        agenda: "Final consolidation and endorsement of the FY 2026 Annual Executive Budget.",
        minutes: "Final expenditure program endorsed to the Municipal Mayor and Sangguniang Bayan.",
        attendees,
        recordedById: sbSecretary.id,
      },
    ],
    { transaction }
  );

  // Department budget proposals & enacted appropriations
  const appropriationsByKey = {};
  for (const spec of APPROPRIATIONS) {
    const dept = departmentsByCode[spec.department];
    const proposal = await BudgetProposal.create(
      {
        executiveBudgetId: executiveBudget.id,
        departmentId: dept.id,
        fiscalYear: FISCAL_YEAR,
        status: "finalised",
        proposedTotal: spec.amount,
        recommendedTotal: spec.amount,
        finalTotal: spec.amount,
        previousYearAppropriation: Math.round(spec.amount * 0.96),
        justification: `FY ${FISCAL_YEAR} funding requirement for ${spec.title}.`,
        submittedAt: atManila("2025-10-02T11:00"),
        reviewNotes: "Aligned with the adopted FY 2026 Annual Investment Program.",
        preparedById: budgetOfficer.id,
      },
      { transaction }
    );
    await BudgetProposalLine.create(
      {
        budgetProposalId: proposal.id,
        aipEntryId: spec.aipKey ? aipByKey[spec.aipKey].id : null,
        title: spec.title,
        expenseClass: spec.expenseClass,
        fund: spec.fund,
        papCode: spec.papCode,
        uacsCode: spec.uacsCode,
        proposedAmount: spec.amount,
        recommendedAmount: spec.amount,
        finalAmount: spec.amount,
        isDevelopmentFund: Boolean(spec.isDevelopmentFund),
        isLdrrmf: false,
        remarks: "Enacted under Appropriation Ordinance No. 2025-09.",
      },
      { transaction }
    );

    appropriationsByKey[spec.key] = await Appropriation.create(
      {
        fiscalYear: FISCAL_YEAR,
        ordinanceNo: "Appropriation Ordinance No. 2025-09",
        ordinanceDate: "2025-12-10",
        type: "annual",
        fund: spec.fund,
        expenseClass: spec.expenseClass,
        papCode: spec.papCode,
        uacsCode: spec.uacsCode,
        title: spec.title,
        amount: spec.amount,
        status: "enacted",
        departmentId: dept.id,
        remarks: "Enacted FY 2026 appropriation.",
      },
      { transaction }
    );
  }

  return { plan, goalsByKey, program, aipByKey, executiveBudget, appropriationsByKey };
}

async function seedObservers(ctx, rfq, openingDate, { attendedAndReported = false }, transaction) {
  const { observerOrgs, usersByRole } = ctx;
  const secretariat = usersByRole.get("bacSecretariat");
  const observerUser = usersByRole.get("observer");

  const coa = observerOrgs.find((org) => org.sector === "coa");
  const pcci = observerOrgs.find((org) => org.sector === "privateGroup" && org.relevantCategories?.includes("goods"));
  const cso = observerOrgs.find((org) => org.sector === "csoOrPo");
  const invitedAt = new Date(openingDate.getTime() - (OBSERVER_NOTICE_DAYS + 3) * DAY_MS);

  for (const org of [coa, pcci, cso].filter(Boolean)) {
    const isPrimaryCso = org.id === cso?.id;
    const invitation = await ObserverInvitation.create(
      {
        rfqId: rfq.id,
        observerOrganizationId: org.id,
        invitedById: secretariat.id,
        observerUserId: isPrimaryCso ? observerUser.id : null,
        stage: "preliminaryExamination",
        scheduledAt: openingDate,
        invitedAt,
        noticeDays: OBSERVER_NOTICE_DAYS + 3,
        noticeCompliant: true,
        representativeName: isPrimaryCso ? observerUser.name : org.contactPerson,
        confidentialityAgreedAt: attendedAndReported ? openingDate : null,
        attendance: attendedAndReported ? "attended" : "invited",
        attendedAt: attendedAndReported ? openingDate : null,
      },
      { transaction }
    );

    if (attendedAndReported && isPrimaryCso) {
      const submittedAt = new Date(openingDate.getTime() + 2 * DAY_MS);
      const dueAt = new Date(openingDate.getTime() + OBSERVATION_REPORT_DAYS * DAY_MS);
      await ObservationReport.create(
        {
          invitationId: invitation.id,
          submittedById: observerUser.id,
          complianceAssessment:
            "Opening of bids, eligibility screening, and reading of financial proposals were conducted in public view in accordance with RA No. 12009.",
          areasForImprovement: "Continue posting complete technical schedules ahead of pre-bid conferences.",
          findingsRegular: true,
          submittedAt,
          dueAt,
          submittedLate: false,
          furnishedTo: ["hope", "bacChairperson", "philgeps", "coa", "gppb"],
        },
        { transaction }
      );
    }
  }
}

async function seedCompletedProject(ctx, planning, auditQueue, transaction) {
  const spec = PUBLIC_PROJECTS.completed;
  const d = spec.dates;
  const { departmentsByCode, modesByKey, usersByRole, bacMembers, vendorsByKey } = ctx;
  const dept = departmentsByCode[spec.department];
  const mode = modesByKey.competitiveBidding;
  const appropriation = planning.appropriationsByKey[spec.appropriationKey];
  const aip = planning.aipByKey[spec.aipKey];

  const mayor = usersByRole.get("hope");
  const budgetOfficer = usersByRole.get("budgetOfficer");
  const treasurer = usersByRole.get("municipalTreasurer");
  const accountant = usersByRole.get("municipalAccountant");
  const secretariat = usersByRole.get("bacSecretariat");
  const bacChair = usersByRole.get("bacChairperson");
  const twg = usersByRole.get("twgMember");
  const requester = usersByRole.get("departmentRequester");
  const head = usersByRole.get("headOfOffice");

  const queue = (actor, payload) =>
    auditQueue.push({
      ...payload,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.Role?.key ?? payload.actorRole,
      ipAddress: "127.0.0.1",
    });

  const appEntry = await AppEntry.create(
    {
      projectTitle: spec.projectTitle,
      description: spec.description,
      papCode: spec.papCode,
      uacsCode: spec.uacsCode,
      accountCode: spec.accountCode,
      category: spec.category,
      categoryDetails: spec.categoryDetails,
      procurementMode: mode.key,
      abc: spec.abc,
      unit: "lot",
      quantity: 1,
      fundSource: spec.fundSource,
      targetStartQuarter: "Q1",
      targetCompletionQuarter: "Q2",
      justificationStatus: "notApplicable",
      fiscalYear: FISCAL_YEAR,
      status: "locked",
      planStage: "finalApp",
      planCycle: "final",
      earlyProcurement: false,
      bidEvaluationCriteria: "Pass/fail technical compliance followed by Lowest Calculated Responsive Bid.",
      procurementStrategy: "Single lot delivery, installation, commissioning, and training at the Rural Health Unit.",
      modeRecommendedAt: d.appApproved,
      modeRecommendationBasis: "Competitive market availability across accredited medical equipment distributors.",
      lockedAt: d.appApproved,
      postedAt: d.appPosted,
      gppbSubmittedAt: d.appPosted,
      implementingUnitId: dept.id,
      appropriationId: appropriation.id,
      aipEntryId: aip.id,
      preparedById: secretariat.id,
      approvedById: mayor.id,
    },
    { transaction }
  );

  const allocReq = await BudgetControlRequest.create(
    {
      kind: "allocation",
      status: "approved",
      sourceProjectId: appEntry.id,
      sourceAppropriationId: appropriation.id,
      fiscalYear: FISCAL_YEAR,
      amount: spec.abc,
      fund: appropriation.fund,
      expenseClass: appropriation.expenseClass,
      reason: "Allocate enacted FY 2026 health capital outlay to the approved Final APP entry.",
      authorityReference: appropriation.ordinanceNo,
      requesterId: budgetOfficer.id,
      approverId: mayor.id,
      requestedAt: d.appPosted,
      approvedAt: d.allocated,
    },
    { transaction }
  );

  await ProjectAllocation.create(
    {
      appEntryId: appEntry.id,
      appropriationId: appropriation.id,
      fiscalYear: FISCAL_YEAR,
      amount: spec.abc,
      status: "closed",
      approvedById: mayor.id,
      approvedAt: d.allocated,
      sourceRequestId: allocReq.id,
    },
    { transaction }
  );

  queue(mayor, {
    actionType: "app.transition",
    entityRef: "appEntry",
    entityId: appEntry.id,
    actorRole: "hope",
    summary: `Approved Final APP entry ${spec.papCode}`,
    beforeState: { status: "pendingApproval" },
    afterState: { status: "locked" },
    recordedAt: d.appApproved,
  });

  const pr = await PrHeader.create(
    {
      prNumber: spec.prNumber,
      purpose: "Equip the Municipal Rural Health Unit clinical laboratory with diagnostic analyzers and patient monitors.",
      dateRequired: "2026-06-15",
      isEmergency: false,
      justificationStatus: "notApplicable",
      totalAmount: spec.abc,
      status: "approved",
      submittedAt: d.prSubmitted,
      cashCertifiedAt: d.cashCertified,
      cashCertifiedById: treasurer.id,
      mayorApprovedAt: d.mayorApproved,
      mayorApprovedById: mayor.id,
      appropriationCertifiedAt: d.appropriated,
      appropriationCertifiedById: budgetOfficer.id,
      fundsReservedAt: d.obligated,
      obligatedById: budgetOfficer.id,
      fundSource: appropriation.fund,
      modeDeterminedAt: d.modeDetermined,
      modeDeterminedById: bacChair.id,
      modeJustificationStatus: "notApplicable",
      suggestedModeKey: mode.key,
      appEntryId: appEntry.id,
      departmentId: dept.id,
      requesterId: requester.id,
      procurementModeId: mode.id,
    },
    { transaction }
  );

  await PrLineItem.bulkCreate(
    spec.items.map(({ offeredUnitCost, ...item }) => ({
      ...item,
      lineTotal: item.quantity * item.unitCost,
      hasUsefulLifeOverOneYear: true,
      assetClass: "capitalOutlay",
      prHeaderId: pr.id,
    })),
    { transaction }
  );

  await Obligation.create(
    {
      obligationNo: spec.obligationNo,
      amount: spec.awardAmount,
      status: "obligated",
      certifiedAt: d.obligated,
      certifiedById: budgetOfficer.id,
      particulars: `Obligation for ${spec.prNumber}, adjusted to awarded purchase order ${spec.poRef}.`,
      appropriationId: appropriation.id,
      prHeaderId: pr.id,
    },
    { transaction }
  );

  queue(head, {
    actionType: "pr.transition",
    entityRef: "pr",
    entityId: pr.id,
    actorRole: "headOfOffice",
    summary: `Endorsed ${spec.prNumber} for cash certification`,
    beforeState: { status: "pendingDepartmentHeadEndorsement" },
    afterState: { status: "pendingCashCertification" },
    recordedAt: d.prEndorsed,
  });
  queue(treasurer, {
    actionType: "pr.transition",
    entityRef: "pr",
    entityId: pr.id,
    actorRole: "municipalTreasurer",
    summary: `Certified cash availability for ${spec.prNumber}`,
    beforeState: { status: "pendingCashCertification" },
    afterState: { status: "pendingMayorApproval" },
    recordedAt: d.cashCertified,
  });
  queue(mayor, {
    actionType: "pr.transition",
    entityRef: "pr",
    entityId: pr.id,
    actorRole: "hope",
    summary: `Approved ${spec.prNumber}`,
    beforeState: { status: "pendingMayorApproval" },
    afterState: { status: "pendingAppropriationCertification" },
    recordedAt: d.mayorApproved,
  });
  queue(budgetOfficer, {
    actionType: "pr.transition",
    entityRef: "pr",
    entityId: pr.id,
    actorRole: "budgetOfficer",
    summary: `Certified appropriation and obligated funds (${spec.obligationNo})`,
    beforeState: { status: "pendingAppropriationCertification" },
    afterState: { status: "pendingModeDetermination" },
    recordedAt: d.obligated,
  });
  queue(bacChair, {
    actionType: "pr.mode.determined",
    entityRef: "pr",
    entityId: pr.id,
    actorRole: "bacChairperson",
    summary: `Confirmed Competitive Bidding for ${spec.prNumber}`,
    beforeState: { status: "pendingModeDetermination" },
    afterState: { status: "approved", procurementMode: mode.key },
    recordedAt: d.modeDetermined,
  });

  const rfqFields = {
    referenceNo: spec.rfqRef,
    title: spec.projectTitle,
    openingVenue: spec.venue,
    category: spec.rfqCategory,
    abc: spec.abc,
    prHeaderId: pr.id,
    appEntryId: appEntry.id,
    procurementModeId: mode.id,
    publishedById: secretariat.id,
    status: "awarded",
    procurementContactPerson: `${secretariat.name}, BAC Secretariat`,
    procurementContactEmail: secretariat.email,
    requiredSupplierDocuments:
      "PhilGEPS Platinum Certificate, Mayor's Permit, BIR Tax Clearance, Audited Financial Statements, Omnibus Sworn Statement, Technical Specifications Compliance Schedule, and Bid Securing Declaration.",
    publishDate: d.published,
    procurementStartAt: d.scheduleApproved,
    publicationStartAt: d.published,
    publicationEndAt: d.closing,
    closingDate: d.closing,
    openingDate: d.opening,
    prebidRequired: true,
    prebidAt: d.prebid,
    prebidVenue: spec.venue,
    prebidRemarks: "Clarified equipment calibration, installation schedule, and 2-year preventive maintenance coverage.",
    evaluationStartAt: d.evalStart,
    evaluationEndAt: d.evalEnd,
    postQualificationStartAt: d.postQualStart,
    postQualificationEndAt: d.postQualEnd,
    expectedAwardAt: d.awardApproved,
    scheduleApprovedAt: d.scheduleApproved,
    schedulePublishedAt: d.published,
    twgRequired: true,
    postingRequired: true,
    philgepsPostedAt: d.published,
    philgepsReference: spec.philgepsRef,
  };
  assert.equal(scheduleValidationError(rfqFields), null, "Completed project RFQ schedule invalid");
  const rfq = await Rfq.create(rfqFields, { transaction });

  const notice = await Announcement.create(
    {
      ...announcementSchedule(rfq),
      title: `Invitation to Bid — ${spec.projectTitle}`,
      body: `The Municipality of Roxas, Oriental Mindoro invites sealed bids for ${spec.projectTitle} with an Approved Budget for the Contract of ${peso(spec.abc)}.`,
      category: "procurementOpportunity",
      status: "archived",
      publishedAt: d.published,
      expiresAt: d.closing,
      archivedAt: d.evalEnd,
      registrationDeadline: d.closing,
      venue: spec.venue,
      contactPerson: secretariat.name,
      contactEmail: secretariat.email,
      fundSource: spec.fundSource,
      procurementMethod: mode.name,
      procurementMethodCitation: mode.citation,
      rfqId: rfq.id,
      appEntryId: appEntry.id,
      createdById: secretariat.id,
      publishedById: secretariat.id,
    },
    { transaction }
  );

  await seedObservers(ctx, rfq, d.opening, { attendedAndReported: true }, transaction);

  queue(secretariat, {
    actionType: "rfq.published",
    entityRef: "rfq",
    entityId: rfq.id,
    actorRole: "bacSecretariat",
    summary: `Published Invitation to Bid ${spec.rfqRef} (${spec.philgepsRef})`,
    beforeState: { status: "draft" },
    afterState: { status: "published" },
    recordedAt: d.published,
  });
  queue(secretariat, {
    actionType: "observers.invited",
    entityRef: "rfq",
    entityId: rfq.id,
    actorRole: "bacSecretariat",
    summary: `Invited COA, private sector, and civil society observers for ${spec.rfqRef}`,
    afterState: { count: 3 },
    recordedAt: new Date(d.opening.getTime() - (OBSERVER_NOTICE_DAYS + 3) * DAY_MS),
  });

  await TwgDeclaration.create(
    { rfqId: rfq.id, memberId: twg.id, noConflictDeclared: true, declaredAt: d.opening },
    { transaction }
  );

  const evaluators = bacMembers.slice(0, 3);
  for (const member of evaluators) {
    await EvaluatorDeclaration.create(
      { rfqId: rfq.id, userId: member.user.id, role: member.roleKey, noConflictDeclared: true, declaredAt: d.opening },
      { transaction }
    );
  }

  const compliance = Object.fromEntries(complianceRequirementsFor("goods", mode.key).map(({ key }) => [key, true]));
  assert.equal(evaluationError({ category: "goods", modeKey: mode.key, criteriaBreakdown: compliance, verdict: "passed" }), null);

  const bids = [];
  for (const [idx, offer] of spec.bidders.entries()) {
    const vendor = vendorsByKey[offer.vendorKey];
    const bid = await Bid.create(
      {
        rfqId: rfq.id,
        vendorId: vendor.id,
        submittedAt: offer.submittedAt,
        blindLabel: offer.blindLabel,
        technicalSubmitted: true,
        financialSealed: false,
        totalBidPrice: offer.amount,
        status: idx === 0 ? "awarded" : "lost",
      },
      { transaction }
    );
    bids.push(bid);

    await Security.create(
      {
        type: "bid",
        form: "securingDeclaration",
        amount: 0,
        percentage: 0,
        referenceNo: `BSD-2026-001-${idx + 1}`,
        postedAt: offer.submittedAt,
        validUntil: "2026-08-08",
        status: "released",
        releasedAt: d.signedVendor,
        entityRef: "bid",
        entityId: bid.id,
        vendorId: vendor.id,
      },
      { transaction }
    );

    await TwgAssessment.create(
      {
        bidId: bid.id,
        memberId: twg.id,
        status: "submitted",
        excludedForConflict: false,
        noConflictDeclared: true,
        declaredAt: d.opening,
        submittedAt: d.evalStart,
        recommendation: "compliant",
        remarks: "Submitted technical brochures, FDA clearances, and equipment specifications meet all mandatory requirements.",
        requirements: [
          { requirement: "Clinical analyzer throughput and wavelength compliance", complianceStatus: "compliant", findings: "Verified against manufacturer datasheets." },
          { requirement: "Warranty, calibration, and on-site training commitment", complianceStatus: "compliant", findings: "Two-year warranty and commissioning plan confirmed." },
        ],
      },
      { transaction }
    );

    for (const member of evaluators) {
      await Evaluation.create(
        {
          bidId: bid.id,
          evaluatorId: member.user.id,
          criteriaBreakdown: { verdict: "passed", requirementsExamined: compliance },
          score: 100,
          blindFlag: true,
          status: "submitted",
          noConflictDeclared: true,
          declaredAt: d.opening,
          submittedAt: d.evalEnd,
          failureReason: "none",
          recommendation: "Technically compliant; proceed to financial opening.",
          remarks: "Eligibility documents, technical compliance, and bid security verified.",
        },
        { transaction }
      );
    }
  }

  await BidOpeningRecord.create(
    {
      rfqId: rfq.id,
      openedAt: d.opening,
      openedById: bacChair.id,
      bidsReceived: bids.length,
      witnesses: "BAC Chairperson, BAC Members, BAC Secretariat, and accredited observers",
      remarks: "Three sealed bids received before the deadline and opened in public session.",
    },
    { transaction }
  );

  queue(bacChair, {
    actionType: "bids.opened",
    entityRef: "rfq",
    entityId: rfq.id,
    actorRole: "bacChairperson",
    summary: `Opened ${bids.length} sealed bids for ${spec.rfqRef}`,
    beforeState: { status: "closed" },
    afterState: { status: "opened", bidsReceived: bids.length },
    recordedAt: d.opening,
  });
  queue(evaluators[0].user, {
    actionType: "evaluation.submitted",
    entityRef: "bid",
    entityId: bids[0].id,
    actorRole: evaluators[0].roleKey,
    summary: "Submitted technical compliance evaluation",
    afterState: { status: "submitted" },
    recordedAt: d.evalStart,
  });
  queue(bacChair, {
    actionType: "evaluation.closed",
    entityRef: "rfq",
    entityId: rfq.id,
    actorRole: "bacChairperson",
    summary: `Concluded bid evaluation for ${spec.rfqRef}`,
    beforeState: { status: "opened" },
    afterState: { status: "evaluated" },
    recordedAt: d.evalEnd,
  });

  await PostQualification.create(
    {
      bidId: bids[0].id,
      verifiedById: bacChair.id,
      result: "passed",
      verifiedAt: d.postQualEnd,
      checklist: { philgeps: "verified", businessPermit: "verified", taxClearance: "verified", technicalCapacity: "verified", warrantySupport: "verified" },
      remarks: "Verified original legal, technical, and financial documents and confirmed stock readiness.",
    },
    { transaction }
  );

  const winner = vendorsByKey[spec.bidders[0].vendorKey];
  const award = await Award.create(
    {
      rfqId: rfq.id,
      bidId: bids[0].id,
      vendorId: winner.id,
      recommendedById: bacChair.id,
      approvedById: mayor.id,
      status: "accepted",
      awardBasis: "LCRB",
      noaNumber: spec.noaNumber,
      noaDate: dateOnly(d.awardApproved),
      supplierReceivedAt: d.supplierReceivedNoa,
      amount: spec.awardAmount,
      remarks: "Lowest Calculated Responsive Bid; supplier acknowledged Notice of Award and posted performance security.",
    },
    { transaction }
  );

  const resolution = await BacResolution.create(
    {
      resolutionNo: spec.bacResolutionNo,
      type: "recommendAward",
      title: `BAC Resolution Recommending Award for ${spec.rfqRef}`,
      recitals: `${winner.businessName} submitted the Lowest Calculated Responsive Bid of ${peso(spec.awardAmount)} and passed post-qualification.`,
      resolvedAt: d.resolution,
      members: bacMembers.map(({ user, roleKey }) => ({
        userId: user.id,
        role: roleKey,
        name: user.name,
        present: true,
        concurred: true,
      })),
      quorumMet: true,
      entityRef: "award",
      entityId: award.id,
    },
    { transaction }
  );

  await ProcurementAttempt.create(
    {
      rfqId: rfq.id,
      projectKey: projectKeyFor(rfq),
      attemptNumber: 1,
      status: "awarded",
      bacResolutionId: resolution.id,
      responsibleUserId: bacChair.id,
      startedAt: d.scheduleApproved,
      completedAt: d.awardApproved,
      outcomeSnapshot: { awardId: award.id, winningBidId: bids[0].id, amount: spec.awardAmount, basis: "LCRB" },
      supportingDocuments: [],
    },
    { transaction }
  );

  queue(bacChair, {
    actionType: "award.recommended",
    entityRef: "award",
    entityId: award.id,
    actorRole: "bacChairperson",
    summary: `Recommended award to ${winner.businessName} (${spec.bacResolutionNo})`,
    afterState: { status: "recommended", amount: spec.awardAmount },
    recordedAt: d.resolution,
  });
  queue(mayor, {
    actionType: "award.approved",
    entityRef: "award",
    entityId: award.id,
    actorRole: "hope",
    summary: `Approved Notice of Award ${spec.noaNumber}`,
    beforeState: { status: "recommended" },
    afterState: { status: "accepted", noaNumber: spec.noaNumber },
    recordedAt: d.awardApproved,
  });

  const contract = await Contract.create(
    {
      awardId: award.id,
      vendorId: winner.id,
      draftedById: secretariat.id,
      contractNo: spec.contractNo,
      poRef: spec.poRef,
      amount: spec.awardAmount,
      amountPaid: spec.awardAmount,
      instrumentType: "purchaseOrder",
      category: "goods",
      startDate: dateOnly(d.ntpIssued),
      deliveryDeadline: spec.deliveryDeadline,
      noticeToProceedAt: d.ntpIssued,
      contractDays: spec.contractDays,
      signedByLguAt: d.signedLgu,
      signedByVendorAt: d.signedVendor,
      status: "completed",
      actualCompletionAt: d.paid,
      terms:
        "Supply, deliver, install, calibrate, and commission all diagnostic laboratory equipment at the Roxas Rural Health Unit within 30 calendar days from Notice to Proceed, with 2-year preventive maintenance warranty.",
    },
    { transaction }
  );

  await Security.create(
    {
      type: "performance",
      form: "managersCheck",
      amount: requiredPerformanceSecurity(spec.awardAmount, "goods", "managersCheck"),
      percentage: 5,
      referenceNo: "PS-2026-0001",
      postedAt: d.perfSecurityPosted,
      validUntil: "2027-06-30",
      status: "released",
      releasedAt: d.inspected,
      entityRef: "contract",
      entityId: contract.id,
      vendorId: winner.id,
    },
    { transaction }
  );

  queue(mayor, {
    actionType: "contract.signed",
    entityRef: "contract",
    entityId: contract.id,
    actorRole: "hope",
    summary: `Executed ${spec.contractNo} / ${spec.poRef}`,
    beforeState: { status: "draft" },
    afterState: { status: "active" },
    recordedAt: d.signedVendor,
  });
  queue(secretariat, {
    actionType: "contract.ntp.issued",
    entityRef: "contract",
    entityId: contract.id,
    actorRole: "bacSecretariat",
    summary: `Issued Notice to Proceed ${spec.ntpRef}`,
    afterState: { status: "active", noticeToProceedAt: d.ntpIssued.toISOString() },
    recordedAt: d.ntpIssued,
  });

  const delivery = await Delivery.create(
    {
      contractId: contract.id,
      deliveredAt: d.delivered,
      inspectedAt: d.inspected,
      inspectedById: head.id,
      status: "accepted",
      description: `${spec.deliveryReceipt} — All diagnostic laboratory analyzers, monitors, centrifuge, and worktable delivered, installed, and calibrated.`,
      acceptedQuantityNote: "All 4 line items delivered in full and verified operational at the Rural Health Unit.",
      acceptedValue: spec.awardAmount,
      remarks: `${spec.iarRef} — Inspection and Acceptance Committee verified serial numbers, calibration certificates, and staff orientation.`,
    },
    { transaction }
  );

  const invoice = await Invoice.create(
    {
      contractId: contract.id,
      deliveryId: delivery.id,
      vendorId: winner.id,
      invoiceNo: spec.invoiceNo,
      supplierInvoiceRef: spec.supplierInvoiceRef,
      amount: spec.awardAmount,
      submittedAt: d.invoiced,
      status: "paid",
      remarks: `Certified complete against ${spec.poRef} and ${spec.iarRef}.`,
    },
    { transaction }
  );

  const deductions = computeDeductions({
    grossAmount: spec.awardAmount,
    vendor: winner,
    contract,
    asOf: d.certified,
  });

  const payment = await Payment.create(
    {
      invoiceId: invoice.id,
      disbursementNo: spec.disbursementNo,
      amount: deductions.netAmount,
      grossAmount: deductions.grossAmount,
      ewtAmount: deductions.ewtAmount,
      vatWithheldAmount: deductions.vatWithheldAmount,
      retentionAmount: deductions.retentionAmount,
      liquidatedDamages: deductions.liquidatedDamages,
      otherDeductions: deductions.otherDeductions,
      deductionBreakdown: deductions.breakdown,
      preparedAt: d.certified,
      preparedById: accountant.id,
      releasedAt: d.paid,
      releasedById: treasurer.id,
      status: "released",
      method: "bankTransfer",
      reference: spec.paymentReference,
      remarks: "Full settlement released to supplier with statutory EWT and GMP VAT withholdings remitted separately.",
    },
    { transaction }
  );

  const savings = spec.abc - spec.awardAmount;
  const closeout = await BudgetControlRequest.create(
    {
      kind: "closeout",
      status: "approved",
      sourceProjectId: appEntry.id,
      sourceAppropriationId: appropriation.id,
      fiscalYear: FISCAL_YEAR,
      amount: savings,
      classification: "contractSavings",
      fund: appropriation.fund,
      expenseClass: appropriation.expenseClass,
      sector: "social",
      reason: "Delivery accepted and disbursement completed in full. Recognize unused allocation as contract savings.",
      authorityReference: spec.closeoutRef,
      requesterId: budgetOfficer.id,
      approverId: mayor.id,
      requestedAt: d.closeoutRequested,
      approvedAt: d.closeoutApproved,
      decisionRemarks: "Verified zero unpaid balance and accurate tax withholding on DV-2026-0001.",
    },
    { transaction }
  );

  queue(head, {
    actionType: "delivery.inspected",
    entityRef: "delivery",
    entityId: delivery.id,
    actorRole: "headOfOffice",
    summary: `Accepted delivery under ${spec.iarRef}`,
    beforeState: { status: "reported" },
    afterState: { status: "accepted" },
    recordedAt: d.inspected,
  });
  queue(accountant, {
    actionType: "invoice.certified",
    entityRef: "invoice",
    entityId: invoice.id,
    actorRole: "municipalAccountant",
    summary: `Certified ${spec.invoiceNo} and prepared ${spec.disbursementNo}`,
    beforeState: { status: "submitted" },
    afterState: { status: "certified" },
    recordedAt: d.certified,
  });
  queue(treasurer, {
    actionType: "payment.released",
    entityRef: "payment",
    entityId: payment.id,
    actorRole: "municipalTreasurer",
    summary: `Released disbursement ${spec.disbursementNo} (${spec.paymentReference})`,
    beforeState: { status: "prepared" },
    afterState: { status: "released", netAmount: deductions.netAmount },
    recordedAt: d.paid,
  });

  // Attach genuine PDF records to public and internal entities.
  const itbPdf = await attachPdf(transaction, {
    entityRef: "rfq",
    entityId: rfq.id,
    filename: `${spec.rfqRef}-Invitation-to-Bid.pdf`,
    label: "Invitation to Bid and Technical Specifications",
    uploadedById: secretariat.id,
    uploadedAt: d.published,
    pdfSpec: {
      office: "Bids and Awards Committee Secretariat",
      title: "Invitation to Bid and Technical Specifications",
      reference: `${spec.rfqRef} / ${spec.philgepsRef}`,
      issuedDate: dateOnly(d.published),
      projectTitle: spec.projectTitle,
      intro: "Sealed bids are invited for the supply, delivery, installation, and calibration of clinical diagnostic equipment for the Rural Health Unit.",
      rows: [
        ["Approved Budget (ABC)", peso(spec.abc)],
        ["Funding Source", `${spec.fundSource} (${appropriation.ordinanceNo})`],
        ["Procurement Method", `${mode.name} (${mode.citation})`],
        ["Pre-Bid Conference", `${dateOnly(d.prebid)} | ${spec.venue}`],
        ["Bid Opening", `${dateOnly(d.opening)} | ${spec.venue}`],
        ...spec.items.map((item) => [`${item.quantity} ${item.unit} - ${item.description}`, item.technicalSpecifications]),
      ],
      footer: "Published pursuant to Republic Act No. 12009 and its Implementing Rules and Regulations.",
    },
  });

  await attachPdf(transaction, {
    entityRef: "announcement",
    entityId: notice.id,
    filename: `${spec.rfqRef}-Notice.pdf`,
    label: "Published Invitation to Bid Notice",
    uploadedById: secretariat.id,
    uploadedAt: d.published,
    pdfSpec: {
      office: "Bids and Awards Committee Secretariat",
      title: "Published Invitation to Bid Notice",
      reference: spec.rfqRef,
      issuedDate: dateOnly(d.published),
      projectTitle: spec.projectTitle,
      intro: `Official public bidding notice posted on PhilGEPS (${spec.philgepsRef}) and the municipal transparency portal.`,
      rows: [
        ["Approved Budget", peso(spec.abc)],
        ["Submission Deadline", dateOnly(d.closing)],
        ["Bid Opening Venue", spec.venue],
        ["Contact Officer", `${secretariat.name} (${secretariat.email})`],
      ],
    },
  });

  const abstractPdf = await attachPdf(transaction, {
    entityRef: "rfq",
    entityId: rfq.id,
    filename: `${spec.rfqRef}-Abstract-of-Bids.pdf`,
    label: "Abstract of Bids and Award Summary",
    uploadedById: secretariat.id,
    uploadedAt: d.resolution,
    pdfSpec: {
      office: "Bids and Awards Committee",
      title: "Abstract of Bids and Award Recommendation",
      reference: `${spec.bacResolutionNo} / ${spec.noaNumber}`,
      issuedDate: dateOnly(d.resolution),
      projectTitle: spec.projectTitle,
      intro: "Three responsive bids were received and opened in public session. Award was recommended to the Lowest Calculated Responsive Bid.",
      rows: [
        ["Approved Budget", peso(spec.abc)],
        ...spec.bidders.map((b, i) => [`Rank ${i + 1}`, `${vendorsByKey[b.vendorKey].businessName} — ${peso(b.amount)}`]),
        ["Recommended Awardee", winner.businessName],
        ["Contract Price", peso(spec.awardAmount)],
        ["Contract Savings", peso(savings)],
      ],
    },
  });

  await attachPdf(transaction, {
    entityRef: "contract",
    entityId: contract.id,
    filename: `${spec.poRef}-Purchase-Order.pdf`,
    label: "Signed Purchase Order and Notice to Proceed",
    uploadedById: secretariat.id,
    uploadedAt: d.ntpIssued,
    pdfSpec: {
      office: "Office of the Municipal Mayor",
      title: "Purchase Order and Notice to Proceed",
      reference: `${spec.contractNo} / ${spec.poRef} / ${spec.ntpRef}`,
      issuedDate: dateOnly(d.ntpIssued),
      projectTitle: spec.projectTitle,
      intro: `Contract executed with ${winner.businessName} for delivery and installation within ${spec.contractDays} calendar days.`,
      rows: [
        ["Supplier", winner.businessName],
        ["Contract Amount", peso(spec.awardAmount)],
        ["Delivery Deadline", spec.deliveryDeadline],
        ["Performance Security", `Manager's Check — ${peso(requiredPerformanceSecurity(spec.awardAmount, "goods", "managersCheck"))}`],
      ],
    },
  });

  const dvPdf = await attachPdf(transaction, {
    entityRef: "payment",
    entityId: payment.id,
    filename: `${spec.disbursementNo}-Disbursement-Voucher.pdf`,
    label: "Certified Disbursement Voucher and Payment Advice",
    uploadedById: treasurer.id,
    uploadedAt: d.paid,
    pdfSpec: {
      office: "Municipal Accounting and Treasury Offices",
      title: "Disbursement Voucher and Settlement Advice",
      reference: `${spec.disbursementNo} / ${spec.paymentReference}`,
      issuedDate: dateOnly(d.paid),
      projectTitle: spec.projectTitle,
      intro: `Final payment settlement against ${spec.invoiceNo} (${spec.supplierInvoiceRef}) and ${spec.iarRef}.`,
      rows: [
        ["Payee", winner.businessName],
        ["Gross Claim", peso(deductions.grossAmount)],
        ...deductions.breakdown.lines.map(({ label, amount }) => [label, peso(amount)]),
        ["Net Amount Released", peso(deductions.netAmount)],
        ["Financial Closeout", `${spec.closeoutRef} — Recognized savings: ${peso(savings)}`],
      ],
    },
  });

  await closeout.update({ supportingDocumentIds: [itbPdf.id, abstractPdf.id, dvPdf.id] }, { transaction });
  return { appEntry, pr, rfq, award, contract, delivery, invoice, payment };
}

async function seedOngoingBiddingProject(ctx, planning, auditQueue, transaction) {
  const spec = PUBLIC_PROJECTS.ongoingBidding;
  const d = spec.dates;
  const { departmentsByCode, modesByKey, usersByRole, bacMembers, vendorsByKey } = ctx;
  const dept = departmentsByCode[spec.department];
  const mode = modesByKey.competitiveBidding;
  const appropriation = planning.appropriationsByKey[spec.appropriationKey];
  const aip = planning.aipByKey[spec.aipKey];

  const mayor = usersByRole.get("hope");
  const budgetOfficer = usersByRole.get("budgetOfficer");
  const treasurer = usersByRole.get("municipalTreasurer");
  const secretariat = usersByRole.get("bacSecretariat");
  const bacChair = usersByRole.get("bacChairperson");
  const twg = usersByRole.get("twgMember");
  const requester = usersByRole.get("departmentRequester");
  const head = usersByRole.get("headOfOffice");

  // One secondary BAC member submits an initial evaluation so bac.chair / bac.vice / bac.member
  // can either submit their own evaluation OR immediately finalize evaluation with 3/5 quorum.
  const secondaryEvaluator = bacMembers.find((m) => m.user.email === "bac.member2@roxas-lgu.ph") ?? bacMembers[2];

  const queue = (actor, payload) =>
    auditQueue.push({
      ...payload,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.Role?.key ?? payload.actorRole,
      ipAddress: "127.0.0.1",
    });

  const appEntry = await AppEntry.create(
    {
      projectTitle: spec.projectTitle,
      description: spec.description,
      papCode: spec.papCode,
      uacsCode: spec.uacsCode,
      accountCode: spec.accountCode,
      category: spec.category,
      categoryDetails: spec.categoryDetails,
      procurementMode: mode.key,
      abc: spec.abc,
      unit: "lot",
      quantity: 1,
      fundSource: spec.fundSource,
      targetStartQuarter: "Q3",
      targetCompletionQuarter: "Q4",
      justificationStatus: "notApplicable",
      fiscalYear: FISCAL_YEAR,
      status: "locked",
      planStage: "finalApp",
      planCycle: "final",
      earlyProcurement: false,
      bidEvaluationCriteria: "Pass/fail technical compliance followed by Lowest Calculated Responsive Bid.",
      procurementStrategy: "Single lot IT hardware supply with 3-year on-site warranty.",
      modeRecommendedAt: d.appApproved,
      modeRecommendationBasis: "Open competitive bidding among accredited ICT suppliers.",
      lockedAt: d.appApproved,
      postedAt: d.appPosted,
      gppbSubmittedAt: d.appPosted,
      implementingUnitId: dept.id,
      appropriationId: appropriation.id,
      aipEntryId: aip.id,
      preparedById: secretariat.id,
      approvedById: mayor.id,
    },
    { transaction }
  );

  const allocReq = await BudgetControlRequest.create(
    {
      kind: "allocation",
      status: "approved",
      sourceProjectId: appEntry.id,
      sourceAppropriationId: appropriation.id,
      fiscalYear: FISCAL_YEAR,
      amount: spec.abc,
      fund: appropriation.fund,
      expenseClass: appropriation.expenseClass,
      reason: "Reserve enacted FY 2026 IT Capital Outlay for municipal workstations and network switches.",
      authorityReference: appropriation.ordinanceNo,
      requesterId: budgetOfficer.id,
      approverId: mayor.id,
      requestedAt: d.appPosted,
      approvedAt: d.allocated,
    },
    { transaction }
  );

  await ProjectAllocation.create(
    {
      appEntryId: appEntry.id,
      appropriationId: appropriation.id,
      fiscalYear: FISCAL_YEAR,
      amount: spec.abc,
      status: "active",
      approvedById: mayor.id,
      approvedAt: d.allocated,
      sourceRequestId: allocReq.id,
    },
    { transaction }
  );

  queue(mayor, {
    actionType: "app.transition",
    entityRef: "appEntry",
    entityId: appEntry.id,
    actorRole: "hope",
    summary: `Approved Final APP entry ${spec.papCode}`,
    beforeState: { status: "pendingApproval" },
    afterState: { status: "locked" },
    recordedAt: d.appApproved,
  });

  const pr = await PrHeader.create(
    {
      prNumber: spec.prNumber,
      purpose: "Upgrade municipal hall office desktop workstations, managed network switches, and power backup systems.",
      dateRequired: "2026-12-20",
      isEmergency: false,
      justificationStatus: "notApplicable",
      totalAmount: spec.abc,
      status: "approved",
      submittedAt: d.prSubmitted,
      cashCertifiedAt: d.cashCertified,
      cashCertifiedById: treasurer.id,
      mayorApprovedAt: d.mayorApproved,
      mayorApprovedById: mayor.id,
      appropriationCertifiedAt: d.appropriated,
      appropriationCertifiedById: budgetOfficer.id,
      fundsReservedAt: d.obligated,
      obligatedById: budgetOfficer.id,
      fundSource: appropriation.fund,
      modeDeterminedAt: d.modeDetermined,
      modeDeterminedById: bacChair.id,
      modeJustificationStatus: "notApplicable",
      suggestedModeKey: mode.key,
      appEntryId: appEntry.id,
      departmentId: dept.id,
      requesterId: requester.id,
      procurementModeId: mode.id,
    },
    { transaction }
  );

  await PrLineItem.bulkCreate(
    spec.items.map((item) => ({
      ...item,
      lineTotal: item.quantity * item.unitCost,
      hasUsefulLifeOverOneYear: true,
      assetClass: item.unitCost >= 50000 ? "capitalOutlay" : "semiExpendable",
      prHeaderId: pr.id,
    })),
    { transaction }
  );

  await Obligation.create(
    {
      obligationNo: spec.obligationNo,
      amount: spec.abc,
      status: "obligated",
      certifiedAt: d.obligated,
      certifiedById: budgetOfficer.id,
      particulars: `Obligation reserved for ${spec.prNumber} under FY 2026 IT Capital Outlay.`,
      appropriationId: appropriation.id,
      prHeaderId: pr.id,
    },
    { transaction }
  );

  queue(head, {
    actionType: "pr.transition",
    entityRef: "pr",
    entityId: pr.id,
    actorRole: "headOfOffice",
    summary: `Endorsed ${spec.prNumber}`,
    beforeState: { status: "pendingDepartmentHeadEndorsement" },
    afterState: { status: "pendingCashCertification" },
    recordedAt: d.prEndorsed,
  });
  queue(treasurer, {
    actionType: "pr.transition",
    entityRef: "pr",
    entityId: pr.id,
    actorRole: "municipalTreasurer",
    summary: `Certified cash availability for ${spec.prNumber}`,
    beforeState: { status: "pendingCashCertification" },
    afterState: { status: "pendingMayorApproval" },
    recordedAt: d.cashCertified,
  });
  queue(mayor, {
    actionType: "pr.transition",
    entityRef: "pr",
    entityId: pr.id,
    actorRole: "hope",
    summary: `Approved ${spec.prNumber}`,
    beforeState: { status: "pendingMayorApproval" },
    afterState: { status: "pendingAppropriationCertification" },
    recordedAt: d.mayorApproved,
  });
  queue(budgetOfficer, {
    actionType: "pr.transition",
    entityRef: "pr",
    entityId: pr.id,
    actorRole: "budgetOfficer",
    summary: `Obligated funds under ${spec.obligationNo}`,
    beforeState: { status: "pendingAppropriationCertification" },
    afterState: { status: "pendingModeDetermination" },
    recordedAt: d.obligated,
  });
  queue(bacChair, {
    actionType: "pr.mode.determined",
    entityRef: "pr",
    entityId: pr.id,
    actorRole: "bacChairperson",
    summary: `Confirmed Competitive Bidding for ${spec.prNumber}`,
    beforeState: { status: "pendingModeDetermination" },
    afterState: { status: "approved", procurementMode: mode.key },
    recordedAt: d.modeDetermined,
  });

  const rfqFields = {
    referenceNo: spec.rfqRef,
    title: spec.projectTitle,
    openingVenue: spec.venue,
    category: spec.rfqCategory,
    abc: spec.abc,
    prHeaderId: pr.id,
    appEntryId: appEntry.id,
    procurementModeId: mode.id,
    publishedById: secretariat.id,
    status: "opened",
    procurementContactPerson: `${secretariat.name}, BAC Secretariat`,
    procurementContactEmail: secretariat.email,
    requiredSupplierDocuments:
      "PhilGEPS Platinum Certificate, Business Permit, Tax Clearance, NFCC Computation, Omnibus Sworn Statement, Technical Specifications Schedule, and Bid Security.",
    publishDate: d.published,
    procurementStartAt: d.scheduleApproved,
    publicationStartAt: d.published,
    publicationEndAt: d.closing,
    closingDate: d.closing,
    openingDate: d.opening,
    prebidRequired: true,
    prebidAt: d.prebid,
    prebidVenue: spec.venue,
    prebidRemarks: "Confirmed operating system licensing, rack-mount accessories, and warranty response timelines.",
    evaluationStartAt: d.evalStart,
    evaluationEndAt: d.evalEnd,
    postQualificationStartAt: d.postQualStart,
    postQualificationEndAt: d.postQualEnd,
    expectedAwardAt: d.expectedAward,
    scheduleApprovedAt: d.scheduleApproved,
    schedulePublishedAt: d.published,
    twgRequired: true,
    postingRequired: true,
    philgepsPostedAt: d.published,
    philgepsReference: spec.philgepsRef,
  };
  assert.equal(scheduleValidationError(rfqFields), null, "Ongoing bidding RFQ schedule invalid");
  const rfq = await Rfq.create(rfqFields, { transaction });

  const notice = await Announcement.create(
    {
      ...announcementSchedule(rfq),
      title: `Invitation to Bid — ${spec.projectTitle}`,
      body: `The Municipality of Roxas, Oriental Mindoro invites sealed bids for ${spec.projectTitle} (ABC: ${peso(spec.abc)}).`,
      category: "procurementOpportunity",
      status: "archived",
      publishedAt: d.published,
      expiresAt: d.closing,
      archivedAt: d.opening,
      registrationDeadline: d.closing,
      venue: spec.venue,
      contactPerson: secretariat.name,
      contactEmail: secretariat.email,
      fundSource: spec.fundSource,
      procurementMethod: mode.name,
      procurementMethodCitation: mode.citation,
      rfqId: rfq.id,
      appEntryId: appEntry.id,
      createdById: secretariat.id,
      publishedById: secretariat.id,
    },
    { transaction }
  );

  await ProcurementAttempt.create(
    {
      rfqId: rfq.id,
      projectKey: projectKeyFor(rfq),
      attemptNumber: 1,
      status: "ongoing",
      responsibleUserId: bacChair.id,
      startedAt: d.scheduleApproved,
      outcomeSnapshot: { referenceNo: rfq.referenceNo, title: rfq.title },
      supportingDocuments: [],
    },
    { transaction }
  );

  await seedObservers(ctx, rfq, d.opening, { attendedAndReported: false }, transaction);

  queue(secretariat, {
    actionType: "rfq.published",
    entityRef: "rfq",
    entityId: rfq.id,
    actorRole: "bacSecretariat",
    summary: `Published Invitation to Bid ${spec.rfqRef} (${spec.philgepsRef})`,
    beforeState: { status: "draft" },
    afterState: { status: "published" },
    recordedAt: d.published,
  });
  queue(secretariat, {
    actionType: "observers.invited",
    entityRef: "rfq",
    entityId: rfq.id,
    actorRole: "bacSecretariat",
    summary: `Invited accredited observers for ${spec.rfqRef}`,
    afterState: { count: 3 },
    recordedAt: new Date(d.opening.getTime() - (OBSERVER_NOTICE_DAYS + 3) * DAY_MS),
  });

  await TwgDeclaration.create(
    { rfqId: rfq.id, memberId: twg.id, noConflictDeclared: true, declaredAt: d.opening },
    { transaction }
  );
  await EvaluatorDeclaration.create(
    { rfqId: rfq.id, userId: secondaryEvaluator.user.id, role: secondaryEvaluator.roleKey, noConflictDeclared: true, declaredAt: d.opening },
    { transaction }
  );

  const compliance = Object.fromEntries(complianceRequirementsFor("goods", mode.key).map(({ key }) => [key, true]));
  const bids = [];
  for (const [idx, offer] of spec.bidders.entries()) {
    const vendor = vendorsByKey[offer.vendorKey];
    const bid = await Bid.create(
      {
        rfqId: rfq.id,
        vendorId: vendor.id,
        submittedAt: offer.submittedAt,
        blindLabel: offer.blindLabel,
        technicalSubmitted: true,
        financialSealed: true,
        totalBidPrice: offer.amount,
        status: "opened",
      },
      { transaction }
    );
    bids.push(bid);

    await Security.create(
      {
        type: "bid",
        form: "securingDeclaration",
        amount: 0,
        percentage: 0,
        referenceNo: `BSD-2026-002-${idx + 1}`,
        postedAt: offer.submittedAt,
        validUntil: "2027-03-10",
        status: "posted",
        entityRef: "bid",
        entityId: bid.id,
        vendorId: vendor.id,
      },
      { transaction }
    );

    await TwgAssessment.create(
      {
        bidId: bid.id,
        memberId: twg.id,
        status: "submitted",
        excludedForConflict: false,
        noConflictDeclared: true,
        declaredAt: d.opening,
        submittedAt: d.twgSubmitted,
        recommendation: "compliant",
        remarks: "Hardware specifications, OS licensing proof, and network switch PoE+ ratings conform to requirements.",
        requirements: [
          { requirement: "Workstation processor, memory, NVMe storage, and licensed OS", complianceStatus: "compliant", findings: "Confirmed against manufacturer spec sheets." },
          { requirement: "Managed PoE+ switch uplinks and UPS backup rating", complianceStatus: "compliant", findings: "All port and wattage minimums satisfied." },
        ],
      },
      { transaction }
    );

    await Evaluation.create(
      {
        bidId: bid.id,
        evaluatorId: secondaryEvaluator.user.id,
        criteriaBreakdown: { verdict: "passed", requirementsExamined: compliance },
        score: 100,
        blindFlag: true,
        status: "submitted",
        noConflictDeclared: true,
        declaredAt: d.opening,
        submittedAt: d.bacEvalSubmitted,
        failureReason: "none",
        recommendation: "Technically responsive; ready for BAC committee finalization.",
        remarks: "Reviewed TWG report and confirmed eligibility documents and bid security.",
      },
      { transaction }
    );
  }

  await BidOpeningRecord.create(
    {
      rfqId: rfq.id,
      openedAt: d.opening,
      openedById: bacChair.id,
      bidsReceived: bids.length,
      witnesses: "BAC Chairperson, BAC Members, TWG, and BAC Secretariat",
      remarks: "Three timely sealed bids received. Technical envelopes opened; financial envelopes remain sealed pending BAC evaluation finalization.",
    },
    { transaction }
  );

  queue(bacChair, {
    actionType: "bids.opened",
    entityRef: "rfq",
    entityId: rfq.id,
    actorRole: "bacChairperson",
    summary: `Opened ${bids.length} bids for ${spec.rfqRef}`,
    beforeState: { status: "closed" },
    afterState: { status: "opened", bidsReceived: bids.length },
    recordedAt: d.opening,
  });
  queue(secondaryEvaluator.user, {
    actionType: "evaluation.submitted",
    entityRef: "bid",
    entityId: bids[0].id,
    actorRole: secondaryEvaluator.roleKey,
    summary: "Submitted blind technical compliance review",
    afterState: { status: "submitted" },
    recordedAt: d.bacEvalSubmitted,
  });

  await attachPdf(transaction, {
    entityRef: "rfq",
    entityId: rfq.id,
    filename: `${spec.rfqRef}-Invitation-to-Bid.pdf`,
    label: "Invitation to Bid and Technical Specifications",
    uploadedById: secretariat.id,
    uploadedAt: d.published,
    pdfSpec: {
      office: "Bids and Awards Committee Secretariat",
      title: "Invitation to Bid and Technical Specifications",
      reference: `${spec.rfqRef} / ${spec.philgepsRef}`,
      issuedDate: dateOnly(d.published),
      projectTitle: spec.projectTitle,
      intro: "Sealed bids are invited for the supply and delivery of municipal workstations, managed network switches, and UPS units.",
      rows: [
        ["Approved Budget (ABC)", peso(spec.abc)],
        ["Funding Source", `${spec.fundSource} (${appropriation.ordinanceNo})`],
        ["Pre-Bid Conference", `${dateOnly(d.prebid)} | ${spec.venue}`],
        ["Bid Opening", `${dateOnly(d.opening)} | ${spec.venue}`],
        ...spec.items.map((item) => [`${item.quantity} ${item.unit} - ${item.description}`, item.technicalSpecifications]),
      ],
    },
  });

  await attachPdf(transaction, {
    entityRef: "announcement",
    entityId: notice.id,
    filename: `${spec.rfqRef}-Prebid-Minutes.pdf`,
    label: "Minutes of the Pre-Bid Conference",
    uploadedById: secretariat.id,
    uploadedAt: d.prebid,
    pdfSpec: {
      office: "Bids and Awards Committee Secretariat",
      title: "Minutes of the Pre-Bid Conference",
      reference: `${spec.rfqRef}-PREBID`,
      issuedDate: dateOnly(d.prebid),
      projectTitle: spec.projectTitle,
      intro: "Clarifications on workstation warranty terms, switch rack-mount kits, and delivery acceptance criteria.",
      rows: [
        ["Venue", spec.venue],
        ["Warranty", "Three-year on-site hardware warranty covering parts and labor."],
        ["Bid Deadline", dateOnly(d.closing)],
      ],
    },
  });

  return { appEntry, pr, rfq, bids };
}

async function seedOngoingContractProject(ctx, planning, auditQueue, transaction) {
  const spec = PUBLIC_PROJECTS.ongoingContract;
  const d = spec.dates;
  const { departmentsByCode, modesByKey, usersByRole, bacMembers, vendorsByKey } = ctx;
  const dept = departmentsByCode[spec.department];
  const mode = modesByKey.competitiveBidding;
  const appropriation = planning.appropriationsByKey[spec.appropriationKey];
  const aip = planning.aipByKey[spec.aipKey];

  const mayor = usersByRole.get("hope");
  const budgetOfficer = usersByRole.get("budgetOfficer");
  const treasurer = usersByRole.get("municipalTreasurer");
  const secretariat = usersByRole.get("bacSecretariat");
  const bacChair = usersByRole.get("bacChairperson");
  const twg = usersByRole.get("twgMember");
  const requester = usersByRole.get("departmentRequester");
  const head = usersByRole.get("headOfOffice");

  const queue = (actor, payload) =>
    auditQueue.push({
      ...payload,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.Role?.key ?? payload.actorRole,
      ipAddress: "127.0.0.1",
    });

  const appEntry = await AppEntry.create(
    {
      projectTitle: spec.projectTitle,
      description: spec.description,
      papCode: spec.papCode,
      uacsCode: spec.uacsCode,
      accountCode: spec.accountCode,
      category: spec.category,
      categoryDetails: spec.categoryDetails,
      procurementMode: mode.key,
      abc: spec.abc,
      unit: "lot",
      quantity: 1,
      fundSource: spec.fundSource,
      targetStartQuarter: "Q3",
      targetCompletionQuarter: "Q4",
      justificationStatus: "notApplicable",
      fiscalYear: FISCAL_YEAR,
      status: "locked",
      planStage: "finalApp",
      planCycle: "final",
      earlyProcurement: false,
      bidEvaluationCriteria: "Pass/fail technical compliance followed by Lowest Calculated Responsive Bid.",
      procurementStrategy: "Phased delivery of solar streetlight assemblies and galvanized steel poles for Barangay Poblacion.",
      modeRecommendedAt: d.appApproved,
      modeRecommendationBasis: "Competitive supply bidding for municipal solar streetlighting hardware.",
      lockedAt: d.appApproved,
      postedAt: d.appPosted,
      gppbSubmittedAt: d.appPosted,
      implementingUnitId: dept.id,
      appropriationId: appropriation.id,
      aipEntryId: aip.id,
      preparedById: secretariat.id,
      approvedById: mayor.id,
    },
    { transaction }
  );

  const allocReq = await BudgetControlRequest.create(
    {
      kind: "allocation",
      status: "approved",
      sourceProjectId: appEntry.id,
      sourceAppropriationId: appropriation.id,
      fiscalYear: FISCAL_YEAR,
      amount: spec.abc,
      fund: appropriation.fund,
      expenseClass: appropriation.expenseClass,
      reason: "Allocate enacted FY 2026 streetlighting outlay to Barangay Poblacion solar lighting project.",
      authorityReference: appropriation.ordinanceNo,
      requesterId: budgetOfficer.id,
      approverId: mayor.id,
      requestedAt: d.appPosted,
      approvedAt: d.allocated,
    },
    { transaction }
  );

  await ProjectAllocation.create(
    {
      appEntryId: appEntry.id,
      appropriationId: appropriation.id,
      fiscalYear: FISCAL_YEAR,
      amount: spec.abc,
      status: "active",
      approvedById: mayor.id,
      approvedAt: d.allocated,
      sourceRequestId: allocReq.id,
    },
    { transaction }
  );

  queue(mayor, {
    actionType: "app.transition",
    entityRef: "appEntry",
    entityId: appEntry.id,
    actorRole: "hope",
    summary: `Approved Final APP entry ${spec.papCode}`,
    beforeState: { status: "pendingApproval" },
    afterState: { status: "locked" },
    recordedAt: d.appApproved,
  });

  const pr = await PrHeader.create(
    {
      prNumber: spec.prNumber,
      purpose: "Phase 1 supply and delivery of 30 solar LED streetlight assemblies for Barangay Poblacion main roads.",
      dateRequired: "2026-12-18",
      isEmergency: false,
      justificationStatus: "notApplicable",
      totalAmount: spec.prAmount,
      status: "approved",
      submittedAt: d.prSubmitted,
      cashCertifiedAt: d.cashCertified,
      cashCertifiedById: treasurer.id,
      mayorApprovedAt: d.mayorApproved,
      mayorApprovedById: mayor.id,
      appropriationCertifiedAt: d.appropriated,
      appropriationCertifiedById: budgetOfficer.id,
      fundsReservedAt: d.obligated,
      obligatedById: budgetOfficer.id,
      fundSource: appropriation.fund,
      modeDeterminedAt: d.modeDetermined,
      modeDeterminedById: bacChair.id,
      modeJustificationStatus: "notApplicable",
      suggestedModeKey: mode.key,
      appEntryId: appEntry.id,
      departmentId: dept.id,
      requesterId: requester.id,
      procurementModeId: mode.id,
    },
    { transaction }
  );

  await PrLineItem.bulkCreate(
    spec.items.map(({ offeredUnitCost, ...item }) => ({
      ...item,
      lineTotal: item.quantity * item.unitCost,
      hasUsefulLifeOverOneYear: true,
      assetClass: "capitalOutlay",
      prHeaderId: pr.id,
    })),
    { transaction }
  );

  await Obligation.create(
    {
      obligationNo: spec.obligationNo,
      amount: spec.awardAmount,
      status: "obligated",
      certifiedAt: d.obligated,
      certifiedById: budgetOfficer.id,
      particulars: `Obligation for ${spec.prNumber}, conformed to ${spec.poRef}.`,
      appropriationId: appropriation.id,
      prHeaderId: pr.id,
    },
    { transaction }
  );

  queue(head, {
    actionType: "pr.transition",
    entityRef: "pr",
    entityId: pr.id,
    actorRole: "headOfOffice",
    summary: `Endorsed ${spec.prNumber}`,
    beforeState: { status: "pendingDepartmentHeadEndorsement" },
    afterState: { status: "pendingCashCertification" },
    recordedAt: d.prEndorsed,
  });
  queue(treasurer, {
    actionType: "pr.transition",
    entityRef: "pr",
    entityId: pr.id,
    actorRole: "municipalTreasurer",
    summary: `Certified cash availability for ${spec.prNumber}`,
    beforeState: { status: "pendingCashCertification" },
    afterState: { status: "pendingMayorApproval" },
    recordedAt: d.cashCertified,
  });
  queue(mayor, {
    actionType: "pr.transition",
    entityRef: "pr",
    entityId: pr.id,
    actorRole: "hope",
    summary: `Approved ${spec.prNumber}`,
    beforeState: { status: "pendingMayorApproval" },
    afterState: { status: "pendingAppropriationCertification" },
    recordedAt: d.mayorApproved,
  });
  queue(budgetOfficer, {
    actionType: "pr.transition",
    entityRef: "pr",
    entityId: pr.id,
    actorRole: "budgetOfficer",
    summary: `Obligated funds under ${spec.obligationNo}`,
    beforeState: { status: "pendingAppropriationCertification" },
    afterState: { status: "pendingModeDetermination" },
    recordedAt: d.obligated,
  });
  queue(bacChair, {
    actionType: "pr.mode.determined",
    entityRef: "pr",
    entityId: pr.id,
    actorRole: "bacChairperson",
    summary: `Confirmed Competitive Bidding for ${spec.prNumber}`,
    beforeState: { status: "pendingModeDetermination" },
    afterState: { status: "approved", procurementMode: mode.key },
    recordedAt: d.modeDetermined,
  });

  const rfqFields = {
    referenceNo: spec.rfqRef,
    title: spec.projectTitle,
    openingVenue: spec.venue,
    category: spec.rfqCategory,
    abc: spec.prAmount,
    prHeaderId: pr.id,
    appEntryId: appEntry.id,
    procurementModeId: mode.id,
    publishedById: secretariat.id,
    status: "awarded",
    procurementContactPerson: `${secretariat.name}, BAC Secretariat`,
    procurementContactEmail: secretariat.email,
    requiredSupplierDocuments:
      "PhilGEPS Platinum Certificate, Business Permit, Tax Clearance, Technical Specifications Schedule, Warranty Certificate, and Bid Security.",
    publishDate: d.published,
    procurementStartAt: d.scheduleApproved,
    publicationStartAt: d.published,
    publicationEndAt: d.closing,
    closingDate: d.closing,
    openingDate: d.opening,
    prebidRequired: true,
    prebidAt: d.prebid,
    prebidVenue: spec.venue,
    prebidRemarks: "Clarified pole galvanizing thickness, anchor bolt spacing, and photometric requirements.",
    evaluationStartAt: d.evalStart,
    evaluationEndAt: d.evalEnd,
    postQualificationStartAt: d.postQualStart,
    postQualificationEndAt: d.postQualEnd,
    expectedAwardAt: d.awardApproved,
    scheduleApprovedAt: d.scheduleApproved,
    schedulePublishedAt: d.published,
    twgRequired: true,
    postingRequired: true,
    philgepsPostedAt: d.published,
    philgepsReference: spec.philgepsRef,
  };
  assert.equal(scheduleValidationError(rfqFields), null, "Ongoing contract RFQ schedule invalid");
  const rfq = await Rfq.create(rfqFields, { transaction });

  await Announcement.create(
    {
      ...announcementSchedule(rfq),
      title: `Invitation to Bid — ${spec.projectTitle}`,
      body: `The Municipality of Roxas, Oriental Mindoro invites sealed bids for ${spec.projectTitle} (ABC: ${peso(spec.prAmount)}).`,
      category: "procurementOpportunity",
      status: "archived",
      publishedAt: d.published,
      expiresAt: d.closing,
      archivedAt: d.evalEnd,
      registrationDeadline: d.closing,
      venue: spec.venue,
      contactPerson: secretariat.name,
      contactEmail: secretariat.email,
      fundSource: spec.fundSource,
      procurementMethod: mode.name,
      procurementMethodCitation: mode.citation,
      rfqId: rfq.id,
      appEntryId: appEntry.id,
      createdById: secretariat.id,
      publishedById: secretariat.id,
    },
    { transaction }
  );

  await seedObservers(ctx, rfq, d.opening, { attendedAndReported: true }, transaction);

  queue(secretariat, {
    actionType: "rfq.published",
    entityRef: "rfq",
    entityId: rfq.id,
    actorRole: "bacSecretariat",
    summary: `Published Invitation to Bid ${spec.rfqRef} (${spec.philgepsRef})`,
    beforeState: { status: "draft" },
    afterState: { status: "published" },
    recordedAt: d.published,
  });

  await TwgDeclaration.create(
    { rfqId: rfq.id, memberId: twg.id, noConflictDeclared: true, declaredAt: d.opening },
    { transaction }
  );
  const evaluators = bacMembers.slice(0, 3);
  for (const member of evaluators) {
    await EvaluatorDeclaration.create(
      { rfqId: rfq.id, userId: member.user.id, role: member.roleKey, noConflictDeclared: true, declaredAt: d.opening },
      { transaction }
    );
  }

  const compliance = Object.fromEntries(complianceRequirementsFor("goods", mode.key).map(({ key }) => [key, true]));
  const bids = [];
  for (const [idx, offer] of spec.bidders.entries()) {
    const vendor = vendorsByKey[offer.vendorKey];
    const bid = await Bid.create(
      {
        rfqId: rfq.id,
        vendorId: vendor.id,
        submittedAt: offer.submittedAt,
        blindLabel: offer.blindLabel,
        technicalSubmitted: true,
        financialSealed: false,
        totalBidPrice: offer.amount,
        status: idx === 0 ? "awarded" : "lost",
      },
      { transaction }
    );
    bids.push(bid);

    await Security.create(
      {
        type: "bid",
        form: "securingDeclaration",
        amount: 0,
        percentage: 0,
        referenceNo: `BSD-2026-003-${idx + 1}`,
        postedAt: offer.submittedAt,
        validUntil: "2027-01-22",
        status: "released",
        releasedAt: d.signedVendor,
        entityRef: "bid",
        entityId: bid.id,
        vendorId: vendor.id,
      },
      { transaction }
    );

    await TwgAssessment.create(
      {
        bidId: bid.id,
        memberId: twg.id,
        status: "submitted",
        excludedForConflict: false,
        noConflictDeclared: true,
        declaredAt: d.opening,
        submittedAt: d.evalStart,
        recommendation: "compliant",
        remarks: "Luminaire photometric rating, IP66 sealing, LiFePO4 battery capacity, and pole structural drawings passed.",
        requirements: [
          { requirement: "IP66 LED luminaire output and LiFePO4 battery autonomy", complianceStatus: "compliant", findings: "Verified from photometric compliance certificate." },
          { requirement: "Hot-dip galvanized tapered steel pole dimensions", complianceStatus: "compliant", findings: "Wall thickness and anchor bolt specs confirmed." },
        ],
      },
      { transaction }
    );

    for (const member of evaluators) {
      await Evaluation.create(
        {
          bidId: bid.id,
          evaluatorId: member.user.id,
          criteriaBreakdown: { verdict: "passed", requirementsExamined: compliance },
          score: 100,
          blindFlag: true,
          status: "submitted",
          noConflictDeclared: true,
          declaredAt: d.opening,
          submittedAt: d.evalEnd,
          failureReason: "none",
          recommendation: "Compliant technical offer; proceed to financial ranking.",
          remarks: "All mandatory eligibility and technical requirements met.",
        },
        { transaction }
      );
    }
  }

  await BidOpeningRecord.create(
    {
      rfqId: rfq.id,
      openedAt: d.opening,
      openedById: bacChair.id,
      bidsReceived: bids.length,
      witnesses: "BAC Chairperson, BAC Members, BAC Secretariat, and accredited observers",
      remarks: "Three sealed proposals received on time and opened publicly.",
    },
    { transaction }
  );

  await PostQualification.create(
    {
      bidId: bids[0].id,
      verifiedById: bacChair.id,
      result: "passed",
      verifiedAt: d.postQualEnd,
      checklist: { philgeps: "verified", businessPermit: "verified", taxClearance: "verified", technicalCapacity: "verified" },
      remarks: "Original eligibility documents, warehouse inventory, and product warranties verified.",
    },
    { transaction }
  );

  const winner = vendorsByKey[spec.bidders[0].vendorKey];
  const award = await Award.create(
    {
      rfqId: rfq.id,
      bidId: bids[0].id,
      vendorId: winner.id,
      recommendedById: bacChair.id,
      approvedById: mayor.id,
      status: "accepted",
      awardBasis: "LCRB",
      noaNumber: spec.noaNumber,
      noaDate: dateOnly(d.awardApproved),
      supplierReceivedAt: d.supplierReceivedNoa,
      amount: spec.awardAmount,
      remarks: "Lowest Calculated Responsive Bid; supplier acknowledged Notice of Award.",
    },
    { transaction }
  );

  const resolution = await BacResolution.create(
    {
      resolutionNo: spec.bacResolutionNo,
      type: "recommendAward",
      title: `BAC Resolution Recommending Award for ${spec.rfqRef}`,
      recitals: `${winner.businessName} submitted the Lowest Calculated Responsive Bid of ${peso(spec.awardAmount)} and passed post-qualification.`,
      resolvedAt: d.resolution,
      members: bacMembers.map(({ user, roleKey }) => ({
        userId: user.id,
        role: roleKey,
        name: user.name,
        present: true,
        concurred: true,
      })),
      quorumMet: true,
      entityRef: "award",
      entityId: award.id,
    },
    { transaction }
  );

  await ProcurementAttempt.create(
    {
      rfqId: rfq.id,
      projectKey: projectKeyFor(rfq),
      attemptNumber: 1,
      status: "awarded",
      bacResolutionId: resolution.id,
      responsibleUserId: bacChair.id,
      startedAt: d.scheduleApproved,
      completedAt: d.awardApproved,
      outcomeSnapshot: { awardId: award.id, winningBidId: bids[0].id, amount: spec.awardAmount, basis: "LCRB" },
      supportingDocuments: [],
    },
    { transaction }
  );

  const contract = await Contract.create(
    {
      awardId: award.id,
      vendorId: winner.id,
      draftedById: secretariat.id,
      contractNo: spec.contractNo,
      poRef: spec.poRef,
      amount: spec.awardAmount,
      amountPaid: 0,
      instrumentType: "purchaseOrder",
      category: "goods",
      startDate: dateOnly(d.ntpIssued),
      deliveryDeadline: spec.deliveryDeadline,
      noticeToProceedAt: d.ntpIssued,
      contractDays: spec.contractDays,
      signedByLguAt: d.signedLgu,
      signedByVendorAt: d.signedVendor,
      status: "active",
      terms:
        "Supply and deliver 20 single-arm and 10 dual-arm solar LED streetlight assemblies with hot-dip galvanized poles to the Municipal Engineering Office yard within 45 calendar days from Notice to Proceed. Partial progress billing allowed upon acceptance of each tranche.",
    },
    { transaction }
  );

  await Security.create(
    {
      type: "performance",
      form: "managersCheck",
      amount: requiredPerformanceSecurity(spec.awardAmount, "goods", "managersCheck"),
      percentage: 5,
      referenceNo: "PS-2026-0002",
      postedAt: d.perfSecurityPosted,
      validUntil: "2027-12-31",
      status: "posted",
      entityRef: "contract",
      entityId: contract.id,
      vendorId: winner.id,
    },
    { transaction }
  );

  // Delivery 1: Accepted, with a submitted invoice ready for Accounting certification & Treasury payment release!
  const deliveryOne = await Delivery.create(
    {
      contractId: contract.id,
      deliveredAt: d.deliveryOneArrived,
      inspectedAt: d.deliveryOneInspected,
      inspectedById: head.id,
      status: "accepted",
      description: "Tranche 1 Delivery — 10 single-arm and 5 dual-arm solar LED streetlight assemblies with galvanized poles.",
      acceptedQuantityNote: "15 complete assemblies inspected and accepted at the Municipal Engineering yard.",
      acceptedValue: spec.deliveryOneAmount,
      remarks: "IAR-2026-0002 — Pole wall thickness, battery ratings, and lighting output verified compliant.",
    },
    { transaction }
  );

  const invoiceOne = await Invoice.create(
    {
      contractId: contract.id,
      deliveryId: deliveryOne.id,
      vendorId: winner.id,
      invoiceNo: spec.invoiceNo,
      supplierInvoiceRef: spec.supplierInvoiceRef,
      amount: spec.deliveryOneAmount,
      submittedAt: d.invoiceOneSubmitted,
      status: "submitted",
      remarks: "Progress billing for Tranche 1 accepted delivery under PO-2026-0002.",
    },
    { transaction }
  );

  // Delivery 2: Reported by supplier, awaiting inspection & acceptance by Engineering / Secretariat!
  const deliveryTwo = await Delivery.create(
    {
      contractId: contract.id,
      deliveredAt: d.deliveryTwoArrived,
      status: "reported",
      description: "Tranche 2 Final Delivery — Remaining 10 single-arm and 5 dual-arm solar LED streetlight assemblies with poles and anchor bolts.",
      remarks: "Awaiting final inspection and acceptance by the Municipal Inspection Committee.",
    },
    { transaction }
  );

  queue(bacChair, {
    actionType: "bids.opened",
    entityRef: "rfq",
    entityId: rfq.id,
    actorRole: "bacChairperson",
    summary: `Opened ${bids.length} sealed bids for ${spec.rfqRef}`,
    beforeState: { status: "closed" },
    afterState: { status: "opened", bidsReceived: bids.length },
    recordedAt: d.opening,
  });
  queue(bacChair, {
    actionType: "evaluation.closed",
    entityRef: "rfq",
    entityId: rfq.id,
    actorRole: "bacChairperson",
    summary: `Concluded evaluation for ${spec.rfqRef}`,
    beforeState: { status: "opened" },
    afterState: { status: "evaluated" },
    recordedAt: d.evalEnd,
  });
  queue(bacChair, {
    actionType: "award.recommended",
    entityRef: "award",
    entityId: award.id,
    actorRole: "bacChairperson",
    summary: `Recommended award to ${winner.businessName} (${spec.bacResolutionNo})`,
    afterState: { status: "recommended", amount: spec.awardAmount },
    recordedAt: d.resolution,
  });
  queue(mayor, {
    actionType: "award.approved",
    entityRef: "award",
    entityId: award.id,
    actorRole: "hope",
    summary: `Approved Notice of Award ${spec.noaNumber}`,
    beforeState: { status: "recommended" },
    afterState: { status: "accepted", noaNumber: spec.noaNumber },
    recordedAt: d.awardApproved,
  });
  queue(mayor, {
    actionType: "contract.signed",
    entityRef: "contract",
    entityId: contract.id,
    actorRole: "hope",
    summary: `Executed ${spec.contractNo} / ${spec.poRef}`,
    beforeState: { status: "draft" },
    afterState: { status: "active" },
    recordedAt: d.signedVendor,
  });
  queue(secretariat, {
    actionType: "contract.ntp.issued",
    entityRef: "contract",
    entityId: contract.id,
    actorRole: "bacSecretariat",
    summary: `Issued Notice to Proceed ${spec.ntpRef}`,
    afterState: { status: "active", noticeToProceedAt: d.ntpIssued.toISOString() },
    recordedAt: d.ntpIssued,
  });
  queue(head, {
    actionType: "delivery.inspected",
    entityRef: "delivery",
    entityId: deliveryOne.id,
    actorRole: "headOfOffice",
    summary: "Accepted Tranche 1 delivery (15 solar streetlight assemblies)",
    beforeState: { status: "reported" },
    afterState: { status: "accepted" },
    recordedAt: d.deliveryOneInspected,
  });

  await attachPdf(transaction, {
    entityRef: "rfq",
    entityId: rfq.id,
    filename: `${spec.rfqRef}-Invitation-to-Bid.pdf`,
    label: "Invitation to Bid and Technical Specifications",
    uploadedById: secretariat.id,
    uploadedAt: d.published,
    pdfSpec: {
      office: "Bids and Awards Committee Secretariat",
      title: "Invitation to Bid and Technical Specifications",
      reference: `${spec.rfqRef} / ${spec.philgepsRef}`,
      issuedDate: dateOnly(d.published),
      projectTitle: spec.projectTitle,
      intro: "Sealed bids are invited for the supply and delivery of heavy-duty solar LED streetlight assemblies for Barangay Poblacion.",
      rows: [
        ["Approved Budget (ABC)", peso(spec.prAmount)],
        ["Funding Source", `${spec.fundSource} (${appropriation.ordinanceNo})`],
        ["Pre-Bid Conference", `${dateOnly(d.prebid)} | ${spec.venue}`],
        ["Bid Opening", `${dateOnly(d.opening)} | ${spec.venue}`],
        ...spec.items.map((item) => [`${item.quantity} ${item.unit} - ${item.description}`, item.technicalSpecifications]),
      ],
    },
  });

  await attachPdf(transaction, {
    entityRef: "contract",
    entityId: contract.id,
    filename: `${spec.poRef}-Purchase-Order.pdf`,
    label: "Signed Purchase Order and Delivery Schedule",
    uploadedById: secretariat.id,
    uploadedAt: d.ntpIssued,
    pdfSpec: {
      office: "Office of the Municipal Mayor",
      title: "Purchase Order and Notice to Proceed",
      reference: `${spec.contractNo} / ${spec.poRef} / ${spec.ntpRef}`,
      issuedDate: dateOnly(d.ntpIssued),
      projectTitle: spec.projectTitle,
      intro: `Contract awarded to ${winner.businessName} for phased delivery over ${spec.contractDays} calendar days.`,
      rows: [
        ["Supplier", winner.businessName],
        ["Contract Price", peso(spec.awardAmount)],
        ["Delivery Deadline", spec.deliveryDeadline],
        ["Tranche 1 Accepted", `${peso(spec.deliveryOneAmount)} (Invoice ${spec.invoiceNo} submitted)`],
        ["Tranche 2 Status", `${peso(spec.deliveryTwoAmount)} (Reported — pending final inspection)`],
      ],
    },
  });

  return { appEntry, pr, rfq, award, contract, deliveryOne, deliveryTwo, invoiceOne };
}

async function seedInternalDraftAndAdvisory(ctx, planning, transaction) {
  const { departmentsByCode, usersByRole } = ctx;
  const secretariat = usersByRole.get("bacSecretariat");

  const draftApp = await AppEntry.create(
    {
      projectTitle: INTERNAL_DRAFT_APP.projectTitle,
      description: INTERNAL_DRAFT_APP.description,
      papCode: INTERNAL_DRAFT_APP.papCode,
      uacsCode: INTERNAL_DRAFT_APP.uacsCode,
      accountCode: INTERNAL_DRAFT_APP.accountCode,
      category: INTERNAL_DRAFT_APP.category,
      categoryDetails: INTERNAL_DRAFT_APP.categoryDetails,
      procurementMode: INTERNAL_DRAFT_APP.procurementMode,
      abc: INTERNAL_DRAFT_APP.abc,
      unit: INTERNAL_DRAFT_APP.unit,
      quantity: INTERNAL_DRAFT_APP.quantity,
      fundSource: INTERNAL_DRAFT_APP.fundSource,
      targetStartQuarter: INTERNAL_DRAFT_APP.targetStartQuarter,
      targetCompletionQuarter: INTERNAL_DRAFT_APP.targetCompletionQuarter,
      justificationStatus: "notApplicable",
      fiscalYear: FISCAL_YEAR,
      status: "draft",
      planStage: "finalApp",
      planCycle: "final",
      earlyProcurement: false,
      implementingUnitId: departmentsByCode[INTERNAL_DRAFT_APP.department].id,
      appropriationId: planning.appropriationsByKey[INTERNAL_DRAFT_APP.appropriationKey].id,
      aipEntryId: planning.aipByKey[INTERNAL_DRAFT_APP.aipKey].id,
      preparedById: secretariat.id,
    },
    { transaction }
  );

  const advisory = await Announcement.create(
    {
      ...PUBLIC_GENERAL_ANNOUNCEMENT,
      status: "published",
      createdById: secretariat.id,
      publishedById: secretariat.id,
    },
    { transaction }
  );

  return { draftApp, advisory };
}

export async function seedSurveyDemo({ confirmDatabase, allowRemoteDb = false, quiet = false } = {}) {
  if (process.env.CLOUDFLARE_WORKER === "true") {
    throw new Error("Run seed:survey against a standalone MySQL database, not a Cloudflare Worker.");
  }
  const database = sequelize.config.database;
  const host = sequelize.config.host;
  if (!database) throw new Error("Set DB_NAME explicitly before running seed:survey.");
  if (PROTECTED_PRODUCTION_DATABASES.has(database.toLowerCase())) {
    throw new Error(
      `Refusing to seed "${database}". Point DB_NAME to a dedicated evaluation database (for example, municipal_survey_demo).`
    );
  }
  if (confirmDatabase !== database) {
    throw new Error(`Pass --confirm-database ${database} to confirm resetting "${database}".`);
  }
  if (!allowRemoteDb && !["127.0.0.1", "localhost"].includes(host)) {
    throw new Error(`Refusing remote host "${host}" without --allow-remote-db.`);
  }

  await sequelize.authenticate();

  const summary = await withAuditTransaction(async (transaction, audit) => {
    await clearAllTables(transaction);
    const ctx = await seedReferenceAndAccounts(transaction);
    const planning = await seedPlanningAndBudget(ctx, transaction);

    const auditQueue = [];
    const completed = await seedCompletedProject(ctx, planning, auditQueue, transaction);
    const ongoingBidding = await seedOngoingBiddingProject(ctx, planning, auditQueue, transaction);
    const ongoingContract = await seedOngoingContractProject(ctx, planning, auditQueue, transaction);
    const extras = await seedInternalDraftAndAdvisory(ctx, planning, transaction);

    // Append all procurement audit entries in strict chronological sequence.
    auditQueue.sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));
    for (const entry of auditQueue) {
      await audit(entry);
    }

    return {
      database,
      accounts: ctx.usersByEmail.size,
      roles: Object.keys(ctx.rolesByKey).length,
      bacCommitteeSize: ctx.bacMembers.length,
      vendors: Object.keys(ctx.vendorsByKey).length,
      projects: {
        completedId: completed.appEntry.id,
        ongoingBiddingId: ongoingBidding.appEntry.id,
        ongoingContractId: ongoingContract.appEntry.id,
        internalDraftAppId: extras.draftApp.id,
      },
      auditEntries: auditQueue.length,
    };
  });

  // Rebaseline integrity fingerprints outside the cleared transaction so sweep reports 0 findings.
  const baselineCounts = await rebaseline();
  const chain = await verifyChain();
  const findings = await sweep();
  assert.equal(chain.intact, true, `Audit chain failed verification: ${JSON.stringify(chain.problems)}`);
  assert.equal(findings.length, 0, `Integrity sweep found ${findings.length} unexpected findings`);

  const result = {
    ...summary,
    fingerprinted: Object.values(baselineCounts).reduce((sum, n) => sum + n, 0),
    auditChainIntact: chain.intact,
    integrityFindings: findings.length,
  };
  if (!quiet) {
    console.log(JSON.stringify(result, null, 2));
  }
  return result;
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  try {
    const { values } = parseArgs({
      options: {
        "confirm-database": { type: "string" },
        "allow-remote-db": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
    if (values.help || !values["confirm-database"]) {
      console.log(`Usage:
  npm run seed:survey -- --confirm-database <DB_NAME> [--allow-remote-db]

Resets the dedicated evaluation database (never municipal_backend), seeds all
19 role accounts (password: ${SURVEY_DEFAULT_PASSWORD}, MFA disabled), 5-member BAC setup,
1 completed project, 2 ongoing projects (bidding/evaluation and contract/payment),
extra approved budget & draft APP, PDFs, hash-chained audit trail, and integrity baseline.`);
      if (!values.help) process.exitCode = 1;
    } else {
      await seedSurveyDemo({
        confirmDatabase: values["confirm-database"],
        allowRemoteDb: values["allow-remote-db"],
      });
    }
  } catch (error) {
    console.error("Survey seed failed:", error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}
