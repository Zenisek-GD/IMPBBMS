// The permission matrix from design doc Section 2.3, enumerated per action.
// Section 2.3 itself says the summary matrix should be maintained as a separate
// per-action access-control table during implementation — this is that table.

export const PERMISSIONS = [
  // Administration
  { key: "users.manage", module: "administration", description: "Create, edit, and deactivate user accounts" },

  // Held separately from users.manage on purpose. Creating a bidder's account is
  // not general user administration — it is the act that converts an approved
  // accreditation into system access.
  //
  // It is deliberately NOT held by the office that performs the accreditation.
  // The BAC Secretariat decides whether a bidder's requirements are complete and
  // valid; Admin/IT decides whether that approval becomes a working credential.
  // One office judging the papers and then issuing the access on its own say-so
  // is a single point at which a bidder could be let into the system without
  // anyone else having seen the file — the same separation-of-duties argument
  // that keeps payment.certify apart from payment.release.
  {
    key: "bidders.createAccount",
    module: "administration",
    description: "Create and invite bidder accounts for registrations the BAC has approved",
  },
  { key: "departments.manage", module: "administration", description: "Create and edit departments" },
  { key: "settings.manage", module: "administration", description: "Change system configuration" },

  // Publishing to the public portal is its own act. An announcement is the one
  // thing in this system that is written by an official and read by the whole
  // municipality without any record behind it to check it against — every other
  // public page is a projection of an approved record. That makes it worth a
  // permission of its own rather than folding it into settings.manage, so the
  // office that advertises procurement can post without also being able to
  // reconfigure the system.
  {
    key: "announcements.manage",
    module: "administration",
    description: "Write, publish, and withdraw public announcements",
  },

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
  // ── The two halves of LGC Sec. 344 ────────────────────────────────────────
  // "No money shall be disbursed unless the local budget officer certifies to
  // the existence of appropriation that has been legally made for the purpose,
  // the local accountant has obligated said appropriation, and the local
  // treasurer certifies to the availability of funds for the purpose."
  //
  // Those are two different officers answering two different questions, and the
  // system previously asked only the first. `pr.certify` is the Budget Officer:
  // is there an appropriation, and is there room left under it? That
  // certification also writes the Obligation. `pr.certifyCash` is the Treasurer:
  // is the money actually in the treasury to pay it?
  //
  // An appropriation can exist in full while the cash to honour it has not been
  // collected — which is precisely the situation the Treasurer's signature
  // exists to catch, and why one permission cannot stand for both.
  { key: "pr.certify", module: "pr", description: "Certify existence of appropriation on requisitions" },
  {
    key: "pr.certifyCash",
    module: "pr",
    description: "Certify availability of funds in the treasury (LGC Sec. 344)",
  },
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
    // Admin/IT is the ONLY holder of this. A bidder's account comes into
    // existence here and nowhere else, after the BAC Secretariat has approved
    // the accreditation — see the note on the permission itself.
    "bidders.createAccount",
    "departments.manage",
    "settings.manage",
    // System updates and maintenance notices are the administrator's to post.
    "announcements.manage",
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

  // The Secretariat reviews bidder registrations and decides whether the
  // requirements are complete and valid. It does NOT hold
  // "bidders.createAccount": approving an accreditation and issuing the
  // credential that follows from it are two acts by two offices, so a verified
  // registration is handed to Admin/IT rather than turned into access here.
  // `bidding.publish` is what admits them to this queue.
  bacSecretariat: [
    "app.view", "app.consolidate",
    "pr.view", "pr.review",
    "bidding.view", "bidding.publish",
    // The office that advertises a procurement is the office that announces it,
    // and it is the same office that will review whoever answers the call.
    "announcements.manage",
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
  // The Treasurer holds the cash. They certify it is there before a requisition
  // proceeds (LGC Sec. 344), and they release it at the end. Deliberately NOT
  // granted "pr.certify": certifying that an appropriation exists is the Budget
  // Officer's act, and one officer answering both questions collapses the
  // control into a single signature.
  municipalTreasurer: [
    "pr.view",
    "pr.certifyCash",
    "payment.view",
    "payment.release",
    "budget.view",
    "audit.viewAll",
  ],

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
