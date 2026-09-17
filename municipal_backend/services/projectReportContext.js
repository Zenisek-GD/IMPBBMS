// Context is created from the published project on the server, never accepted
// from the browser. A public reporter can say what appears wrong, but cannot
// relabel the record their correspondence is attached to.
export const PUBLIC_PROJECT_REPORT_MODULE = "publicProjectDetail";

export const buildProjectReportContext = (project, reportedAt = new Date()) => ({
  version: 1,
  module: PUBLIC_PROJECT_REPORT_MODULE,
  currentPage: `/projects/${project.id}`,
  projectId: project.id,
  projectTitle: project.projectTitle,
  referenceNo: project.referenceNo ?? null,
  currentStatus: project.category ?? null,
  currentPhase: project.phase ?? null,
  currentPhaseLabel: project.phaseLabel ?? null,
  implementingUnit: project.implementingUnit ?? null,
  procurementMode: project.procurementMode ?? null,
  fiscalYear: project.fiscalYear ?? null,
  contractNo: project.contractNo ?? null,
  // The model's createdAt remains the canonical persisted receipt time. This
  // copy makes the contextual snapshot self-explanatory when it is viewed later.
  reportedAt: reportedAt.toISOString(),
});

export const projectReferenceHint = (context) =>
  [context.referenceNo, context.projectTitle].filter(Boolean).join(" — ").slice(0, 190);
