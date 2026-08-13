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
    // The third officer Sec. 344 names, and the one this system was missing.
    // The Budget Officer says the appropriation exists; the Accountant makes
    // the entry that encumbers it. One office doing both is the check and the
    // book-keeping in the same pair of hands.
    key: "pr.obligate",
    module: "pr",
    description: "Obligate the appropriation and raise the ORS (LGC Sec. 344)",
  },
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
  { key: "bidding.award", module: "bidding", description: "Approve, disapprove and issue the award" },

  // ── Eligibility of prospective bidders ─────────────────────────────────────
  // GPM Volume 1, "Responsibilities of the BAC", item iv: "Determine the
  // eligibility of prospective bidders." That is the committee's act.
  //
  // The Secretariat's separate duty is "create, maintain and update the registry
  // of suppliers, contractors, and consultants" — record-keeping, not
  // adjudication. It receives the counter submission, checks each document
  // against the requirement it answers, and takes custody of the file; all of
  // that stays on `bidding.publish`.
  //
  // Until now `bidding.publish` also carried the registration-level decision,
  // which meant a support office was making a committee determination on its own
  // signature, with no BAC involvement at all. That is the same defect already
  // corrected for `pr.determineMode`, which moved from the Secretariat to the
  // Chair and Vice-Chair for exactly this reason — the fix simply never reached
  // vendor eligibility.
  {
    key: "vendor.determineEligibility",
    module: "bidding",
    description: "Determine the eligibility of a prospective bidder as the BAC",
  },

  // ── Observers (RA 12009 Sec. 43) ───────────────────────────────────────────
  // Two sides of the same mechanism. The BAC Secretariat maintains the roster
  // and issues the invitations; the observer attends and files the report.
  // Kept apart because a Secretariat that could file the observers' reports
  // would be marking its own committee's homework, which is the exact thing
  // the observer requirement exists to prevent.
  {
    key: "observer.manage",
    module: "bidding",
    description: "Maintain the observer roster and invite observers to BAC proceedings",
  },
  {
    key: "observer.participate",
    module: "bidding",
    description: "Attend BAC proceedings as an invited observer and file observation reports",
  },

  // ── Protest mechanism (RA 12009 Sec. 83–85) ────────────────────────────────
  // Three separate holders because the IRR routes the two stages to two
  // different bodies: a request for reconsideration is decided by the BAC, and
  // only a *denied* request opens a protest to the HoPE. One permission for
  // both would let the committee decide the appeal against its own decision.
  { key: "protest.file", module: "bidding", description: "File a request for reconsideration or protest as a bidder" },
  { key: "protest.resolve", module: "bidding", description: "Decide requests for reconsideration as the BAC" },
  { key: "protest.decide", module: "bidding", description: "Resolve protests as the Head of the Procuring Entity" },

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

  // ── Document templates and generation ──────────────────────────────────────
  // Authoring a template and issuing a document from it are deliberately
  // separate. A template is the wording every future Notice of Award will carry;
  // whoever can rewrite it can change what the municipality says in all of them,
  // which is a heavier power than producing one document from settled wording.
  {
    key: "template.view",
    module: "documents",
    description: "View document templates and their version history",
  },
  {
    key: "template.manage",
    module: "documents",
    description: "Create, edit and archive document templates",
  },
  {
    key: "document.generate",
    module: "documents",
    description: "Generate official documents from procurement records",
  },
  {
    // Approval is what turns a draft into an issued document bearing the
    // municipality's name, so it sits with the office whose name is on it
    // rather than with whoever pressed generate.
    key: "document.approve",
    module: "documents",
    description: "Approve and issue generated documents",
  },
  {
    // Held apart from approval on purpose: putting a document in front of the
    // whole municipality is a second decision, taken after the first.
    key: "document.publish",
    module: "documents",
    description: "Publish approved documents to the public transparency portal",
  },
  {
    key: "document.void",
    module: "documents",
    description: "Void an issued document so a corrected one can be reissued",
  },

  // Audit and transparency
  { key: "audit.viewLogs", module: "audit", description: "View system logs" },
  { key: "audit.viewAll", module: "audit", description: "View full workflow history across modules" },
  { key: "audit.viewPublished", module: "audit", description: "View published transparency records only" },
  { key: "audit.export", module: "audit", description: "Export audit records" },

  // Security monitoring. Deliberately separate from `audit.*`: reading the
  // history of what the system did is a different power from being told what
  // the system thinks went wrong, and the second one carries the ability to
  // close an alert.
  {
    key: "security.view",
    module: "security",
    description: "View security alerts and integrity monitoring status",
  },
  {
    key: "security.manage",
    module: "security",
    description: "Run scans, acknowledge and resolve security alerts, reset the integrity baseline",
  },
];

// Role key → permission keys. Mirrors the Section 2.3 grid row by row; an em
// dash in that grid means the role simply has no entry here.
export const ROLE_PERMISSIONS = {
  systemAdministrator: [
    "template.view", "template.manage",
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
    "security.view", "security.manage",
  ],

  hope: [
    "template.view", "document.approve",
    // The Mayor's own acts in the planning and budgeting chain: naming the
    // year's priorities against the development plan, endorsing the investment
    // program, and approving the executive budget before it goes to the
    // Sanggunian (LGC Sec. 318).
    "planning.view", "planning.setPriorities",
    "budget.approveExecutive",
    "app.view", "app.approve",
    // ── The LGU's signature on a contract is the Mayor's ──────────────────────
    // LGC Sec. 22(c): "No contract may be entered into by the local chief
    // executive in behalf of the local government unit without prior
    // authorization by the sanggunian concerned." The signatory is the local
    // chief executive — not the BAC Chairperson, who held this and should never
    // have: the officer who chairs the committee recommending the award cannot
    // also be the officer who binds the municipality to it.
    "contract.view", "contract.sign",
    "pr.view", "pr.approve",
    "bidding.view", "bidding.approveAlternativeMode", "bidding.award",
    // Sec. 84.1 — "With respect to LGUs, the decision of the local chief
    // executive shall be final." The protest is decided by the HoPE, never by
    // the committee whose decision is being challenged.
    "protest.decide",
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
    "template.view", "document.generate",
    "app.view",
    "pr.view", "pr.determineMode",
    "bidding.view", "bidding.evaluate", "bidding.chairEvaluation",
    // GPM: "Determine the eligibility of prospective bidders" is the BAC's, not
    // the Secretariat's. The Secretariat still receives the submission and
    // checks the papers; the committee decides whether the bidder is eligible.
    "vendor.determineEligibility",
    // GPM, "Responsibilities of the BAC" item xvi: "Invite the Observers
    // required by law to be present during selected stages of the procurement
    // process." Held by the Secretariat alone until now, which meant the
    // Chairperson could open the observers screen and find no way to invite
    // anybody. The Secretariat keeps it too — it makes the arrangements.
    "observer.manage",
    // Sec. 83.1 — the request for reconsideration is decided by the BAC. The
    // protest that may follow is the HoPE's, and is deliberately not here.
    "protest.resolve",
    // The contract is signed for the LGU by the Local Chief Executive, not by
    // the committee that recommended the award — see the note on `hope` below.
    "contract.view",
    "budget.view",
    "audit.viewAll",
  ],

  // ── BAC Vice-Chairperson ───────────────────────────────────────────────────
  // The quorum rule turns on this office: the majority of members constitutes a
  // quorum "provided that the Chairperson or the Vice-Chairperson should be
  // present in all meetings and deliberations". Without the role, a committee
  // whose Chairperson was on leave could never lawfully sit — and the system
  // had no way to express that, so it simply counted heads.
  bacViceChairperson: [
    "app.view",
    "pr.view", "pr.determineMode",
    "bidding.view", "bidding.evaluate", "bidding.chairEvaluation",
    // The office exists so the committee can sit when the Chairperson cannot, so
    // it holds the same two committee acts — otherwise a Vice-Chair presiding in
    // the Chair's absence could neither rule on eligibility nor invite observers.
    "vendor.determineEligibility",
    "observer.manage",
    "protest.resolve",
    "contract.view",
    "budget.view",
    "audit.viewAll",
  ],

  bacMember: [
    "app.view",
    "pr.view",
    "bidding.view", "bidding.evaluate",
    "protest.resolve",
    "budget.view",
  ],

  // The Secretariat receives bidder registrations at the counter, checks each
  // document against the requirement it answers, and keeps the registry. It does
  // NOT determine eligibility — that is `vendor.determineEligibility`, and it
  // belongs to the committee this office supports.
  //
  // It also does NOT hold "bidders.createAccount": approving an accreditation and
  // issuing the credential that follows from it are two acts by two offices, so a
  // verified registration is handed to Admin/IT rather than turned into access
  // here. `bidding.publish` is what admits them to this queue.
  bacSecretariat: [
    "template.view", "template.manage", "document.generate", "document.publish", "document.void",
    "planning.view",
    "app.view", "app.consolidate", "app.revise",
    // The Secretariat prepares and documents; it does not decide. The GPM is
    // explicit that recommending the method of procurement is a responsibility
    // of *the BAC*, and equally explicit that the Secretariat is its support
    // unit. `pr.determineMode` was held here, which let a support office make a
    // committee determination on its own signature — so it has moved to the
    // Chairperson and Vice-Chairperson, who are the committee.
    "pr.view", "pr.review",
    "bidding.view", "bidding.publish",
    // Sec. 43 — the Secretariat keeps the observer roster and issues the
    // invitations, as part of "organize and make all necessary arrangements for
    // the BAC and the TWG meetings and conferences".
    "observer.manage",
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

  // ── Head of Office ─────────────────────────────────────────────────────────
  // Step 15 of the municipal process: the requisition is *prepared* by staff and
  // *endorsed* by the head of the office it comes from. Those are two people —
  // the controller refuses a requester who tries to endorse their own request.
  //
  // Without this role nobody in the system held `pr.endorse` and no department
  // had a head, so every requisition stopped dead at
  // `pendingDepartmentHeadEndorsement` with no officer able to move it.
  //
  // Endorsement is normally decided by *headship* — `Department.headUserId` —
  // rather than by permission; this role is what makes that designation
  // meaningful out of the box, and gives an office head somewhere to work.
  headOfOffice: [
    "document.generate",
    "planning.view",
    "budget.proposeBudget", "budget.view",
    "app.view", "app.create", "app.submit", "app.revise",
    "pr.view", "pr.create", "pr.endorse",
    "delivery.report",
  ],

  departmentRequester: [
    "document.generate",
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
  municipalAccountant: [
    // LGC Sec. 344 — "the local accountant has obligated said appropriation".
    // The Accountant previously had no part in the requisition chain at all,
    // which left the Budget Officer certifying and obligating in one act.
    "pr.view",
    "pr.obligate",
    "payment.view",
    "payment.certify",
    "budget.view",
    "audit.viewAll",
  ],

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

  vendor: [
    "bidding.submitBid",
    "contract.sign",
    "delivery.submitInvoice",
    // Sec. 83 — the bidder's remedy against a decision of the BAC, and under
    // Sec. 85 a precondition to any court action. A system that awards
    // contracts and offers the losing bidder no route to object is not
    // modelling the procurement law, only the happy path through it.
    "protest.file",
  ],

  // Section 2.2: observers see approved/published records only — never drafts,
  // internal remarks, or pre-award data.
  //
  // `observer.participate` is what makes this role the Sec. 43 observer rather
  // than a member of the public with a login: it is the right to be invited to
  // the six stages the BAC must open to observation, to attend them, and to
  // file the observation report the IRR obliges an observer to file.
  observer: [
    "app.viewPublished",
    "bidding.viewPublished",
    "contract.viewPublished",
    "audit.viewPublished",
    "observer.participate",
  ],

  // Section 2.2: full workflow history and logs across all modules, including
  // denied and returned actions.
  internalAuditor: [
    "template.view",
    "planning.view",
    "app.view", "pr.view", "bidding.view", "contract.view", "budget.view",
    "audit.viewAll", "audit.viewLogs", "audit.export",
    "security.view", "security.manage",
  ],
};
