// The lifecycle assembler also produces private relationship IDs for server
// lookups. Match the public controller's disclosure boundary before exporting.
export const publicProjectView = ({ entityRefs: _internalRefs, ...project }) => project;

const PRIVATE_FIELD = /^(entityRefs|email|password|passwordHash|encryptedSecret|secret|otpauthUri|qrDataUri|recoveryCodes|session|cookie|token|ipAddress|internalRemarks)$/i;
export const assertPublicSnapshot = (snapshot) => {
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (PRIVATE_FIELD.test(key)) throw new Error(`Public snapshot contains a prohibited field: ${key}`);
      visit(child);
    }
  };
  visit(snapshot);
  return snapshot;
};
