// Centralised state machine for Purchase Requisitions.
//
//   draft
//     → pendingDepartmentHeadEndorsement   the Head of Office signs the request
//     → pendingCashCertification           the Treasurer certifies that the
//                                          funds are available
//     → pendingMayorApproval               the Mayor approves the request
//     → pendingBudgetCertification         the Budget Office certifies that an
//                                          appropriation exists, identifies the
//                                          funding source, and obligates it
//     → pendingModeDetermination           the BAC determines the mode of
//                                          procurement
//     → approved                           cleared; procurement may begin
//
// Any stage may return the requisition to the requester.
//
// ── WHY THIS ORDER, AND WHY IT CHANGED ───────────────────────────────────────
// An earlier version ran Budget → Treasury → Secretariat → Mayor, reasoning
// from LGC Sec. 344 that there is nothing to certify cash against until an
// amount has been obligated. Sec. 344 does say the Budget Officer certifies the
// appropriation, the Accountant obligates it and the Treasurer certifies
// availability of funds — but it says so about *disbursement*, the moment money
// leaves, which in this system is the voucher stage and is implemented there.
//
// The requisition is a different document earlier in the year, and the LGU's
// actual practice — the order the boxes appear on the Purchase Request form —
// is: the office requests, the Treasurer certifies cash is available, the Local
// Chief Executive approves, and only then does the Budget Office issue the
// Obligation Request against the appropriation.
//
// That order is also the more defensible one. Obligating funds encumbers an
// appropriation: the money stops being available to anything else. Doing that
// *before* the Mayor has approved the request means every requisition that is
// later refused has silently held budget in the meantime. Obligating after
// approval commits money only to requests the executive has actually agreed to.
//
// The two certifications remain separate officers answering separate questions
// and must never be merged: the Treasurer answers "is the cash there?", the
// Budget Officer answers "is there an appropriation, and is there room left
// under it?". An appropriation can be intact while collections have not come
// in, which is exactly the case the Treasurer's signature exists to catch.

export const PR_TRANSITIONS = {
  submit: {
    from: ["draft", "returned"],
    to: "pendingDepartmentHeadEndorsement",
    permission: "pr.create",
    label: "Submit",
  },
  endorse: {
    from: ["pendingDepartmentHeadEndorsement"],
    to: "pendingCashCertification",
    permission: "pr.endorse",
    label: "Endorse",
  },
  // Step 16 — the Treasurer.
  certifyCash: {
    from: ["pendingCashCertification"],
    to: "pendingMayorApproval",
    permission: "pr.certifyCash",
    label: "Certify availability of funds",
  },
  // Step 17 — the Local Chief Executive. Named `approve` because that is what
  // the box on the form says and what the officer is doing; the requisition is
  // not finished at this point, and its status says so.
  approve: {
    from: ["pendingMayorApproval"],
    to: "pendingBudgetCertification",
    permission: "pr.approve",
    label: "Approve the request",
  },
  // Step 18 — the Budget Office. This is the transition that writes the
  // Obligation Request and stamps the funding source on the requisition.
  certify: {
    from: ["pendingBudgetCertification"],
    to: "pendingModeDetermination",
    permission: "pr.certify",
    label: "Certify appropriation and obligate",
  },
  // Step 19 — the Bids and Awards Committee.
  determineMode: {
    from: ["pendingModeDetermination"],
    to: "approved",
    permission: "pr.determineMode",
    label: "Determine the mode of procurement",
  },
  return: {
    from: [
      "pendingDepartmentHeadEndorsement",
      "pendingCashCertification",
      "pendingMayorApproval",
      "pendingBudgetCertification",
      "pendingModeDetermination",
    ],
    to: "returned",
    permission: null, // depends on the stage — see below
    label: "Return to requester",
    requiresRemarks: true,
  },
};

const RETURN_PERMISSION_BY_STATE = {
  pendingDepartmentHeadEndorsement: "pr.endorse",
  pendingCashCertification: "pr.certifyCash",
  pendingMayorApproval: "pr.approve",
  pendingBudgetCertification: "pr.certify",
  pendingModeDetermination: "pr.determineMode",
};

// The stages at which a requisition is live: it has left the requester's desk
// and has not been refused. Every one of these holds a claim on the linked APP
// entry's balance.
//
// This list has to contain every non-draft, non-returned, non-approved state.
// When `pendingCashCertification` was added and this list was not updated, a
// requisition sitting with the Treasurer stopped counting against its APP
// entry, and two requisitions could each pass the balance check for the same
// money. Derive it rather than retyping it.
export const LIVE_PR_STATUSES = [
  ...new Set(Object.values(PR_TRANSITIONS).flatMap((transition) => transition.from)),
]
  .filter((status) => status !== "draft" && status !== "returned")
  .concat("approved");

export const permissionForTransition = (action, currentStatus) => {
  if (action === "return") return RETURN_PERMISSION_BY_STATE[currentStatus] ?? null;
  return PR_TRANSITIONS[action]?.permission ?? null;
};

export const evaluateTransition = ({ action, currentStatus, remarks }) => {
  const transition = PR_TRANSITIONS[action];
  if (!transition) return { ok: false, message: `Unknown action: ${action}` };

  if (currentStatus === "approved") {
    return { ok: false, message: "This requisition has already cleared and is ready for procurement." };
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
