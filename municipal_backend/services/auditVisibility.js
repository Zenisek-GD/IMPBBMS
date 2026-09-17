import { Op } from "sequelize";

// The immutable audit chain contains two useful, but materially different,
// kinds of evidence. A row with an accountable actor is a user or official
// action; a row without one is emitted by infrastructure/security work (for
// example an unauthenticated sign-in failure). Keeping the split here makes
// every audit endpoint apply the same privacy boundary.
export const AUDIT_ACTIVITY_SCOPES = Object.freeze({
  OFFICIAL: "official",
  SYSTEM: "system",
});

export const canViewSystemActivity = (permissions) =>
  Boolean(permissions?.has?.("audit.viewLogs"));

// The official stream is deliberately the safe default. A caller without
// audit.viewLogs cannot obtain the technical stream by placing `scope=system`
// in a URL or calling the API directly.
export const resolveAuditActivityScope = (requestedScope, permissions) => {
  if (
    requestedScope !== undefined &&
    requestedScope !== "" &&
    requestedScope !== AUDIT_ACTIVITY_SCOPES.OFFICIAL &&
    requestedScope !== AUDIT_ACTIVITY_SCOPES.SYSTEM
  ) {
    return null;
  }

  if (requestedScope === AUDIT_ACTIVITY_SCOPES.SYSTEM && canViewSystemActivity(permissions)) {
    return AUDIT_ACTIVITY_SCOPES.SYSTEM;
  }

  return AUDIT_ACTIVITY_SCOPES.OFFICIAL;
};

export const auditActivityWhere = (scope) =>
  scope === AUDIT_ACTIVITY_SCOPES.SYSTEM
    ? { actorId: null }
    : { actorId: { [Op.ne]: null } };
