// Normalize only values entered/changed; historical resolution rows stay intact.
export const normalizeResolutionNumber = (value) => {
  if (value == null) return value;
  if (typeof value !== "string") throw new TypeError("Resolution number must be text.");
  return value.trim().replace(/^(?:resolution\s+(?:no\.?|number)\s*[:#.-]?\s*)+/i, "").trim();
};
export const attachResolutionNumberHooks = (model) => {
  model.beforeValidate((record) => {
    if (record.isNewRecord || record.changed("resolutionNo")) record.resolutionNo = normalizeResolutionNumber(record.resolutionNo);
  });
  model.beforeBulkUpdate((options) => {
    if (Object.hasOwn(options.attributes, "resolutionNo")) options.attributes.resolutionNo = normalizeResolutionNumber(options.attributes.resolutionNo);
  });
};
