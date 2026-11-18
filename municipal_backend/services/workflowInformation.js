// Explicitly scoped to business records. Account, vendor onboarding, security,
// settings and public endpoints never pass through this policy.
export const isUnavailable = value => value == null || (typeof value === 'string'
  && /^(?:none|n\s*\/?\s*a|not applicable|not available|not provided|pending)?$/i.test(value.trim()));

const fields = names => names.split(' ').filter(Boolean);
const rule = (path, names, options = {}) => ({ path, fields: fields(names), ...options });
const solicitation = 'openingVenue procurementContactPerson procurementContactEmail requiredSupplierDocuments';
const schedule = 'procurementStartAt publicationStartAt publicationEndAt evaluationStartAt evaluationEndAt postQualificationStartAt postQualificationEndAt expectedAwardAt prebidRemarks';
// Missing keys in PATCH requests mean "leave unchanged". Only creation rules
// enumerate omitted fields; action rules inspect only information being sent.
export const informationRules = [
  rule(/^\/planning\/plans(?:\/\d+)?$/, 'vision remarks goals.*.subsector goals.*.description', { create: true }),
  rule(/^\/planning\/(?:plans\/\d+\/goals|goals\/\d+)$/, 'subsector description', { create: true }),
  rule(/^\/planning\/investment-programs(?:\/\d+)?$/, 'remarks', { create: true }),
  rule(/^\/planning\/(?:investment-programs\/\d+\/entries|aip-entries\/\d+)$/, 'reference description expectedOutput papCode remarks implementingUnitId', { create: true }),
  rule(/^\/budget-preparation\/proposals(?:\/\d+)?$/, 'justification lines.*.papCode lines.*.uacsCode lines.*.remarks', { create: true }),
  rule(/^\/budget-preparation\/(?:budgets\/\d+\/proceedings|proceedings\/\d+)$/, 'venue agenda minutes heldAt departmentId', { create: true }),
  rule(/^\/budget-preparation\/proposals\/\d+\/(?:review|finalise)$/, 'notes'),
  rule(/^\/budget-preparation\/budgets\/\d+\/transition$/, 'provincialRemarks'),
  rule(/^\/app-entries(?:\/\d+)?$/, 'description categoryDetails mfoId papCode uacsCode unit quantity abc category procurementMode aipEntryId appropriationId fundSource accountCode targetStartQuarter targetCompletionQuarter procurementStrategy', { create: true }),
  rule(/^\/app-entries\/gppb-submission$/, 'reference', { create: true }),
  rule(/^\/purchase-requisitions(?:\/\d+)?$/, 'purpose dateRequired isEmergency lineItems.*.technicalSpecifications lineItems.*.unit lineItems.*.quantity lineItems.*.unitCost lineItems.*.hasUsefulLifeOverOneYear', { create: true }),
  rule(/^\/bidding\/rfqs$/, `${solicitation} ${schedule}`, { create: true }),
  rule(/^\/bidding\/rfqs\/\d+\/information$/, solicitation),
  rule(/^\/bidding\/rfqs\/\d+\/schedule$/, schedule),
  rule(/^\/bidding\/rfqs\/\d+\/open$/, 'witnesses remarks'),
  rule(/^\/bidding\/awards\/\d+\/receipt$/, 'externalNoaNumber'),
  rule(/^\/contracts(?:\/\d+)?$/, 'poRef terms startDate deliveryDeadline contractDays', { create: true }),
  rule(/^\/contracts\/\d+\/deliveries$/, 'description deliveredAt', { create: true }),
  rule(/^\/contracts\/deliveries\/\d+\/inspect$/, 'acceptedQuantityNote remarks', { when: body => body.result === 'accepted' }),
  rule(/^\/contracts\/deliveries\/\d+\/inspect$/, 'acceptedQuantityNote'),
  rule(/^\/finance\/invoices(?:\/\d+\/resubmit)?$/, 'supplierInvoiceRef remarks', { create: true }),
  rule(/^\/finance\/payments\/\d+\/release$/, 'method reference', { create: true }),
  rule(/^\/finance\/pending-items$/, 'notes', { create: true }),
  rule(/^\/finance\/pending-items\/\d+\/resolve$/, 'notes', { when: body => body.resolution !== 'dropped' }),
  rule(/^\/finance\/budget-controls(?:\/\d+)?$/, 'payload.papCode payload.uacsCode payload.departmentId'),
  rule(/^\/finance\/appropriations(?:\/\d+)?$/, 'ordinanceDate papCode uacsCode remarks departmentId', { create: true }),
  rule(/^\/conferences$/, 'meetingUrl', { create: true }),
  rule(/^\/conferences\/\d+$/, 'minutes'),
  rule(/^\/observers\/organizations$/, 'contactPerson contactEmail', { create: true }),
  rule(/^\/observers\/invitations\/\d+\/report$/, 'areasForImprovement', { create: true }),
  rule(/^\/announcements(?:\/\d+)?$/, 'excerpt venue contactPerson contactEmail contactPhone referenceNo fundSource procurementMethodCitation expiresAt', { create: false }),
  rule(/^\/doc-generation\/templates(?:\/\d+)?$/, 'description'),
];

const labels = {
  abc: 'Approved budget for contract (ABC)', mfoId: 'MFO ID', aipEntryId: 'Investment program project', appropriationId: 'Appropriation line',
  vision: 'Long-term direction', subsector: 'Programme', papCode: 'PAP code', uacsCode: 'UACS code',
  poRef: 'Purchase order reference', contractDays: 'Contract period (days)', supplierInvoiceRef: 'Supplier invoice reference',
  implementingUnitId: 'Implementing office', departmentId: 'Office', isEmergency: 'Emergency purchase',
  hasUsefulLifeOverOneYear: 'Useful life over one year', procurementContactEmail: 'Procurement contact email',
  externalNoaNumber: 'External notice of award number', requiredSupplierDocuments: 'Supplier document references',
};
const labelFor = key => labels[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
const groupLabels = { goals: 'Goal', lines: 'Budget line', lineItems: 'Requisition item' };

export function prepareWorkflowInformation(url, method, input) {
  const path = url.split('?')[0].replace(/^\/api(?=\/)/, '').replace(/\/$/, '');
  if (!['POST', 'PUT', 'PATCH'].includes(method.toUpperCase()) || !input || typeof input !== 'object' || Array.isArray(input)) return null;
  const policy = informationRules.find(candidate => candidate.path.test(path) && candidate.when?.(input) !== false);
  if (!policy) return null;
  const body = structuredClone(input);
  const missing = [];
  const includeOmitted = policy.create && method.toUpperCase() === 'POST';
  const visit = (record, parts, prefix = '', context = '') => {
    if (!record || typeof record !== 'object') return;
    const [key, ...rest] = parts;
    if (rest[0] === '*') {
      if (Array.isArray(record[key])) record[key].forEach((item, index) => visit(item, rest.slice(1), `${prefix}${key}.${index}.`, `${groupLabels[key] ?? labelFor(key)} ${index + 1}: `));
      return;
    }
    if (rest.length) { visit(record[key], rest, `${prefix}${key}.`, context); return; }
    if (key === 'appropriationId' && body.planCycle === 'indicative') return;
    if (!Object.hasOwn(record, key) && !includeOmitted) return;
    if (isUnavailable(record[key])) {
      missing.push({ field: `${prefix}${key}`, label: context + labelFor(key) });
      // Do not materialize omitted values: some controllers distinguish an
      // omitted value from an explicit clear, even on creation.
      if (Object.hasOwn(record, key)) record[key] = null;
    }
  };
  for (const path of policy.fields) visit(body, path.split('.'));
  return { body, missing };
}

export function checkWorkflowInformation(req, res) {
  const result = prepareWorkflowInformation(req.originalUrl || req.url || '', req.method, req.body);
  if (!result) return true;
  if (result.missing.length && req.get?.('X-Confirm-Incomplete-Information') !== 'true') {
    res.status(409).json({
      code: 'INCOMPLETE_INFORMATION_CONFIRMATION_REQUIRED',
      message: 'These fields are unanswered or marked None / N/A. Do you want to proceed anyway?',
      missingFields: result.missing,
    });
    return false;
  }
  req.body = result.body;
  req.incompleteInformation = result.missing;
  return true;
}
