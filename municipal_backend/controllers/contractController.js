import { Op } from "sequelize";
import { sequelize } from "../models/db.js";
import { Contract, Delivery } from "../models/contractModel.js";
import { Award, Rfq } from "../models/biddingModel.js";
import { Vendor } from "../models/vendorModel.js";
import { User } from "../models/userModel.js";
import { notifyUsers, notifyByPermission, NOTIFICATION_EVENTS } from "../services/notifier.js";

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
  const { awardId, startDate, deliveryDeadline, terms, poRef } = req.body;

  const award = await Award.findByPk(awardId, { include: [{ model: Rfq, as: "rfq" }] });
  if (!award) return res.status(400).json({ message: "That award does not exist." });
  if (award.status !== "issued") {
    return res.status(400).json({ message: "The award must be issued before a contract can be drafted." });
  }
  if (await Contract.findOne({ where: { awardId, status: { [Op.ne]: "cancelled" } } })) {
    return res.status(409).json({ message: "This award already has a contract." });
  }

  const year = new Date().getFullYear();
  const count = await Contract.count({ where: { contractNo: { [Op.like]: `CON-${year}-%` } } });

  const contract = await Contract.create({
    contractNo: `CON-${year}-${String(count + 1).padStart(4, "0")}`,
    poRef: poRef ?? null,
    amount: award.amount,
    startDate: startDate ?? null,
    deliveryDeadline: deliveryDeadline ?? null,
    terms: terms ?? null,
    awardId: award.id,
    vendorId: award.vendorId,
    draftedById: req.currentUser.id,
    status: "draft",
  });

  res.status(201).json(serialize(await Contract.findByPk(contract.id, contractIncludes)));
};

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

// ── Delivery ────────────────────────────────────────────────────────────────

export const reportDelivery = async (req, res) => {
  const { description, deliveredAt } = req.body;
  const contract = await Contract.findByPk(req.params.id, contractIncludes);
  if (!contract) return res.status(404).json({ message: "Contract not found." });
  if (contract.status !== "active") {
    return res.status(409).json({ message: "Deliveries can only be reported against an active contract." });
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
