// The permission matrix from design doc Section 2.3, enumerated per action.
// Section 2.3 itself says the summary matrix should be maintained as a separate
// per-action access-control table during implementation — this is that table.

export const PERMISSIONS = [
  // Administration
  { key: "users.manage", module: "administration", description: "Create, edit, and deactivate user accounts" },

  // Held separately from users.manage on purpose. Creating a bidder's account is
  // not general user administration — it is the act that converts an approved
  // accreditation into system access, and it belongs to the officials who
  // reviewed that accreditation. Granting it through users.manage would mean the
  // only way to let the BAC Secretariat invite an approved bidder was to also let
  // them create Mayor and Treasurer accounts.
  {
    key: "bidders.createAccount",
    module: "administration",
    description: "Create and invite bidder accounts for approved registrations",
  },
  { key: "departments.manage", module: "administration", description: "Create and edit departments" },
  { key: "settings.manage", module: "administration", description: "Change system configuration" },

  // Annual Procurement Plan
  { key: "app.view", module: "app", description: "View APP entries" },
  { key: "app.viewPublished", module: "app", description: "View approved/published APP entries only" },
  { key: "app.create", module: "app", description: "Create and edit own APP entries" },
  { key: "app.submit", module: "app", description: "Submit APP entries for consolidation" },
  { key: "app.consolidate", module: "app", description: "Consolidate departmental APP entries" },
  { key: "app.certify", module: "app", description: "Certify funding on APP entries" },
  { key: "app.approve", module: "app", description: "Approve or return the APP" },

  // Purchase Requisition
  { key: "pr.view", module: "pr", description: "View purchase requisitions" },
  { key: "pr.create", module: "pr", description: "Create and submit purchase requisitions" },
  { key: "pr.endorse", module: "pr", description: "Endorse requisitions as department head" },
  { key: "pr.certify", module: "pr", description: "Certify funding on requisitions" },
  { key: "pr.review", module: "pr", description: "Review requisitions as Secretariat" },
  { key: "pr.approve", module: "pr", description: "Give final approval on requisitions" },

  // Bidding, evaluation, award
  { key: "bidding.view", module: "bidding", description: "View bidding records" },
  { key: "bidding.viewPublished", module: "bidding", description: "View approved bidding records only" },
  { key: "bidding.publish", module: "bidding", description: "Publish RFQ/ITB and open bids" },
  { key: "bidding.submitBid", module: "bidding", description: "Submit a bid or quotation" },
  { key: "bidding.evaluate", module: "bidding", description: "Score bids against the rubric" },
  { key: "bidding.technicalInput", module: "bidding", description: "Provide TWG technical evaluation input" },
  { key: "bidding.chairEvaluation", module: "bidding", description: "Chair evaluation and resolve award" },
  { key: "bidding.approveAlternativeMode", module: "bidding", description: "Approve alternative procurement modes" },
  { key: "bidding.award", module: "bidding", description: "Approve and issue the award" },

  // Contract
  { key: "contract.view", module: "contract", description: "View contracts" },
  { key: "contract.viewPublished", module: "contract", description: "View approved contracts only" },
  { key: "contract.draft", module: "contract", description: "Draft contracts and purchase orders" },
  { key: "contract.sign", module: "contract", description: "Sign contracts" },

  // Delivery, invoice, payment
  //
  // Certification and release are separate permissions because they are
  // separate accountable acts performed by separate officers. The Municipal
  // Accountant certifies that the claim is valid and the supporting documents
  // are complete; the Municipal Treasurer releases the cash. Collapsing them
  // into one permission — as a single "process invoices and release payment"
  // did — puts the entire disbursement in one pair of hands, which is the
  // control failure this split exists to prevent.
  { key: "delivery.report", module: "delivery", description: "Submit delivery and acceptance reports" },
  { key: "delivery.submitInvoice", module: "delivery", description: "Submit invoices as a supplier" },
  { key: "payment.view", module: "delivery", description: "View invoices and disbursement vouchers" },
  { key: "payment.certify", module: "delivery", description: "Certify invoices and prepare disbursement vouchers" },
  { key: "payment.release", module: "delivery", description: "Release disbursements from the treasury" },

  // Budget
  { key: "budget.view", module: "budget", description: "View budget and certification status" },
  { key: "budget.certify", module: "budget", description: "Certify availability of funds" },
  {
    key: "budget.manageAppropriations",
    module: "budget",
    description: "Record and amend appropriation ordinance lines",
  },

  // Audit and transparency
  { key: "audit.viewLogs", module: "audit", description: "View system logs" },
  { key: "audit.viewAll", module: "audit", description: "View full workflow history across modules" },
  { key: "audit.viewPublished", module: "audit", description: "View published transparency records only" },
  { key: "audit.export", module: "audit", description: "Export audit records" },
];

// Role key → permission keys. Mirrors the Section 2.3 grid row by row; an em
// dash in that grid means the role simply has no entry here.
export const ROLE_PERMISSIONS = {
  systemAdministrator: [
    "users.manage",
    // The administrator can also invite a bidder, so onboarding is not blocked
    // when no Secretariat member is available.
    "bidders.createAccount",
    "departments.manage",
    "settings.manage",
    "audit.viewLogs",
  ],

  hope: [
    "app.view", "app.approve",
    "pr.view", "pr.approve",
    "bidding.view", "bidding.approveAlternativeMode", "bidding.award",
    "budget.view",
    "audit.viewAll",
  ],

  // NOTE: deliberately NOT granted "bidding.award". Section 2.3 reads "Chair
  // evaluation & award" for this role and "Approve alt. modes / Award" for the
  // HOPE — the committee *recommends* the award, the Mayor *approves* it.
  // Granting both here would let the Chairperson approve their own
  // recommendation and collapse that separation of duties.
  bacChairperson: [
    "app.view",
    "pr.view",
    "bidding.view", "bidding.evaluate", "bidding.chairEvaluation",
    "contract.view", "contract.sign",
    "budget.view",
    "audit.viewAll",
  ],

  bacMember: [
    "app.view",
    "pr.view",
    "bidding.view", "bidding.evaluate",
    "budget.view",
  ],

  // The Secretariat reviews bidder registrations, so it is also the office that
  // turns an approved one into an account — the decision and the act that follows
  // from it stay with the same officials, and both are audited against them.
  bacSecretariat: [
    "app.view", "app.consolidate",
    "pr.view", "pr.review",
    "bidding.view", "bidding.publish",
    "bidders.createAccount",
    "contract.view", "contract.draft",
    "budget.view",
  ],

  twgMember: [
    "app.view",
    "pr.view",
    "bidding.view", "bidding.technicalInput",
    "budget.view",
  ],

  departmentRequester: [
    "app.view", "app.create", "app.submit",
    "pr.view", "pr.create",
    "delivery.report",
  ],

  // The Budget Officer keeps the appropriation register: they record what the
  // Sanggunian enacted, and they certify availability against it. Recording the
  // ordinance is a clerical act over a decision already made elsewhere — the
  // system cannot create budget, only reflect it.
  budgetOfficer: [
    "app.view", "app.certify",
    "pr.view", "pr.certify",
    "budget.view", "budget.certify", "budget.manageAppropriations",
    "audit.viewAll",
  ],

  // The Accountant certifies the claim (validity, completeness of supporting
  // documents) and prepares the disbursement voucher. Deliberately NOT granted
  // "payment.release" — the officer who certifies a claim must not also be the
  // one who hands over the money.
  municipalAccountant: ["payment.view", "payment.certify", "budget.view", "audit.viewAll"],

  // The Treasurer holds the funds and releases them against a certified
  // voucher. Deliberately NOT granted "payment.certify", for the same reason
  // in the opposite direction.
  municipalTreasurer: ["payment.view", "payment.release", "budget.view", "audit.viewAll"],

  vendor: ["bidding.submitBid", "contract.sign", "delivery.submitInvoice"],

  // Section 2.2: observers see approved/published records only — never drafts,
  // internal remarks, or pre-award data.
  observer: ["app.viewPublished", "bidding.viewPublished", "contract.viewPublished", "audit.viewPublished"],

  // Section 2.2: full workflow history and logs across all modules, including
  // denied and returned actions.
  internalAuditor: [
    "app.view", "pr.view", "bidding.view", "contract.view", "budget.view",
    "audit.viewAll", "audit.viewLogs", "audit.export",
  ],
};
