import "./config/developmentOnly.js";
import "./config/env.js";
import {
  sequelize,
  Announcement,
  AppEntry,
  Appropriation,
  AuditLog,
  Award,
  BacResolution,
  Bid,
  BidOpeningRecord,
  BudgetProceeding,
  BudgetProposal,
  BudgetProposalLine,
  ConferenceAttendance,
  Contract,
  Delivery,
  DevelopmentGoal,
  DevelopmentPlan,
  Document,
  Evaluation,
  ExecutiveBudget,
  GeneratedDocument,
  Invoice,
  InvestmentProgram,
  LiveConferenceSession,
  Notification,
  Obligation,
  ObservationReport,
  ObserverInvitation,
  ObserverOrganization,
  Payment,
  PendingItem,
  PostQualification,
  PrHeader,
  PrLineItem,
  Protest,
  PublicMessage,
  RecordFingerprint,
  Rfq,
  Security,
  SecurityAlert,
  Vendor,
  VendorDocument,
  AipEntry,
} from "./models/index.js";
import { rebaseline } from "./services/integrityMonitor.js";

// Clears local demonstration and workflow data while deliberately preserving
// accounts, roles, permissions, departments, system settings and MFA setup.
// This makes the workflow start empty without requiring anyone to recreate
// their login credentials.
const LOCAL_WALKTHROUGH_DATABASE = "municipal_walkthrough_20260907";

const workflowModels = [
  GeneratedDocument,
  Document,
  VendorDocument,
  Protest,
  ConferenceAttendance,
  LiveConferenceSession,
  ObservationReport,
  ObserverInvitation,
  Security,
  BacResolution,
  Payment,
  Invoice,
  Delivery,
  Contract,
  Award,
  PostQualification,
  Evaluation,
  BidOpeningRecord,
  Bid,
  Rfq,
  PendingItem,
  PrLineItem,
  PrHeader,
  Announcement,
  AppEntry,
  Obligation,
  Appropriation,
  BudgetProceeding,
  BudgetProposalLine,
  BudgetProposal,
  ExecutiveBudget,
  AipEntry,
  InvestmentProgram,
  DevelopmentGoal,
  DevelopmentPlan,
  ObserverOrganization,
  Vendor,
  Notification,
  PublicMessage,
  AuditLog,
  SecurityAlert,
  RecordFingerprint,
];

try {
  await sequelize.authenticate();
  if (sequelize.config.database !== LOCAL_WALKTHROUGH_DATABASE) {
    throw new Error(`This reset is restricted to ${LOCAL_WALKTHROUGH_DATABASE}.`);
  }

  const removed = {};
  await sequelize.transaction(async (transaction) => {
    for (const model of workflowModels) {
      const count = await model.destroy({ where: {}, transaction });
      if (count) removed[model.name] = count;
    }
  });

  await rebaseline();
  console.log("✅ Workflow and sample data cleared.");
  console.log("✅ User accounts, roles, permissions, departments, settings and MFA data were kept.");
  console.log(removed);
} catch (err) {
  console.error("❌ Reset failed:", err);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
