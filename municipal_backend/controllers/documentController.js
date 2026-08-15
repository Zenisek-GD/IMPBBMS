import { Document, DOCUMENT_METADATA_ATTRIBUTES } from "../models/documentModel.js";
import { Vendor } from "../models/vendorModel.js";
import { Contract, Delivery } from "../models/contractModel.js";
import { Bid } from "../models/biddingModel.js";
import { Invoice } from "../models/paymentModel.js";
import { User } from "../models/userModel.js";
import { checksumOf, safeFilename } from "../services/documentStore.js";
import { auditFromRequest, AUDIT_ACTIONS } from "../services/auditLog.js";

// Design doc Section 12: "File uploads and document access restricted by
// permission (e.g., vendor documents visible only to authorized reviewers)."
//
// Access is decided per attachment point rather than globally, because a
// supplier must reach their own documents and nobody else's, while reviewers
// need to reach everyone's. Returns { read, write } for the caller.
const accessFor = async (req, entityRef, entityId) => {
  const has = (permission) => req.permissions.has(permission);

  // The vendor profile belonging to this caller, if any.
  const ownVendor = has("bidding.submitBid")
    ? await Vendor.findOne({ where: { userId: req.currentUser.id } })
    : null;

  switch (entityRef) {
    case "vendor": {
      const isOwner = ownVendor?.id === Number(entityId);
      return {
        // The bidder can still see what the office holds on file for them.
        read: isOwner || has("bidding.publish") || has("bidding.view") || has("audit.viewAll"),
        // Write is the REVIEWER's, not the bidder's — the reverse of what it used
        // to be. Accreditation documents are submitted on paper at the BAC
        // office, so the only files that should ever land on a vendor record are
        // the ones an officer scanned in from that counter submission. A bidder
        // who could still upload here would have a route back to submitting
        // requirements through the website, which is exactly what was removed.
        write: has("bidding.publish"),
      };
    }

    case "announcement": {
      // Bidding documents, terms of reference and specifications hung off an
      // Invitation to Bid.
      //
      // Read is wide on purpose: these are the papers a prospective bidder
      // needs, and once the notice is published they are public anyway — the
      // unauthenticated download lives on the public router, which checks that
      // the notice is published before serving anything. This branch governs
      // the *internal* view, so it is scoped to the offices that work on
      // procurement rather than to everyone with a login.
      //
      // Write is the publishing office alone. An attachment on a notice is part
      // of the invitation: whoever can add one can change what bidders are
      // asked to price.
      return {
        read: has("bidding.view") || has("announcements.manage") || has("audit.viewAll"),
        write: has("announcements.manage"),
      };
    }

    case "bid": {
      // Bid attachments follow the same disclosure rule as the bid itself, so
      // they are readable by evaluators and by the bid's owner — but "the bid's
      // owner" means THIS bid's vendor, not any vendor. Checking only that the
      // caller has a vendor profile would let one bidder read, replace or delete
      // a competitor's bid documents, which are confidential until opening.
      const bid = await Bid.findByPk(entityId);
      const isOwner = Boolean(ownVendor) && bid?.vendorId === ownVendor.id;
      return {
        read: isOwner || has("bidding.view") || has("bidding.evaluate") || has("bidding.technicalInput"),
        write: isOwner,
      };
    }

    case "contract": {
      const contract = await Contract.findByPk(entityId);
      const isOwner = ownVendor && contract?.vendorId === ownVendor.id;
      return {
        read: isOwner || has("contract.view") || has("contract.draft") || has("audit.viewAll"),
        write: isOwner || has("contract.draft"),
      };
    }

    case "delivery": {
      // A delivery belongs to one contract, which belongs to one vendor. A
      // supplier may only reach delivery papers on their OWN contract; checking
      // just that the caller is a vendor would expose another supplier's
      // delivery and inspection records. Officers keep their permission-based
      // access.
      const delivery = await Delivery.findByPk(entityId, {
        include: [{ model: Contract, as: "contract" }],
      });
      const isOwner = Boolean(ownVendor) && delivery?.contract?.vendorId === ownVendor.id;
      return {
        read: isOwner || has("delivery.report") || has("contract.view"),
        write: isOwner || has("delivery.report"),
      };
    }

    case "invoice": {
      const invoice = await Invoice.findByPk(entityId);
      const isOwner = ownVendor && invoice?.vendorId === ownVendor.id;
      return {
        read: isOwner || has("payment.view") || has("audit.viewAll"),
        write: isOwner,
      };
    }

    default:
      // Unknown attachment points are refused rather than allowed — a new
      // entity type must be added here deliberately.
      return { read: false, write: false };
  }
};

const serialize = (document) => ({
  id: document.id,
  filename: document.filename,
  mimeType: document.mimeType,
  sizeBytes: document.sizeBytes,
  checksum: document.checksum,
  entityRef: document.entityRef,
  entityId: document.entityId,
  docType: document.docType,
  label: document.label,
  uploadedAt: document.uploadedAt,
  uploadedByName: document.uploadedBy?.name ?? null,
});

export const uploadDocument = async (req, res) => {
  const { entityRef, entityId, docType, label } = req.body;

  if (!req.file) return res.status(400).json({ message: "No file was received." });
  if (!entityRef || !entityId) {
    return res.status(400).json({ message: "entityRef and entityId are required." });
  }

  const access = await accessFor(req, entityRef, Number(entityId));
  if (!access.write) {
    // Section 2.2 requires denied actions to be recorded too.
    await auditFromRequest(req, {
      actionType: AUDIT_ACTIONS.PERMISSION_DENIED,
      entityRef,
      entityId: Number(entityId),
      outcome: "denied",
      summary: `Refused document upload to ${entityRef}#${entityId}`,
    });
    return res.status(403).json({ message: "You may not attach documents to that record." });
  }

  const filename = safeFilename(req.file.originalname);
  const checksum = checksumOf(req.file.buffer);

  // Re-uploading the same slot replaces rather than accumulating duplicates,
  // which is what "attach your PhilGEPS certificate" means in practice.
  if (docType) {
    await Document.destroy({ where: { entityRef, entityId: Number(entityId), docType } });
  }

  const document = await Document.create({
    filename,
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size,
    content: req.file.buffer,
    checksum,
    entityRef,
    entityId: Number(entityId),
    docType: docType ?? null,
    label: label ?? null,
    uploadedById: req.currentUser.id,
    uploadedAt: new Date(),
  });

  await auditFromRequest(req, {
    actionType: "document.uploaded",
    entityRef,
    entityId: Number(entityId),
    summary: `Uploaded ${filename} (${(req.file.size / 1024).toFixed(0)} KB)`,
    afterState: { documentId: document.id, docType: docType ?? null, checksum },
  });

  res.status(201).json(serialize(document));
};

export const listDocuments = async (req, res) => {
  const { entityRef, entityId } = req.query;
  if (!entityRef || !entityId) {
    return res.status(400).json({ message: "entityRef and entityId are required." });
  }

  const access = await accessFor(req, entityRef, Number(entityId));
  if (!access.read) {
    return res.status(403).json({ message: "You may not view documents on that record." });
  }

  // Metadata only — never selects the blob column.
  const documents = await Document.findAll({
    where: { entityRef, entityId: Number(entityId) },
    attributes: DOCUMENT_METADATA_ATTRIBUTES,
    include: [{ model: User, as: "uploadedBy", attributes: ["id", "name"] }],
    order: [["uploadedAt", "DESC"]],
  });

  res.json(documents.map(serialize));
};

export const downloadDocument = async (req, res) => {
  const document = await Document.findByPk(req.params.id);
  if (!document) return res.status(404).json({ message: "Document not found." });

  const access = await accessFor(req, document.entityRef, document.entityId);
  if (!access.read) {
    await auditFromRequest(req, {
      actionType: AUDIT_ACTIONS.PERMISSION_DENIED,
      entityRef: document.entityRef,
      entityId: document.entityId,
      outcome: "denied",
      summary: `Refused download of document #${document.id}`,
    });
    return res.status(403).json({ message: "You may not download that document." });
  }

  // Always a download, never rendered in place: an uploaded file must not be
  // able to execute in our origin. `nosniff` stops the browser second-guessing
  // the declared type.
  res.setHeader("Content-Type", document.mimeType);
  res.setHeader("Content-Length", document.sizeBytes);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("Content-Disposition", `attachment; filename="${document.filename}"`);
  res.send(document.content);
};

export const deleteDocument = async (req, res) => {
  const document = await Document.findByPk(req.params.id, {
    attributes: DOCUMENT_METADATA_ATTRIBUTES,
  });
  if (!document) return res.status(404).json({ message: "Document not found." });

  const access = await accessFor(req, document.entityRef, document.entityId);
  if (!access.write) {
    return res.status(403).json({ message: "You may not remove that document." });
  }

  await auditFromRequest(req, {
    actionType: "document.deleted",
    entityRef: document.entityRef,
    entityId: document.entityId,
    summary: `Removed ${document.filename}`,
    beforeState: { documentId: document.id, checksum: document.checksum },
  });

  await document.destroy();
  res.json({ message: "Document removed." });
};
