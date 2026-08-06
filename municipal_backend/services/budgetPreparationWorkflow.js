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

// ── LGC Sec. 323: failure to enact the annual appropriations ─────────────────
// "In case the sanggunian concerned fails to pass the ordinance authorizing the
// annual appropriations at the beginning of the ensuing fiscal year, it shall
// continue to hold sessions... until such ordinance is approved... In the
// meantime, the annual appropriations of the preceding fiscal year shall be
// deemed reenacted and shall remain in force and effect until the ordinance
// authorizing the proposed appropriations is passed by the sanggunian."
//
// The system had no concept of this at all: a municipality whose Sanggunian had
// not passed the budget by 1 January simply had no appropriations, and every
// requisition would fail certification — when in law the LGU is operating, and
// spending, under a reenacted budget.
//
// The reenacted budget is not the whole of the previous year's. Sec. 323 limits
// it to the annual appropriations for salaries and wages of existing positions,
// statutory and contractual obligations, and essential operating expenses. New
// appropriations — and in particular capital outlay — are NOT carried over,
// which is precisely the constraint an LGU under a reenacted budget lives with.
export const REENACTABLE_EXPENSE_CLASSES = ["personalServices", "mooe"];

export const isReenactable = (appropriation) =>
  REENACTABLE_EXPENSE_CLASSES.includes(appropriation?.expenseClass);

// Whether a fiscal year has reached the point where reenactment applies: the
// year has begun and no ordinance has been enacted for it.
export const reenactmentApplies = ({ fiscalYear, enactedBudgetExists, asOf = new Date() }) => {
  if (enactedBudgetExists) return false;
  return asOf >= new Date(`${fiscalYear}-01-01T00:00:00`);
};

// ── LGC general limitations on the annual budget ─────────────────────────────
// Sec. 324 and 325 put hard arithmetic limits on what an LGU may appropriate.
// The system enforced only the balanced-budget rule (Sec. 324(a)); these three
// were absent, and they are the ones COA actually raises findings on.
//
//   Sec. 325(a) — Personal Services may not exceed 45% of the total annual
//                 income from regular sources of the NEXT preceding fiscal year
//                 for 1st–3rd class LGUs, or 55% for 4th class and below.
//   Sec. 324(b) — at least 20% of the annual internal revenue allotment (now the
//                 National Tax Allotment) must be appropriated for development
//                 projects — the "20% Development Fund".
//   Sec. 324(d) — 5% of estimated revenue from regular sources must be set aside
//                 as the Local Disaster Risk Reduction and Management Fund.
export const PS_CAP_HIGHER_CLASS = 0.45;
export const PS_CAP_LOWER_CLASS = 0.55;
export const DEVELOPMENT_FUND_RATE = 0.2;
export const LDRRMF_RATE = 0.05;

// 1st, 2nd and 3rd class LGUs carry the tighter Personal Services cap.
export const personalServicesCapFor = (incomeClass) =>
  ["1st", "2nd", "3rd"].includes(incomeClass) ? PS_CAP_HIGHER_CLASS : PS_CAP_LOWER_CLASS;

// Returns a list of findings rather than throwing. These are limitations on the
// budget as a whole, so they are checked at finalisation — the point where the
// figures stop moving — and reported together, because an office fixing one at
// a time would be walking back and forth for each.
export const generalLimitationFindings = ({
  incomeClass,
  estimatedIncome,
  regularIncomePriorYear,
  nationalTaxAllotment,
  personalServicesTotal,
  developmentFundTotal,
  ldrrmfTotal,
}) => {
  const findings = [];

  const psCap = personalServicesCapFor(incomeClass);
  if (regularIncomePriorYear > 0 && personalServicesTotal > regularIncomePriorYear * psCap) {
    findings.push({
      code: "personalServicesCap",
      citation: "LGC Sec. 325(a)",
      message:
        `Personal Services of ₱${personalServicesTotal.toLocaleString()} exceed the ` +
        `${Math.round(psCap * 100)}% cap of ₱${(regularIncomePriorYear * psCap).toLocaleString()} ` +
        `on the prior year's regular income (₱${regularIncomePriorYear.toLocaleString()}).`,
    });
  }

  if (nationalTaxAllotment > 0 && developmentFundTotal < nationalTaxAllotment * DEVELOPMENT_FUND_RATE) {
    findings.push({
      code: "developmentFund",
      citation: "LGC Sec. 324(b)",
      message:
        `The 20% Development Fund requires at least ` +
        `₱${(nationalTaxAllotment * DEVELOPMENT_FUND_RATE).toLocaleString()} of the ` +
        `₱${nationalTaxAllotment.toLocaleString()} National Tax Allotment; ` +
        `₱${developmentFundTotal.toLocaleString()} is appropriated.`,
    });
  }

  if (estimatedIncome > 0 && ldrrmfTotal < estimatedIncome * LDRRMF_RATE) {
    findings.push({
      code: "ldrrmf",
      citation: "LGC Sec. 324(d)",
      message:
        `The Local Disaster Risk Reduction and Management Fund requires at least ` +
        `₱${(estimatedIncome * LDRRMF_RATE).toLocaleString()} (5% of estimated regular income); ` +
        `₱${ldrrmfTotal.toLocaleString()} is set aside.`,
    });
  }

  return findings;
};

// ── The statutory budget calendar (LGC Sec. 318, 319, 321) ───────────────────
// Departmental estimates are due 15 July; the Mayor submits the executive
// budget to the Sanggunian on or before 16 October; the Sanggunian should enact
// on or before the end of the fiscal year. These are deadlines an LGU is
// measured against rather than gates — a budget submitted late is late, not
// void — so they are reported, not refused.
export const BUDGET_CALENDAR = {
  departmentalEstimatesDue: { month: 7, day: 15, citation: "LGC Sec. 318" },
  executiveBudgetDue: { month: 10, day: 16, citation: "LGC Sec. 318" },
  ordinanceDue: { month: 12, day: 31, citation: "LGC Sec. 319" },
};

export const calendarStatusFor = (milestone, fiscalYear, actualDate = new Date()) => {
  const spec = BUDGET_CALENDAR[milestone];
  if (!spec) return null;
  // The executive budget for FY N is prepared during FY N-1.
  const deadline = new Date(Date.UTC(fiscalYear - 1, spec.month - 1, spec.day));
  const actual = new Date(actualDate);
  const daysLate = Math.floor((actual - deadline) / 86_400_000);
  return {
    milestone,
    citation: spec.citation,
    deadline,
    onTime: daysLate <= 0,
    daysLate: Math.max(0, daysLate),
  };
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
