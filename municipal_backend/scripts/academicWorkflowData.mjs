import { ACADEMIC_SOLICITATION } from "../services/academicCase.js";
import { computeDeductions } from "../services/deductions.js";

export const year = 2026;
export const papCode = "GSO-2026-014";
export const aipReference = "AIP-GSO-26-028";
export const ordinance = "SO-2026-04";
export const prNumber = "PR-2026-09-041";
export const obligationNo = "ORS-2026-09-067";
export const solicitation = ACADEMIC_SOLICITATION;
export const bacResolution = "BAC-2026-026";
export const noticeOfAward = "NOA-2026-031";
export const contractNo = "CTR-2026-031";
export const purchaseOrder = "PO-2026-10-033";
export const noticeToProceed = "NTP-2026-031";
export const deliveryReceipt = "DR-SP-2026-0168";
export const acceptanceReport = "IAR-2026-11-009";
export const invoiceNo = "INV-2026-11-013";
export const supplierInvoice = "SP-2026-0246";
export const voucher = "DV-2026-11-022";
export const paymentReference = "ADA-2026-11-022";
export const closeoutReference = "FCR-2026-11-008";
export const title = "Supply and Delivery of Filing Cabinets and Records Shelving for the Municipal Records Room";
export const office = "General Services Office";
export const expenseClass = "mooe";
export const fundingLabel = "General Fund · MOOE (semi-expendable furniture and fixtures)";
export const venue = "Municipal Hall, BAC Conference Room";
export const purpose = "Replace warped cabinets and shallow shelving in the municipal records room. Provide secure drawer storage for personnel and property folders, with anchored racks sized for standard archive boxes.";
export const expectedOutput = "Twelve lockable filing cabinets and ten anchored records racks delivered, assembled, inspected, and inventoried in the municipal records room.";

export const items = [
  {
    description: "Four-drawer steel filing cabinet", unit: "unit", quantity: 12,
    unitCost: 18000, offeredUnitCost: 17400,
    technicalSpecifications: "620 mm deep × 470 mm wide × 1,320 mm high, minimum 0.8 mm powder-coated steel, A4/legal suspension rails, anti-tip drawer interlock, and two keys per cabinet.",
  },
  {
    description: "Five-tier adjustable records rack", unit: "unit", quantity: 10,
    unitCost: 10800, offeredUnitCost: 9950,
    technicalSpecifications: "900 mm wide × 450 mm deep × 1,800 mm high, with adjustable shelves rated 120 kg each and floor anchors. Assembly, leveling and anchoring included.",
  },
];
export const abc = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
export const awardAmount = items.reduce((sum, item) => sum + item.quantity * item.offeredUnitCost, 0);
export const savings = abc - awardAmount;

export const at = (day, time) => new Date(year + "-" + day + "T" + time + ":00+08:00");
export const dates = {
  aip: at("09-24", "09:30"), ordinance: at("09-25", "14:00"),
  planRecommended: at("09-28", "09:15"), plan: at("09-28", "13:40"),
  allocationRequested: at("09-28", "14:55"), planPosted: at("09-29", "08:30"),
  allocation: at("09-29", "09:05"), requested: at("09-29", "10:35"),
  cashCertified: at("09-29", "14:20"), requisitionApproved: at("09-30", "09:10"),
  appropriated: at("09-30", "10:05"), obligated: at("09-30", "13:30"),
  mode: at("09-30", "15:20"), schedule: at("10-01", "08:15"),
  posted: at("10-01", "10:00"), prebid: at("10-05", "10:00"),
  closes: at("10-19", "10:00"), opened: at("10-19", "10:15"),
  technical: at("10-19", "15:20"), financial: at("10-20", "09:30"),
  qualificationStart: at("10-21", "09:00"), qualification: at("10-22", "11:20"),
  resolution: at("10-22", "15:10"), award: at("10-23", "09:30"),
  awardReceipt: at("10-23", "14:12"), secured: at("10-26", "09:20"),
  signedLgu: at("10-26", "13:20"), signedVendor: at("10-26", "14:05"),
  proceeds: at("10-26", "15:10"), delivered: at("10-30", "10:25"),
  inspected: at("11-03", "10:40"), invoiced: at("11-03", "14:20"),
  certified: at("11-04", "11:25"), paid: at("11-05", "10:45"),
  closeoutRequested: at("11-05", "13:30"), closed: at("11-05", "15:10"),
};
export const contractDays = 10;
export const deadline = "2026-11-05";
export const bidders = [
  { businessName: "Sapang Pulo Office Fixtures Trading", code: "SPOF", email: "sapangpulo.offers@procurenance.online", address: "Sitio Pinagtipunan, Barangay Sapang Pulo", amount: awardAmount, submittedAt: at("10-16", "13:40"), isVatRegistered: true },
  { businessName: "Maylapat Steel Storage Supply", code: "MSSS", email: "maylapat.offers@procurenance.online", address: "Purok 3, Barangay Maylapat", amount: 315600, submittedAt: at("10-16", "15:15"), isVatRegistered: true },
  { businessName: "Dulong Ilog Industrial Furnishings", code: "DIIF", email: "dulongilog.offers@procurenance.online", address: "Purok Silangan, Barangay Dulong Ilog", amount: 320900, submittedAt: at("10-19", "08:50"), isVatRegistered: true },
];
export const winner = bidders[0];
export const deductions = computeDeductions({
  grossAmount: awardAmount,
  vendor: { ...winner, taxClassification: "goods" },
  contract: { category: "goods", deliveryDeadline: deadline, actualCompletionAt: dates.inspected },
  asOf: dates.certified,
});

export const milestones = [
  ["aip", "planning", "Investment project recorded", aipReference + " · Municipal records-room improvement"],
  ["ordinance", "planning", "Supplemental appropriation enacted", ordinance + " · " + fundingLabel],
  ["plan", "planning", "Final procurement plan approved", papCode + " · General Services Office"],
  ["planPosted", "planning", "Final procurement plan posted", "Procurement schedule and approved budget entered in the final APP"],
  ["allocation", "requisition", "Project funds allocated", "Funding reserved against the supplemental appropriation"],
  ["requested", "requisition", "Purchase requisition submitted", prNumber + " · 12 cabinets and 10 racks"],
  ["obligated", "requisition", "Funds certified and obligation recorded", obligationNo],
  ["mode", "requisition", "Procurement method confirmed", "Competitive bidding · Goods"],
  ["schedule", "solicitation", "Bidding schedule approved", solicitation],
  ["posted", "solicitation", "Invitation to Bid posted", solicitation + " · Bidding documents and technical specifications available"],
  ["prebid", "solicitation", "Pre-bid conference held", "Shelf capacity, anchoring and acceptance requirements clarified"],
  ["opened", "bidding", "Bids opened", "Three bids received by the deadline"],
  ["technical", "evaluation", "Technical evaluation completed", "All three bids met the mandatory requirements"],
  ["financial", "evaluation", "Financial offers opened and ranked", "Offers checked against quantities and approved budget"],
  ["qualification", "evaluation", "Post-qualification completed", "Supplier eligibility, delivery capacity and warranty verified"],
  ["resolution", "award", "BAC recommended award", bacResolution + " · Lowest Calculated Responsive Bid"],
  ["award", "award", "Notice of Award issued", noticeOfAward],
  ["awardReceipt", "award", "Supplier acknowledged award", winner.businessName],
  ["secured", "contract", "Performance security received", "Manager's check equal to five percent of the contract amount"],
  ["signedVendor", "contract", "Purchase order signed", purchaseOrder],
  ["proceeds", "contract", "Notice to Proceed issued", noticeToProceed],
  ["delivered", "completion", "Goods delivered and assembled", deliveryReceipt + " · 22 units received"],
  ["inspected", "completion", "Delivery inspected and accepted", acceptanceReport + " · Full quantities and specifications verified"],
  ["invoiced", "completion", "Supplier invoice received", supplierInvoice],
  ["certified", "completion", "Disbursement voucher certified", voucher],
  ["paid", "completion", "Payment released and contract completed", voucher + " · Full invoiced amount settled with statutory deductions recorded"],
  ["closed", "completion", "Financial closeout approved", closeoutReference + " · Unused allocation recognized as contract savings"],
].map(([date, stage, action, detail]) => ({ occurredAt: dates[date].toISOString(), stage, action, detail }));
