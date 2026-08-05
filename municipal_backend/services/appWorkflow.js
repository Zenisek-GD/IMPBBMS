// Centralised state machine for APP entries. Design doc Section 13 asks for
// "centralized state-transition handling (state machine or equivalent) to
// prevent invalid step-skipping" — every status change goes through here.
//
// Flow per Section 4.2:
//   draft → pendingConsolidation → pendingBudgetCertification
//         → pendingHopeApproval → approved → locked
// Any review step may return the entry to the requester.

export const APP_TRANSITIONS = {
  submit: {
    from: ["draft", "returned"],
    to: "pendingConsolidation",
    permission: "app.submit",
    label: "Submit for consolidation",
  },
  consolidate: {
    from: ["pendingConsolidation"],
    to: "pendingBudgetCertification",
    permission: "app.consolidate",
    label: "Consolidate",
  },
  certify: {
    from: ["pendingBudgetCertification"],
    to: "pendingHopeApproval",
    permission: "app.certify",
    label: "Certify funding",
  },
  approve: {
    from: ["pendingHopeApproval"],
    to: "approved",
    permission: "app.approve",
    label: "Approve",
  },
  // Returning is available at every review stage, per Section 4.1's "Returned".
  return: {
    from: ["pendingConsolidation", "pendingBudgetCertification", "pendingHopeApproval"],
    to: "returned",
    permission: null, // whoever holds the permission for the current stage
    label: "Return to requester",
    requiresRemarks: true,
  },

  // ── Revision and cancellation ──────────────────────────────────────────────
  // An approved entry is locked, which was right for the ordinary case and
  // wrong for the real one: projects get rescoped and dropped mid-year, and the
  // municipality's own process says a cancelled project's PPMP is revised.
  // Without a way back, the only options were an unrecorded database edit or a
  // plan that no longer described what the office was doing.
  //
  // Both are gated on `app.revise` and both demand remarks — the point is not
  // to make an approved plan editable, it is to make changing it an act that
  // leaves a record.
  revise: {
    from: ["approved", "locked"],
    to: "draft",
    permission: "app.revise",
    label: "Reopen for revision",
    requiresRemarks: true,
  },
  cancel: {
    from: [
      "draft",
      "returned",
      "pendingConsolidation",
      "pendingBudgetCertification",
      "pendingHopeApproval",
      "approved",
      "locked",
    ],
    to: "cancelled",
    permission: "app.revise",
    label: "Cancel the project",
    requiresRemarks: true,
  },
};

// Which permission may return an entry, by the stage it is sitting in.
const RETURN_PERMISSION_BY_STATE = {
  pendingConsolidation: "app.consolidate",
  pendingBudgetCertification: "app.certify",
  pendingHopeApproval: "app.approve",
};

// Statuses in which the entry still holds a claim on its appropriation — every
// status except the two that release it. Written as an exclusion so a new
// status added to the model counts as live by default, which is the safe way
// round: over-counting a claim blocks an overspend, under-counting permits one.
export const RELEASED_APP_STATUSES = ["returned", "cancelled"];

export const permissionForTransition = (action, currentStatus) => {
  if (action === "return") return RETURN_PERMISSION_BY_STATE[currentStatus] ?? null;
  return APP_TRANSITIONS[action]?.permission ?? null;
};

// Returns { ok: true, to } or { ok: false, message }.
export const evaluateTransition = ({ action, currentStatus, remarks }) => {
  const transition = APP_TRANSITIONS[action];
  if (!transition) return { ok: false, message: `Unknown action: ${action}` };

  if (currentStatus === "cancelled") {
    return { ok: false, message: "This APP entry has been cancelled." };
  }

  // Section 4.3 / 4.2: an approved APP is locked and cannot be edited or moved
  // through the normal workflow. Revision and cancellation are the deliberate
  // exceptions — they exist precisely to act on a locked entry — so they are
  // checked against their own `from` lists below rather than being caught here.
  if (
    (currentStatus === "approved" || currentStatus === "locked") &&
    action !== "revise" &&
    action !== "cancel"
  ) {
    return {
      ok: false,
      message: "This APP entry is approved and locked. Reopen it for revision if the project has changed.",
    };
  }

  if (!transition.from.includes(currentStatus)) {
    return {
      ok: false,
      message: `Cannot ${transition.label.toLowerCase()} from status "${currentStatus}".`,
    };
  }

  if (transition.requiresRemarks && !remarks?.trim()) {
    return { ok: false, message: "Remarks are required when returning an entry." };
  }

  return { ok: true, to: transition.to };
};

export const isEditable = (status) => status === "draft" || status === "returned";
