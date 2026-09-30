import crypto from "node:crypto";
import { MutationReceipt } from "../models/mutationReceiptModel.js";
import { attachRecordChangeAudit, withRecordChangeAudit } from "../services/recordChangeAudit.js";

const MUTATIONS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const BUSINESS_PATH = /^\/api\/(?:planning|budget-preparation|app-entries|purchase-requisitions|bidding|finance|contracts|conferences|announcements|observers|protests|departments|messages|vendors|settings)(?:\/|$)/;
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
export const canonicalMutation = value => value === null || typeof value !== "object" ? value
  : Array.isArray(value) ? value.map(canonicalMutation)
    : Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalMutation(value[key])]));
const conflict = (res, code, message) => res.status(409).json({ code, message });

export const protectMutation = (handler, { Receipt = MutationReceipt } = {}) => async (req, res, next) => {
  const key = req.get?.("Idempotency-Key");
  const url = req.originalUrl || req.url || "";
  if (!key || !req.currentUser?.id || !MUTATIONS.has(req.method) || !BUSINESS_PATH.test(url) || !req.is?.("application/json")) {
    return handler(req, res, next);
  }
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) return res.status(400).json({ message: "The action reference is invalid. Reload the form and try again." });
  const actorScope = hash(JSON.stringify([req.currentUser.Role?.id, req.currentUser.Role?.key, req.currentUser.departmentId, [...(req.permissions ?? [])].sort()]));
  const requestHash = hash(JSON.stringify([req.method, url, canonicalMutation(req.body ?? {})]));
  const id = hash(`${req.currentUser.id}:${key}`);
  let receipt;
  try {
    receipt = await Receipt.create({ id, actorId: req.currentUser.id, actorScope, requestHash });
  } catch (error) {
    if (error.name !== "SequelizeUniqueConstraintError") throw error;
    receipt = await Receipt.findByPk(id);
    if (!receipt || receipt.actorScope !== actorScope || receipt.requestHash !== requestHash) {
      return conflict(res, "ACTION_REFERENCE_CONFLICT", "This action reference belongs to a different request or permission context. Reload the record before continuing.");
    }
    if (receipt.status === "completed") {
      res.set("Idempotency-Replayed", "true");
      return res.status(receipt.statusCode).json(receipt.responseBody);
    }
    return conflict(res, receipt.status === "processing" ? "ACTION_IN_PROGRESS" : "ACTION_OUTCOME_UNCERTAIN",
      receipt.status === "processing" ? "This action is already being processed. Wait and refresh its status before trying again."
        : "This action may already have been saved. Refresh the record to check its status before starting another action.");
  }

  // Hold JSON until the receipt is durable. Permission middleware has already
  // run, including on replays, because this wraps only the final route handler.
  const originalJson = res.json;
  let response;
  res.json = function (body) { response = { statusCode: this.statusCode, body: JSON.parse(JSON.stringify(body ?? null)) }; return this; };
  try {
    await handler(req, res, error => { if (error) throw error; return next(); });
    res.json = originalJson;
    if (!response) {
      await receipt.update({ status: "uncertain", completedAt: new Date() });
      return;
    }
    await receipt.update({ status: response.statusCode >= 500 ? "uncertain" : "completed", statusCode: response.statusCode, responseBody: response.body, completedAt: new Date() });
    return originalJson.call(res.status(response.statusCode), response.body);
  } catch (error) {
    res.json = originalJson;
    // A process/connection failure can occur after a business commit. Retain
    // the claim rather than risking a second approval or payment on retry.
    await receipt.update({ status: "uncertain", completedAt: new Date() }).catch(() => {});
    throw error;
  }
};

const PROTECTED = Symbol("mutationProtected");
export const protectRouterMutations = owner => {
  attachRecordChangeAudit();
  for (const layer of owner?.stack ?? []) {
    if (layer.handle?.stack) protectRouterMutations(layer.handle);
    if (!layer.route || !Object.keys(layer.route.methods).some(method => MUTATIONS.has(method.toUpperCase()))) continue;
    const controller = layer.route.stack.at(-1);
    if (!controller?.handle || controller.handle[PROTECTED]) continue;
    const handler = controller.handle;
    const protectedHandler = protectMutation((req, res, next) => withRecordChangeAudit(req, () => handler(req, res, next)));
    protectedHandler[PROTECTED] = true;
    controller.handle = protectedHandler;
  }
};
