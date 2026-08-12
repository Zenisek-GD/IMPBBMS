// ── WHAT EACH DOCUMENT IS ABOUT ──────────────────────────────────────────────
// A Notice of Award is about an award; an Inspection and Acceptance Report is
// about a delivery. That mapping decides three things at once: which record the
// generate button appears on, which placeholders can possibly resolve, and
// which permission an officer needs to produce one.
//
// Keeping it in one table rather than scattered through the controller means
// adding a document type is a data change, and means the UI can *tell* an
// officer which fields a template may use instead of leaving them to guess and
// discover the blanks after printing.

// Fields no record can supply, which the officer types when generating. A
// certificate has no procurement record behind it — the recipient and the
// occasion exist only in the officer's head until they are asked for.
const certificateFields = [
  { key: "recipient_name", label: "Recipient name", required: true },
  { key: "recipient_role", label: "Recipient role or company", required: false },
  { key: "occasion", label: "Occasion or activity", required: true },
  { key: "occasion_date", label: "Date of the activity", type: "date", required: false },
];

export const DOCUMENT_TYPE_SOURCES = {
  // The official letter, as distinct from the public announcement.
  //
  // Both describe the same invitation, and keeping them apart is deliberate:
  // the announcement is the public-friendly posting on the transparency portal,
  // written and edited for readers; this is the signed instrument the office
  // files and posts on the bulletin board. Generating the letter from the
  // solicitation means the two cannot quote different figures.
  invitationToBid: {
    entityRef: "rfq",
    entityLabel: "Solicitation (RFQ / ITB)",
    numberPrefix: "ITB",
    permission: "bidding.publish",
    publishable: true,
    manualFields: [
      { key: "issued_on", label: "Date of issue", type: "date", required: false },
    ],
    description: "The official Invitation to Bid letter for a published solicitation.",
  },

  noticeOfAward: {
    entityRef: "award",
    entityLabel: "Award",
    numberPrefix: "NOA",
    permission: "bidding.award",
    publishable: true,
    manualFields: [],
    description: "Issued to the winning bidder once the Mayor approves the award.",
  },
  noticeToProceed: {
    entityRef: "contract",
    entityLabel: "Contract",
    numberPrefix: "NTP",
    permission: "contract.draft",
    publishable: true,
    manualFields: [
      { key: "effectivity_date", label: "Effectivity date", type: "date", required: true },
    ],
    description: "Starts contract time. Contract days are counted from its effectivity.",
  },
  contractAgreement: {
    entityRef: "contract",
    entityLabel: "Contract",
    numberPrefix: "CON",
    permission: "contract.draft",
    publishable: true,
    manualFields: [
      {
        key: "authorizing_resolution",
        label: "Sanggunian resolution authorising the Mayor to sign (LGC Sec. 22(c))",
        required: false,
      },
    ],
    description: "The agreement itself, between the municipality and the supplier.",
  },
  purchaseRequest: {
    entityRef: "pr",
    entityLabel: "Purchase Requisition",
    numberPrefix: "PRF",
    permission: "pr.view",
    publishable: false,
    manualFields: [],
    description: "The requisition form with its certification and approval boxes.",
  },
  inspectionAcceptanceReport: {
    entityRef: "delivery",
    entityLabel: "Delivery",
    numberPrefix: "IAR",
    permission: "delivery.report",
    publishable: false,
    manualFields: [
      { key: "inspection_findings", label: "Inspection findings", required: false },
    ],
    description: "Records what was delivered, inspected and accepted.",
  },

  // The three certificates share a shape: no procurement record behind them,
  // everything supplied by the officer. They are grouped rather than merged
  // because an office wants three separately worded templates, not one with a
  // dropdown.
  certificateOfRecognition: {
    entityRef: null,
    entityLabel: null,
    numberPrefix: "COR",
    permission: "document.generate",
    publishable: false,
    manualFields: certificateFields,
    description: "Recognises an individual or organisation's contribution.",
  },
  certificateOfParticipation: {
    entityRef: null,
    entityLabel: null,
    numberPrefix: "COP",
    permission: "document.generate",
    publishable: false,
    manualFields: certificateFields,
    description: "Confirms attendance or participation in an activity.",
  },
  certificateOfAppreciation: {
    entityRef: null,
    entityLabel: null,
    numberPrefix: "COA",
    permission: "document.generate",
    publishable: false,
    manualFields: certificateFields,
    description: "Thanks a person or body for their support.",
  },

  // The escape hatch. An office will always have a form nobody anticipated, and
  // the alternative to supporting it is that they go back to Word and the
  // system stops being the record of what was issued. It may be attached to any
  // record or to none, and its extra fields are declared on the template.
  other: {
    entityRef: "any",
    entityLabel: "Any record (optional)",
    numberPrefix: "DOC",
    permission: "document.generate",
    publishable: false,
    manualFields: [],
    description: "Any other official document the office issues.",
  },
};

// Which entityRef values a caller may legitimately attach a document to. Used
// to reject a request that names an entity the type does not support, so a
// Notice of Award cannot be generated against a delivery.
export const entityRefFor = (documentType) => DOCUMENT_TYPE_SOURCES[documentType]?.entityRef ?? null;

export const manualFieldsFor = (documentType) =>
  DOCUMENT_TYPE_SOURCES[documentType]?.manualFields ?? [];

export const isPublishableType = (documentType) =>
  Boolean(DOCUMENT_TYPE_SOURCES[documentType]?.publishable);

// ── The placeholder catalogue ────────────────────────────────────────────────
// What the editor's palette shows, grouped so an officer writing a Notice of
// Award is not scrolling past delivery fields. `sources` says which document
// types can actually resolve each one — the editor greys out the rest rather
// than letting somebody insert a token that will always render blank.

const ALL = Object.keys(DOCUMENT_TYPE_SOURCES);
const AWARD_CHAIN = ["noticeOfAward", "noticeToProceed", "contractAgreement", "inspectionAcceptanceReport"];
// An Invitation to Bid is written before any bid exists, so it shares the
// *procurement* fields with the award chain but none of the award or supplier
// ones — there is no supplier yet, which is the point of inviting.
const SOLICITATION_CHAIN = ["invitationToBid", ...AWARD_CHAIN];
const CONTRACT_CHAIN = ["noticeToProceed", "contractAgreement", "inspectionAcceptanceReport"];
const SUPPLIER_CHAIN = [...AWARD_CHAIN];

export const PLACEHOLDER_CATALOGUE = [
  {
    group: "Municipality and issuing office",
    fields: [
      { token: "lgu_name", label: "LGU name", sources: ALL, example: "Municipality of Roxas" },
      { token: "lgu_address", label: "LGU office address", sources: ALL },
      { token: "office_name", label: "Issuing office", sources: ALL, example: "BAC Secretariat" },
      { token: "official_name", label: "Officer generating the document", sources: ALL },
      { token: "official_position", label: "That officer's position", sources: ALL },
      { token: "signatory_name", label: "Signing official for this document", sources: ALL },
      { token: "signatory_position", label: "Signing official's position", sources: ALL },
    ],
  },
  {
    group: "Dates and numbering",
    fields: [
      { token: "current_date", label: "Today", sources: ALL, example: "6 August 2026" },
      { token: "current_date_long", label: "Today, long form", sources: ALL, example: "6th day of August 2026" },
      { token: "current_year", label: "Current year", sources: ALL },
      { token: "document_no", label: "This document's number", sources: ALL, example: "NOA-2026-0001" },
    ],
  },
  {
    group: "Supplier",
    fields: [
      { token: "supplier_name", label: "Supplier / business name", sources: SUPPLIER_CHAIN },
      { token: "supplier_address", label: "Supplier address", sources: SUPPLIER_CHAIN },
      { token: "supplier_tin", label: "Supplier TIN", sources: SUPPLIER_CHAIN },
      { token: "supplier_contact_person", label: "Authorised representative", sources: SUPPLIER_CHAIN },
      { token: "supplier_email", label: "Supplier email", sources: SUPPLIER_CHAIN },
      { token: "supplier_phone", label: "Supplier phone", sources: SUPPLIER_CHAIN },
      { token: "supplier_philgeps_no", label: "PhilGEPS registration number", sources: SUPPLIER_CHAIN },
    ],
  },
  {
    group: "Procurement",
    fields: [
      { token: "project_title", label: "Project / contract title", sources: [...SOLICITATION_CHAIN, "purchaseRequest"] },
      { token: "procurement_reference_number", label: "ITB / RFQ reference", sources: SOLICITATION_CHAIN },
      { token: "abc", label: "Approved Budget for the Contract", sources: SOLICITATION_CHAIN },
      { token: "abc_in_words", label: "ABC in words", sources: SOLICITATION_CHAIN },
      { token: "procurement_mode", label: "Mode of procurement", sources: [...SOLICITATION_CHAIN, "purchaseRequest"] },
      { token: "procurement_mode_citation", label: "Legal basis for the mode", sources: [...SOLICITATION_CHAIN, "purchaseRequest"] },
      { token: "procurement_category", label: "Goods / infrastructure / consulting", sources: SOLICITATION_CHAIN },
      { token: "implementing_office", label: "Implementing / end-user office", sources: [...SOLICITATION_CHAIN, "purchaseRequest"] },
    ],
  },
  {
    group: "Invitation to Bid schedule",
    fields: [
      { token: "publish_date", label: "Date advertised", sources: ["invitationToBid"] },
      { token: "prebid_date", label: "Pre-bid conference", sources: ["invitationToBid"] },
      { token: "submission_deadline", label: "Deadline for submission of bids", sources: ["invitationToBid"] },
      { token: "bid_opening_date", label: "Bid opening", sources: ["invitationToBid"] },
      { token: "bid_security_note", label: "Bid security requirement", sources: ["invitationToBid"] },
      { token: "issued_on", label: "Date of issue", sources: ["invitationToBid"] },
    ],
  },
  {
    group: "Award",
    fields: [
      { token: "noa_number", label: "Notice of Award number", sources: AWARD_CHAIN },
      { token: "award_date", label: "Award date", sources: AWARD_CHAIN },
      { token: "award_date_long", label: "Award date, long form", sources: AWARD_CHAIN },
      { token: "award_amount", label: "Awarded amount", sources: AWARD_CHAIN },
      { token: "award_amount_in_words", label: "Awarded amount in words", sources: AWARD_CHAIN },
      { token: "award_basis", label: "Basis of award", sources: AWARD_CHAIN },
      { token: "bid_amount", label: "Winning bid price", sources: AWARD_CHAIN },
    ],
  },
  {
    group: "Contract",
    fields: [
      { token: "contract_no", label: "Contract number", sources: CONTRACT_CHAIN },
      { token: "contract_amount", label: "Contract amount", sources: CONTRACT_CHAIN },
      { token: "contract_amount_in_words", label: "Contract amount in words", sources: CONTRACT_CHAIN },
      { token: "contract_days", label: "Contract duration in days", sources: CONTRACT_CHAIN },
      { token: "contract_start_date", label: "Start date", sources: CONTRACT_CHAIN },
      { token: "delivery_deadline", label: "Delivery deadline", sources: CONTRACT_CHAIN },
      { token: "notice_to_proceed_date", label: "Notice to Proceed date", sources: CONTRACT_CHAIN },
    ],
  },
  {
    group: "Requisition",
    fields: [
      { token: "pr_number", label: "PR number", sources: ["purchaseRequest", ...AWARD_CHAIN] },
      { token: "pr_purpose", label: "Purpose", sources: ["purchaseRequest"] },
      { token: "pr_total", label: "Requisition total", sources: ["purchaseRequest"] },
      { token: "pr_total_in_words", label: "Requisition total in words", sources: ["purchaseRequest"] },
      { token: "pr_date_required", label: "Date required", sources: ["purchaseRequest"] },
      { token: "requester_name", label: "Requesting officer", sources: ["purchaseRequest"] },
      { token: "fund_source", label: "Funding source", sources: ["purchaseRequest"] },
      { token: "pr_line_items_table", label: "Line items (table)", sources: ["purchaseRequest"], isHtml: true },
    ],
  },
  {
    group: "Delivery and inspection",
    fields: [
      { token: "delivery_date", label: "Date delivered", sources: ["inspectionAcceptanceReport"] },
      { token: "inspection_date", label: "Date inspected", sources: ["inspectionAcceptanceReport"] },
      { token: "delivery_description", label: "What was delivered", sources: ["inspectionAcceptanceReport"] },
      { token: "delivery_status", label: "Acceptance status", sources: ["inspectionAcceptanceReport"] },
      { token: "inspector_name", label: "Inspecting officer", sources: ["inspectionAcceptanceReport"] },
    ],
  },
  {
    group: "Certificates",
    fields: [
      { token: "recipient_name", label: "Recipient", sources: ["certificateOfRecognition", "certificateOfParticipation", "certificateOfAppreciation"] },
      { token: "recipient_role", label: "Recipient role or company", sources: ["certificateOfRecognition", "certificateOfParticipation", "certificateOfAppreciation"] },
      { token: "occasion", label: "Occasion or activity", sources: ["certificateOfRecognition", "certificateOfParticipation", "certificateOfAppreciation"] },
      { token: "occasion_date", label: "Date of the activity", sources: ["certificateOfRecognition", "certificateOfParticipation", "certificateOfAppreciation"] },
    ],
  },
];

// Flat token → definition, for validating what a template references.
export const PLACEHOLDER_INDEX = Object.fromEntries(
  PLACEHOLDER_CATALOGUE.flatMap((group) =>
    group.fields.map((field) => [field.token, { ...field, group: group.group }])
  )
);

// Tokens whose resolved value is HTML (a rendered table) rather than text, and
// which must therefore not be escaped on substitution. Everything else is
// escaped, so a supplier named `Smith & Co <Ltd>` cannot break the document or
// inject markup into it.
export const HTML_TOKENS = new Set(
  Object.entries(PLACEHOLDER_INDEX)
    .filter(([, field]) => field.isHtml)
    .map(([token]) => token)
);

export const placeholdersFor = (documentType) =>
  PLACEHOLDER_CATALOGUE.map((group) => ({
    group: group.group,
    fields: group.fields.filter((field) => field.sources.includes(documentType)),
  })).filter((group) => group.fields.length > 0);
