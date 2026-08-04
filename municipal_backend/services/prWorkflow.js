// Centralised state machine for Purchase Requisitions, per design doc
// Section 5.2 and the Section 13 requirement for centralised state handling.
//
//   draft → pendingDepartmentHeadEndorsement → pendingBudgetCertification
//         → pendingSecretariatReview → pendingHopeApproval → approved
// Any review stage may return the requisition to the requester.

export const PR_TRANSITIONS = {
  submit: {
    from: ["draft", "returned"],
    to: "pendingDepartmentHeadEndorsement",
    permission: "pr.create",
    label: "Submit",
  },
  endorse: {
    from: ["pendingDepartmentHeadEndorsement"],
    to: "pendingBudgetCertification",
    permission: "pr.endorse",
    label: "Endorse",
  },
  certify: {
    from: ["pendingBudgetCertification"],
    to: "pendingSecretariatReview",
    permission: "pr.certify",
    label: "Certify funding",
  },
  review: {
    from: ["pendingSecretariatReview"],
    to: "pendingHopeApproval",
    permission: "pr.review",
    label: "Review",
  },
  approve: {
    from: ["pendingHopeApproval"],
    to: "approved",
    permission: "pr.approve",
    label: "Approve",
  },
  return: {
    from: [
      "pendingDepartmentHeadEndorsement",
      "pendingBudgetCertification",
      "pendingSecretariatReview",
      "pendingHopeApproval",
    ],
    to: "returned",
    permission: null, // depends on the stage — see below
    label: "Return to requester",
    requiresRemarks: true,
  },
};

const RETURN_PERMISSION_BY_STATE = {
  pendingDepartmentHeadEndorsement: "pr.endorse",
  pendingBudgetCertification: "pr.certify",
  pendingSecretariatReview: "pr.review",
  pendingHopeApproval: "pr.approve",
};

export const permissionForTransition = (action, currentStatus) => {
  if (action === "return") return RETURN_PERMISSION_BY_STATE[currentStatus] ?? null;
  return PR_TRANSITIONS[action]?.permission ?? null;
};

export const evaluateTransition = ({ action, currentStatus, remarks }) => {
  const transition = PR_TRANSITIONS[action];
  if (!transition) return { ok: false, message: `Unknown action: ${action}` };

  if (currentStatus === "approved") {
    return { ok: false, message: "This requisition is already approved." };
  }

  if (!transition.from.includes(currentStatus)) {
    return {
      ok: false,
      message: `Cannot ${transition.label.toLowerCase()} from status "${currentStatus}".`,
    };
  }

  if (transition.requiresRemarks && !remarks?.trim()) {
    return { ok: false, message: "Remarks are required when returning a requisition." };
  }

  return { ok: true, to: transition.to };
};

export const isEditable = (status) => status === "draft" || status === "returned";
