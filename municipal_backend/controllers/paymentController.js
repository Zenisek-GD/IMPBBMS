const workflowConflict = () => Object.assign(new Error("This financial record changed. Reload it before trying again."), { code: "WORKFLOW_CONFLICT" });
import { Op } from "sequelize";
import { Award, Rfq } from "../models/biddingModel.js";
import { fundingIncludes, fundingYearCondition, fundingYearOf } from "../services/fundingYear.js";
import { money, paymentGross, difference } from "../services/financialCalculations.js";
import { Invoice, Payment } from "../models/paymentModel.js";
import { Contract, Delivery } from "../models/contractModel.js";
import { Vendor } from "../models/vendorModel.js";
import { User } from "../models/userModel.js";
import { notifyUsers, notifyByPermission, NOTIFICATION_EVENTS } from "../services/notifier.js";
import { withAuditTransaction, AUDIT_ACTIONS } from "../services/auditLog.js";
import { actorAudit, workflowError } from "../services/workflowSupport.js";
import { computeDeductions } from "../services/deductions.js";
import { nextSequenceNo, withSequenceRetry } from "../services/sequenceNo.js";
import { parseListParams, pageEnvelope, searchCondition } from "../services/listQuery.js";

const round2 = money;
// A plain Sequelize result can still reference the instance's live values.
// Freeze the historical state before any update changes that instance.
const recordSnapshot = (record) => JSON.parse(JSON.stringify(record.get({ plain: true })));

const invoiceIncludes = {
  include: [
    { model: Contract, as: "contract", include: [{ model: Award, as: "award", include: [{ model: Rfq, as: "rfq", include: fundingIncludes() }] }] },
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
  fiscalYear: fundingYearOf(invoice.contract?.award?.rfq),
  supplierInvoiceRef: invoice.supplierInvoiceRef,
  amount: Number(invoice.amount),
  submittedAt: invoice.submittedAt,
  status: invoice.status,
  remarks: invoice.remarks,
  contractNo: invoice.contract?.contractNo ?? null,
  contractId: invoice.contractId,
  deliveryId: invoice.deliveryId,
  contractAmount: invoice.contract ? Number(invoice.contract.amount) : null,
  vendorName: invoice.vendor?.businessName ?? null,
  payment: invoice.payment
    ? {
        id: invoice.payment.id,
        disbursementNo: invoice.payment.disbursementNo,
        // The voucher in full: what was claimed, what was withheld, what is
        // actually paid. Showing only the net would hide the withholding.
        grossAmount: paymentGross(invoice.payment),
        ewtAmount: Number(invoice.payment.ewtAmount),
        vatWithheldAmount: Number(invoice.payment.vatWithheldAmount),
        retentionAmount: Number(invoice.payment.retentionAmount),
        liquidatedDamages: Number(invoice.payment.liquidatedDamages),
        otherDeductions: Number(invoice.payment.otherDeductions),
        totalDeductions: difference(paymentGross(invoice.payment), invoice.payment.amount),
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
  const { status, search } = req.query;
  const where = {};
  const fundingScope = fundingYearCondition(req.query.fiscalYear, "contract.award.rfq");
  if (fundingScope) where[Op.and] = [fundingScope];
  if (status) where.status = status;
  const searched = searchCondition(search, [
    "invoiceNo",
    "supplierInvoiceRef",
    "remarks",
    "$contract.contractNo$",
    "$vendor.businessName$",
    "$payment.disbursementNo$",
  ]);
  if (searched) Object.assign(where, searched);
  if (req.query.paymentStatus === "none") where["$payment.id$"] = null;
  if (["prepared", "released", "cancelled"].includes(req.query.paymentStatus)) {
    where["$payment.status$"] = req.query.paymentStatus;
  }

  // A supplier sees only their own invoices.
  if (req.permissions.has("delivery.submitInvoice") && !req.permissions.has("payment.view")) {
    const vendor = await Vendor.findOne({ where: { userId: req.currentUser.id } });
    if (!vendor) {
      if (["page", "pageSize", "sort"].some((key) => req.query[key] !== undefined)) {
        const page = parseListParams(req.query);
        return res.json(pageEnvelope({ rows: [], total: 0, page: page.page, pageSize: page.pageSize }));
      }
      return res.json([]);
    }
    where.vendorId = vendor.id;
  }

  const paged = ["page", "pageSize", "sort"].some((key) => req.query[key] !== undefined);
  if (!paged) {
    const invoices = await Invoice.findAll({ where, ...invoiceIncludes, order: [["createdAt", "DESC"]] });
    return res.json(invoices.map(serialize));
  }
  const page = parseListParams(req.query, {
    sorts: {
      invoiceNo: "invoiceNo",
      amount: "amount",
      submittedAt: "submittedAt",
      status: "status",
      createdAt: "createdAt",
    },
    defaultSort: { field: "createdAt", direction: "desc" },
  });
  const { count, rows } = await Invoice.findAndCountAll({
    where,
    ...invoiceIncludes,
    ...page,
    distinct: true,
    subQuery: false,
  });
  return res.json(pageEnvelope({ rows: rows.map(serialize), total: count, page: page.page, pageSize: page.pageSize }));
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

  // Payment must track what was actually delivered. When the inspecting officer
  // certified a value for this delivery, the invoice cannot exceed it — without
  // this a supplier could bill the whole contract against one small acceptance.
  // Deliveries with no certified value (older records) fall through to the
  // contract-level ceiling below, preserving prior behaviour.
  if (delivery.acceptedValue != null) {
    const certified = Number(delivery.acceptedValue);
    if (value > certified + 0.005) {
      return res.status(400).json({
        message:
          `Invoice ₱${value.toLocaleString()} exceeds the ₱${certified.toLocaleString()} ` +
          `value certified as delivered and accepted for this delivery.`,
        acceptedValue: certified,
      });
    }
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

  const invoice = await withSequenceRetry(() => withAuditTransaction(async (transaction, audit) => {
    // All invoices for this contract serialize on the parent row, including
    // invoices against different deliveries. Recheck the ceiling under the lock.
    await contract.reload({ transaction, lock: transaction.LOCK.UPDATE });
    await delivery.reload({ transaction, lock: transaction.LOCK.UPDATE });
    if (delivery.status !== "accepted" || delivery.contractId !== contract.id || contract.vendorId !== vendor.id || (delivery.acceptedValue != null && value > Number(delivery.acceptedValue) + 0.005)) throw workflowConflict();
    const duplicate = await Invoice.findOne({ where: { deliveryId: delivery.id, status: { [Op.ne]: "cancelled" } }, transaction });
    const currentBilled = Number(await Invoice.sum("amount", { where: { contractId: contract.id, status: { [Op.ne]: "cancelled" } }, transaction }) ?? 0);
    if (duplicate || value > Number(contract.amount) - currentBilled) throw workflowConflict();
    const created = await Invoice.create({
      invoiceNo: await nextSequenceNo(Invoice, "invoiceNo", "INV", year, { transaction }),
      supplierInvoiceRef: supplierInvoiceRef ?? null,
      amount: value,
      submittedAt: new Date(),
      contractId: contract.id,
      deliveryId: delivery.id,
      vendorId: vendor.id,
      status: "submitted",
    }, { transaction });
    await audit(actorAudit(req, { actionType: "invoice.submitted", entityRef: "invoice", entityId: created.id, summary: `${created.invoiceNo} submitted for ${contract.contractNo}.`, afterState: created.get({ plain: true }) }));
    return created;
  }));

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

// Correct the existing returned claim without creating a second invoice for
// the same accepted delivery or discarding the original review history.
export const resubmitInvoice = async (req, res) => {
  const observed = await Invoice.findByPk(req.params.id);
  if (!observed) throw workflowError("Invoice not found.", 404);
  const vendor = await Vendor.findOne({ where: { userId: req.currentUser.id } });
  if (!vendor || vendor.id !== observed.vendorId) throw workflowError("You may only correct your own invoice.", 403);
  const value = round2(req.body.amount);
  if (!Number.isFinite(value) || value <= 0) throw workflowError("A positive invoice amount is required.", 400);
  const updated = await withAuditTransaction(async (transaction, audit) => {
    const contract = await Contract.findByPk(observed.contractId, { transaction, lock: transaction.LOCK.UPDATE });
    const delivery = await Delivery.findByPk(observed.deliveryId, { transaction, lock: transaction.LOCK.UPDATE });
    const invoice = await Invoice.findByPk(observed.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!invoice || invoice.status !== "returned" || invoice.vendorId !== vendor.id || invoice.contractId !== observed.contractId || invoice.deliveryId !== observed.deliveryId) throw workflowConflict();
    if (!contract || contract.vendorId !== vendor.id || !delivery || delivery.contractId !== contract.id || delivery.status !== "accepted") throw workflowError("The invoice must still refer to your accepted delivery.");
    if (delivery.acceptedValue != null && value > Number(delivery.acceptedValue) + 0.005) throw workflowError("The invoice exceeds the value accepted for this delivery.", 400);
    const billed = Number(await Invoice.sum("amount", { where: { contractId: contract.id, id: { [Op.ne]: invoice.id }, status: { [Op.ne]: "cancelled" } }, transaction }) ?? 0);
    if (value > Number(contract.amount) - billed + 0.005) throw workflowError("The corrected invoice exceeds the remaining contract amount.", 400);
    if (await Payment.findOne({ where: { invoiceId: invoice.id, status: { [Op.ne]: "cancelled" } }, transaction })) throw workflowConflict();
    const beforeState = recordSnapshot(invoice);
    await invoice.update({ amount: value, supplierInvoiceRef: String(req.body.supplierInvoiceRef ?? invoice.supplierInvoiceRef ?? "").trim() || null,
      status: "submitted", submittedAt: new Date(), remarks: null }, { transaction });
    await audit(actorAudit(req, { actionType: "invoice.resubmitted", entityRef: "invoice", entityId: invoice.id,
      summary: `${invoice.invoiceNo} corrected and resubmitted.`, beforeState, afterState: invoice.get({ plain: true }) }));
    return invoice;
  });
  await notifyByPermission("payment.certify", { type: NOTIFICATION_EVENTS.PAYMENT_STATUS,
    title: `Corrected invoice received — ${updated.invoiceNo}`, body: "The supplier has corrected the returned claim for a new review.",
    link: "/invoices", refEntity: "invoice", refId: updated.id, severity: "info" });
  res.json(serialize(await Invoice.findByPk(updated.id, invoiceIncludes)));
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
  if (decision === "return" && (typeof remarks !== "string" || !remarks.trim())) {
    return res.status(400).json({ message: "Remarks are required when returning an invoice." });
  }

  if (decision === "return") {
    await withAuditTransaction(async (transaction, audit) => {
      await invoice.reload({ transaction, lock: transaction.LOCK.UPDATE });
      if (invoice.status !== "submitted") throw workflowConflict();
      const beforeState = recordSnapshot(invoice);
      await invoice.update({ status: "returned", remarks: remarks.trim() }, { transaction });
      await audit(actorAudit(req, { actionType: "invoice.returned", entityRef: "invoice", entityId: invoice.id, summary: `${invoice.invoiceNo} returned for correction.`, beforeState, afterState: invoice.get({ plain: true }) }));
    });
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

  // The voucher is computed here, at certification, because certification is
  // the act of saying what is properly payable. The Treasurer later releases
  // the net — they do not recompute it, and cannot change it.
  let deductions = computeDeductions({
    grossAmount: Number(invoice.amount),
    vendor: invoice.vendor,
    contract: invoice.contract,
  });

  await withSequenceRetry(() =>
    withAuditTransaction(async (transaction, audit) => {
      await invoice.contract.reload({ transaction, lock: transaction.LOCK.UPDATE });
      await invoice.reload({ transaction, lock: transaction.LOCK.UPDATE });
      if (invoice.status !== "submitted") throw workflowConflict();
      if (await Payment.findOne({ where: { invoiceId: invoice.id, status: { [Op.ne]: "cancelled" } }, transaction })) throw workflowConflict();
      deductions = computeDeductions({ grossAmount: Number(invoice.amount), vendor: invoice.vendor, contract: invoice.contract });
      const beforeState = recordSnapshot(invoice);
      await invoice.update({ status: "certified", remarks: remarks?.trim() ?? null }, { transaction });
      const voucher = await Payment.create(
      {
        disbursementNo: await nextSequenceNo(Payment, "disbursementNo", "DV", year, { transaction }),
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
      await audit(actorAudit(req, { actionType: AUDIT_ACTIONS.INVOICE_CERTIFIED, entityRef: "invoice", entityId: invoice.id, summary: `${invoice.invoiceNo} certified.`, beforeState, afterState: invoice.get({ plain: true }) }));
      await audit(actorAudit(req, { actionType: "payment.prepared", entityRef: "payment", entityId: voucher.id, summary: `${voucher.disbursementNo} prepared for ${invoice.invoiceNo}.`, afterState: voucher.get({ plain: true }) }));
    })
  );

  await notifyUsers([invoice.vendor?.userId], {
    type: NOTIFICATION_EVENTS.PAYMENT_STATUS,
    title: `Invoice certified — ${invoice.invoiceNo}`,
    body: "Your invoice was certified and a disbursement voucher prepared. Awaiting Treasury release.",
    link: "/invoices",
    refEntity: "invoice",
    refId: invoice.id,
    severity: "info",
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
  let paidAfterThis = Number(contract?.amountPaid ?? 0) + Number(payment.grossAmount);
  let retentionAfterThis =
    Number(contract?.retentionHeld ?? 0) + Number(payment.retentionAmount ?? 0);

  const deliveries = contract?.deliveries ?? [];
  let deliveredInFull =
    deliveries.length > 0 && deliveries.every((delivery) => delivery.status === "accepted");
  // Float tolerance: DECIMAL round-trips through JS numbers, and a contract
  // settled to the last centavo should not be left open by a rounding artefact.
  let paidInFull = paidAfterThis >= contractAmount - 0.005;
  let closes = deliveredInFull && paidInFull;

  await withAuditTransaction(async (transaction, audit) => {
    if (contract) await contract.reload({ transaction, lock: transaction.LOCK.UPDATE });
    const currentInvoice = await Invoice.findByPk(payment.invoiceId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!currentInvoice || currentInvoice.status !== "certified") throw workflowConflict();
    await payment.reload({ transaction, lock: transaction.LOCK.UPDATE });
    if (payment.status !== "prepared" || payment.preparedById === req.currentUser.id) throw workflowConflict();
    const beforeState = recordSnapshot(payment);
    if (contract) {
      await contract.reload({ transaction, lock: transaction.LOCK.UPDATE });
      paidAfterThis = Number(contract.amountPaid ?? 0) + Number(payment.grossAmount);
      retentionAfterThis = Number(contract.retentionHeld ?? 0) + Number(payment.retentionAmount ?? 0);
      if (paidAfterThis > Number(contract.amount) + 0.005) throw workflowConflict();
      paidInFull = paidAfterThis >= Number(contract.amount) - 0.005;
      const currentDeliveries = await Delivery.findAll({ where: { contractId: contract.id }, transaction });
      deliveredInFull = currentDeliveries.length > 0 && currentDeliveries.every(row => row.status === "accepted");
      closes = contract.status === "active" && deliveredInFull && paidInFull;
    }
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
  await audit(actorAudit(req, {
    actionType: AUDIT_ACTIONS.PAYMENT_RELEASED,
    entityRef: "payment",
    entityId: payment.id,
    summary:
      `${payment.disbursementNo} released — net ₱${Number(payment.amount).toLocaleString()} ` +
      `of ₱${Number(payment.grossAmount).toLocaleString()} gross` +
      (closes ? ` (final payment, ${contract.contractNo} closed)` : ""),
    beforeState,
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
      contractOutstanding: Math.max(0, Number(contract?.amount ?? 0) - paidAfterThis),
      contractRetentionHeld: retentionAfterThis,
      contractClosed: closes,
    },
  }));
  });

  const outstanding = Math.max(0, contractAmount - paidAfterThis);



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
