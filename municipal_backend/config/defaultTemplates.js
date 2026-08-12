// ── THE OFFICE'S STARTING SET ────────────────────────────────────────────────
// Eight templates covering the documents the municipality actually issues,
// authored against the real placeholder catalogue so they work the moment the
// system is seeded. They are flagged `isSystemTemplate`, which means a reseed
// refreshes them and leaves anything an official wrote alone.
//
// The wording follows standard Philippine LGU practice but is deliberately
// plain — an office will want to adjust it, and adjusting it is the point of
// the module. What matters is that every fact on the page comes from a token.

const LETTERHEAD = `
<div style="text-align:center; margin-bottom:18pt">
  <div style="font-size:10.5pt">Republic of the Philippines</div>
  <div style="font-size:12pt; font-weight:bold; text-transform:uppercase">{lgu_name}</div>
  <div style="font-size:10pt">{lgu_address}</div>
  <hr style="border:0; border-top:1.5px solid #000; margin-top:8pt">
</div>`;

const SIGNATURE = `
<div class="signature-block" style="margin-top:42pt">
  <div>Very truly yours,</div>
  <div style="margin-top:36pt; font-weight:bold; text-transform:uppercase">{signatory_name}</div>
  <div>{signatory_position}</div>
</div>`;

const FOOTER = `<div style="width:100%; font-size:7.5pt; color:#555; padding:0 20mm; display:flex; justify-content:space-between">
  <span>{document_no}</span><span class="pageNumber"></span> / <span class="totalPages"></span>
</div>`;

// A certificate is a different object from a letter: landscape, ruled border,
// no letterhead rule, and the recipient's name as the largest thing on it.
const certificate = ({ heading, body }) => ({
  bodyHtml: `
<div style="border:3px double #1a3a5c; padding:28pt; text-align:center; height:100%">
  <div style="font-size:11pt; letter-spacing:2px">REPUBLIC OF THE PHILIPPINES</div>
  <div style="font-size:14pt; font-weight:bold; text-transform:uppercase; margin-top:2pt">{lgu_name}</div>
  <div style="font-size:9.5pt">{lgu_address}</div>

  <div style="font-size:26pt; font-weight:bold; letter-spacing:3px; margin:26pt 0 4pt">${heading}</div>
  <div style="font-size:11pt">is hereby awarded to</div>

  <div style="font-size:24pt; font-weight:bold; margin:14pt 0 2pt; text-transform:uppercase">{recipient_name}</div>
  <div style="font-size:11pt; font-style:italic">{recipient_role}</div>

  <div style="font-size:12pt; margin:18pt 40pt 0; line-height:1.7">${body}</div>

  <div style="margin-top:14pt; font-size:11pt">Given this {current_date_long} at {lgu_name}.</div>

  <div style="margin-top:34pt; display:inline-block; text-align:center">
    <div style="font-weight:bold; text-transform:uppercase; border-top:1px solid #000; padding-top:4pt; min-width:260pt">{signatory_name}</div>
    <div style="font-size:10.5pt">{signatory_position}</div>
  </div>
</div>`,
  css: "body { font-family: Georgia, 'Times New Roman', serif; }",
  landscape: true,
  margins: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
});

export const DEFAULT_TEMPLATES = [
  {
    key: "invitation-to-bid-standard",
    name: "Invitation to Bid (standard)",
    documentType: "invitationToBid",
    description:
      "The official invitation for a published solicitation. The public-friendly posting is written separately as an announcement.",
    footerHtml: FOOTER,
    bodyHtml: `${LETTERHEAD}
<h2 style="text-align:center; margin:8pt 0 2pt; letter-spacing:1px">INVITATION TO BID</h2>
<p style="text-align:center; margin-bottom:4pt">for</p>
<p style="text-align:center; font-weight:bold; text-transform:uppercase; margin-bottom:14pt">{project_title}</p>
<p style="text-align:center; margin-bottom:16pt">{procurement_reference_number}</p>

<p style="text-align:justify">1. The <strong>{lgu_name}</strong>, through its approved budget for the current fiscal year,
intends to apply the sum of <strong>{abc_in_words} ({abc})</strong> being the Approved Budget for the Contract (ABC)
to payments under the contract for <strong>{project_title}</strong>. Bids received in excess of the ABC shall be
automatically rejected at bid opening.</p>

<p style="text-align:justify">2. The {lgu_name} now invites bids for the above procurement. Delivery or completion
shall be within the period stated in the bidding documents. Bidders should have completed a contract similar to the
project. The description of an eligible bidder is contained in the bidding documents.</p>

<p style="text-align:justify">3. Bidding will be conducted through open competitive bidding procedures using a
non-discretionary pass/fail criterion, in accordance with <strong>Republic Act No. 12009</strong>, the New Government
Procurement Act, and its Implementing Rules and Regulations. This procurement is undertaken through
<strong>{procurement_mode}</strong> pursuant to {procurement_mode_citation}.</p>

<p style="text-align:justify">4. Interested bidders may obtain further information and inspect the bidding documents
at the address below during office hours.</p>

<h3 style="margin-top:14pt; font-size:12pt">5. Schedule of activities</h3>
<table class="doc-table">
  <tr><th style="width:45%">Activity</th><th>Date and time</th></tr>
  <tr><td>Advertisement / posting</td><td>{publish_date}</td></tr>
  <tr><td>Pre-bid conference</td><td>{prebid_date}</td></tr>
  <tr><td>Deadline for submission of bids</td><td>{submission_deadline}</td></tr>
  <tr><td>Opening of bids</td><td>{bid_opening_date}</td></tr>
</table>

<p style="text-align:justify; margin-top:12pt">6. {bid_security_note} Bids must be duly received by the BAC Secretariat
on or before the deadline stated above. Late bids shall not be accepted.</p>

<p style="text-align:justify">7. The {lgu_name} reserves the right to reject any and all bids, declare a failure of
bidding, or not award the contract at any time prior to contract award, without thereby incurring any liability to the
affected bidder or bidders.</p>

<p style="text-align:justify">8. For further information, please refer to the {office_name},
{lgu_address}.</p>

<p style="margin-top:16pt">Issued this {issued_on}.</p>
${SIGNATURE}`,
  },
  {
    key: "notice-of-award-standard",
    name: "Notice of Award (standard)",
    documentType: "noticeOfAward",
    description: "Issued to the winning bidder once the Mayor has approved the award.",
    footerHtml: FOOTER,
    bodyHtml: `${LETTERHEAD}
<p style="text-align:right">{current_date}</p>
<p style="margin-top:14pt"><strong>{supplier_name}</strong><br>{supplier_address}</p>
<p>Attention: <strong>{supplier_contact_person}</strong></p>
<h2 style="text-align:center; margin:20pt 0 4pt; letter-spacing:1px">NOTICE OF AWARD</h2>
<p style="text-align:center; margin-bottom:18pt">{noa_number}</p>
<p>Sir/Madam:</p>
<p style="text-align:justify">We are pleased to inform you that following the evaluation conducted by the Bids and Awards Committee under
<strong>{procurement_reference_number}</strong> for <strong>{project_title}</strong>, with an Approved Budget for the Contract of {abc},
your bid has been determined to be the {award_basis}.</p>
<p style="text-align:justify">The contract is hereby awarded to your firm in the total amount of
<strong>{award_amount_in_words} ({award_amount})</strong>, procured through {procurement_mode} pursuant to {procurement_mode_citation}.</p>
<p style="text-align:justify">You are required to formally enter into contract with the {lgu_name} and to post the required
performance security within ten (10) calendar days from your receipt of this Notice.</p>
${SIGNATURE}
<div style="margin-top:34pt; border-top:1px solid #000; padding-top:6pt">
  <div style="font-size:10.5pt">Conforme:</div>
  <div style="margin-top:26pt; font-weight:bold">{supplier_contact_person}</div>
  <div style="font-size:10.5pt">{supplier_name} &nbsp;·&nbsp; Date: ______________</div>
</div>`,
  },

  {
    key: "notice-to-proceed-standard",
    name: "Notice to Proceed (standard)",
    documentType: "noticeToProceed",
    description: "Starts contract time. Contract days are counted from its effectivity.",
    footerHtml: FOOTER,
    bodyHtml: `${LETTERHEAD}
<p style="text-align:right">{current_date}</p>
<p style="margin-top:14pt"><strong>{supplier_name}</strong><br>{supplier_address}</p>
<h2 style="text-align:center; margin:20pt 0 4pt; letter-spacing:1px">NOTICE TO PROCEED</h2>
<p style="text-align:center; margin-bottom:18pt">{document_no}</p>
<p>Sir/Madam:</p>
<p style="text-align:justify">Pursuant to Contract No. <strong>{contract_no}</strong> for <strong>{project_title}</strong>
in the amount of {contract_amount_in_words} ({contract_amount}), you are hereby directed to commence work
effective <strong>{effectivity_date}</strong>.</p>
<p style="text-align:justify">The contract period is <strong>{contract_days} calendar days</strong> reckoned from the
effectivity date above, with delivery/completion due not later than <strong>{delivery_deadline}</strong>.
Liquidated damages shall accrue for every day of delay in accordance with the contract.</p>
<p style="text-align:justify">Please acknowledge receipt of this Notice by signing below.</p>
${SIGNATURE}
<div style="margin-top:30pt; border-top:1px solid #000; padding-top:6pt">
  <div style="font-size:10.5pt">Received and acknowledged:</div>
  <div style="margin-top:26pt; font-weight:bold">{supplier_contact_person}</div>
  <div style="font-size:10.5pt">{supplier_name} &nbsp;·&nbsp; Date: ______________</div>
</div>`,
  },

  {
    key: "contract-agreement-standard",
    name: "Contract Agreement (standard)",
    documentType: "contractAgreement",
    description: "The agreement between the municipality and the supplier.",
    footerHtml: FOOTER,
    bodyHtml: `<h2 style="text-align:center; letter-spacing:1px">CONTRACT AGREEMENT</h2>
<p style="text-align:center">{contract_no}</p>
<p style="margin-top:18pt">KNOW ALL MEN BY THESE PRESENTS:</p>
<p style="text-align:justify">This Agreement, made and entered into this {current_date_long}, by and between:</p>
<p style="text-align:justify"><strong>{lgu_name}</strong>, a local government unit duly organized and existing under the laws
of the Republic of the Philippines, with principal office at {lgu_address}, represented in this act by its
Municipal Mayor, <strong>{signatory_name}</strong>, duly authorized by {authorizing_resolution},
hereinafter referred to as the <strong>"PROCURING ENTITY"</strong>;</p>
<p style="text-align:center">— and —</p>
<p style="text-align:justify"><strong>{supplier_name}</strong>, with business address at {supplier_address} and
Taxpayer Identification Number {supplier_tin}, represented in this act by <strong>{supplier_contact_person}</strong>,
hereinafter referred to as the <strong>"SUPPLIER"</strong>;</p>
<p style="text-align:center; margin-top:14pt">WITNESSETH: That —</p>
<p style="text-align:justify"><strong>WHEREAS</strong>, the PROCURING ENTITY conducted {procurement_mode} for
<strong>{project_title}</strong> under {procurement_reference_number} pursuant to {procurement_mode_citation};</p>
<p style="text-align:justify"><strong>WHEREAS</strong>, the award was made to the SUPPLIER under {noa_number} dated {award_date};</p>
<p style="text-align:justify"><strong>NOW THEREFORE</strong>, for and in consideration of the foregoing, the parties agree as follows:</p>
<p style="text-align:justify"><strong>1. Scope.</strong> The SUPPLIER shall furnish {project_title} in accordance with the
bidding documents, which form an integral part of this Agreement.</p>
<p style="text-align:justify"><strong>2. Contract Price.</strong> The PROCURING ENTITY shall pay the SUPPLIER the total sum of
<strong>{contract_amount_in_words} ({contract_amount})</strong>.</p>
<p style="text-align:justify"><strong>3. Period.</strong> Performance shall be completed within {contract_days} calendar days
from receipt of the Notice to Proceed, on or before {delivery_deadline}.</p>
<div style="margin-top:34pt; page-break-inside:avoid">
  <p>IN WITNESS WHEREOF, the parties have signed this Agreement on the date first written above.</p>
  <table style="width:100%; margin-top:30pt"><tr>
    <td style="width:50%; text-align:center; border:0">
      <div style="font-weight:bold; text-transform:uppercase">{signatory_name}</div>
      <div style="font-size:10.5pt">{signatory_position}</div>
      <div style="font-size:10pt; margin-top:2pt">For the Procuring Entity</div>
    </td>
    <td style="width:50%; text-align:center; border:0">
      <div style="font-weight:bold; text-transform:uppercase">{supplier_contact_person}</div>
      <div style="font-size:10.5pt">{supplier_name}</div>
      <div style="font-size:10pt; margin-top:2pt">For the Supplier</div>
    </td>
  </tr></table>
</div>`,
  },

  {
    key: "purchase-request-form",
    name: "Purchase Request form",
    documentType: "purchaseRequest",
    description: "The requisition with its certification and approval boxes.",
    footerHtml: FOOTER,
    bodyHtml: `${LETTERHEAD}
<h2 style="text-align:center; margin-bottom:12pt; letter-spacing:1px">PURCHASE REQUEST</h2>
<table style="width:100%; margin-bottom:10pt; font-size:10.5pt">
  <tr>
    <td style="border:0"><strong>PR No.:</strong> {pr_number}</td>
    <td style="border:0"><strong>Date required:</strong> {pr_date_required}</td>
  </tr>
  <tr>
    <td style="border:0"><strong>Office:</strong> {implementing_office}</td>
    <td style="border:0"><strong>Fund:</strong> {fund_source}</td>
  </tr>
  <tr><td colspan="2" style="border:0"><strong>Purpose:</strong> {pr_purpose}</td></tr>
</table>
{pr_line_items_table}
<p style="text-align:right; margin-top:8pt"><strong>Total: {pr_total}</strong><br>
<span style="font-size:10pt">{pr_total_in_words}</span></p>
<table style="width:100%; margin-top:26pt; font-size:10.5pt; page-break-inside:avoid">
  <tr>
    <td style="width:50%; padding:10pt; vertical-align:top">
      Requested by:<div style="margin-top:28pt; font-weight:bold">{requester_name}</div>
      <div>Requesting Officer</div>
    </td>
    <td style="width:50%; padding:10pt; vertical-align:top">
      Approved by:<div style="margin-top:28pt; font-weight:bold">{signatory_name}</div>
      <div>{signatory_position}</div>
    </td>
  </tr>
</table>`,
  },

  {
    key: "inspection-acceptance-report",
    name: "Inspection and Acceptance Report",
    documentType: "inspectionAcceptanceReport",
    description: "Records what was delivered, inspected and accepted.",
    footerHtml: FOOTER,
    bodyHtml: `${LETTERHEAD}
<h2 style="text-align:center; margin-bottom:12pt; letter-spacing:1px">INSPECTION AND ACCEPTANCE REPORT</h2>
<p style="text-align:center; margin-bottom:16pt">{document_no}</p>
<table style="width:100%; font-size:10.5pt">
  <tr><td style="border:0"><strong>Supplier:</strong> {supplier_name}</td>
      <td style="border:0"><strong>Contract:</strong> {contract_no}</td></tr>
  <tr><td style="border:0"><strong>Project:</strong> {project_title}</td>
      <td style="border:0"><strong>Amount:</strong> {contract_amount}</td></tr>
  <tr><td style="border:0"><strong>Date delivered:</strong> {delivery_date}</td>
      <td style="border:0"><strong>Date inspected:</strong> {inspection_date}</td></tr>
</table>
<h3 style="margin-top:16pt; font-size:12pt">Particulars delivered</h3>
<p style="text-align:justify">{delivery_description}</p>
<h3 style="margin-top:14pt; font-size:12pt">Inspection</h3>
<p style="text-align:justify">{inspection_findings}</p>
<p style="margin-top:10pt"><strong>Result:</strong> {delivery_status}</p>
<table style="width:100%; margin-top:26pt; font-size:10.5pt; page-break-inside:avoid">
  <tr>
    <td style="width:50%; padding:10pt; vertical-align:top">
      Inspected by:<div style="margin-top:28pt; font-weight:bold">{inspector_name}</div>
      <div>Inspecting Officer</div>
    </td>
    <td style="width:50%; padding:10pt; vertical-align:top">
      Accepted by:<div style="margin-top:28pt; font-weight:bold">______________________</div>
      <div>End-user / {implementing_office}</div>
    </td>
  </tr>
</table>`,
  },

  {
    key: "certificate-of-recognition",
    name: "Certificate of Recognition",
    documentType: "certificateOfRecognition",
    description: "Recognises an individual or organisation's contribution.",
    ...certificate({
      heading: "CERTIFICATE OF RECOGNITION",
      body: "in recognition of their invaluable contribution and outstanding support to <strong>{occasion}</strong> held on {occasion_date}.",
    }),
  },
  {
    key: "certificate-of-participation",
    name: "Certificate of Participation",
    documentType: "certificateOfParticipation",
    description: "Confirms attendance or participation in an activity.",
    ...certificate({
      heading: "CERTIFICATE OF PARTICIPATION",
      body: "for having actively participated in <strong>{occasion}</strong> held on {occasion_date}.",
    }),
  },
  {
    key: "certificate-of-appreciation",
    name: "Certificate of Appreciation",
    documentType: "certificateOfAppreciation",
    description: "Thanks a person or body for their support.",
    ...certificate({
      heading: "CERTIFICATE OF APPRECIATION",
      body: "in sincere appreciation of their generous support and cooperation extended to <strong>{occasion}</strong> held on {occasion_date}.",
    }),
  },
];
