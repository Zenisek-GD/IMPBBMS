// The older ProcureNance log was already present with 670 unverifiable hashes
// in the retained backups. The original rows and links stay append-only. This
// digest is pinned outside the database so a change to those rows is detected.
export const legacyAuditArchive = Object.freeze({
  throughSequence: 744,
  entriesChecked: 744,
  originalHashMismatches: 670,
  headHash: "cb84b7db9ce5d5dabf22bc9632f10c1ba44f7c62632c30370bccf6571807ea62",
  snapshotDigest: "60395e8fe8ee03cfadc642b5b2eecfcf9b6ef3e4c2e7ec7ca72a6026c2855fdf",
});
