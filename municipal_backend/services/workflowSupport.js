export const workflowError = (message, status = 409, details = {}) => Object.assign(new Error(message), { name: "ProcurementWorkflowError", status, details });
export const actorAudit = (req, payload) => ({
  ...payload, actorId: req.currentUser?.id ?? null, actorName: req.currentUser?.name ?? null,
  actorRole: req.currentUser?.Role?.key ?? null, ipAddress: req.ip ?? null,
});
