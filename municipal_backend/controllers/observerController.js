import { Op } from "sequelize";
import { sequelize } from "../models/db.js";
import {
  ObserverOrganization,
  ObserverInvitation,
  ObservationReport,
  OBSERVABLE_STAGES,
  OBSERVABLE_STAGE_LABELS,
  OBSERVER_SECTORS,
  OBSERVER_SECTOR_LABELS,
  OBSERVER_NOTICE_DAYS,
  OBSERVATION_REPORT_DAYS,
} from "../models/observerModel.js";
import { Rfq } from "../models/biddingModel.js";
import { User } from "../models/userModel.js";
import { notifyUsers, notifyByPermission, NOTIFICATION_EVENTS } from "../services/notifier.js";
import { auditFromRequest, AUDIT_ACTIONS } from "../services/auditLog.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const calendarDaysBetween = (from, to) =>
  Math.floor((new Date(to).getTime() - new Date(from).getTime()) / DAY_MS);

export const getObserverOptions = async (req, res) => {
  res.json({
    stages: OBSERVABLE_STAGES.map((key) => ({ key, label: OBSERVABLE_STAGE_LABELS[key] })),
    sectors: OBSERVER_SECTORS.map((key) => ({ key, label: OBSERVER_SECTOR_LABELS[key] })),
    noticeDays: OBSERVER_NOTICE_DAYS,
    reportDays: OBSERVATION_REPORT_DAYS,
  });
};

// ── The roster ──────────────────────────────────────────────────────────────

const serializeOrganization = (organization) => ({
  id: organization.id,
  name: organization.name,
  sector: organization.sector,
  sectorLabel: OBSERVER_SECTOR_LABELS[organization.sector],
  relevantCategories: organization.relevantCategories ?? [],
  registryBody: organization.registryBody,
  registrationNo: organization.registrationNo,
  contactPerson: organization.contactPerson,
  contactEmail: organization.contactEmail,
  status: organization.status,
  remarks: organization.remarks,
});

export const listOrganizations = async (req, res) => {
  const where = {};
  if (req.query.sector) where.sector = req.query.sector;
  if (req.query.status) where.status = req.query.status;

  const organizations = await ObserverOrganization.findAll({ where, order: [["name", "ASC"]] });
  res.json(organizations.map(serializeOrganization));
};

export const createOrganization = async (req, res) => {
  const { name, sector, registryBody, registrationNo, relevantCategories, contactPerson, contactEmail } =
    req.body ?? {};

  if (!name?.trim()) return res.status(400).json({ message: "An organisation name is required." });
  if (!OBSERVER_SECTORS.includes(sector)) {
    return res.status(400).json({ message: "Unknown observer sector.", accepted: OBSERVER_SECTORS });
  }

  // Sec. 43.1.2 — a private group or CSO/PO must be registered with the SEC or
  // the CDA. The COA representative is not an outside organisation and carries
  // no such requirement, which is why the check is scoped rather than blanket.
  if (sector !== "coa" && !registrationNo?.trim()) {
    return res.status(400).json({
      message:
        "A private group or CSO/PO must be duly registered with the SEC or the CDA (RA 12009 " +
        "Sec. 43.1.2). Record its registration number.",
    });
  }

  const organization = await ObserverOrganization.create({
    name: name.trim(),
    sector,
    registryBody: registryBody ?? (sector === "coa" ? "coa" : "sec"),
    registrationNo: registrationNo?.trim() || null,
    relevantCategories: Array.isArray(relevantCategories) ? relevantCategories : null,
    contactPerson: contactPerson?.trim() || null,
    contactEmail: contactEmail?.trim() || null,
  });

  res.status(201).json(serializeOrganization(organization));
};

// ── Invitations ─────────────────────────────────────────────────────────────

const serializeInvitation = (invitation) => ({
  id: invitation.id,
  rfqId: invitation.rfqId,
  referenceNo: invitation.rfq?.referenceNo ?? null,
  stage: invitation.stage,
  stageLabel: OBSERVABLE_STAGE_LABELS[invitation.stage],
  organizationId: invitation.observerOrganizationId,
  organizationName: invitation.organization?.name ?? null,
  sector: invitation.organization?.sector ?? null,
  sectorLabel: invitation.organization ? OBSERVER_SECTOR_LABELS[invitation.organization.sector] : null,
  scheduledAt: invitation.scheduledAt,
  invitedAt: invitation.invitedAt,
  noticeDays: invitation.noticeDays,
  noticeCompliant: invitation.noticeCompliant,
  representativeName: invitation.representativeName,
  confidentialityAgreedAt: invitation.confidentialityAgreedAt,
  attendance: invitation.attendance,
  attendedAt: invitation.attendedAt,
  inhibitionReason: invitation.inhibitionReason,
  invitedByName: invitation.invitedBy?.name ?? null,
  report: invitation.report
    ? {
        id: invitation.report.id,
        findingsRegular: invitation.report.findingsRegular,
        submittedAt: invitation.report.submittedAt,
        dueAt: invitation.report.dueAt,
        submittedLate: invitation.report.submittedLate,
      }
    : null,
});

const invitationIncludes = {
  include: [
    { model: Rfq, as: "rfq" },
    { model: ObserverOrganization, as: "organization" },
    { model: User, as: "invitedBy", attributes: ["id", "name"] },
    { model: ObservationReport, as: "report" },
  ],
};

export const listInvitations = async (req, res) => {
  const where = {};
  if (req.query.rfqId) where.rfqId = Number(req.query.rfqId);
  if (req.query.stage) where.stage = req.query.stage;

  // An observer sees the proceedings they were invited to, and nothing else.
  if (!req.permissions.has("observer.manage") && req.permissions.has("observer.participate")) {
    where.observerUserId = req.currentUser.id;
  }

  const invitations = await ObserverInvitation.findAll({
    where,
    ...invitationIncludes,
    order: [["scheduledAt", "DESC"]],
  });
  res.json(invitations.map(serializeInvitation));
};

// Sec. 43.1–43.2. The BAC invites; the invitation is the record that makes the
// proceedings regular whether or not anyone turns up.
export const inviteObservers = async (req, res) => {
  const { stage, scheduledAt, organizationIds, representativeNames } = req.body ?? {};

  const rfq = await Rfq.findByPk(req.params.rfqId);
  if (!rfq) return res.status(404).json({ message: "RFQ/ITB not found." });

  if (!OBSERVABLE_STAGES.includes(stage)) {
    return res.status(400).json({ message: "Unknown procurement stage.", accepted: OBSERVABLE_STAGES });
  }
  if (!scheduledAt || Number.isNaN(new Date(scheduledAt).getTime())) {
    return res.status(400).json({ message: "A scheduled date and time for the activity is required." });
  }

  const ids = Array.isArray(organizationIds) ? organizationIds.map(Number).filter(Boolean) : [];
  if (ids.length === 0) {
    return res.status(400).json({ message: "Select at least one organisation to invite." });
  }

  const organizations = await ObserverOrganization.findAll({
    where: { id: { [Op.in]: ids }, status: "active" },
  });
  if (organizations.length !== ids.length) {
    return res.status(400).json({ message: "One or more organisations are unknown or inactive." });
  }

  const invitedAt = new Date();
  const noticeDays = calendarDaysBetween(invitedAt, scheduledAt);

  // Sec. 43.2 — at least five calendar days before the activity. Short notice
  // is refused rather than flagged: an invitation that arrives too late to act
  // on does not discharge the obligation, and the whole point of the record is
  // that it can be relied on.
  if (noticeDays < OBSERVER_NOTICE_DAYS) {
    return res.status(409).json({
      message:
        `Observers must be invited at least ${OBSERVER_NOTICE_DAYS} calendar days before the activity ` +
        `(RA 12009 Sec. 43.2). This activity is ${noticeDays} day(s) away.`,
      noticeDays,
      required: OBSERVER_NOTICE_DAYS,
    });
  }

  const created = await sequelize.transaction(async (transaction) =>
    Promise.all(
      organizations.map((organization) =>
        ObserverInvitation.create(
          {
            rfqId: rfq.id,
            stage,
            scheduledAt,
            invitedAt,
            noticeDays,
            noticeCompliant: true,
            observerOrganizationId: organization.id,
            representativeName: representativeNames?.[organization.id]?.trim() || null,
            invitedById: req.currentUser.id,
            attendance: "invited",
          },
          { transaction }
        )
      )
    )
  );

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.OBSERVERS_INVITED,
    entityRef: "rfq",
    entityId: rfq.id,
    summary:
      `${organizations.length} observer(s) invited to ${OBSERVABLE_STAGE_LABELS[stage]} for ` +
      `${rfq.referenceNo} (${noticeDays} days' notice)`,
    afterState: {
      stage,
      scheduledAt,
      noticeDays,
      organizations: organizations.map((organization) => organization.name),
    },
  });

  await notifyByPermission("observer.participate", {
    type: NOTIFICATION_EVENTS.RFQ_PUBLISHED,
    title: `Invitation to observe — ${rfq.referenceNo}`,
    body: `${OBSERVABLE_STAGE_LABELS[stage]} on ${new Date(scheduledAt).toLocaleString()}.`,
    link: "/observer/proceedings",
    refEntity: "rfq",
    refId: rfq.id,
    severity: "info",
  });

  res.status(201).json({
    invited: created.length,
    noticeDays,
    invitations: created.map((invitation) => ({ id: invitation.id, stage: invitation.stage })),
  });
};

// Sec. 43.1 requires the COA representative plus at least two observers. This
// reports whether a given stage is properly attended, which is what the BAC
// needs to know before it proceeds and what an auditor asks afterwards.
export const stageCoverage = async (req, res) => {
  const rfq = await Rfq.findByPk(req.params.rfqId);
  if (!rfq) return res.status(404).json({ message: "RFQ/ITB not found." });

  const invitations = await ObserverInvitation.findAll({
    where: { rfqId: rfq.id },
    include: [{ model: ObserverOrganization, as: "organization" }],
  });

  const coverage = OBSERVABLE_STAGES.map((stage) => {
    const forStage = invitations.filter((invitation) => invitation.stage === stage);
    const sectors = new Set(forStage.map((invitation) => invitation.organization?.sector));

    const hasCoa = sectors.has("coa");
    // "at least two (2) observers" in addition to COA — one private group, one
    // CSO/PO.
    const nonCoa = forStage.filter((invitation) => invitation.organization?.sector !== "coa");

    return {
      stage,
      label: OBSERVABLE_STAGE_LABELS[stage],
      invited: forStage.length,
      attended: forStage.filter((invitation) => invitation.attendance === "attended").length,
      hasCoa,
      hasPrivateGroup: sectors.has("privateGroup"),
      hasCsoOrPo: sectors.has("csoOrPo"),
      compliant: hasCoa && nonCoa.length >= 2 && sectors.has("privateGroup") && sectors.has("csoOrPo"),
      reportsSubmitted: 0,
    };
  });

  res.json({
    referenceNo: rfq.referenceNo,
    category: rfq.category,
    stages: coverage,
    // A single answer for the dashboard: is this procurement observable as the
    // law requires it to be?
    compliant: coverage.every((stage) => stage.invited === 0 || stage.compliant),
  });
};

// Attendance, and Sec. 43.4(c) inhibition.
export const recordAttendance = async (req, res) => {
  const { attendance, inhibitionReason, representativeName, confidentialityAgreed } = req.body ?? {};
  const invitation = await ObserverInvitation.findByPk(req.params.id, invitationIncludes);
  if (!invitation) return res.status(404).json({ message: "Invitation not found." });

  if (!["attended", "absent", "inhibited"].includes(attendance)) {
    return res.status(400).json({ message: "Attendance must be attended, absent or inhibited." });
  }

  // Sec. 43.4(c) — inhibition is a written act, so it needs its reason.
  if (attendance === "inhibited" && !inhibitionReason?.trim()) {
    return res.status(400).json({
      message:
        "An observer who inhibits must notify the Procuring Entity in writing of the actual or " +
        "potential interest (RA 12009 Sec. 43.4(c)).",
    });
  }

  // Sec. 43.5 — "In all instances, observers shall be required to enter into a
  // confidentiality agreement."
  if (attendance === "attended" && !invitation.confidentialityAgreedAt && !confidentialityAgreed) {
    return res.status(409).json({
      message:
        "An observer must enter into a confidentiality agreement with the Procuring Entity before " +
        "attending (RA 12009 Sec. 43.5).",
    });
  }

  await invitation.update({
    attendance,
    attendedAt: attendance === "attended" ? new Date() : null,
    inhibitionReason: attendance === "inhibited" ? inhibitionReason.trim() : null,
    representativeName: representativeName?.trim() || invitation.representativeName,
    confidentialityAgreedAt:
      invitation.confidentialityAgreedAt ?? (confidentialityAgreed ? new Date() : null),
  });

  res.json(serializeInvitation(await ObserverInvitation.findByPk(invitation.id, invitationIncludes)));
};

// ── The Observation Report (Sec. 43.4) ──────────────────────────────────────

export const submitObservationReport = async (req, res) => {
  const { complianceAssessment, areasForImprovement, findingsRegular, furnishedTo } = req.body ?? {};

  const invitation = await ObserverInvitation.findByPk(req.params.id, invitationIncludes);
  if (!invitation) return res.status(404).json({ message: "Invitation not found." });

  // The report covers "the actual proceedings they are concerned with and have
  // attended to" — an observer who did not attend has nothing to report on.
  if (invitation.attendance !== "attended") {
    return res.status(409).json({
      message: "Only an observer recorded as having attended the activity may file a report on it.",
    });
  }
  if (await ObservationReport.findOne({ where: { invitationId: invitation.id } })) {
    return res.status(409).json({ message: "A report has already been filed for this activity." });
  }
  if (!complianceAssessment?.trim()) {
    return res.status(400).json({
      message:
        "The report must assess the extent of the BAC's compliance with the IRR " +
        "(RA 12009 Sec. 43.4(a)).",
    });
  }

  const submittedAt = new Date();
  const dueAt = new Date(new Date(invitation.scheduledAt).getTime() + OBSERVATION_REPORT_DAYS * DAY_MS);

  const report = await ObservationReport.create({
    invitationId: invitation.id,
    complianceAssessment: complianceAssessment.trim(),
    areasForImprovement: areasForImprovement?.trim() || null,
    findingsRegular: findingsRegular !== false,
    submittedAt,
    dueAt,
    submittedLate: submittedAt > dueAt,
    // Sec. 43.4(b) — HoPE, PhilGEPS, COA, GPPB, Ombudsman.
    furnishedTo: furnishedTo ?? null,
    submittedById: req.currentUser.id,
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.OBSERVATION_REPORT_FILED,
    entityRef: "rfq",
    entityId: invitation.rfqId,
    summary:
      `Observation report filed by ${invitation.organization?.name ?? "an observer"} on ` +
      `${OBSERVABLE_STAGE_LABELS[invitation.stage]} — ` +
      `${report.findingsRegular ? "proceedings regular" : "IRREGULARITIES NOTED"}`,
    afterState: {
      stage: invitation.stage,
      findingsRegular: report.findingsRegular,
      submittedLate: report.submittedLate,
    },
  });

  // Sec. 43.4(a) — submitted to the HoPE, copy furnished the BAC Chairperson.
  // An adverse finding is the case the whole mechanism exists for, so it is
  // raised rather than filed quietly.
  const severity = report.findingsRegular ? "info" : "danger";
  await notifyByPermission("bidding.award", {
    type: NOTIFICATION_EVENTS.AWARD_RECOMMENDED,
    title: `Observation report — ${invitation.rfq?.referenceNo ?? ""}`,
    body: report.findingsRegular
      ? `${invitation.organization?.name} found the proceedings regular.`
      : `${invitation.organization?.name} recorded irregularities: ${report.complianceAssessment.slice(0, 160)}`,
    link: "/evaluation",
    refEntity: "rfq",
    refId: invitation.rfqId,
    severity,
  });
  await notifyByPermission("bidding.chairEvaluation", {
    type: NOTIFICATION_EVENTS.AWARD_RECOMMENDED,
    title: `Observation report — ${invitation.rfq?.referenceNo ?? ""}`,
    body: report.findingsRegular ? "Proceedings found regular." : "Irregularities recorded by an observer.",
    link: "/evaluation",
    refEntity: "rfq",
    refId: invitation.rfqId,
    severity,
  });

  res.status(201).json({
    id: report.id,
    findingsRegular: report.findingsRegular,
    submittedLate: report.submittedLate,
    dueAt: report.dueAt,
  });
};

// Sec. 43.2 — "The absence of observers will not nullify the BAC proceedings;
// Provided, That they have been duly invited in writing." And Sec. 43.4(b) —
// silence past seven days is read as concurrence. Both of those turn on records
// this endpoint reports, so the BAC can see where it actually stands.
export const observationSummary = async (req, res) => {
  const invitations = await ObserverInvitation.findAll({
    where: { rfqId: Number(req.params.rfqId) },
    ...invitationIncludes,
  });

  const now = new Date();

  res.json(
    invitations.map((invitation) => {
      const dueAt = new Date(
        new Date(invitation.scheduledAt).getTime() + OBSERVATION_REPORT_DAYS * DAY_MS
      );
      return {
        ...serializeInvitation(invitation),
        // Where no report was filed and the window has closed, the IRR supplies
        // the conclusion for us.
        presumedRegular: !invitation.report && now > dueAt,
        reportWindowCloses: dueAt,
      };
    })
  );
};
