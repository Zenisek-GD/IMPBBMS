import { Op } from "sequelize";
import { sequelize } from "../models/db.js";
import {
  Contract,
  Delivery,
  originalAmountOf,
  VARIATION_ORDER_CEILING_RATE,
} from "../models/contractModel.js";
import { Award, Rfq } from "../models/biddingModel.js";
import { Vendor } from "../models/vendorModel.js";
import { User } from "../models/userModel.js";
import {
  Security,
  SECURITY_FORMS,
  PERFORMANCE_SECURITY_RATES,
  requiredPerformanceSecurity,
  WARRANTY_SECURITY_RATE,
} from "../models/securityModel.js";
import { notifyUsers, notifyByPermission, NOTIFICATION_EVENTS } from "../services/notifier.js";
import { auditFromRequest, AUDIT_ACTIONS } from "../services/auditLog.js";

const contractIncludes = {
  include: [
    { model: Vendor, as: "vendor" },
    { model: Award, as: "award", include: [{ model: Rfq, as: "rfq" }] },
    { model: Delivery, as: "deliveries" },
    { model: User, as: "draftedBy", attributes: ["id", "name"] },
  ],
};

const serialize = (contract) => ({
  id: contract.id,
  contractNo: contract.contractNo,
  poRef: contract.poRef,
  amount: Number(contract.amount),
  amountPaid: Number(contract.amountPaid ?? 0),
  amountOutstanding: Math.max(0, Number(contract.amount) - Number(contract.amountPaid ?? 0)),
  startDate: contract.startDate,
  deliveryDeadline: contract.deliveryDeadline,
  terms: contract.terms,
  status: contract.status,
  signedByLguAt: contract.signedByLguAt,
  signedByVendorAt: contract.signedByVendorAt,
  vendorId: contract.vendorId,
  vendorName: contract.vendor?.businessName ?? null,
  noaNumber: contract.award?.noaNumber ?? null,
  referenceNo: contract.award?.rfq?.referenceNo ?? null,
  projectTitle: contract.award?.rfq?.title ?? null,
  draftedByName: contract.draftedBy?.name ?? null,
  deliveries: (contract.deliveries ?? []).map((delivery) => ({
    id: delivery.id,
    deliveredAt: delivery.deliveredAt,
    inspectedAt: delivery.inspectedAt,
    description: delivery.description,
    status: delivery.status,
    remarks: delivery.remarks,
  })),
});

export const listContracts = async (req, res) => {
  const { status } = req.query;
  const where = {};
  if (status) where.status = status;

  // A supplier sees only their own contracts.
  if (req.permissions.has("delivery.submitInvoice") && !req.permissions.has("contract.view")) {
    const vendor = await Vendor.findOne({ where: { userId: req.currentUser.id } });
    if (!vendor) return res.json([]);
    where.vendorId = vendor.id;
  }
  // Observers see only what is already in force (Section 2.2).
  if (req.permissions.has("contract.viewPublished") && !req.permissions.has("contract.view")) {
    where.status = { [Op.in]: ["active", "completed"] };
  }

  const contracts = await Contract.findAll({ where, ...contractIncludes, order: [["createdAt", "DESC"]] });
  res.json(contracts.map(serialize));
};

// Lifecycle step 10: the contract is generated from an issued award.
export const createContract = async (req, res) => {
  const { awardId, startDate, deliveryDeadline, terms, poRef, contractDays } = req.body;

  const award = await Award.findByPk(awardId, { include: [{ model: Rfq, as: "rfq" }] });
  if (!award) return res.status(400).json({ message: "That award does not exist." });
  if (award.status !== "issued") {
    return res.status(400).json({ message: "The award must be issued before a contract can be drafted." });
  }
  if (await Contract.findOne({ where: { awardId, status: { [Op.ne]: "cancelled" } } })) {
    return res.status(409).json({ message: "This award already has a contract." });
  }

  // Contract time is what makes delay — and therefore liquidated damages —
  // computable. `services/deductions.js` has always been able to calculate them
  // and has never had anything to calculate from, because nothing outside the
  // demo seeder ever set these two fields.
  const days = Number(contractDays);
  if (!Number.isInteger(days) || days <= 0) {
    return res.status(400).json({
      message:
        "A contract period in calendar days is required. Without it there is no day zero to count " +
        "delay from, and liquidated damages cannot be computed.",
    });
  }

  // Goods and small-value awards run on a Purchase Order; infrastructure and
  // consulting on a Contract. They carry different securities and retention
  // rules, so the instrument follows the category rather than being guessed.
  const category = award.rfq?.category ?? "goods";

  const year = new Date().getFullYear();
  const count = await Contract.count({ where: { contractNo: { [Op.like]: `CON-${year}-%` } } });

  const contract = await Contract.create({
    contractNo: `CON-${year}-${String(count + 1).padStart(4, "0")}`,
    poRef: poRef ?? null,
    amount: award.amount,
    category,
    instrumentType: category === "goods" ? "purchaseOrder" : "contract",
    contractDays: days,
    startDate: startDate ?? null,
    deliveryDeadline: deliveryDeadline ?? null,
    terms: terms ?? null,
    awardId: award.id,
    vendorId: award.vendorId,
    draftedById: req.currentUser.id,
    status: "draft",
  });

  res.status(201).json({
    ...serialize(await Contract.findByPk(contract.id, contractIncludes)),
    // Told at drafting time, so the supplier knows what to post before they are
    // asked to sign rather than being blocked at the signature.
    performanceSecurity: {
      required: true,
      rates: PERFORMANCE_SECURITY_RATES[category] ?? PERFORMANCE_SECURITY_RATES.goods,
      amountBySuretyBond: requiredPerformanceSecurity(award.amount, category, "suretyBond"),
      amountByCash: requiredPerformanceSecurity(award.amount, category, "cash"),
    },
  });
};

// ── Performance security (RA 12009 Sec. 68) ─────────────────────────────────
// "To guarantee the faithful performance by the winning bidder of its
// obligations under the contract... it shall post a performance security prior
// to the signing of the contract."
//
// The rates and the helper for this have been in `models/securityModel.js` from
// the start, and that file states the rule in its own comment — "Posted BEFORE
// contract signing... the reason a contract may not be activated without it".
// Nothing ever called it. A contract went active on two signatures and the LGU
// held nothing against non-performance.
export const postPerformanceSecurity = async (req, res) => {
  const { form, referenceNo, issuer, amount } = req.body ?? {};
  const contract = await Contract.findByPk(req.params.id, contractIncludes);
  if (!contract) return res.status(404).json({ message: "Contract not found." });

  if (!["draft", "pendingSignatures"].includes(contract.status)) {
    return res.status(409).json({
      message: `Performance security is posted before signing; this contract is "${contract.status}".`,
    });
  }
  if (!SECURITY_FORMS.includes(form)) {
    return res.status(400).json({ message: "Unknown security form.", accepted: SECURITY_FORMS });
  }

  const existing = await Security.findOne({
    where: { type: "performance", entityRef: "contract", entityId: contract.id, status: "posted" },
  });
  if (existing) {
    return res.status(409).json({ message: "A performance security is already posted for this contract." });
  }

  const required = requiredPerformanceSecurity(contract.amount, contract.category, form);
  const posted = amount === undefined ? required : Number(amount);

  // Sec. 68.4 — "in the amount not less than the required percentage of the
  // total contract price". A Performance Securing Declaration carries no
  // deposit, so its zero is legitimate and is not measured against the table.
  if (form !== "securingDeclaration" && posted < required) {
    return res.status(400).json({
      message:
        `A ${form} performance security for a ${contract.category} contract of ` +
        `₱${Number(contract.amount).toLocaleString()} must be at least ₱${required.toLocaleString()} ` +
        `(RA 12009 Sec. 68.4). ₱${posted.toLocaleString()} was posted.`,
      required,
      posted,
    });
  }

  const security = await Security.create({
    type: "performance",
    form,
    amount: posted,
    percentage: (PERFORMANCE_SECURITY_RATES[contract.category] ?? PERFORMANCE_SECURITY_RATES.goods)[form] ?? 0,
    referenceNo: referenceNo ?? null,
    issuer: issuer ?? null,
    postedAt: new Date(),
    status: "posted",
    entityRef: "contract",
    entityId: contract.id,
    vendorId: contract.vendorId,
    recordedById: req.currentUser.id,
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.SECURITY_POSTED,
    entityRef: "contract",
    entityId: contract.id,
    summary:
      `Performance security posted for ${contract.contractNo}: ${form} ₱${posted.toLocaleString()}`,
    afterState: { form, amount: posted, required },
  });

  res.status(201).json({ id: security.id, form, amount: posted, required });
};

const performanceSecurityFor = (contractId) =>
  Security.findOne({
    where: { type: "performance", entityRef: "contract", entityId: contractId, status: "posted" },
  });

export const issueForSignature = async (req, res) => {
  const contract = await Contract.findByPk(req.params.id, contractIncludes);
  if (!contract) return res.status(404).json({ message: "Contract not found." });
  if (contract.status !== "draft") {
    return res.status(409).json({ message: `Cannot issue from status "${contract.status}".` });
  }

  await contract.update({ status: "pendingSignatures" });

  await notifyUsers([contract.vendor?.userId], {
    type: NOTIFICATION_EVENTS.CONTRACT_READY,
    title: `Contract ready to sign — ${contract.contractNo}`,
    body: `${contract.award?.rfq?.title ?? "Your awarded procurement"} — ₱${Number(contract.amount).toLocaleString()}.`,
    link: "/supplier/contracts",
    refEntity: "contract",
    refId: contract.id,
    severity: "warning",
  });

  res.json(serialize(await Contract.findByPk(contract.id, contractIncludes)));
};

// Both parties must sign before the contract becomes active. `party` is
// derived from the caller's permission rather than trusted from the body.
export const signContract = async (req, res) => {
  const contract = await Contract.findByPk(req.params.id, contractIncludes);
  if (!contract) return res.status(404).json({ message: "Contract not found." });
  if (contract.status !== "pendingSignatures") {
    return res.status(409).json({ message: "This contract is not awaiting signatures." });
  }

  // Sec. 68.1 — the security is posted "prior to the signing of the contract",
  // so this gate sits before either signature rather than at activation.
  const security = await performanceSecurityFor(contract.id);
  if (!security) {
    return res.status(409).json({
      message:
        `The winning bidder must post a performance security before this contract is signed ` +
        `(RA 12009 Sec. 68.1). For a ${contract.category} contract of ` +
        `₱${Number(contract.amount).toLocaleString()} that is ` +
        `₱${requiredPerformanceSecurity(contract.amount, contract.category, "suretyBond").toLocaleString()} ` +
        `by surety bond, or ` +
        `₱${requiredPerformanceSecurity(contract.amount, contract.category, "cash").toLocaleString()} in cash.`,
      requiredBySuretyBond: requiredPerformanceSecurity(contract.amount, contract.category, "suretyBond"),
      requiredByCash: requiredPerformanceSecurity(contract.amount, contract.category, "cash"),
    });
  }

  const isVendorSigning = req.permissions.has("delivery.submitInvoice") && !req.permissions.has("contract.draft");

  if (isVendorSigning) {
    const vendor = await Vendor.findOne({ where: { userId: req.currentUser.id } });
    if (!vendor || vendor.id !== contract.vendorId) {
      return res.status(403).json({ message: "This is not your contract." });
    }
    if (contract.signedByVendorAt) {
      return res.status(409).json({ message: "You have already signed this contract." });
    }
    contract.signedByVendorAt = new Date();
  } else {
    if (!req.permissions.has("contract.sign")) {
      return res.status(403).json({ message: "You do not have permission to sign contracts." });
    }
    if (contract.signedByLguAt) {
      return res.status(409).json({ message: "The LGU has already signed this contract." });
    }
    contract.signedByLguAt = new Date();
  }

  // Active only once both signatures are present.
  if (contract.signedByLguAt && contract.signedByVendorAt) {
    contract.status = "active";
  }
  await contract.save();

  if (contract.status === "active") {
    await notifyUsers([contract.vendor?.userId], {
      type: NOTIFICATION_EVENTS.CONTRACT_READY,
      title: `Contract active — ${contract.contractNo}`,
      body: "Both parties have signed. You may proceed with delivery.",
      link: "/supplier/contracts",
      refEntity: "contract",
      refId: contract.id,
      severity: "success",
    });
  }

  res.json(serialize(await Contract.findByPk(contract.id, contractIncludes)));
};

// ── Notice to Proceed ───────────────────────────────────────────────────────
// The instrument that starts contract time. A signed contract is an agreement;
// the NTP is the day the clock starts, and without it delay has no reference
// point — `services/deductions.js` returns nothing at all when
// `noticeToProceedAt` is null, which meant liquidated damages could never
// accrue on any contract this system produced.
export const issueNoticeToProceed = async (req, res) => {
  const { issuedAt } = req.body ?? {};
  const contract = await Contract.findByPk(req.params.id, contractIncludes);
  if (!contract) return res.status(404).json({ message: "Contract not found." });

  if (contract.status !== "active") {
    return res.status(409).json({
      message:
        `A Notice to Proceed is issued on a contract in force. This one is "${contract.status}" — ` +
        `both parties must sign before work can be ordered to begin.`,
    });
  }
  if (contract.noticeToProceedAt) {
    return res.status(409).json({
      message: `A Notice to Proceed was already issued on ${new Date(contract.noticeToProceedAt).toLocaleDateString()}.`,
    });
  }

  const effective = issuedAt ? new Date(issuedAt) : new Date();
  if (Number.isNaN(effective.getTime())) {
    return res.status(400).json({ message: "Invalid Notice to Proceed date." });
  }
  // Backdating an NTP shortens the contract period the supplier actually had,
  // and inflates the liquidated damages computed against it.
  if (contract.signedByVendorAt && effective < new Date(contract.signedByVendorAt)) {
    return res.status(400).json({
      message: "A Notice to Proceed cannot take effect before the contract was signed.",
    });
  }

  const expectedCompletion = new Date(
    effective.getTime() + Number(contract.contractDays ?? 0) * 24 * 60 * 60 * 1000
  );

  await contract.update({ noticeToProceedAt: effective, startDate: effective.toISOString().slice(0, 10) });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.NOTICE_TO_PROCEED_ISSUED,
    entityRef: "contract",
    entityId: contract.id,
    summary:
      `Notice to Proceed issued on ${contract.contractNo} — ${contract.contractDays} calendar days, ` +
      `expected completion ${expectedCompletion.toISOString().slice(0, 10)}`,
    afterState: {
      noticeToProceedAt: effective,
      contractDays: contract.contractDays,
      expectedCompletion,
    },
  });

  await notifyUsers([contract.vendor?.userId], {
    type: NOTIFICATION_EVENTS.CONTRACT_READY,
    title: `Notice to Proceed — ${contract.contractNo}`,
    body:
      `You may begin. ${contract.contractDays} calendar days from ` +
      `${effective.toLocaleDateString()}; expected completion ${expectedCompletion.toLocaleDateString()}. ` +
      `Delay beyond that date attracts liquidated damages.`,
    link: "/supplier/contracts",
    refEntity: "contract",
    refId: contract.id,
    severity: "warning",
  });

  res.json({
    id: contract.id,
    noticeToProceedAt: effective,
    contractDays: contract.contractDays,
    expectedCompletion,
  });
};

// ── Delivery ────────────────────────────────────────────────────────────────

export const reportDelivery = async (req, res) => {
  const { description, deliveredAt } = req.body;
  const contract = await Contract.findByPk(req.params.id, contractIncludes);
  if (!contract) return res.status(404).json({ message: "Contract not found." });
  if (contract.status !== "active") {
    return res.status(409).json({ message: "Deliveries can only be reported against an active contract." });
  }

  // Work is ordered to begin by the Notice to Proceed. A delivery reported
  // before one has been issued is either a mis-dated record or work started
  // without authority; both are worth catching here.
  if (!contract.noticeToProceedAt) {
    return res.status(409).json({
      message:
        "No Notice to Proceed has been issued on this contract, so contract time has not started. " +
        "Issue it before deliveries are reported against the contract.",
    });
  }

  const delivery = await Delivery.create({
    contractId: contract.id,
    reportedById: req.currentUser.id,
    deliveredAt: deliveredAt ?? new Date(),
    description: description ?? null,
    status: "reported",
  });

  // Section 6: the GSO inspects and accepts, so whoever holds that duty is told.
  await notifyByPermission("delivery.report", {
    type: NOTIFICATION_EVENTS.DELIVERY_ACCEPTED,
    title: `Delivery reported — ${contract.contractNo}`,
    body: `${contract.vendor?.businessName ?? "The supplier"} reported a delivery awaiting inspection.`,
    link: "/deliveries",
    refEntity: "delivery",
    refId: delivery.id,
    severity: "info",
  });

  res.status(201).json({ id: delivery.id, status: delivery.status });
};

export const inspectDelivery = async (req, res) => {
  const { result, remarks, acceptedQuantityNote } = req.body;
  const delivery = await Delivery.findByPk(req.params.deliveryId, {
    include: [{ model: Contract, as: "contract", include: [{ model: Vendor, as: "vendor" }] }],
  });
  if (!delivery) return res.status(404).json({ message: "Delivery not found." });
  if (delivery.status === "accepted" || delivery.status === "rejected") {
    return res.status(409).json({ message: "This delivery has already been inspected." });
  }
  if (!["accepted", "rejected"].includes(result)) {
    return res.status(400).json({ message: "Result must be accepted or rejected." });
  }
  if (result === "rejected" && !remarks?.trim()) {
    return res.status(400).json({ message: "Remarks are required when rejecting a delivery." });
  }

  await sequelize.transaction(async (transaction) => {
    await delivery.update(
      {
        status: result,
        inspectedById: req.currentUser.id,
        inspectedAt: new Date(),
        remarks: remarks?.trim() ?? null,
        acceptedQuantityNote: acceptedQuantityNote ?? null,
      },
      { transaction }
    );
  });

  await notifyUsers([delivery.contract?.vendor?.userId], {
    type: NOTIFICATION_EVENTS.DELIVERY_ACCEPTED,
    title: result === "accepted" ? "Delivery accepted" : "Delivery rejected",
    body:
      result === "accepted"
        ? `Your delivery under ${delivery.contract?.contractNo} was accepted. You may now submit an invoice.`
        : remarks?.trim(),
    link: "/supplier/contracts",
    refEntity: "delivery",
    refId: delivery.id,
    severity: result === "accepted" ? "success" : "danger",
  });

  res.json({ id: delivery.id, status: result });
};

export const listDeliveries = async (req, res) => {
  const deliveries = await Delivery.findAll({
    include: [
      { model: Contract, as: "contract", include: [{ model: Vendor, as: "vendor" }] },
      { model: User, as: "reportedBy", attributes: ["id", "name"] },
    ],
    order: [["createdAt", "DESC"]],
  });

  res.json(
    deliveries.map((delivery) => ({
      id: delivery.id,
      status: delivery.status,
      deliveredAt: delivery.deliveredAt,
      inspectedAt: delivery.inspectedAt,
      description: delivery.description,
      remarks: delivery.remarks,
      contractNo: delivery.contract?.contractNo ?? null,
      vendorName: delivery.contract?.vendor?.businessName ?? null,
      reportedByName: delivery.reportedBy?.name ?? null,
    }))
  );
};

// ── Variation orders (RA 12009 Sec. 71) ──────────────────────────────────────
// Change and Extra Work Orders for infrastructure; Amendments to Order for
// goods. Two rules make this more than a figure in a text box:
//
//   · the cumulative value may not exceed ten percent of the original contract
//     price — the ceiling is on the total, not on each order; and
//   · "The winning bidder is required to update the performance security posted
//     prior to the issuance of a variation order" (Sec. 68.1). A variation that
//     enlarges the contract while the security still covers the original price
//     leaves the LGU under-secured on the difference.
export const issueVariationOrder = async (req, res) => {
  const { amount, justification } = req.body ?? {};
  const contract = await Contract.findByPk(req.params.id, contractIncludes);
  if (!contract) return res.status(404).json({ message: "Contract not found." });

  if (contract.status !== "active") {
    return res.status(409).json({
      message: `A variation order is issued against a contract in force. This one is "${contract.status}".`,
    });
  }

  const delta = Number(amount);
  if (!Number.isFinite(delta) || delta === 0) {
    return res.status(400).json({ message: "State the value of the variation." });
  }
  if (!justification?.trim() || justification.trim().length < 30) {
    return res.status(400).json({
      message:
        "A variation order must be justified in writing — the condition, event or necessity that " +
        "requires it (RA 12009 Sec. 71).",
    });
  }

  const original = originalAmountOf(contract);
  const newVariationTotal = Number(contract.variationTotal) + delta;
  const ceiling = original * VARIATION_ORDER_CEILING_RATE;

  if (Math.abs(newVariationTotal) > ceiling) {
    return res.status(409).json({
      message:
        `Variation orders on this contract would total ₱${Math.abs(newVariationTotal).toLocaleString()}, ` +
        `above the ₱${ceiling.toLocaleString()} ceiling — ten percent of the original contract price of ` +
        `₱${original.toLocaleString()} (RA 12009 Sec. 71). A change beyond that is a new procurement.`,
      ceiling,
      wouldTotal: newVariationTotal,
    });
  }

  const newAmount = Number(contract.amount) + delta;

  // Sec. 68.1 — the security must cover the enlarged contract before the order
  // is issued, not after.
  if (delta > 0) {
    const security = await performanceSecurityFor(contract.id);
    const requiredNow = requiredPerformanceSecurity(
      newAmount,
      contract.category,
      security?.form ?? "suretyBond"
    );
    if (!security || Number(security.amount) < requiredNow) {
      return res.status(409).json({
        message:
          `The performance security must be updated before this variation order is issued ` +
          `(RA 12009 Sec. 68.1). A contract of ₱${newAmount.toLocaleString()} requires ` +
          `₱${requiredNow.toLocaleString()}; ₱${Number(security?.amount ?? 0).toLocaleString()} is posted.`,
        required: requiredNow,
        posted: Number(security?.amount ?? 0),
      });
    }
  }

  await contract.update({ amount: newAmount, variationTotal: newVariationTotal });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.VARIATION_ORDER_APPROVED,
    entityRef: "contract",
    entityId: contract.id,
    summary:
      `Variation order on ${contract.contractNo}: ${delta > 0 ? "+" : ""}₱${delta.toLocaleString()} ` +
      `(cumulative ₱${newVariationTotal.toLocaleString()} of a ₱${ceiling.toLocaleString()} ceiling)`,
    beforeState: {
      amount: Number(contract.amount) - delta,
      variationTotal: Number(contract.variationTotal) - delta,
    },
    afterState: { amount: newAmount, variationTotal: newVariationTotal, justification: justification.trim() },
  });

  res.json({
    id: contract.id,
    amount: newAmount,
    variationTotal: newVariationTotal,
    ceiling,
    headroom: ceiling - Math.abs(newVariationTotal),
  });
};

// ── Termination (RA 12009 Sec. 71) ───────────────────────────────────────────
// A contract can end without being completed. The ground matters: a termination
// for the supplier's default forfeits the performance security, while one for
// the LGU's own convenience does not — so the ground is recorded and the
// security is acted on accordingly rather than left posted indefinitely.
export const terminateContract = async (req, res) => {
  const { ground, reason } = req.body ?? {};
  const contract = await Contract.findByPk(req.params.id, contractIncludes);
  if (!contract) return res.status(404).json({ message: "Contract not found." });

  if (!["active", "pendingSignatures"].includes(contract.status)) {
    return res.status(409).json({ message: `Cannot terminate a contract in "${contract.status}".` });
  }
  if (!["default", "breach", "convenience", "unlawfulActs"].includes(ground)) {
    return res.status(400).json({
      message: "State the ground for termination.",
      accepted: ["default", "breach", "convenience", "unlawfulActs"],
    });
  }
  if (!reason?.trim() || reason.trim().length < 30) {
    return res.status(400).json({
      message: "A notice of termination must state the reasons in writing (RA 12009 Sec. 71).",
    });
  }

  // Forfeiture follows fault. Termination for convenience is the LGU's choice,
  // not the supplier's failure, so their security is returned.
  const forfeits = ground !== "convenience";

  await sequelize.transaction(async (transaction) => {
    await contract.update(
      {
        status: "rescinded",
        terminatedAt: new Date(),
        terminationGround: ground,
        terminationReason: reason.trim(),
      },
      { transaction }
    );

    await Security.update(
      forfeits
        ? { status: "forfeited", forfeitedAt: new Date(), forfeitureReason: reason.trim() }
        : { status: "released", releasedAt: new Date() },
      {
        where: { entityRef: "contract", entityId: contract.id, type: "performance", status: "posted" },
        transaction,
      }
    );
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.CONTRACT_TERMINATED,
    entityRef: "contract",
    entityId: contract.id,
    summary: `${contract.contractNo} terminated for ${ground} — performance security ${forfeits ? "forfeited" : "released"}`,
    beforeState: { status: contract.status },
    afterState: { status: "rescinded", ground, reason: reason.trim(), securityForfeited: forfeits },
  });

  await notifyUsers([contract.vendor?.userId], {
    type: NOTIFICATION_EVENTS.CONTRACT_READY,
    title: `Notice of Termination — ${contract.contractNo}`,
    body: `${reason.trim()} Your performance security has been ${forfeits ? "forfeited" : "released"}.`,
    link: "/supplier/contracts",
    refEntity: "contract",
    refId: contract.id,
    severity: "danger",
  });

  res.json({ id: contract.id, status: "rescinded", ground, securityForfeited: forfeits });
};

// ── Warranty security (RA 12009 Sec. 68) ─────────────────────────────────────
// Posted on final acceptance and retained for the warranty period, covering
// defects that surface after the work is taken over. `WARRANTY_SECURITY_RATE`
// has been exported since the securities model was written and had no call
// site, so a contract could be completed with nothing standing behind it.
export const postWarrantySecurity = async (req, res) => {
  const { form, referenceNo, issuer, warrantyMonths } = req.body ?? {};
  const contract = await Contract.findByPk(req.params.id, contractIncludes);
  if (!contract) return res.status(404).json({ message: "Contract not found." });

  if (!["active", "completed"].includes(contract.status)) {
    return res.status(409).json({
      message: "Warranty security is posted on final acceptance of a contract that ran to completion.",
    });
  }
  if (!SECURITY_FORMS.includes(form)) {
    return res.status(400).json({ message: "Unknown security form.", accepted: SECURITY_FORMS });
  }

  const required = Math.round(Number(contract.amount) * WARRANTY_SECURITY_RATE * 100) / 100;
  const months = Number(warrantyMonths) || 12;
  const validUntil = new Date();
  validUntil.setMonth(validUntil.getMonth() + months);

  const security = await Security.create({
    type: "warranty",
    form,
    amount: required,
    percentage: WARRANTY_SECURITY_RATE,
    referenceNo: referenceNo ?? null,
    issuer: issuer ?? null,
    postedAt: new Date(),
    validUntil: validUntil.toISOString().slice(0, 10),
    status: "posted",
    entityRef: "contract",
    entityId: contract.id,
    vendorId: contract.vendorId,
    recordedById: req.currentUser.id,
  });

  // The performance security has done its job once the warranty one is posted.
  await Security.update(
    { status: "released", releasedAt: new Date() },
    { where: { entityRef: "contract", entityId: contract.id, type: "performance", status: "posted" } }
  );

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.SECURITY_POSTED,
    entityRef: "contract",
    entityId: contract.id,
    summary:
      `Warranty security posted on ${contract.contractNo}: ₱${required.toLocaleString()} for ` +
      `${months} month(s); performance security released`,
    afterState: { type: "warranty", amount: required, validUntil, warrantyMonths: months },
  });

  res.status(201).json({ id: security.id, amount: required, validUntil, warrantyMonths: months });
};
