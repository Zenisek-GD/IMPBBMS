import { Award, Rfq, Bid } from "../models/biddingModel.js";
import { Contract, Delivery } from "../models/contractModel.js";
import { PrHeader, PrLineItem } from "../models/prModel.js";
import { AppEntry } from "../models/appEntryModel.js";
import { Vendor } from "../models/vendorModel.js";
import { ProcurementMode } from "../models/procurementModeModel.js";
import { Department } from "../models/departmentModel.js";
import { User } from "../models/userModel.js";
import { Role } from "../models/roleModel.js";
import { getLguProfile } from "../models/systemSettingModel.js";
import { entityRefFor, manualFieldsFor } from "./documentTypes.js";
import { amountInWords, formatPeso, formatDate, formatLongDate } from "./amountInWords.js";

// ── FROM RECORDS TO PLACEHOLDER VALUES ───────────────────────────────────────
// The point of the whole module: an officer should never retype a supplier's
// name onto a Notice of Award, because the name is already on file and the
// version they would retype is the one that might be wrong.
//
// Everything here is read-only. A resolver that could write would be a way to
// change a procurement record by generating a document from it.

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// The Local Chief Executive signs notices, contracts and certificates. Resolved
// from the role rather than stored on each document, so a change of Mayor does
// not require touching any template — and looked up live rather than cached,
// because a document generated after an election must bear the current name.
const findLocalChiefExecutive = async () => {
  const role = await Role.findOne({ where: { key: "hope" } });
  if (!role) return null;
  // No association include: only the name is used, and User→Department is
  // registered under the default `Department` alias rather than `department`,
  // so asking for the wrong one throws rather than returning nothing.
  return User.findOne({
    where: { roleId: role.id, status: "active" },
    order: [["id", "ASC"]],
  });
};

const personName = (user) => user?.name ?? "";

const lineItemsTable = (items = []) => {
  if (items.length === 0) return "";
  const rows = items
    .map(
      (item, index) => `
      <tr>
        <td style="text-align:center">${index + 1}</td>
        <td>${escapeHtml(item.description)}</td>
        <td style="text-align:center">${escapeHtml(item.unit ?? "")}</td>
        <td style="text-align:right">${Number(item.quantity).toLocaleString("en-PH")}</td>
        <td style="text-align:right">${formatPeso(item.unitCost)}</td>
        <td style="text-align:right">${formatPeso(item.lineTotal)}</td>
      </tr>`
    )
    .join("");

  return `<table class="doc-table"><thead><tr>
      <th>#</th><th>Description</th><th>Unit</th><th>Qty</th><th>Unit cost</th><th>Amount</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
};

// ── Record loaders, each pulling the whole chain the document may need ───────

const loadAward = (id) =>
  Award.findByPk(id, {
    include: [
      { model: Vendor, as: "vendor" },
      { model: Bid, as: "bid" },
      { model: User, as: "approvedBy" },
      { model: User, as: "recommendedBy" },
      {
        model: Rfq,
        as: "rfq",
        include: [
          { model: ProcurementMode, as: "mode" },
          { model: AppEntry, as: "appEntry", include: [{ model: Department, as: "implementingUnit" }] },
          {
            model: PrHeader,
            as: "purchaseRequisition",
            include: [{ model: Department, as: "department" }],
          },
        ],
      },
    ],
  });

// The solicitation itself, for the Invitation to Bid letter. No vendor and no
// bid in the include list, because at invitation time neither exists — that is
// what distinguishes this from every other document in the chain.
const loadRfq = (id) =>
  Rfq.findByPk(id, {
    include: [
      { model: ProcurementMode, as: "mode" },
      { model: AppEntry, as: "appEntry", include: [{ model: Department, as: "implementingUnit" }] },
      { model: PrHeader, as: "purchaseRequisition", include: [{ model: Department, as: "department" }] },
    ],
  });

const loadContract = (id) =>
  Contract.findByPk(id, {
    include: [
      { model: Vendor, as: "vendor" },
      { model: User, as: "draftedBy" },
      {
        model: Award,
        as: "award",
        include: [
          { model: User, as: "approvedBy" },
          {
            model: Rfq,
            as: "rfq",
            include: [
              { model: ProcurementMode, as: "mode" },
              { model: AppEntry, as: "appEntry", include: [{ model: Department, as: "implementingUnit" }] },
              { model: PrHeader, as: "purchaseRequisition", include: [{ model: Department, as: "department" }] },
            ],
          },
        ],
      },
    ],
  });

const loadDelivery = (id) =>
  Delivery.findByPk(id, {
    include: [
      { model: User, as: "reportedBy" },
      { model: User, as: "inspectedBy" },
      {
        model: Contract,
        as: "contract",
        include: [
          { model: Vendor, as: "vendor" },
          {
            model: Award,
            as: "award",
            include: [{ model: Rfq, as: "rfq", include: [{ model: ProcurementMode, as: "mode" }] }],
          },
        ],
      },
    ],
  });

const loadPr = (id) =>
  PrHeader.findByPk(id, {
    include: [
      { model: PrLineItem, as: "lineItems" },
      { model: Department, as: "department" },
      { model: User, as: "requester" },
      { model: User, as: "mayorApprovedBy" },
      { model: User, as: "cashCertifiedBy" },
      { model: ProcurementMode, as: "procurementMode" },
      { model: AppEntry, as: "appEntry" },
    ],
  });

// ── Per-namespace context builders ───────────────────────────────────────────

const supplierContext = (vendor) => ({
  supplier_name: vendor?.businessName ?? "",
  supplier_address: vendor?.address ?? "",
  supplier_tin: vendor?.tin ?? "",
  supplier_contact_person: vendor?.contactPerson ?? "",
  supplier_email: vendor?.contactEmail ?? "",
  supplier_phone: vendor?.contactPhone ?? "",
  supplier_philgeps_no: vendor?.philgepsRegistrationNo ?? "",
});

const procurementContext = (rfq) => ({
  project_title: rfq?.title ?? "",
  procurement_reference_number: rfq?.referenceNo ?? "",
  abc: rfq ? formatPeso(rfq.abc) : "",
  abc_in_words: rfq ? amountInWords(rfq.abc) : "",
  procurement_mode: rfq?.mode?.name ?? "",
  procurement_mode_citation: rfq?.mode?.citation ?? "",
  procurement_category: rfq?.category ?? "",
  implementing_office:
    rfq?.appEntry?.implementingUnit?.name ?? rfq?.purchaseRequisition?.department?.name ?? "",
  pr_number: rfq?.purchaseRequisition?.prNumber ?? "",
});

const awardContext = (award) => ({
  noa_number: award?.noaNumber ?? "",
  award_date: formatDate(award?.noaDate),
  award_date_long: formatLongDate(award?.noaDate),
  award_amount: award ? formatPeso(award.amount) : "",
  award_amount_in_words: award ? amountInWords(award.amount) : "",
  award_basis: award?.awardBasis ?? "",
  bid_amount: award?.bid ? formatPeso(award.bid.totalBidPrice) : "",
});

const contractContext = (contract) => ({
  contract_no: contract?.contractNo ?? "",
  contract_amount: contract ? formatPeso(contract.amount) : "",
  contract_amount_in_words: contract ? amountInWords(contract.amount) : "",
  contract_days: contract?.contractDays == null ? "" : String(contract.contractDays),
  contract_start_date: formatDate(contract?.startDate),
  delivery_deadline: formatDate(contract?.deliveryDeadline),
  notice_to_proceed_date: formatDate(contract?.noticeToProceedAt),
});

// ── The entry point ──────────────────────────────────────────────────────────
// Returns { context, record, title, signatory } or { error }.
export const resolvePlaceholders = async ({
  documentType,
  entityId,
  manualValues = {},
  currentUser,
  documentNo = "",
}) => {
  const expectedRef = entityRefFor(documentType);

  const lgu = await getLguProfile();
  const lce = await findLocalChiefExecutive();

  const now = new Date();
  const actorDepartment = currentUser?.departmentId
    ? await Department.findByPk(currentUser.departmentId)
    : null;

  // Available on every document regardless of type.
  const base = {
    lgu_name: lgu.name,
    lgu_address: lgu.address ?? "",
    office_name: actorDepartment?.name ?? "",
    official_name: personName(currentUser),
    // `req.currentUser` is a User instance loaded with its Role association, so
    // the position is on `Role.name` — there is no flat `roleName` on it.
    official_position: currentUser?.Role?.name ?? "",
    signatory_name: personName(lce),
    signatory_position: lce ? "Municipal Mayor" : "",
    current_date: formatDate(now),
    current_date_long: formatLongDate(now),
    current_year: String(now.getFullYear()),
    document_no: documentNo,
  };

  // Manual fields are merged last so an officer's typed value wins over an
  // empty resolved one, but they are validated first — a certificate with no
  // recipient is not a certificate.
  const manual = {};
  for (const field of manualFieldsFor(documentType)) {
    const value = manualValues[field.key];
    if (field.required && !String(value ?? "").trim()) {
      return { error: `${field.label} is required for this document.` };
    }
    manual[field.key] = field.type === "date" ? formatDate(value) : (value ?? "");
  }

  // Types with no source record — the certificates — are complete already.
  if (!expectedRef) {
    return {
      context: { ...base, ...manual },
      record: null,
      title: manual.occasion
        ? `${manual.recipient_name} — ${manual.occasion}`
        : manual.recipient_name || "Certificate",
      signatory: lce,
    };
  }

  let record = null;
  let context = { ...base };
  let title = "";

  if (expectedRef === "award") {
    record = await loadAward(entityId);
    if (!record) return { error: "That award does not exist." };
    // A Notice of Award for an award the Mayor has not approved would be a
    // notice of nothing, and one for a declined or cancelled award would assert
    // something untrue. The module must not become a way around the approval it
    // depends on.
    //
    // Stated as the states that are *refused* rather than the one that is
    // allowed: `accepted` sits past `issued` — the supplier has already
    // returned the conforme — and a reprint of that notice is routine. An
    // allow-list of `issued` alone blocked exactly that, which is how this was
    // found.
    const REFUSED = { pendingHopeApproval: "has not been approved yet", declined: "was declined", cancelled: "was cancelled" };
    if (REFUSED[record.status]) {
      return { error: `A Notice of Award cannot be produced: this award ${REFUSED[record.status]}.` };
    }
    context = {
      ...context,
      ...supplierContext(record.vendor),
      ...procurementContext(record.rfq),
      ...awardContext(record),
      signatory_name: personName(record.approvedBy) || base.signatory_name,
    };
    title = `${record.noaNumber} — ${record.rfq?.title ?? "Award"}`;
  }

  if (expectedRef === "rfq") {
    record = await loadRfq(entityId);
    if (!record) return { error: "That solicitation does not exist." };
    // An invitation for a solicitation still in draft would advertise a
    // procurement the BAC has not actually opened.
    if (record.status === "draft") {
      return { error: "This solicitation has not been published yet, so it cannot be advertised." };
    }

    context = {
      ...context,
      ...procurementContext(record),
      publish_date: formatDate(record.publishDate),
      prebid_date: record.prebidAt ? formatDate(record.prebidAt) : "Not applicable",
      submission_deadline: formatDate(record.closingDate),
      // Bid opening follows the deadline unless the office says otherwise —
      // the usual practice, and better than printing a blank.
      bid_opening_date: formatDate(record.closingDate),
      bid_security_note: record.mode?.requiresBidSecurity
        ? "A bid security in the form and amount prescribed by the IRR is required."
        : "No bid security is required for this mode of procurement.",
    };
    title = `${record.referenceNo} — ${record.title}`;
  }

  if (expectedRef === "contract") {
    record = await loadContract(entityId);
    if (!record) return { error: "That contract does not exist." };
    context = {
      ...context,
      ...supplierContext(record.vendor),
      ...procurementContext(record.award?.rfq),
      ...awardContext(record.award),
      ...contractContext(record),
      signatory_name: personName(record.award?.approvedBy) || base.signatory_name,
    };
    title = `${record.contractNo} — ${record.award?.rfq?.title ?? "Contract"}`;
  }

  if (expectedRef === "delivery") {
    record = await loadDelivery(entityId);
    if (!record) return { error: "That delivery does not exist." };
    const contract = record.contract;
    context = {
      ...context,
      ...supplierContext(contract?.vendor),
      ...procurementContext(contract?.award?.rfq),
      ...awardContext(contract?.award),
      ...contractContext(contract),
      delivery_date: formatDate(record.deliveredAt),
      inspection_date: formatDate(record.inspectedAt),
      delivery_description: record.description ?? "",
      delivery_status: record.status ?? "",
      inspector_name: personName(record.inspectedBy),
      signatory_name: personName(record.inspectedBy) || base.signatory_name,
      signatory_position: record.inspectedBy ? "Inspecting Officer" : base.signatory_position,
    };
    title = `Inspection and Acceptance — ${contract?.contractNo ?? "delivery"}`;
  }

  if (expectedRef === "pr") {
    record = await loadPr(entityId);
    if (!record) return { error: "That requisition does not exist." };
    context = {
      ...context,
      pr_number: record.prNumber,
      pr_purpose: record.purpose ?? "",
      pr_total: formatPeso(record.totalAmount),
      pr_total_in_words: amountInWords(record.totalAmount),
      pr_date_required: formatDate(record.dateRequired),
      requester_name: personName(record.requester),
      implementing_office: record.department?.name ?? "",
      fund_source: record.fundSource ?? "",
      procurement_mode: record.procurementMode?.name ?? "",
      procurement_mode_citation: record.procurementMode?.citation ?? "",
      project_title: record.appEntry?.projectTitle ?? record.purpose ?? "",
      pr_line_items_table: lineItemsTable(record.lineItems ?? []),
      signatory_name: personName(record.mayorApprovedBy) || base.signatory_name,
    };
    title = `${record.prNumber} — ${record.purpose ?? "Purchase Request"}`;
  }

  // `other` attaches to anything or nothing; it gets the base context and
  // whatever the template's own extra fields supply.
  if (expectedRef === "any") {
    title = manual.title || "Official document";
  }

  return { context: { ...context, ...manual }, record, title, signatory: lce };
};

export { escapeHtml };
