import * as c from "./academicWorkflowData.mjs";

const money = (amount) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount);
const day = new Intl.DateTimeFormat("en-PH", { dateStyle: "long", timeZone: "Asia/Manila" });
const time = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });
const specRows = c.items.map((item) => [item.quantity + " units · " + item.description, item.technicalSpecifications]);
const pricing = (cost) => c.items.map((item) => [
  item.description, item.quantity + " units × " + money(item[cost]) + " = " + money(item.quantity * item[cost]),
]);
const amountRows = c.bidders.map((bid, i) => [String(i + 1) + ". " + bid.businessName, money(bid.amount)]);
const doc = (entityRef, reference, title, office, issuedAt, intro, rows, note) => ({
  entityRef, reference, title, office, issuedAt, intro, rows, note, filename: reference + ".pdf",
});

export const documents = [
  doc("appEntry", c.aipReference, "Supplemental Investment Program Entry", "Municipal Planning and Development Office", c.dates.aip, c.purpose, [
    ["Implementing office", c.office], ["Program / Activity / Project", c.papCode],
    ["FY 2026 funding", c.fundingLabel + " · " + money(c.abc)],
    ["Expected output", c.expectedOutput],
  ], "Proposed for supplemental funding under the municipal records management program."),
  doc("appEntry", c.ordinance, "Supplemental Appropriation Schedule", "Office of the Secretary to the Sanggunian", c.dates.ordinance,
    "Schedule of funds approved for semi-expendable records-room furniture and fixtures.", [
      ["Investment program reference", c.aipReference], ["Program / Activity / Project", c.papCode],
      ["Office", c.office], ["Source and classification", c.fundingLabel],
      ["Authorized amount", money(c.abc)],
    ], "Expenditure is limited to the procurement and installation of the cabinets and racks listed in the investment program."),
  doc("appEntry", "APP-" + c.papCode, "Final Annual Procurement Plan Entry", "BAC Secretariat", c.dates.plan,
    "Procurement plan approved for the General Services Office under the supplemental appropriation.", [
      ["Funding authority", c.ordinance + " · " + c.aipReference],
      ["Method and budget", "Competitive bidding · " + money(c.abc)],
      ["Schedule", "Planning and requisition in Q3. Solicitation, delivery and closeout in Q4."],
      ...pricing("unitCost"), ["Posted", time.format(c.dates.planPosted)],
    ], "Award basis: Lowest Calculated Responsive Bid, subject to technical compliance and post-qualification."),
  doc("pr", c.prNumber, "Purchase Requisition and Obligation", c.office, c.dates.obligated, c.purpose, [
    ["Requested", time.format(c.dates.requested)], ["Funding", c.ordinance + " · " + c.obligationNo],
    ...pricing("unitCost"), ["Estimated total", money(c.abc)],
    ["Approved requisition", time.format(c.dates.requisitionApproved)],
  ], "The final obligation was adjusted to the awarded purchase amount when the order was placed."),
  doc("rfq", c.solicitation, "Invitation to Bid and Technical Specifications", "BAC Secretariat", c.dates.posted,
    "Sealed bids are invited for one lot of records storage furniture, including delivery, assembly, and anchoring.", [
      ["Approved budget", money(c.abc)], ["Pre-bid conference", time.format(c.dates.prebid) + " · " + c.venue],
      ["Deadline for receipt of bids", time.format(c.dates.closes)], ["Opening of bids", time.format(c.dates.opened) + " · " + c.venue],
      ...specRows,
    ], "Price both lines on a delivered and installed basis. Submit eligibility documents, a signed technical compliance schedule, bid security, and a separate financial offer."),
  doc("rfq", c.solicitation + "-PREBID", "Minutes of the Pre-bid Conference", "BAC Secretariat", c.dates.prebid,
    "The Secretariat presented the requirements for the records room and took questions on installation and acceptance.", [
      ["Shelf rating", "120 kg per shelf is the uniformly distributed working load. State the load rating in the offer."],
      ["Anchoring", "The supplier provides anchors and coordinates drilling with the Records Custodian."],
      ["Inspection", "Cabinet locks, drawer safety stops, shelf dimensions and anchoring will be checked on site."],
      ["Submission deadline", time.format(c.dates.closes)],
    ], "The approved quantities, budget, and bid submission deadline were retained."),
  doc("rfq", c.solicitation + "-AB", "Abstract of Bids", "Bids and Awards Committee", c.dates.financial,
    "Three sealed bids were received before the deadline. The BAC opened the financial offers after technical compliance was confirmed.", [
      ["Bid opening", time.format(c.dates.opened)], ["Approved budget", money(c.abc)],
      ...amountRows, ["Ranking result", c.winner.businessName + " ranked first and proceeded to post-qualification."],
    ], "Evaluated prices include delivery, assembly, anchors and taxes."),
  doc("rfq", c.solicitation + "-PQ", "Post-qualification Report", "Bids and Awards Committee", c.dates.qualification,
    "The BAC verified the lowest calculated bid against the originals and the supplier’s delivery commitments.", [
      ["Supplier", c.winner.businessName], ["Eligibility and bid security", "Business registration, current permit, PhilGEPS status, and signed bid securing declaration checked."],
      ["Product compliance", "Cabinet data sheets and manufacturer load chart matched the offered units. Mounting hardware included."],
      ["Capacity and warranty", "Stock availability and installation schedule confirmed. One-year workmanship warranty included."],
      ["Result", "Passed. Recommend award at " + money(c.awardAmount) + "."],
    ], "Findings complete for the first-ranked bidder. No post-qualification of the higher-priced bids was required."),
  doc("award", c.bacResolution, "BAC Resolution Recommending Award", "Bids and Awards Committee", c.dates.resolution,
    "After reviewing the abstract and the post-qualification findings, the BAC recommends award for the lot described in " + c.solicitation + ".", [
      ["Project reference", c.papCode], ["Recommended awardee", c.winner.businessName],
      ["Award basis", "Lowest Calculated Responsive Bid"], ["Recommended amount", money(c.awardAmount)],
      ["Supporting records", c.solicitation + "-AB and " + c.solicitation + "-PQ"],
    ], "Decision recorded with quorum and endorsed to the Head of the Procuring Entity."),
  doc("award", c.noticeOfAward, "Notice of Award and Acknowledgment", "Office of the Head of the Procuring Entity", c.dates.award,
    "The lot for records-room filing cabinets and shelving is awarded to " + c.winner.businessName + ".", [
      ["Reference", c.solicitation + " · " + c.bacResolution], ["Award amount", money(c.awardAmount)],
      ["Acknowledged by supplier", time.format(c.dates.awardReceipt)],
      ["Next step", "Submit performance security and execute the purchase order before the Notice to Proceed."],
    ]),
  doc("contract", c.purchaseOrder, "Purchase Order and Delivery Terms", c.office, c.dates.signedVendor,
    "Furnish and install the listed items at the municipal records room.", [
      ["Contract and award", c.contractNo + " · " + c.noticeOfAward], ["Supplier", c.winner.businessName],
      ...pricing("offeredUnitCost"), ["Total order price", money(c.awardAmount)],
      ["Performance security", "Manager’s check received " + day.format(c.dates.secured) + " · " + money(c.awardAmount * 0.05)],
      ["Delivery and acceptance", "Deliver within " + c.contractDays + " calendar days of the Notice to Proceed. Payment follows acceptance and invoice certification."],
    ], "Warranty: one year for workmanship, locks, drawer mechanisms and rack stability from acceptance."),
  doc("contract", c.noticeToProceed, "Notice to Proceed", c.office, c.dates.proceeds,
    "Proceed with fabrication release, delivery, assembly, leveling and anchoring under the signed purchase order.", [
      ["Supplier", c.winner.businessName], ["Contract / Order", c.contractNo + " · " + c.purchaseOrder],
      ["Delivery point", "Municipal Hall, Records Room · coordinate with the Records Custodian"],
      ["Delivery deadline", c.deadline], ["Contract amount", money(c.awardAmount)],
    ]),
  doc("delivery", c.acceptanceReport, "Inspection and Acceptance Report", c.office, c.dates.inspected,
    "The inspection team checked the delivered furniture against the purchase order and accepted all items.", [
      ["Delivered", time.format(c.dates.delivered) + " · " + c.deliveryReceipt],
      ["Cabinets", "12 accepted. Locks, keys, drawer stops and anti-tip mechanisms checked. Property tags GSO-FC-26-091 through 102."],
      ["Records racks", "10 accepted. Units leveled and anchored with all 50 shelves installed. Property tags GSO-RS-26-043 through 052."],
      ["Accepted value", money(c.awardAmount)], ["Purchase order", c.purchaseOrder],
    ], "No shortages or defects recorded. Warranty documents turned over to the Records Custodian."),
  doc("invoice", c.supplierInvoice, "Supplier Invoice", c.winner.businessName, c.dates.invoiced,
    "Invoice for the delivery and installation accepted under " + c.acceptanceReport + ".", [
      ["Bill to", c.office], ["Purchase order", c.purchaseOrder], ["Delivery reference", c.deliveryReceipt],
      ...pricing("offeredUnitCost"), ["Gross invoice amount", money(c.awardAmount)],
    ], "Payment subject to applicable withholding."),
  doc("payment", c.voucher, "Disbursement Voucher and Payment Advice", "Municipal Accounting and Treasury Offices", c.dates.paid,
    "Payment of the accepted supply and installation under " + c.purchaseOrder + ".", [
      ["Payee", c.winner.businessName], ["Invoice and acceptance", c.supplierInvoice + " · " + c.acceptanceReport],
      ["Gross expenditure", money(c.deductions.grossAmount)],
      ...c.deductions.breakdown.lines.map(({ label, amount }) => [label, money(amount)]),
      ["Net paid", money(c.deductions.netAmount)], ["Certified", time.format(c.dates.certified)],
      ["Payment advice", c.paymentReference],
    ], "The voucher records the net supplier payment and the corresponding tax withholding."),
  doc("appEntry", c.closeoutReference, "Financial Closeout and Contract Savings", "Municipal Budget Office", c.dates.closed,
    "Delivery acceptance and payment were checked against the obligation and purchase order. The unused balance is recorded as contract savings.", [
      ["Contract and voucher", c.contractNo + " · " + c.voucher], ["Project allocation", money(c.abc)],
      ["Gross expenditure", money(c.awardAmount)], ["Unpaid supplier balance", money(0)],
      ["Approved contract savings", money(c.savings)], ["Appropriation", c.ordinance],
    ], "Statutory withholding remains recorded separately from supplier settlement and contract savings."),
  ...c.bidders.map((bid, i) => doc("bid" + i, c.solicitation + "-" + bid.code, "Sealed Bid Submission Record", bid.businessName, bid.submittedAt,
    "Offer for the complete lot of records-room cabinets and shelving under " + c.solicitation + ".", [
      ["Technical envelope", "Eligibility package and bid securing declaration enclosed."],
      ["Scope", "12 steel cabinets and 10 adjustable racks. Delivery, assembly, and anchoring are included."],
      ["Financial offer", money(bid.amount)], ["Delivery period", "Within " + c.contractDays + " calendar days of the Notice to Proceed."],
      ["Bidder contact", bid.email],
    ])),
];

const escape = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function documentHtml(record) {
  const rows = record.rows.map(([label, value]) => "<tr><th>" + escape(label) + "</th><td>" + escape(value) + "</td></tr>").join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(record.title)}</title>
<style>
  body { color: #192431; font: 11pt/1.45 Arial, sans-serif; margin: 0; }
  header { border-bottom: 2px solid #23384d; padding-bottom: 14px; }
  .office { font-weight: bold; color: #23384d; }
  h1 { font-size: 21pt; line-height: 1.12; margin: 14px 0 8px; }
  .reference { color: #39495a; font-size: 10pt; }
  h2 { font-size: 12pt; margin: 21px 0 8px; }
  p { margin: 12px 0 16px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 8px 9px; border: 1px solid #ccd3db; text-align: left; vertical-align: top; }
  th { width: 28%; background: #f2f5f7; }
  tr { break-inside: avoid; }
  footer { margin-top: 16px; font-size: 10pt; color: #39495a; }
</style></head><body>
<header><div class="office">${escape(record.office)}</div><h1>${escape(record.title)}</h1><div class="reference">${escape(record.reference)} · ${day.format(record.issuedAt)}</div></header>
<h2>${escape(c.title)}</h2><p>${escape(record.intro)}</p>
<table><tbody>${rows}</tbody></table>
${record.note ? "<footer>" + escape(record.note) + "</footer>" : ""}
</body></html>`;
}
