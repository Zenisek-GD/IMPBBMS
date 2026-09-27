const developmentPlanning = {
  id: 'development-plan',
  title: 'Start a Development Plan',
  summary: 'Create a multi-year plan and add its first practical development goal.',
  duration: '0:36',
  video: '/guide-videos/development-planning.mp4',
  poster: '/guide-videos/development-planning-poster.png',
  transcript: [
    'The Planning Officer starts the development plan so the municipality can record the goals that guide later programs and investments.',
    'Open Development Plan and AIP, select New Plan, enter the title and approved plan years, then add each goal with its area and intended result.',
    'Review the details and select Create Plan to save a draft; this does not yet approve the plan.',
    'The draft is now ready for Sangguniang Bayan action, which the Sanggunian Secretary records after the official resolution is issued.',
  ],
}

const recordPlanAdoption = {
  id: 'development-plan-adoption',
  title: 'Record Development Plan Adoption',
  summary: 'Record the Sangguniang Bayan resolution that adopts a drafted development plan.',
  duration: '0:37',
  video: '/guide-videos/development-plan-adoption.mp4',
  poster: '/guide-videos/development-plan-adoption-poster.png',
  transcript: [
    "After the Sangguniang Bayan acts on the Planning Officer's draft, the Sanggunian Secretary records that official adoption in the system.",
    'Find the draft in Development Plan and AIP, review the plan and its goal, then select Adopt.',
    "Enter the approved resolution number and date so the system records the legislature's action rather than treating it as a Secretary approval.",
    'Check both details and select Record.',
    'The plan is now adopted and moves to the HoPE, or Municipal Mayor, for annual priorities.',
  ],
}

const setMayorPriorities = {
  id: 'mayor-priorities',
  title: 'Set the Mayor’s annual priorities',
  summary: 'Rank goals from an adopted development plan for the fiscal year.',
  duration: '0:32',
  video: '/guide-videos/mayor-priorities.mp4',
  poster: '/guide-videos/mayor-priorities-poster.png',
  transcript: [
    'The HoPE, or Municipal Mayor, works from the adopted plan to identify the goals that should advance in this fiscal year.',
    'Open Development Plan and AIP, find the adopted plan, and select Priorities.',
    'Enter the fiscal year, then select each goal in the order it should be ranked.',
    "Review the ranks and select Set Priorities to record the Mayor's direction.",
    'The priorities now guide the Planning Officer when preparing the Annual Investment Program.',
  ],
}

const prepareAnnualInvestmentProgram = {
  id: 'annual-investment-program',
  title: 'Prepare the Annual Investment Program',
  summary: 'Turn the adopted plan and annual priorities into costed, scheduled projects.',
  duration: '0:53',
  video: '/guide-videos/annual-investment-program.mp4',
  poster: '/guide-videos/annual-investment-program-poster.png',
  transcript: [
    "The Planning Officer prepares the Annual Investment Program to turn the adopted plan and the Mayor's priorities into costed projects for the budget process.",
    'On Development Plan and AIP, open Investment Program, select New AIP, and choose an eligible fiscal year tied to the adopted plan.',
    'For each project, select Add Project, enter a clear name, and link it to the right development goal and implementing office.',
    'Enter the estimated cost, then review the expense class, fund, and schedule shown on the form.',
    'Review the details and select Add Project to save the entry in the draft AIP record.',
    'The Planning Officer can then submit the draft for HoPE endorsement; after that, the Sanggunian Secretary records the Sangguniang Bayan adoption.',
  ],
}

const prepareIndicativePpmp = {
  id: 'department-ppmp',
  title: 'Prepare an indicative PPMP',
  summary: 'Record a department procurement need while its budget request is being prepared.',
  duration: '0:49',
  video: '/guide-videos/indicative-ppmp.mp4',
  poster: '/guide-videos/indicative-ppmp-poster.png',
  transcript: [
    'The Department Requester prepares the indicative PPMP while the department budget request is being developed.',
    'Open APP Entries, select New Plan Line, choose Indicative for the fiscal year, and link the adopted investment project.',
    'An ordinance or appropriation line is not used at this stage because the budget has not yet been enacted.',
    'Describe the planned requirement, select its category, enter the estimated cost, and review the proposed method and justification.',
    'Save the draft and select Submit to document the planned procurement need.',
    'The submitted line now moves to the BAC Secretariat for attendance, quorum, and Indicative APP consolidation; this is not the final PR mode determination.',
  ],
}

const consolidateIndicativeApp = {
  id: 'indicative-app',
  title: 'Consolidate the indicative APP',
  summary: 'Record BAC consolidation and the preliminary funding and approval steps.',
  duration: '0:41',
  video: '/guide-videos/indicative-app.mp4',
  poster: '/guide-videos/indicative-app-poster.png',
  transcript: [
    'The BAC Secretariat receives the submitted indicative PPMP and records the BAC action needed for consolidation.',
    'Review the planned procurement details, record only the members who actually attended, and confirm the required quorum.',
    'Select Finalize BAC Action to consolidate the Indicative APP and forward it for funding review.',
    'The Budget Officer reviews the funding basis, then the HoPE, or Municipal Mayor, approves the updated Indicative APP record.',
    'Confirm the plan is Approved and Locked; a Final APP still follows after the budget is enacted.',
  ],
}

const prepareDepartmentBudgetProposal = {
  id: 'department-budget',
  title: 'Prepare a department budget proposal',
  summary: 'Request funding for office needs and connect capital costs to the adopted investment program.',
  duration: '0:46',
  video: '/guide-videos/department-budget-proposal.mp4',
  poster: '/guide-videos/department-budget-proposal-poster.png',
  transcript: [
    'The Department Requester prepares the budget proposal so the requested funding can be reviewed against the municipal plan and available resources.',
    'For the fiscal year, open Budget Preparation and select New Proposal.',
    'Add the requested item, choose its expense class, enter the amount, and link capital requests to the matching AIP project.',
    'Explain the need and save the draft so the department can check the details before forwarding it.',
    'Select Submit Proposal to send the request to the Municipal Budget Council for review.',
    'Confirm the visible Submitted status; the Budget Officer then closes the submission period before the authorized Council review begins.',
  ],
}

const reviewBudgetCouncilProposals = {
  id: 'budget-council',
  title: 'Review proposals at the Budget Council',
  summary: 'Evaluate submitted office requests, record recommended amounts, and complete the Council review.',
  duration: '0:32',
  video: '/guide-videos/budget-council-review.mp4',
  poster: '/guide-videos/budget-council-review-poster.png',
  transcript: [
    'The Budget Officer first closes the proposal submission period so the review uses a stable set of department requests.',
    'In this recording, the Budget Officer is acting as an authorized Municipal Budget Council reviewer.',
    'Review each request against the approved plan and available funding, then enter the recommended amount and clear review notes.',
    "Select Complete Review to send the Council's recommendations to the Planning Officer for consolidation.",
  ],
}

const consolidateBudgetRequests = {
  id: 'planning-consolidation',
  title: 'Consolidate budget requests',
  summary: 'Check Council recommendations against the development plan and Annual Investment Program.',
  duration: '0:29',
  video: '/guide-videos/planning-consolidation.mp4',
  poster: '/guide-videos/planning-consolidation-poster.png',
  transcript: [
    'The Planning Officer receives the completed Municipal Budget Council recommendations for consolidation.',
    'Review each request against the adopted development plan and Annual Investment Program so only programmed needs move forward.',
    'Confirm the matching project, then select Consolidate to prepare the municipal budget for the next review.',
    'The consolidated record now moves to the Local Finance Committee for the budget forum.',
  ],
}

const conductBudgetForum = {
  id: 'budget-forum',
  title: 'Conduct the Local Finance Committee Budget Forum',
  summary: 'Record the forum and set a balanced expenditure ceiling against estimated income.',
  duration: '0:26',
  video: '/guide-videos/budget-forum.mp4',
  poster: '/guide-videos/budget-forum-poster.png',
  transcript: [
    'In this recording, the Budget Officer records the Local Finance Committee budget forum.',
    'Review the proceedings, then enter the estimated municipal income and a balanced expenditure ceiling.',
    'The ceiling must not exceed expected income, which keeps the proposed budget financially supportable.',
    'Select Conclude Forum to move the record to the budget hearing stage.',
  ],
}

const conductBudgetHearing = {
  id: 'budget-hearing',
  title: 'Conduct the budget hearing',
  summary: 'Document the public hearing and advance the reviewed requests to deliberation.',
  duration: '0:27',
  video: '/guide-videos/budget-hearing.mp4',
  poster: '/guide-videos/budget-hearing-poster.png',
  transcript: [
    'An authorized Local Finance Committee member records the budget hearing so the public review is documented with the official meeting details.',
    'Review the proposals and enter the hearing date, venue, and minutes shown in the record.',
    'After checking the documentation, select Conclude Hearings.',
    'The reviewed requests now move to the Budget Officer for final budget deliberation.',
  ],
}

const finaliseBudgetDeliberation = {
  id: 'budget-deliberation',
  title: 'Deliberate and finalize the budget',
  summary: 'Record final proposal figures and send the executive budget for mayoral review.',
  duration: '0:28',
  video: '/guide-videos/budget-deliberation.mp4',
  poster: '/guide-videos/budget-deliberation-poster.png',
  transcript: [
    'After the hearing, the Budget Officer records the final figures for each proposal line.',
    'Check every approved amount against the department request and the expenditure ceiling so the executive budget remains within the documented limits.',
    'Add clear notes and select Finalise Budget to complete the Budget Office action.',
    'The executive budget now moves to the HoPE, or Municipal Mayor, for review and approval.',
  ],
}

const approveExecutiveBudget = {
  id: 'executive-budget-approval',
  title: 'Approve the executive budget',
  summary: 'Review the finalized budget and submit it to the Sangguniang Bayan for action.',
  duration: '0:23',
  video: '/guide-videos/executive-budget-approval.mp4',
  poster: '/guide-videos/executive-budget-approval-poster.png',
  transcript: [
    'The HoPE, or Municipal Mayor, reviews the finalized executive budget and its supporting proposal totals.',
    'Confirm the official figures before selecting Approve and Submit; this records the executive approval needed before legislative action.',
    'The budget package now moves to the Sangguniang Bayan for its action.',
  ],
}

const enactAppropriationOrdinance = {
  id: 'appropriation-ordinance',
  title: 'Record the Enacted Appropriation Ordinance',
  summary: 'Record the Sangguniang Bayan ordinance number and enactment date.',
  duration: '0:29',
  video: '/guide-videos/appropriation-ordinance.mp4',
  poster: '/guide-videos/appropriation-ordinance-poster.png',
  transcript: [
    'After the Sangguniang Bayan has acted on the executive budget, the Sanggunian Secretary records the official Appropriation Ordinance in the system.',
    'Enter the ordinance number and date exactly as issued so the budget record has a traceable legislative basis.',
    'Review the details and select Record Ordinance.',
    'The recorded ordinance now moves to the Sangguniang Panlalawigan for the official legality review.',
  ],
}

const recordProvincialReview = {
  id: 'provincial-review',
  title: 'Record provincial legality review',
  summary: 'Record the official provincial outcome before appropriations are released.',
  duration: '0:31',
  video: '/guide-videos/provincial-review.mp4',
  poster: '/guide-videos/provincial-review-poster.png',
  transcript: [
    'After the Sangguniang Panlalawigan issues its official review, the Sanggunian Secretary records the stated outcome in Budget Preparation.',
    'Select Record Review, choose the outcome shown in the official notice, and enter matching remarks.',
    'Here, the visible outcome is Approved; select Record Review to save the official result.',
    'An approved result enacts the budget and releases the authorized appropriations for the next municipal steps.',
  ],
}

const approveFinalApp = {
  id: 'final-app',
  title: 'Prepare and approve the final APP',
  summary: 'Record an independently scoped procurement package against an adopted AIP project and enacted appropriation.',
  duration: '0:53',
  video: '/guide-videos/final-app.mp4',
  poster: '/guide-videos/final-app-poster.png',
  transcript: [
    'With the budget enacted, the Department Requester opens APP Entries and selects New Plan Line to prepare an authorized Final APP item.',
    'Choose Final APP, the fiscal year, adopted investment project, and ordinance line, then describe the package and enter its approved budget.',
    'Save and submit the line; the proposed method shown here supports planning, while the enforceable PR procurement-mode determination happens later.',
    'The BAC Secretariat records the actual BAC attendance and quorum before consolidating the plan for funding certification.',
    'The Budget Officer certifies the funding basis, and the HoPE, or Municipal Mayor, approves the Final APP record.',
    'Confirm the plan is Approved and Locked before the Department Requester prepares a Purchase Request.',
  ],
}

const preparePurchaseRequest = {
  id: 'purchase-request',
  title: 'Prepare a Purchase Request',
  summary: 'Request the independently scoped examination room equipment set against the approved final APP.',
  duration: '0:42',
  video: '/guide-videos/purchase-request.mp4',
  poster: '/guide-videos/purchase-request-poster.png',
  transcript: [
    'The Department Requester opens Purchase Requisitions and selects New Requisition to request an item against the approved Final APP record.',
    'Choose the authorized APP line, then enter the purpose, required date, item cost, and any long-life equipment detail shown on the form.',
    "Check the total against the available APP balance and save the draft for the department's review.",
    'Select Submit to forward the Purchase Request for a separate Head of Office endorsement.',
    'The designated Head of Office reviews and endorses the request, confirming the department need before the Municipal Treasurer checks cash availability.',
  ],
}

const certifyFunds = {
  id: 'fund-certification',
  title: 'Certify fund availability',
  summary: 'The Treasurer records the availability of funds for the endorsed request.',
  duration: '0:23',
  video: '/guide-videos/fund-certification.mp4',
  poster: '/guide-videos/fund-certification-poster.png',
  transcript: [
    'The Municipal Treasurer receives the endorsed Purchase Request for cash-availability certification.',
    'Review the requested amount and actual available funds, then select Certify Funds Available so the HoPE does not approve an unfunded request.',
    'The certified request now moves to the HoPE, or Municipal Mayor, for approval.',
  ],
}

const approvePurchaseRequest = {
  id: 'request-approval',
  title: 'Approve the Purchase Request',
  summary: 'The Mayor reviews the endorsed request and Treasurer certification.',
  duration: '0:19',
  video: '/guide-videos/request-approval.mp4',
  poster: '/guide-videos/request-approval-poster.png',
  transcript: [
    "The HoPE, or Municipal Mayor, reviews the endorsed Purchase Request together with the Municipal Treasurer's cash certification.",
    'Select Approve Request to record the executive decision and send the request to the Budget Officer for appropriation and funding-source certification.',
  ],
}

const certifyAppropriation = {
  id: 'appropriation-certification',
  title: 'Certify the appropriation and funding source',
  summary: 'Confirm the enacted ordinance line and identify the funding source.',
  duration: '0:24',
  video: '/guide-videos/appropriation-certification.mp4',
  poster: '/guide-videos/appropriation-certification-poster.png',
  transcript: [
    'The Budget Officer checks the enacted appropriation linked to the Final APP and confirms the applicable funding source.',
    'Select Certify Appropriation so the system can verify that a lawful budget authority supports the approved request.',
    'The certified request now moves to the Municipal Accountant for obligation and creation of the ORS record.',
  ],
}

const recordObligation = {
  id: 'obligation-ors',
  title: 'Record the obligation and ORS',
  summary: 'The Accountant obligates the approved amount and records the ORS.',
  duration: '0:24',
  video: '/guide-videos/obligation-ors.mp4',
  poster: '/guide-videos/obligation-ors-poster.png',
  transcript: [
    'The Municipal Accountant receives the appropriation-certified request and records the obligation.',
    'Select Obligate to raise the ORS and reserve the approved amount before procurement action begins.',
    'The record now moves to the BAC Chairperson, or an authorized BAC Vice-Chairperson, for the quorate procurement-method determination.',
  ],
}

const determineProcurementMethod = {
  id: 'procurement-method',
  title: 'Determine the procurement method',
  summary: 'The BAC records a justified mode decision with official attendance and quorum.',
  duration: '0:38',
  video: '/guide-videos/procurement-method.mp4',
  poster: '/guide-videos/procurement-method-poster.png',
  transcript: [
    'The BAC Chairperson, or an authorized BAC Vice-Chairperson, reviews the obligated request against its APP alignment, amount-based guidance, and written justification.',
    'For this independently scoped equipment set, select Small Value Procurement and record the reason for the determination.',
    'Confirm the actual BAC attendees and presiding officer so the system can verify the required quorum.',
    'Select Record Determination; the cleared request now moves to the BAC Secretariat for RFQ preparation and publication.',
  ],
}

const publishProcurementOpportunity = {
  id: 'advertise-procurement',
  title: 'Publish the procurement opportunity',
  summary: 'Prepare an RFQ with fixed specifications and document timing, approve its schedule, and invite qualified suppliers.',
  duration: '0:47',
  video: '/guide-videos/advertise-procurement.mp4',
  poster: '/guide-videos/advertise-procurement-poster.png',
  transcript: [
    'The BAC Secretariat opens RFQ and ITB Management and selects the cleared Purchase Request; the RFQ uses the procurement method already determined for that request.',
    'Enter the fixed technical specifications, the RFQ-required evidence, submission deadline, and opening time so every supplier receives the same terms.',
    'Save the draft and forward its schedule for independent review.',
    'An authorized BAC Chairperson or BAC Vice-Chairperson who did not prepare the schedule reviews and approves the official dates.',
    'The BAC Secretariat then publishes the approved RFQ so verified suppliers can view the fixed requirements before submitting a quotation.',
  ],
}

const receiveOpenQuotations = {
  id: 'bid-submission-opening',
  title: 'Receive and open submissions',
  summary: 'Submit a quotation with required evidence, close at the deadline, and record the scheduled opening.',
  duration: '0:46',
  video: '/guide-videos/bid-submission-opening.mp4',
  poster: '/guide-videos/bid-submission-opening-poster.png',
  transcript: [
    'The Vendor opens the published RFQ and reviews the fixed requirements before preparing a quotation.',
    'Enter the quoted amount and attach only the evidence required by this RFQ; in this training example, the eligibility bundle is required with the quotation.',
    'Confirm the submission with the RFQ-specific verification code before the recorded deadline.',
    'When that deadline arrives, the BAC Secretariat closes submissions so no late quotation can enter the record.',
    'At the scheduled opening time, the BAC Secretariat records only the witnesses who actually attended, opens the quotations, and reviews the Abstract of Quotations for the next evaluation stage.',
  ],
}

const evaluateQuotations = {
  id: 'bid-evaluation',
  title: 'Evaluate quotations',
  summary: 'Review each quotation against the requirements stated in its RFQ and record the supported finding.',
  duration: '0:47',
  video: '/guide-videos/bid-evaluation.mp4',
  poster: '/guide-videos/bid-evaluation-poster.png',
  transcript: [
    'The TWG Member opens Evaluation Workspace and first records a no-conflict declaration, which protects the independence of the technical assessment.',
    'The TWG compares the locked quotation evidence with the published technical requirements and submits its written technical finding.',
    'A separate authorized BAC evaluator then completes the independent compliance checklist and records the BAC evaluation result; the same TWG author cannot perform this review.',
    'Once the required reviews are complete, the BAC Chairperson or BAC Vice-Chairperson records the actual attendees and presiding officer, confirms quorum, and closes the technical evaluation.',
  ],
}

const completePostQualification = {
  id: 'post-qualification',
  title: 'Complete post-qualification',
  summary: 'The BAC Member verifies the highest-ranked technically compliant supplier’s legal, technical, and financial records before a recommendation.',
  duration: '0:37',
  video: '/guide-videos/post-qualification.mp4',
  poster: '/guide-videos/post-qualification-poster.png',
  transcript: [
    'The BAC Member receives the highest-ranked technically compliant supplier for post-qualification.',
    'Open the evaluated quotation and select Verify Supplier, then review the legal, technical, and financial records against the published requirements.',
    'Record specific findings for every check and save the post-qualification result; a failed higher-ranked supplier must be resolved before the next-ranked bid can proceed.',
    'The verified result now moves to the BAC Chairperson or BAC Vice-Chairperson for a quorate recommendation.',
  ],
}

const recommendAward = {
  id: 'bac-recommendation',
  title: 'Recommend the award',
  summary: 'The BAC records its review and recommends the award to the approving officer.',
  duration: '0:31',
  video: '/guide-videos/bac-recommendation.mp4',
  poster: '/guide-videos/bac-recommendation-poster.png',
  transcript: [
    'The BAC Chairperson or BAC Vice-Chairperson reviews the completed evaluation and post-qualification findings before recording the committee recommendation.',
    'Select Recommend Award, then confirm the supplier, quoted amount, actual BAC attendees, and presiding officer so the system can verify quorum.',
    'Finalize the BAC recommendation to send the record to the HoPE, or Municipal Mayor, for an independent decision.',
  ],
}

const approveAward = {
  id: 'award-approval',
  title: 'Review and approve the award',
  summary: 'The Head of the Procuring Entity reviews the BAC recommendation and records the award decision.',
  duration: '0:31',
  video: '/guide-videos/award-approval.mp4',
  poster: '/guide-videos/award-approval-poster.png',
  transcript: [
    'The HoPE, or Municipal Mayor, receives the BAC recommendation for an independent award decision and cannot approve a recommendation they made themselves.',
    'Open the pending recommendation in the award queue and confirm the supplier, amount, verification record, and BAC decision.',
    'Select Approve and Issue Notice of Award to record the final approval.',
    'The award is issued and the procurement moves to contract preparation.',
  ],
}

const recordedGuides = {
  [setMayorPriorities.id]: setMayorPriorities,
  [prepareAnnualInvestmentProgram.id]: prepareAnnualInvestmentProgram,
  [prepareIndicativePpmp.id]: prepareIndicativePpmp,
  [consolidateIndicativeApp.id]: consolidateIndicativeApp,
  [prepareDepartmentBudgetProposal.id]: prepareDepartmentBudgetProposal,
  [reviewBudgetCouncilProposals.id]: reviewBudgetCouncilProposals,
  [consolidateBudgetRequests.id]: consolidateBudgetRequests,
  [conductBudgetForum.id]: conductBudgetForum,
  [conductBudgetHearing.id]: conductBudgetHearing,
  [finaliseBudgetDeliberation.id]: finaliseBudgetDeliberation,
  [approveExecutiveBudget.id]: approveExecutiveBudget,
  [enactAppropriationOrdinance.id]: enactAppropriationOrdinance,
  [recordProvincialReview.id]: recordProvincialReview,
  [approveFinalApp.id]: approveFinalApp,
  [preparePurchaseRequest.id]: preparePurchaseRequest,
  [certifyFunds.id]: certifyFunds,
  [approvePurchaseRequest.id]: approvePurchaseRequest,
  [certifyAppropriation.id]: certifyAppropriation,
  [recordObligation.id]: recordObligation,
  [determineProcurementMethod.id]: determineProcurementMethod,
  [publishProcurementOpportunity.id]: publishProcurementOpportunity,
  [receiveOpenQuotations.id]: receiveOpenQuotations,
  [evaluateQuotations.id]: evaluateQuotations,
  [completePostQualification.id]: completePostQualification,
  [recommendAward.id]: recommendAward,
  [approveAward.id]: approveAward,
}

const GUIDE_SUPPORT = {
  'development-plan': {
    before: 'Agree on the planning period and gather the development goals the municipality needs to record.',
    next: 'The saved draft goes to the Sangguniang Bayan for adoption.',
    check: 'Confirm the plan years and goal description before creating the draft.',
  },
  'development-plan-adoption': {
    before: 'Open a saved draft and have the approved resolution number and date ready.',
    next: 'The Mayor can set annual priorities against the adopted plan.',
    check: 'Match the resolution number and date to the approved record.',
  },
  'mayor-priorities': {
    before: 'Use an adopted development plan and confirm the fiscal year and goals to advance.',
    next: 'Planning uses the ranked priorities when preparing the Annual Investment Program.',
    check: 'Make sure the fiscal year and priority order reflect the Mayor’s approved direction.',
  },
  'annual-investment-program': {
    before: 'Use an adopted plan with annual priorities; gather project costs, schedules, and implementing offices.',
    next: 'Review the draft and required evidence, then submit it for endorsement.',
    check: 'Check that each project is linked to the right goal and office, with reviewed costs and schedule.',
  },
  'department-ppmp': {
    before: 'Prepare the department budget request and identify the related adopted investment project.',
    next: 'Submitted indicative lines are available for BAC consolidation.',
    check: 'Confirm the indicative year, project link, estimated cost, and procurement justification.',
  },
  'indicative-app': {
    before: 'Review submitted indicative PPMP lines and have the BAC meeting attendance details ready.',
    next: 'The final APP follows after the budget is enacted.',
    check: 'Record actual attendance and quorum before finalizing the BAC action.',
  },
  'department-budget': {
    before: 'Gather the office need, proposed amount, expense class, and matching AIP project for capital requests.',
    next: 'Submitted proposals go to the Municipal Budget Council for review.',
    check: 'Check the amount and expense class; link capital requests to the matching AIP project.',
  },
  'budget-council': {
    before: 'Close proposal submissions and review the adopted plan and available funding basis.',
    next: 'Completed Council recommendations go to Planning for consolidation.',
    check: 'Record a recommended amount and review note for each proposal line.',
  },
  'planning-consolidation': {
    before: 'Use the Council recommendations and compare them with the adopted plan and Annual Investment Program.',
    next: 'The Local Finance Committee can proceed to the budget forum.',
    check: 'Resolve mismatches with the adopted plan or AIP before consolidating a request.',
  },
  'budget-forum': {
    before: 'Have the recorded forum proceedings and current municipal income estimates ready.',
    next: 'Concluding the forum moves the budget to public hearings.',
    check: 'Keep the expenditure ceiling at or below estimated municipal income.',
  },
  'budget-hearing': {
    before: 'Gather the reviewed proposals and the hearing date, venue, and minutes.',
    next: 'Concluding the hearings moves the requests to budget deliberation.',
    check: 'Check that the meeting date, venue, and minutes match the official hearing record.',
  },
  'budget-deliberation': {
    before: 'Complete the public hearing and review each request against the expenditure ceiling.',
    next: 'The finalized executive budget goes to the Mayor for review.',
    check: 'Review final amounts against both the request and the expenditure ceiling.',
  },
  'executive-budget-approval': {
    before: 'Review the finalized budget and its supporting proposal totals.',
    next: 'The approved executive budget goes to the Sangguniang Bayan for action.',
    check: 'Confirm the official totals and supporting proposals before approving and submitting.',
  },
  'appropriation-ordinance': {
    before: 'Use the enacted ordinance details and confirm the official ordinance number and date.',
    next: 'The ordinance record proceeds to Sangguniang Panlalawigan legality review.',
    check: 'Copy the ordinance number and enactment date from the official ordinance.',
  },
  'provincial-review': {
    before: 'Have the official provincial review notice and its recorded outcome available.',
    next: 'An approved review releases the authorized appropriations.',
    check: 'Choose the outcome stated in the provincial notice and enter matching remarks.',
  },
  'final-app': {
    before: 'Use the enacted budget, adopted AIP project, ordinance line, and approved procurement plan details.',
    next: 'Once approved and locked, the final APP line can be used for a Purchase Request.',
    check: 'Verify the fiscal year, project, ordinance line, and package cost before submission. The shown method supports Final APP planning; the BAC Chairperson or Vice-Chairperson determines the enforceable procurement method later for the obligated Purchase Request.',
  },
  'purchase-request': {
    before: 'Select an approved final APP line and prepare the purpose, required date, and item cost.',
    next: 'The Head of Office reviews and endorses the request for funding checks.',
    check: 'Confirm the total fits the APP balance and mark long-life equipment correctly.',
  },
  'fund-certification': {
    before: 'Open a submitted, endorsed Purchase Request and verify its amount against available funds.',
    next: 'The certified request goes to the Mayor for approval.',
    check: 'Certify only after confirming the request amount and actual available funds.',
  },
  'request-approval': {
    before: 'Review the endorsed Purchase Request and the Treasurer’s fund certification.',
    next: 'An approved request moves to the Budget Office for appropriation certification.',
    check: 'Confirm the Treasurer’s certification is present and matches the request.',
  },
  'appropriation-certification': {
    before: 'Check the enacted appropriation line linked to the final APP and confirm the funding source.',
    next: 'The certified request moves to the Accountant for obligation.',
    check: 'Use the enacted line and funding source that apply to the approved APP item.',
  },
  'obligation-ors': {
    before: 'Review the approved amount and the Budget Office appropriation certification.',
    next: 'The obligated request goes to the BAC for procurement method determination.',
    check: 'Confirm the obligation amount matches the approved appropriation before creating the ORS.',
  },
  'procurement-method': {
    before: 'Review the Purchase Request, ORS, requirement, and applicable threshold guidance.',
    next: 'The recorded method clears the request for solicitation preparation.',
    check: 'Record the reason, presiding officer, attendees, and quorum with the method decision.',
  },
  'advertise-procurement': {
    before: 'Confirm the procurement method and approved schedule. Complete RFQ criteria and technical terms before publication.',
    next: 'Publication opens the submission period until the recorded deadline.',
    check: 'Do not publish until the schedule is approved and the published details are correct.',
    steps: [
      'The BAC Secretariat opens RFQ / ITB Management and selects the cleared Purchase Request.',
      'The BAC Secretariat completes the fixed technical specifications, RFQ-required evidence, submission deadline, and opening time.',
      'An authorized BAC Chairperson or BAC Vice-Chairperson who did not prepare the schedule reviews and approves the official dates.',
      'The BAC Secretariat selects Publish and verifies the Published status and recorded deadline.',
    ],
  },
  'bid-submission-opening': {
    before: 'Wait for the recorded submission deadline and scheduled opening time; have the witness names ready.',
    next: 'The opened submissions are available for the next evaluation stage.',
    check: 'Record the opening at the scheduled time and enter the witnesses present.',
    steps: [
      'The Vendor opens the published RFQ, checks its fixed requirements, attaches the RFQ-required evidence, and submits with the RFQ-specific verification code before the deadline.',
      'At the recorded deadline, the BAC Secretariat selects Close submissions so late quotations cannot enter the record.',
      'At the scheduled opening time, the BAC Secretariat selects Open quotations or Open bids.',
      'The BAC Secretariat records only the witnesses who actually attended, then checks the resulting Abstract of Quotations or bids.',
    ],
  },
  'bid-evaluation': {
    before: 'Use the opened submissions and the published RFQ requirements. Evaluators must record their conflict-of-interest declaration before participating.',
    next: 'Completed evaluation findings establish which submissions may proceed to verification and the BAC review.',
    check: 'Use the published criteria, record evidence for each finding, and disclose any conflict before participating.',
    steps: [
      'The TWG Member opens Evaluation Workspace and records the required no-conflict declaration.',
      'The TWG compares the locked quotation evidence with the published technical requirements and submits its written technical finding.',
      'A separate authorized BAC evaluator completes the independent compliance checklist; the same TWG author cannot perform this review.',
      'The BAC Chairperson or BAC Vice-Chairperson records actual attendees and presiding officer, confirms quorum, and closes the technical evaluation.',
    ],
  },
  'post-qualification': {
    before: 'Complete evaluation and identify the highest-ranked technically compliant submission. The next-ranked bid may proceed only after a failed post-qualification result.',
    next: 'The verified findings support the BAC award recommendation.',
    check: 'Record document and capability findings against the stated requirements and retain supporting evidence.',
    steps: [
      'The BAC Member opens the evaluated procurement and selects the highest-ranked technically compliant supplier for verification.',
      'The BAC Member selects Verify Supplier and checks the legal, technical, and financial records against the published requirements.',
      'The BAC Member records specific findings and supporting evidence for every check.',
      'If the higher-ranked supplier fails post-qualification, resolve that result before the next-ranked bid may proceed; otherwise submit the result for BAC award recommendation.',
    ],
  },
  'bac-recommendation': {
    before: 'Review the completed evaluation and post-qualification findings, including their supporting records.',
    next: 'The BAC recommendation goes to the Head of the Procuring Entity for decision.',
    check: 'Make sure the recommended supplier and amount agree with the completed review record.',
    steps: [
      'The BAC Chairperson or BAC Vice-Chairperson opens the procurement record and reviews the completed evaluation and post-qualification findings.',
      'The presiding BAC officer selects Recommend Award and records the written basis, recommended supplier, and quoted amount.',
      'The presiding BAC officer records actual BAC attendees and confirms quorum.',
      'The BAC finalizes the recommendation for an independent HoPE decision.',
    ],
  },
  'award-approval': {
    before: 'Review the BAC recommendation, supplier, amount, and supporting approval records.',
    next: 'An issued Notice of Award proceeds to contract preparation.',
    check: 'Confirm the recommendation and required approvals before issuing the Notice of Award.',
    steps: [
      'The HoPE opens the pending recommendation in the Award Queue and reviews the supplier, amount, verification record, and BAC decision.',
      'The HoPE confirms that the supporting record is complete and that the decision is independent of any prior committee action.',
      'The HoPE approves and issues the Notice of Award, or disapproves it with written grounds for BAC review.',
      'The HoPE confirms the recorded decision; an issued Notice of Award moves to contract preparation.',
    ],
  },
}

export const GUIDE_PHASES = [
  {
    id: 'planning',
    title: 'Planning',
    description: 'Indicative PPMP and APP work runs alongside budget preparation.',
    guides: [
      developmentPlanning,
      recordPlanAdoption,
      { id: 'mayor-priorities', title: 'Set the Mayor’s annual priorities', summary: 'Name the priorities for the year against goals in an adopted development plan.' },
      { id: 'annual-investment-program', title: 'Prepare the Annual Investment Program', summary: 'Select and cost the annual projects that carry the adopted plan and priorities into the budget.' },
      { id: 'department-ppmp', title: 'Prepare an indicative PPMP', summary: 'Departments identify planned procurement needs while preparing their budget proposals.' },
      { id: 'indicative-app', title: 'Consolidate the indicative APP', summary: 'Record BAC consolidation, then send the Indicative APP through Budget Officer funding review and HoPE approval before budget enactment.' },
    ],
  },
  {
    id: 'budget-authority',
    title: 'Budget and legal authority',
    guides: [
      { id: 'department-budget', title: 'Prepare a department budget proposal', summary: 'Departments submit requested funding for the programs and services they plan to deliver.' },
      { id: 'budget-council', title: 'Review proposals at the Budget Council', summary: 'The Municipal Budget Council reviews department requests before consolidation.' },
      { id: 'planning-consolidation', title: 'Consolidate budget requests', summary: 'The Planning Office consolidates requests into the municipal budget process.' },
      { id: 'budget-forum', title: 'Conduct the Local Finance Committee Budget Forum', summary: 'Review the fiscal outlook and budget priorities with the Local Finance Committee.' },
      { id: 'budget-hearing', title: 'Conduct the budget hearing', summary: 'Present and review proposals at the budget hearing.' },
      { id: 'budget-deliberation', title: 'Deliberate and finalize the budget', summary: 'Resolve the proposals and prepare the executive budget for approval.' },
      { id: 'executive-budget-approval', title: 'Approve the executive budget', summary: 'The Mayor reviews and approves the proposed executive budget for submission.' },
      { id: 'appropriation-ordinance', title: 'Record the Enacted Appropriation Ordinance', summary: 'The Sanggunian Secretary records the Sangguniang Bayan’s enacted municipal appropriation ordinance.' },
      { id: 'provincial-review', title: 'Record provincial legality review', summary: 'Record the Sangguniang Panlalawigan review before appropriations are treated as authorized.' },
    ],
  },
  {
    id: 'procurement-award',
    title: 'Procurement through award',
    guides: [
      approveFinalApp,
      { id: 'purchase-request', title: 'Prepare a Purchase Request', summary: 'The Department Requester submits a Purchase Request against an approved Final APP; a separate Head of Office endorses it for funding checks.' },
      { id: 'fund-certification', title: 'Certify fund availability', summary: 'The Municipal Treasurer certifies that funds are available for the request.' },
      { id: 'request-approval', title: 'Approve the Purchase Request', summary: 'The Mayor reviews the request after the fund-availability certification.' },
      { id: 'appropriation-certification', title: 'Certify the appropriation and funding source', summary: 'The Budget Office confirms a legal appropriation and identifies its funding source.' },
      { id: 'obligation-ors', title: 'Record the obligation and ORS', summary: 'The Municipal Accountant obligates the appropriation and raises the Obligation Request.' },
      { id: 'procurement-method', title: 'Determine the procurement method', summary: 'The BAC reviews the requirement and determines the legally appropriate procurement method.' },
      publishProcurementOpportunity,
      receiveOpenQuotations,
      evaluateQuotations,
      completePostQualification,
      recommendAward,
      approveAward,
    ],
  },
]

export const ALL_GUIDES = GUIDE_PHASES.flatMap((phase) =>
  phase.guides.map((guide) => ({
    ...guide,
    ...(recordedGuides[guide.id] ?? {}),
    ...(GUIDE_SUPPORT[guide.id] ?? {}),
    phaseId: phase.id,
    phaseTitle: phase.title,
    ready: Boolean(guide.video || recordedGuides[guide.id]?.video),
  }))
)

export const READY_GUIDES = ALL_GUIDES.filter((guide) => guide.ready)
