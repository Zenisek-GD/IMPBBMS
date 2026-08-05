// Centralised state machine for the executive budget, from departmental
// proposals through to the enacted Appropriation Ordinance.
//
//   draft
//     → pendingMbcReview              offices have submitted; the Municipal
//                                     Budget Council reviews the requests
//     → pendingPlanningConsolidation  the Planning Office checks the requests
//                                     against the development plan and the AIP
//     → pendingBudgetForum            the Local Finance Committee sets income
//                                     estimates and expenditure ceilings
//     → pendingBudgetHearing          each office justifies what it asked for
//     → pendingFinalisation           deliberation; final figures are struck
//     → pendingMayorApproval          the executive budget (LGC Sec. 318)
//     → pendingSanggunianAction       the Appropriation Ordinance (Sec. 319)
//     → pendingProvincialReview       Sangguniang Panlalawigan review (Sec. 327)
//     → enacted                       appropriations are written and chargeable
//
// The order is not decorative. Each stage exists because a different body acts,
// and skipping one means a body that is supposed to have seen the budget did
// not. That is why every step is a transition with its own permission rather
// than a status a Budget Officer can set.

export const BUDGET_TRANSITIONS = {
  openForProposals: {
    from: ["draft", "returned"],
    to: "draft",
    permission: "budget.prepareExecutive",
    label: "Open for proposals",
  },
  closeProposals: {
    from: ["draft", "returned"],
    to: "pendingMbcReview",
    permission: "budget.prepareExecutive",
    label: "Close proposals and refer to the Budget Council",
  },
  reviewProposals: {
    from: ["pendingMbcReview"],
    to: "pendingPlanningConsolidation",
    permission: "budget.reviewProposal",
    label: "Complete Budget Council review",
  },
  consolidate: {
    from: ["pendingPlanningConsolidation"],
    to: "pendingBudgetForum",
    permission: "budget.consolidateProposals",
    label: "Consolidate and refer to the Finance Committee",
  },
  holdForum: {
    from: ["pendingBudgetForum"],
    to: "pendingBudgetHearing",
    permission: "budget.conductForum",
    label: "Conclude the budget forum",
    // Ceilings are the whole output of the forum; moving on without them would
    // leave the hearing with nothing to measure a request against.
    requiresCeiling: true,
  },
  concludeHearing: {
    from: ["pendingBudgetHearing"],
    to: "pendingFinalisation",
    permission: "budget.conductHearing",
    label: "Conclude the budget hearings",
  },
  finalise: {
    from: ["pendingFinalisation"],
    to: "pendingMayorApproval",
    permission: "budget.finaliseExecutive",
    label: "Finalise the executive budget",
  },
  approveExecutive: {
    from: ["pendingMayorApproval"],
    to: "pendingSanggunianAction",
    permission: "budget.approveExecutive",
    label: "Approve and submit to the Sanggunian",
  },
  enactOrdinance: {
    from: ["pendingSanggunianAction"],
    to: "pendingProvincialReview",
    permission: "budget.enactOrdinance",
    label: "Record the Appropriation Ordinance",
    requiresOrdinance: true,
  },
  recordProvincialReview: {
    from: ["pendingProvincialReview"],
    to: "enacted",
    permission: "budget.recordProvincialReview",
    label: "Record the provincial review",
    requiresReviewOutcome: true,
  },
  return: {
    from: [
      "pendingMbcReview",
      "pendingPlanningConsolidation",
      "pendingBudgetForum",
      "pendingBudgetHearing",
      "pendingFinalisation",
      "pendingMayorApproval",
      "pendingSanggunianAction",
      "pendingProvincialReview",
    ],
    to: "returned",
    permission: null,
    label: "Return for revision",
    requiresRemarks: true,
  },
};

// Which permission may return the budget, by the stage it is sitting in — the
// body currently holding it is the body that can hand it back.
const RETURN_PERMISSION_BY_STATE = {
  pendingMbcReview: "budget.reviewProposal",
  pendingPlanningConsolidation: "budget.consolidateProposals",
  pendingBudgetForum: "budget.conductForum",
  pendingBudgetHearing: "budget.conductHearing",
  pendingFinalisation: "budget.finaliseExecutive",
  pendingMayorApproval: "budget.approveExecutive",
  pendingSanggunianAction: "budget.enactOrdinance",
  pendingProvincialReview: "budget.recordProvincialReview",
};

export const permissionForTransition = (action, currentStatus) => {
  if (action === "return") return RETURN_PERMISSION_BY_STATE[currentStatus] ?? null;
  return BUDGET_TRANSITIONS[action]?.permission ?? null;
};

export const evaluateTransition = ({ action, currentStatus, remarks, budget, payload = {} }) => {
  const transition = BUDGET_TRANSITIONS[action];
  if (!transition) return { ok: false, message: `Unknown action: ${action}` };

  if (currentStatus === "enacted") {
    return {
      ok: false,
      message:
        "This budget is enacted. Changes to an enacted budget are made through a supplemental budget, not by reopening this one.",
    };
  }

  if (!transition.from.includes(currentStatus)) {
    return {
      ok: false,
      message: `Cannot ${transition.label.toLowerCase()} from status "${currentStatus}".`,
    };
  }

  if (transition.requiresRemarks && !remarks?.trim()) {
    return { ok: false, message: "Remarks are required when returning a budget for revision." };
  }

  if (transition.requiresCeiling) {
    const income = Number(payload.estimatedIncome ?? budget?.estimatedIncome);
    const ceiling = Number(payload.expenditureCeiling ?? budget?.expenditureCeiling);
    if (!Number.isFinite(income) || income <= 0) {
      return { ok: false, message: "The forum must record an estimated income before it can conclude." };
    }
    if (!Number.isFinite(ceiling) || ceiling <= 0) {
      return { ok: false, message: "The forum must record an expenditure ceiling before it can conclude." };
    }
    // A ceiling above the income the LFC itself estimated is a budget that
    // cannot balance. LGC Sec. 324(a) requires the estimated income to cover
    // the appropriations, so this is caught here rather than discovered at
    // enactment.
    if (ceiling > income) {
      return {
        ok: false,
        message: `An expenditure ceiling of ₱${ceiling.toLocaleString()} exceeds the estimated income of ₱${income.toLocaleString()}. The budget would not balance (LGC Sec. 324).`,
      };
    }
  }

  if (transition.requiresOrdinance && !payload.ordinanceNo?.trim()) {
    return { ok: false, message: "The Appropriation Ordinance number is required." };
  }

  if (transition.requiresReviewOutcome && !payload.provincialReviewOutcome) {
    return { ok: false, message: "Record the outcome of the Sangguniang Panlalawigan review." };
  }

  return { ok: true, to: transition.to };
};

// The stage at which each office's proposal stops being editable by the office.
// Once the Budget Council has the proposals, an office changing its own numbers
// underneath the review is the thing this prevents.
export const proposalsEditableIn = (budgetStatus) =>
  budgetStatus === "draft" || budgetStatus === "returned";

// The proposal status that corresponds to each budget stage, so an office's
// copy advances with the budget rather than being tracked by hand.
export const PROPOSAL_STAGE_FOR_BUDGET_STATE = {
  pendingMbcReview: "submitted",
  pendingPlanningConsolidation: "mbcReviewed",
  pendingBudgetForum: "consolidated",
  pendingBudgetHearing: "consolidated",
  pendingFinalisation: "heard",
  pendingMayorApproval: "finalised",
};
