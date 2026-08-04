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
};

// Which permission may return an entry, by the stage it is sitting in.
const RETURN_PERMISSION_BY_STATE = {
  pendingConsolidation: "app.consolidate",
  pendingBudgetCertification: "app.certify",
  pendingHopeApproval: "app.approve",
};

export const permissionForTransition = (action, currentStatus) => {
  if (action === "return") return RETURN_PERMISSION_BY_STATE[currentStatus] ?? null;
  return APP_TRANSITIONS[action]?.permission ?? null;
};

// Returns { ok: true, to } or { ok: false, message }.
export const evaluateTransition = ({ action, currentStatus, remarks }) => {
  const transition = APP_TRANSITIONS[action];
  if (!transition) return { ok: false, message: `Unknown action: ${action}` };

  // Section 4.3 / 4.2: an approved APP is locked and cannot be edited or moved.
  if (currentStatus === "approved" || currentStatus === "locked") {
    return { ok: false, message: "This APP entry is approved and locked." };
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
