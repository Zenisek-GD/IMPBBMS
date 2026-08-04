import { Op } from "sequelize";
import { sequelize } from "../models/db.js";
import { Invoice, Payment } from "../models/paymentModel.js";
import { Contract, Delivery } from "../models/contractModel.js";
import { Vendor } from "../models/vendorModel.js";
import { User } from "../models/userModel.js";
import { notifyUsers, notifyByPermission, NOTIFICATION_EVENTS } from "../services/notifier.js";
import { auditFromRequest, AUDIT_ACTIONS } from "../services/auditLog.js";
import { computeDeductions } from "../services/deductions.js";

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const invoiceIncludes = {
  include: [
    { model: Contract, as: "contract" },
    { model: Delivery, as: "delivery" },
    { model: Vendor, as: "vendor" },
    {
      model: Payment,
      as: "payment",
      include: [
        { model: User, as: "preparedBy", attributes: ["id", "name"] },
        { model: User, as: "releasedBy", attributes: ["id", "name"] },
      ],
    },
  ],
};

const serialize = (invoice) => ({
  id: invoice.id,
  invoiceNo: invoice.invoiceNo,
  supplierInvoiceRef: invoice.supplierInvoiceRef,
  amount: Number(invoice.amount),
  submittedAt: invoice.submittedAt,
  status: invoice.status,
  remarks: invoice.remarks,
  contractNo: invoice.contract?.contractNo ?? null,
  contractAmount: invoice.contract ? Number(invoice.contract.amount) : null,
  vendorName: invoice.vendor?.businessName ?? null,
  payment: invoice.payment
    ? {
        id: invoice.payment.id,
        disbursementNo: invoice.payment.disbursementNo,
        // The voucher in full: what was claimed, what was withheld, what is
        // actually paid. Showing only the net would hide the withholding.
        grossAmount: Number(invoice.payment.grossAmount),
        ewtAmount: Number(invoice.payment.ewtAmount),
        vatWithheldAmount: Number(invoice.payment.vatWithheldAmount),
        retentionAmount: Number(invoice.payment.retentionAmount),
        liquidatedDamages: Number(invoice.payment.liquidatedDamages),
        totalDeductions: round2(
          Number(invoice.payment.grossAmount) - Number(invoice.payment.amount)
        ),
        deductionBreakdown: invoice.payment.deductionBreakdown,
        amount: Number(invoice.payment.amount),
        status: invoice.payment.status,
        preparedAt: invoice.payment.preparedAt,
        releasedAt: invoice.payment.releasedAt,
        preparedByName: invoice.payment.preparedBy?.name ?? null,
        releasedByName: invoice.payment.releasedBy?.name ?? null,
      }
    : null,
});

export const listInvoices = async (req, res) => {
  const { status } = req.query;
  const where = {};
  if (status) where.status = status;

  // A supplier sees only their own invoices.
  if (req.permissions.has("delivery.submitInvoice") && !req.permissions.has("payment.view")) {
    const vendor = await Vendor.findOne({ where: { userId: req.currentUser.id } });
    if (!vendor) return res.json([]);
    where.vendorId = vendor.id;
  }

  const invoices = await Invoice.findAll({ where, ...invoiceIncludes, order: [["createdAt", "DESC"]] });
  res.json(invoices.map(serialize));
};

// Lifecycle step 12: the supplier invoices after delivery.
export const submitInvoice = async (req, res) => {
  const { contractId, deliveryId, amount, supplierInvoiceRef } = req.body;

  const contract = await Contract.findByPk(contractId, { include: [{ model: Vendor, as: "vendor" }] });
  if (!contract) return res.status(400).json({ message: "That contract does not exist." });

  const vendor = await Vendor.findOne({ where: { userId: req.currentUser.id } });
  if (!vendor || vendor.id !== contract.vendorId) {
    return res.status(403).json({ message: "This is not your contract." });
  }

  // Section 6: acceptance is what unlocks invoicing — an invoice without an
  // accepted delivery behind it should never enter the queue.
  const delivery = await Delivery.findByPk(deliveryId);
  if (!delivery || delivery.contractId !== contract.id) {
    return res.status(400).json({ message: "Select a delivery under this contract." });
  }
  if (delivery.status !== "accepted") {
    return res.status(409).json({ message: "Only an accepted delivery can be invoiced." });
  }
  if (await Invoice.findOne({ where: { deliveryId, status: { [Op.ne]: "cancelled" } } })) {
    return res.status(409).json({ message: "This delivery has already been invoiced." });
  }

  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    return res.status(400).json({ message: "A positive invoice amount is required." });
  }

  // The ceiling is the contract, and it applies to the *running total*, not to
  // each invoice in isolation. Checking one invoice at a time left the contract
  // open to being billed its full value once per accepted delivery: three
  // deliveries against a ₱1M contract accepted three ₱1M invoices, and every
  // one of them passed validation.
  //
  // Cancelled invoices are excluded because they never become payable; returned
  // ones are counted, since a returned invoice is still an open claim the
  // supplier may correct and resubmit.
  const contractAmount = Number(contract.amount);
  const billed = Number(
    (await Invoice.sum("amount", {
      where: { contractId: contract.id, status: { [Op.notIn]: ["cancelled"] } },
    })) ?? 0
  );
  const remaining = contractAmount - billed;

  if (value > remaining) {
    return res.status(400).json({
      message:
        remaining <= 0
          ? `${contract.contractNo} is already fully billed at ₱${contractAmount.toLocaleString()}. No further invoices can be raised against it.`
          : `Invoice ₱${value.toLocaleString()} exceeds the ₱${remaining.toLocaleString()} still unbilled on ${contract.contractNo}. ` +
            `₱${billed.toLocaleString()} of the ₱${contractAmount.toLocaleString()} contract has already been invoiced.`,
      contractAmount,
      alreadyBilled: billed,
      remaining: Math.max(0, remaining),
    });
  }

  const year = new Date().getFullYear();
  const count = await Invoice.count({ where: { invoiceNo: { [Op.like]: `INV-${year}-%` } } });

  const invoice = await Invoice.create({
    invoiceNo: `INV-${year}-${String(count + 1).padStart(4, "0")}`,
    supplierInvoiceRef: supplierInvoiceRef ?? null,
    amount: value,
    submittedAt: new Date(),
    contractId: contract.id,
    deliveryId: delivery.id,
    vendorId: vendor.id,
    status: "submitted",
  });

  // Goes to the Accountant, who acts on it next. The Treasurer has nothing to
  // do until a voucher has been certified.
  await notifyByPermission("payment.certify", {
    type: NOTIFICATION_EVENTS.PAYMENT_STATUS,
    title: `Invoice received — ${invoice.invoiceNo}`,
    body: `${vendor.businessName} invoiced ₱${value.toLocaleString()} against ${contract.contractNo}.`,
    link: "/invoices",
    refEntity: "invoice",
    refId: invoice.id,
    severity: "info",
  });

  res.status(201).json(serialize(await Invoice.findByPk(invoice.id, invoiceIncludes)));
};

// Accounting certifies the invoice and prepares the disbursement voucher.
export const certifyInvoice = async (req, res) => {
  const { decision, remarks } = req.body;
  const invoice = await Invoice.findByPk(req.params.id, invoiceIncludes);
  if (!invoice) return res.status(404).json({ message: "Invoice not found." });
  if (invoice.status !== "submitted") {
    return res.status(409).json({ message: `Cannot certify an invoice in "${invoice.status}".` });
  }
  if (!["certify", "return"].includes(decision)) {
    return res.status(400).json({ message: "Decision must be certify or return." });
  }
  if (decision === "return" && !remarks?.trim()) {
    return res.status(400).json({ message: "Remarks are required when returning an invoice." });
  }

  if (decision === "return") {
    await invoice.update({ status: "returned", remarks: remarks.trim() });
    await notifyUsers([invoice.vendor?.userId], {
      type: NOTIFICATION_EVENTS.PAYMENT_STATUS,
      title: `Invoice returned — ${invoice.invoiceNo}`,
      body: remarks.trim(),
      link: "/invoices",
      refEntity: "invoice",
      refId: invoice.id,
      severity: "danger",
    });
    return res.json(serialize(await Invoice.findByPk(invoice.id, invoiceIncludes)));
  }

  const year = new Date().getFullYear();
  const count = await Payment.count({ where: { disbursementNo: { [Op.like]: `DV-${year}-%` } } });

  // The voucher is computed here, at certification, because certification is
  // the act of saying what is properly payable. The Treasurer later releases
  // the net — they do not recompute it, and cannot change it.
  const deductions = computeDeductions({
    grossAmount: Number(invoice.amount),
    vendor: invoice.vendor,
    contract: invoice.contract,
  });

  await sequelize.transaction(async (transaction) => {
    await invoice.update({ status: "certified", remarks: remarks?.trim() ?? null }, { transaction });
    await Payment.create(
      {
        disbursementNo: `DV-${year}-${String(count + 1).padStart(4, "0")}`,
        grossAmount: deductions.grossAmount,
        ewtAmount: deductions.ewtAmount,
        vatWithheldAmount: deductions.vatWithheldAmount,
        retentionAmount: deductions.retentionAmount,
        liquidatedDamages: deductions.liquidatedDamages,
        otherDeductions: deductions.otherDeductions,
        deductionBreakdown: deductions.breakdown,
        // The net is what actually leaves the treasury.
        amount: deductions.netAmount,
        invoiceId: invoice.id,
        preparedById: req.currentUser.id,
        preparedAt: new Date(),
        status: "prepared",
      },
      { transaction }
    );
  });

  await notifyUsers([invoice.vendor?.userId], {
    type: NOTIFICATION_EVENTS.PAYMENT_STATUS,
    title: `Invoice certified — ${invoice.invoiceNo}`,
    body: "Your invoice was certified and a disbursement voucher prepared. Awaiting Treasury release.",
    link: "/invoices",
    refEntity: "invoice",
    refId: invoice.id,
    severity: "info",
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.INVOICE_CERTIFIED,
    entityRef: "invoice",
    entityId: invoice.id,
    summary: `${invoice.invoiceNo} certified — ₱${Number(invoice.amount).toLocaleString()}`,
    beforeState: { status: "submitted" },
    afterState: { status: "certified" },
  });

  res.json(serialize(await Invoice.findByPk(invoice.id, invoiceIncludes)));
};

// The Treasurer releases the funds against a certified voucher. Preparation and
// release are separate accountable acts held by separate officers, so whoever
// prepared the voucher may not also release it.
export const releasePayment = async (req, res) => {
  const { method, reference } = req.body;
  const payment = await Payment.findByPk(req.params.paymentId, {
    include: [
      {
        model: Invoice,
        as: "invoice",
        include: [
          { model: Vendor, as: "vendor" },
          { model: Contract, as: "contract", include: [{ model: Delivery, as: "deliveries" }] },
        ],
      },
    ],
  });
  if (!payment) return res.status(404).json({ message: "Disbursement not found." });
  if (payment.status !== "prepared") {
    return res.status(409).json({ message: `Cannot release a disbursement in "${payment.status}".` });
  }

  // Belt and braces. The permission split already puts certification and
  // release in different roles, but an administrator can grant both to one
  // account, so the rule is enforced on the voucher itself as well.
  if (payment.preparedById === req.currentUser.id) {
    return res.status(403).json({
      message:
        "The officer who prepared this disbursement voucher cannot also release it. " +
        "The Accountant certifies the claim; the Treasurer releases the funds.",
    });
  }

  // A contract closes when the work is finished and the money is fully paid —
  // not when the first cheque goes out. Releasing one progress billing on a
  // road project used to mark the whole road complete, which then fed a
  // "completed" status straight to the public portal and the budget monitor.
  const contract = payment.invoice?.contract;
  const contractAmount = Number(contract?.amount ?? 0);

  // The contract is discharged by the GROSS, not the net. Tax withheld and
  // retention held back still satisfy the LGU's obligation to the supplier —
  // the money was applied to the contract, it simply went to the BIR or into
  // retention rather than to the supplier's bank account. Accumulating the net
  // here would leave every contract looking permanently underpaid.
  const paidAfterThis = Number(contract?.amountPaid ?? 0) + Number(payment.grossAmount);
  const retentionAfterThis =
    Number(contract?.retentionHeld ?? 0) + Number(payment.retentionAmount ?? 0);

  const deliveries = contract?.deliveries ?? [];
  const deliveredInFull =
    deliveries.length > 0 && deliveries.every((delivery) => delivery.status === "accepted");
  // Float tolerance: DECIMAL round-trips through JS numbers, and a contract
  // settled to the last centavo should not be left open by a rounding artefact.
  const paidInFull = paidAfterThis >= contractAmount - 0.005;
  const closes = deliveredInFull && paidInFull;

  await sequelize.transaction(async (transaction) => {
    await payment.update(
      {
        status: "released",
        releasedById: req.currentUser.id,
        releasedAt: new Date(),
        method: method ?? null,
        reference: reference ?? null,
      },
      { transaction }
    );
    await Invoice.update({ status: "paid" }, { where: { id: payment.invoiceId }, transaction });

    if (contract) {
      await contract.update(
        {
          amountPaid: paidAfterThis,
          retentionHeld: retentionAfterThis,
          // Completion also fixes the date delay stops accruing from.
          ...(closes ? { status: "completed", actualCompletionAt: new Date() } : {}),
        },
        { transaction }
      );
    }
  });

  const outstanding = Math.max(0, contractAmount - paidAfterThis);

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.PAYMENT_RELEASED,
    entityRef: "payment",
    entityId: payment.id,
    summary:
      `${payment.disbursementNo} released — net ₱${Number(payment.amount).toLocaleString()} ` +
      `of ₱${Number(payment.grossAmount).toLocaleString()} gross` +
      (closes ? ` (final payment, ${contract.contractNo} closed)` : ""),
    beforeState: { status: "prepared", preparedById: payment.preparedById },
    afterState: {
      status: "released",
      releasedById: req.currentUser.id,
      method: method ?? null,
      // The whole voucher, not just the net — an auditor reading this entry
      // must be able to see what was withheld and why.
      gross: Number(payment.grossAmount),
      ewt: Number(payment.ewtAmount),
      vatWithheld: Number(payment.vatWithheldAmount),
      retention: Number(payment.retentionAmount),
      liquidatedDamages: Number(payment.liquidatedDamages),
      netReleased: Number(payment.amount),
      // The running position: what this disbursement left outstanding.
      contractPaidToDate: paidAfterThis,
      contractOutstanding: outstanding,
      contractRetentionHeld: retentionAfterThis,
      contractClosed: closes,
    },
  });

  await notifyUsers([payment.invoice?.vendor?.userId], {
    type: NOTIFICATION_EVENTS.PAYMENT_STATUS,
    title: `Payment released — ${payment.disbursementNo}`,
    body:
      `Net ₱${Number(payment.amount).toLocaleString()} released against gross ` +
      `₱${Number(payment.grossAmount).toLocaleString()} for ${payment.invoice?.invoiceNo}. ` +
      (closes
        ? `${contract.contractNo} is now fully paid and closed.`
        : `₱${outstanding.toLocaleString()} remains outstanding on ${contract?.contractNo ?? "the contract"}.`),
    link: "/invoices",
    refEntity: "payment",
    refId: payment.id,
    severity: "success",
  });

  res.json({
    id: payment.id,
    disbursementNo: payment.disbursementNo,
    status: "released",
    releasedAt: payment.releasedAt,
    grossAmount: Number(payment.grossAmount),
    netAmount: Number(payment.amount),
    deductions: {
      ewt: Number(payment.ewtAmount),
      vatWithheld: Number(payment.vatWithheldAmount),
      retention: Number(payment.retentionAmount),
      liquidatedDamages: Number(payment.liquidatedDamages),
      total: round2(Number(payment.grossAmount) - Number(payment.amount)),
    },
    contract: contract
      ? {
          contractNo: contract.contractNo,
          amount: contractAmount,
          amountPaid: paidAfterThis,
          outstanding,
          retentionHeld: retentionAfterThis,
          status: closes ? "completed" : contract.status,
          deliveredInFull,
        }
      : null,
  });
};
