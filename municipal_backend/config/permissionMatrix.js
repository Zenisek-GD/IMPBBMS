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

  // ── Development planning ───────────────────────────────────────────────────
  // The layer above procurement: the Comprehensive Development Plan, the
  // Mayor's priorities for the year, and the Annual Investment Program that
  // turns them into a costed list of projects. Nothing in the budget or the
  // procurement plan is supposed to exist without a line here to trace to.
  { key: "planning.view", module: "planning", description: "View development plans and investment programs" },
  {
    key: "planning.manageCdp",
    module: "planning",
    description: "Prepare and maintain the Comprehensive Development Plan and its goals",
  },
  {
    // Held by the Local Chief Executive alone. Naming the year's priorities is
    // an executive act over a plan somebody else wrote, which is why it is not
    // folded into planning.manageCdp.
    key: "planning.setPriorities",
    module: "planning",
    description: "Set the Mayor's priority goals and endorse the investment program",
  },
  { key: "planning.manageAip", module: "planning", description: "Prepare the Annual Investment Program" },
  {
    key: "planning.adoptAip",
    module: "planning",
    description: "Record the Sanggunian's adoption of the investment program",
  },

  // Annual Procurement Plan
  { key: "app.view", module: "app", description: "View APP entries" },
  { key: "app.viewPublished", module: "app", description: "View approved/published APP entries only" },
  { key: "app.create", module: "app", description: "Create and edit own APP entries" },
  { key: "app.submit", module: "app", description: "Submit APP entries for consolidation" },
  { key: "app.consolidate", module: "app", description: "Consolidate departmental APP entries" },
  { key: "app.certify", module: "app", description: "Certify funding on APP entries" },
  { key: "app.approve", module: "app", description: "Approve or return the APP" },
  {
    // An approved APP entry is locked, which was correct while nothing ever
    // changed. Projects do get cancelled or rescoped mid-year, and the
    // municipality's own process says the PPMP is revised when that happens —
    // so there has to be a way back that is a recorded act rather than a
    // database edit.
    key: "app.revise",
    module: "app",
    description: "Reopen or cancel an approved APP/PPMP line when a project changes",
  },

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
  // No longer a stage in the requisition chain — the Secretariat's act on a
  // requisition is now the mode determination below. This remains the
  // Secretariat's general handle on requisition-adjacent work (flagging and
  // resolving pending items), which is what still checks it.
  { key: "pr.review", module: "pr", description: "Handle requisition pending items as Secretariat" },
  { key: "pr.approve", module: "pr", description: "Give final approval on requisitions" },
  {
    // Step 19 of the municipal process: the BAC decides *how* the requisition
    // will be procured. This used to happen implicitly when the Secretariat
    // created an RFQ and picked a mode on the form, which meant the decision
    // had no record of its own, no justification requirement, and no moment at
    // which the committee could be said to have made it.
    key: "pr.determineMode",
    module: "pr",
    description: "Determine the mode of procurement for an approved requisition",
  },

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

  // ── Budget preparation and authorisation ───────────────────────────────────
  // One permission per body that acts on the budget, because the whole point of
  // the sequence is that several different offices see it. A single
  // "budget.manage" would have let one officer walk a budget from proposal to
  // ordinance without anyone else in the chain.
  {
    key: "budget.proposeBudget",
    module: "budget",
    description: "Prepare and submit an office's budget proposal",
  },
  {
    key: "budget.prepareExecutive",
    module: "budget",
    description: "Open a fiscal year for proposals and administer the budget calendar",
  },
  {
    // Municipal Budget Council membership is expressed by holding this, so the
    // council's composition is an administrative matter rather than a code
    // change — the LGC does not fix its membership the way it fixes the LFC's.
    key: "budget.reviewProposal",
    module: "budget",
    description: "Review departmental budget proposals as the Municipal Budget Council",
  },
  {
    key: "budget.consolidateProposals",
    module: "budget",
    description: "Consolidate proposals against the development plan (Planning Office)",
  },
  // The next two are the Local Finance Committee's. LGC Sec. 316 fixes its
  // membership — the Planning and Development Coordinator, the Budget Officer
  // and the Treasurer — so all three hold both, and no one else does.
  {
    key: "budget.conductForum",
    module: "budget",
    description: "Conduct the budget forum and set income estimates and ceilings (LFC)",
  },
  {
    key: "budget.conductHearing",
    module: "budget",
    description: "Conduct budget hearings and record their minutes (LFC)",
  },
  {
    key: "budget.finaliseExecutive",
    module: "budget",
    description: "Strike the final figures and assemble the executive budget",
  },
  {
    key: "budget.approveExecutive",
    module: "budget",
    description: "Approve the executive budget and submit it to the Sanggunian (LGC Sec. 318)",
  },
  {
    key: "budget.enactOrdinance",
    module: "budget",
    description: "Record the Sangguniang Bayan's Appropriation Ordinance (LGC Sec. 319)",
  },
  {
    key: "budget.recordProvincialReview",
    module: "budget",
    description: "Record the Sangguniang Panlalawigan's review of the ordinance (LGC Sec. 327)",
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
    // The Mayor's own acts in the planning and budgeting chain: naming the
    // year's priorities against the development plan, endorsing the investment
    // program, and approving the executive budget before it goes to the
    // Sanggunian (LGC Sec. 318).
    "planning.view", "planning.setPriorities",
    "budget.approveExecutive",
    "app.view", "app.approve",
    "pr.view", "pr.approve",
    "bidding.view", "bidding.approveAlternativeMode", "bidding.award",
    "budget.view",
    "audit.viewAll",
  ],

  // ── Municipal Planning and Development Office ──────────────────────────────
  // The office that writes the development plan and the investment program, and
  // the office that consolidates departmental budget requests against them. It
  // is also one of the three statutory members of the Local Finance Committee
  // (LGC Sec. 316), which is why it holds the forum and hearing permissions.
  //
  // Deliberately holds no procurement permission at all: planning what the
  // municipality will do is a different job from buying it.
  planningOfficer: [
    "planning.view", "planning.manageCdp", "planning.manageAip",
    "app.view",
    "budget.view",
    "budget.reviewProposal",
    "budget.consolidateProposals",
    "budget.conductForum", "budget.conductHearing",
    "audit.viewAll",
  ],

  // ── Office of the Sangguniang Bayan ────────────────────────────────────────
  // The legislature's clerk of record. This role does not *decide* anything —
  // it records what the Sanggunian resolved and what the province did with the
  // ordinance afterwards. Modelled this way because the Sanggunian and the
  // Sangguniang Panlalawigan are bodies outside this system; what belongs in
  // the system is the minute of their action, entered by the officer who keeps
  // it, so the appropriation can be traced to an ordinance rather than to a
  // Budget Officer's keyboard.
  sanggunianSecretary: [
    "planning.view", "planning.adoptAip",
    "app.view",
    "budget.view",
    "budget.enactOrdinance",
    "budget.recordProvincialReview",
    "audit.viewAll",
  ],

  // NOTE: deliberately NOT granted "bidding.award". Section 2.3 reads "Chair
  // evaluation & award" for this role and "Approve alt. modes / Award" for the
  // HOPE — the committee *recommends* the award, the Mayor *approves* it.
  // Granting both here would let the Chairperson approve their own
  // recommendation and collapse that separation of duties.
  bacChairperson: [
    "app.view",
    "pr.view", "pr.determineMode",
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
    "planning.view",
    "app.view", "app.consolidate", "app.revise",
    // Step 19: the Secretariat determines the mode against the ABC thresholds
    // and documents it. The Chairperson holds the same permission, since the
    // determination is the committee's.
    "pr.view", "pr.review", "pr.determineMode",
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
    // An office prepares its own budget request (step 6) using the same account
    // it uses to file its PPMP lines and requisitions. The three are the same
    // office's work at three different points in the year.
    "planning.view",
    "budget.proposeBudget", "budget.view",
    "app.view", "app.create", "app.submit", "app.revise",
    "pr.view", "pr.create",
    "delivery.report",
  ],

  // The Budget Officer keeps the appropriation register: they record what the
  // Sanggunian enacted, and they certify availability against it. Recording the
  // ordinance is a clerical act over a decision already made elsewhere — the
  // system cannot create budget, only reflect it.
  budgetOfficer: [
    "planning.view",
    "app.view", "app.certify",
    "pr.view", "pr.certify",
    "budget.view", "budget.certify", "budget.manageAppropriations",
    // The Budget Office runs the budget calendar, sits on the Budget Council,
    // is one of the three Local Finance Committee members (LGC Sec. 316), and
    // assembles the executive budget the Mayor signs. What it deliberately
    // cannot do is approve that budget or enact it — those belong to the Mayor
    // and the Sanggunian, and holding all three would put the entire
    // authorisation chain in one office.
    "budget.prepareExecutive",
    "budget.reviewProposal",
    "budget.conductForum", "budget.conductHearing",
    "budget.finaliseExecutive",
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
    "planning.view",
    "pr.view",
    "pr.certifyCash",
    "payment.view",
    "payment.release",
    "budget.view",
    // Third statutory member of the Local Finance Committee (LGC Sec. 316).
    // The Treasurer is the officer who knows what the LGU will actually
    // collect, which is why the income estimate the forum works from is not
    // the Budget Office's alone.
    "budget.conductForum", "budget.conductHearing",
    "audit.viewAll",
  ],

  vendor: ["bidding.submitBid", "contract.sign", "delivery.submitInvoice"],

  // Section 2.2: observers see approved/published records only — never drafts,
  // internal remarks, or pre-award data.
  observer: ["app.viewPublished", "bidding.viewPublished", "contract.viewPublished", "audit.viewPublished"],

  // Section 2.2: full workflow history and logs across all modules, including
  // denied and returned actions.
  internalAuditor: [
    "planning.view",
    "app.view", "pr.view", "bidding.view", "contract.view", "budget.view",
    "audit.viewAll", "audit.viewLogs", "audit.export",
  ],
};
