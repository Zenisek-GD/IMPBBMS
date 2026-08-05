// Centralised state machine for the Annual Investment Program, matching the
// pattern already used for APP entries and requisitions — no controller writes
// `status` directly.
//
//   draft → pendingMayorEndorsement → pendingSanggunianAdoption → adopted
//
// Returning is available at either review stage. Once adopted the AIP is fixed:
// the budget proposals and the APP are both drawn against it, so a programme
// that could still change underneath them would make every downstream check
// meaningless.

export const AIP_TRANSITIONS = {
  submit: {
    from: ["draft", "returned"],
    to: "pendingMayorEndorsement",
    permission: "planning.manageAip",
    label: "Submit for endorsement",
  },
  endorse: {
    from: ["pendingMayorEndorsement"],
    to: "pendingSanggunianAdoption",
    permission: "planning.setPriorities",
    label: "Endorse to the Sanggunian",
  },
  adopt: {
    from: ["pendingSanggunianAdoption"],
    to: "adopted",
    permission: "planning.adoptAip",
    label: "Adopt",
  },
  return: {
    from: ["pendingMayorEndorsement", "pendingSanggunianAdoption"],
    to: "returned",
    permission: null, // whoever holds the current stage — see below
    label: "Return to the Planning Office",
    requiresRemarks: true,
  },
};

const RETURN_PERMISSION_BY_STATE = {
  pendingMayorEndorsement: "planning.setPriorities",
  pendingSanggunianAdoption: "planning.adoptAip",
};

export const permissionForTransition = (action, currentStatus) => {
  if (action === "return") return RETURN_PERMISSION_BY_STATE[currentStatus] ?? null;
  return AIP_TRANSITIONS[action]?.permission ?? null;
};

export const evaluateTransition = ({ action, currentStatus, remarks }) => {
  const transition = AIP_TRANSITIONS[action];
  if (!transition) return { ok: false, message: `Unknown action: ${action}` };

  if (currentStatus === "adopted") {
    return { ok: false, message: "This investment program has been adopted and can no longer be moved." };
  }

  if (!transition.from.includes(currentStatus)) {
    return {
      ok: false,
      message: `Cannot ${transition.label.toLowerCase()} from status "${currentStatus}".`,
    };
  }

  if (transition.requiresRemarks && !remarks?.trim()) {
    return { ok: false, message: "Remarks are required when returning an investment program." };
  }

  return { ok: true, to: transition.to };
};

export const isEditable = (status) => status === "draft" || status === "returned";
