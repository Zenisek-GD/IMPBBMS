import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProjectReportContext,
  projectReferenceHint,
} from "./projectReportContext.js";

test("project issue reports retain server-derived public project context", () => {
  const context = buildProjectReportContext({
    id: 42,
    projectTitle: "Barangay access road improvement",
    referenceNo: "ITB-2026-042",
    category: "ongoing",
    phase: "contract",
    phaseLabel: "Contract implementation",
    implementingUnit: "Municipal Engineering Office",
    procurementMode: "Competitive Bidding",
    fiscalYear: 2026,
    contractNo: "CN-2026-042",
  }, new Date("2026-09-17T08:30:00.000Z"));

  assert.deepEqual(context, {
    version: 1,
    module: "publicProjectDetail",
    currentPage: "/projects/42",
    projectId: 42,
    projectTitle: "Barangay access road improvement",
    referenceNo: "ITB-2026-042",
    currentStatus: "ongoing",
    currentPhase: "contract",
    currentPhaseLabel: "Contract implementation",
    implementingUnit: "Municipal Engineering Office",
    procurementMode: "Competitive Bidding",
    fiscalYear: 2026,
    contractNo: "CN-2026-042",
    reportedAt: "2026-09-17T08:30:00.000Z",
  });
  assert.equal(projectReferenceHint(context), "ITB-2026-042 — Barangay access road improvement");
});
