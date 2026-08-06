// Single registration point for every Sequelize model. Import new models here
// so `npm run migrate` and `npm run seed` always see the full schema.
export { sequelize } from "./db.js";
export { Role } from "./roleModel.js";
export { Department } from "./departmentModel.js";
export { User, USER_STATUSES } from "./userModel.js";
// PasswordResetToken is gone: password recovery is now a one-time code verified
// against an OtpChallenge, not a bearer link. See controllers/passwordResetController.js.
export { ActivationToken } from "./activationTokenModel.js";
export { OtpChallenge, OTP_PURPOSES, OTP_PURPOSE_LABELS } from "./otpChallengeModel.js";
export { Permission, RolePermission } from "./permissionModel.js";
export { SystemSetting, SETTING_KEYS, getLguProfile } from "./systemSettingModel.js";
export {
  Appropriation,
  Obligation,
  FUNDS,
  FUND_LABELS,
  EXPENSE_CLASSES,
  EXPENSE_CLASS_LABELS,
  APPROPRIATION_TYPES,
} from "./appropriationModel.js";
// The planning layer above procurement: the development plan the LGU committed
// to, and the year's investment program derived from it.
export {
  DevelopmentPlan,
  DevelopmentGoal,
  SECTORS,
  SECTOR_LABELS,
  PLAN_STATUSES,
  GOAL_STATUSES,
} from "./developmentPlanModel.js";
export {
  InvestmentProgram,
  AipEntry,
  AIP_STATES,
  AIP_ENTRY_STATES,
} from "./investmentProgramModel.js";
// Budget preparation and authorisation — everything between an office asking
// for money and the Sanggunian granting it.
export {
  ExecutiveBudget,
  BudgetProposal,
  BudgetProposalLine,
  BudgetProceeding,
  EXECUTIVE_BUDGET_STATES,
  EXECUTIVE_BUDGET_STATE_LABELS,
  BUDGET_TYPES,
  PROPOSAL_STATES,
  PROCEEDING_TYPES,
  PROCEEDING_TYPE_LABELS,
  PROVINCIAL_REVIEW_OUTCOMES,
  PROVINCIAL_REVIEW_LABELS,
} from "./budgetPreparationModel.js";
export { AppEntry, PLAN_STAGES, PLAN_STAGE_LABELS } from "./appEntryModel.js";
export { BacResolution, RESOLUTION_TYPES, RESOLUTION_TYPE_LABELS } from "./bacResolutionModel.js";
export { PrHeader, PrLineItem } from "./prModel.js";
export { Vendor, VendorDocument } from "./vendorModel.js";
export {
  Security,
  SECURITY_TYPES,
  SECURITY_FORMS,
  SECURITY_FORM_LABELS,
  BID_SECURITY_RATES,
  PERFORMANCE_SECURITY_RATES,
  requiredBidSecurity,
  requiredPerformanceSecurity,
} from "./securityModel.js";
export { ProcurementMode } from "./procurementModeModel.js";
export {
  Announcement,
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_CATEGORY_LABELS,
  acceptsRegistrations,
  isPubliclyVisible,
} from "./announcementModel.js";
export { Notification } from "./notificationModel.js";
// The only thing the public may write to. See the model for why it is not part
// of the procurement record.
export {
  PublicMessage,
  MESSAGE_ROUTING,
  MESSAGE_CATEGORIES,
} from "./publicMessageModel.js";
export { Contract, Delivery } from "./contractModel.js";
export { Invoice, Payment } from "./paymentModel.js";
export { PendingItem } from "./pendingItemModel.js";
export { AuditLog } from "./auditLogModel.js";
export { Document } from "./documentModel.js";
export { LiveConferenceSession, ConferenceAttendance } from "./liveConferenceModel.js";
export { Rfq, Bid, BidOpeningRecord, Evaluation, PostQualification, Award } from "./biddingModel.js";

// ── Observers (RA 12009 Sec. 43) ─────────────────────────────────────────────
export {
  ObserverOrganization,
  ObserverInvitation,
  ObservationReport,
  OBSERVABLE_STAGES,
  OBSERVABLE_STAGE_LABELS,
  OBSERVER_SECTORS,
  OBSERVER_SECTOR_LABELS,
  OBSERVER_NOTICE_DAYS,
  OBSERVATION_REPORT_DAYS,
} from "./observerModel.js";

// ── Protest mechanism (RA 12009 Rule XVI, Sec. 83–85) ────────────────────────
export {
  Protest,
  PROTEST_STAGES,
  PROTEST_STATES,
  protestFeeFor,
  decisionIsFinalAndExecutory,
  LGU_FINALITY_CEILINGS,
} from "./protestModel.js";
