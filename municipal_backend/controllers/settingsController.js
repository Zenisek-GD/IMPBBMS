import {
  SystemSetting,
  SETTING_KEYS,
  getLguProfile,
  getSystemBranding,
  getNavShortcuts,
  setNavShortcuts,
  DEFAULT_SYSTEM_NAME,
  DEFAULT_TRANSPARENCY_TITLE,
  DEFAULT_TRANSPARENCY_FOOTER,
  getProcurementPolicy,
} from "../models/systemSettingModel.js";
import { ProcurementLimit } from "../models/procurementLimitModel.js";
import { ProcurementMode } from "../models/procurementModeModel.js";
import { withAuditTransaction } from "../services/auditLog.js";
import { actorAudit, workflowError } from "../services/workflowSupport.js";
import { getBacContext } from "../services/procurementGovernance.js";
import { validateProcurementPolicy, compositionWarnings } from "../services/bacCommittee.js";
import {
  LGU_TYPES,
  LGU_INCOME_CLASSES,
  svpCeilingFor,
  DIRECT_ACQUISITION_CEILING,
  SVP_POSTING_EXEMPTION_CEILING,
  MANDATORY_PREBID_CONFERENCE_FLOOR,
} from "../services/procurementThresholds.js";

// Returns the LGU profile together with the thresholds it implies, so the
// admin screen can show the consequence of a change rather than just the input.
const buildResponse = (lgu, branding) => ({
  lgu,
  branding,
  options: { lguTypes: LGU_TYPES, incomeClasses: LGU_INCOME_CLASSES },
  thresholds: {
    smallValueProcurement: {
      amount: svpCeilingFor(lgu),
      label: "Small Value Procurement ceiling",
      citation: "IRR Sec. 34.2",
    },
    directAcquisition: {
      amount: DIRECT_ACQUISITION_CEILING,
      label: "Direct Acquisition ceiling",
      citation: "IRR Sec. 32.1",
    },
    postingExemption: {
      amount: SVP_POSTING_EXEMPTION_CEILING,
      label: "SVP posting exemption (at or below)",
      citation: "IRR Sec. 34.3(b), 50.3.2(c)",
    },
    mandatoryPrebidConference: {
      amount: MANDATORY_PREBID_CONFERENCE_FLOOR,
      label: "Mandatory pre-bid conference (at or above)",
      citation: "IRR Sec. 51.1",
    },
    // Not a procurement ceiling — an accounting one. It decides whether a
    // long-lived item bought on a requisition is capitalised as Property, Plant
    // and Equipment or carried as semi-expendable, and therefore whether it may
    // be charged to MOOE at all. Shown alongside the others because it is the
    // same kind of thing from the operator's point of view: a figure a
    // regulator sets that changes what the system allows.
    capitalisation: {
      amount: lgu.capitalizationThreshold,
      label: "Capital Outlay threshold (at or above, per item)",
      citation: "COA Circular 2022-004",
      editable: true,
    },
  },
});

export const getSettings = async (req, res) => {
  const [lgu, branding] = await Promise.all([getLguProfile(), getSystemBranding()]);
  res.json(buildResponse(lgu, branding));
};

export const updateSettings = async (req, res) => {
  const {
    name,
    address,
    lguType,
    incomeClass,
    capitalizationThreshold,
    systemName,
    transparencyTitle,
    transparencyFooter,
  } = req.body;

  if (lguType && !LGU_TYPES.includes(lguType)) {
    return res.status(400).json({ message: "Unknown LGU type." });
  }
  // Barangays have a single flat ceiling, so no income class applies to them.
  if (incomeClass && !LGU_INCOME_CLASSES.includes(incomeClass)) {
    return res.status(400).json({ message: "Unknown income classification." });
  }
  if (name !== undefined && !name.trim()) {
    return res.status(400).json({ message: "LGU name cannot be empty." });
  }
  if (capitalizationThreshold !== undefined && capitalizationThreshold !== null) {
    const threshold = Number(capitalizationThreshold);
    if (!Number.isFinite(threshold) || threshold <= 0) {
      return res.status(400).json({ message: "The capitalisation threshold must be greater than 0." });
    }
  }
  if (systemName !== undefined && !systemName.trim()) {
    return res.status(400).json({ message: "System name cannot be empty." });
  }

  const updates = [
    [SETTING_KEYS.LGU_NAME, name?.trim()],
    [SETTING_KEYS.LGU_ADDRESS, address?.trim()],
    [SETTING_KEYS.LGU_TYPE, lguType],
    [SETTING_KEYS.LGU_INCOME_CLASS, incomeClass],
    [
      SETTING_KEYS.CAPITALIZATION_THRESHOLD,
      capitalizationThreshold === undefined || capitalizationThreshold === null
        ? undefined
        : String(Number(capitalizationThreshold)),
    ],
    [SETTING_KEYS.SYSTEM_NAME, systemName?.trim()],
    [SETTING_KEYS.TRANSPARENCY_TITLE, transparencyTitle?.trim()],
    // Footer may legitimately be multi-line, so only trim leading/trailing.
    [SETTING_KEYS.TRANSPARENCY_FOOTER, transparencyFooter?.trim()],
  ].filter(([, value]) => value !== undefined && value !== null);

  await withAuditTransaction(async (transaction, audit) => {
    const beforeState = {};
    const afterState = {};
    for (const [key, value] of updates) {
      const [row, created] = await SystemSetting.findOrCreate({ where: { key }, defaults: { key, value }, transaction });
      beforeState[key] = created ? null : row.value;
      afterState[key] = value;
      await row.update({ value }, { transaction });
    }
    await audit(actorAudit(req, { actionType: "settings.updated", entityRef: "systemSettings", summary: "Municipal system settings updated", beforeState, afterState }));
  });

  const [lgu, branding] = await Promise.all([getLguProfile(), getSystemBranding()]);
  res.json(buildResponse(lgu, branding));
};

// ── Navigation shortcut endpoints ──────────────────────────────────────────

export const getShortcuts = async (_req, res) => {
  res.json(await getNavShortcuts());
};

export const updateShortcuts = async (req, res) => {
  const { shortcuts } = req.body;
  if (!shortcuts || typeof shortcuts !== "object") {
    return res.status(400).json({ message: "shortcuts must be an object keyed by role name." });
  }

  // Validate structure: each role maps to an array of { href, shortcut } pairs.
  for (const [role, items] of Object.entries(shortcuts)) {
    if (!Array.isArray(items)) {
      return res.status(400).json({ message: `shortcuts.${role} must be an array.` });
    }
    for (const item of items) {
      if (!item.href || typeof item.href !== "string") {
        return res.status(400).json({ message: `Each shortcut entry must have an href string.` });
      }
      if (!item.shortcut || typeof item.shortcut !== "string") {
        return res.status(400).json({ message: `Each shortcut entry must have a shortcut string.` });
      }
    }
  }

  await setNavShortcuts(shortcuts);
  res.json(shortcuts);
};

// ── Public branding endpoint (no auth required) ────────────────────────────
export const getPublicBranding = async (_req, res) => {
  const branding = await getSystemBranding();
  res.json(branding);
};

export const getProcurementSettings = async (req, res) => {
  const { policy, candidates, committee } = await getBacContext(req);
  res.json({ policy, committeeCandidates: candidates, committee, compositionWarnings: compositionWarnings(committee, policy) });
};

export const updateProcurementSettings = async (req, res) => {
  const result = await withAuditTransaction(async (transaction, audit) => {
    const previous = await getProcurementPolicy({ transaction });
    if (!req.body?.policy || typeof req.body.policy !== "object" || Array.isArray(req.body.policy)) throw workflowError("Provide the approved procurement policy settings.", 400);
    const unknown = Object.keys(req.body.policy).filter((key) => !Object.hasOwn(previous, key));
    if (unknown.length) throw workflowError(`Unknown procurement settings: ${unknown.join(", ")}.`, 400);
    const validated = validateProcurementPolicy({ ...previous, ...req.body.policy });
    if (!validated.ok) throw workflowError(validated.errors[0], 400, { errors: validated.errors });
    const policy = validated.policy;
    const { candidates } = await getBacContext(req, { transaction });
    if (policy.memberIds.length) {
      const members = candidates.filter((member) => policy.memberIds.includes(member.id));
      const warnings = compositionWarnings(members, policy);
      if (warnings.length) throw workflowError(warnings[0], 400, { errors: warnings });
    }
    await SystemSetting.upsert({ key: SETTING_KEYS.PROCUREMENT_POLICY, value: JSON.stringify(policy), description: "Approved BAC composition, quorum and procurement attempt requirements" }, { transaction });
    await audit(actorAudit(req, { actionType: "settings.procurement.updated", entityRef: "systemSettings", summary: "BAC composition, quorum and procurement policy updated", beforeState: previous, afterState: policy }));
    return policy;
  });
  const { candidates, committee } = await getBacContext(req);
  res.json({ policy: result, committeeCandidates: candidates, committee, message: "Procurement settings saved. Future BAC actions will use the approved membership and quorum requirements." });
};

const serializeLimit = (row) => ({ ...row.get({ plain: true }), minimumAmount: Number(row.minimumAmount), maximumAmount: row.maximumAmount == null ? null : Number(row.maximumAmount) });
export const listProcurementLimits = async (_req, res) => {
  const [limits, modes] = await Promise.all([ProcurementLimit.findAll({ order: [["effectiveDate", "DESC"], ["id", "DESC"]] }), ProcurementMode.findAll({ attributes: ["key", "name"], order: [["sortOrder", "ASC"]] })]);
  res.json({ limits: limits.map(serializeLimit), methods: [...modes.map((mode) => ({ key: mode.key, name: mode.name })),
    { key: "postingExemption", name: "SVP posting exemption" }, { key: "mandatoryPrebidConference", name: "Mandatory pre-bid conference" }] });
};

const validateLimit = async (input, transaction) => {
  const errors = [];
  const category = input.category ?? "all";
  const procurementMethod = typeof input.procurementMethod === "string" ? input.procurementMethod.trim() : "";
  const minimumAmount = Number(input.minimumAmount);
  const maximumAmount = input.maximumAmount === "" || input.maximumAmount == null ? null : Number(input.maximumAmount);
  const policyReference = typeof input.policyReference === "string" ? input.policyReference.trim() : "";
  if (!["all", "goods", "infrastructure", "consulting"].includes(category)) errors.push("Select a valid procurement category.");
  if (!["postingExemption", "mandatoryPrebidConference"].includes(procurementMethod) && !await ProcurementMode.findOne({ where: { key: procurementMethod }, transaction })) errors.push("Select a configured procurement method.");
  if (input.minimumAmount === "" || input.minimumAmount == null || !Number.isFinite(minimumAmount) || minimumAmount < 0 || minimumAmount > 9999999999999.99) errors.push("Minimum amount must be a valid non-negative amount.");
  if (maximumAmount != null && (!Number.isFinite(maximumAmount) || maximumAmount < minimumAmount || maximumAmount > 9999999999999.99)) errors.push("Maximum amount must be at least the minimum amount, or empty for no ceiling.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate ?? "") || !Number.isFinite(new Date(input.effectiveDate).getTime()) || new Date(input.effectiveDate).toISOString().slice(0, 10) !== input.effectiveDate) errors.push("Enter a valid effective date.");
  if (!["active", "inactive"].includes(input.status)) errors.push("Status must be active or inactive.");
  if (!policyReference || policyReference.length > 255) errors.push("A legal or policy reference of up to 255 characters is required.");
  if (errors.length) throw workflowError(errors[0], 400, { errors });
  return { category, procurementMethod, minimumAmount, maximumAmount, effectiveDate: input.effectiveDate, status: input.status,
    policyReference, remarks: typeof input.remarks === "string" ? input.remarks.trim() || null : null };
};

export const createProcurementLimit = async (req, res) => {
  const row = await withAuditTransaction(async (transaction, audit) => {
    const values = await validateLimit(req.body ?? {}, transaction);
    const limit = await ProcurementLimit.create(values, { transaction });
    await audit(actorAudit(req, { actionType: "settings.threshold.created", entityRef: "procurementLimit", entityId: limit.id, summary: `Applicable limits configured for ${limit.procurementMethod}`, afterState: values }));
    return limit;
  });
  res.status(201).json({ ...serializeLimit(row), message: "Applicable limit created. Related procurement modules will use it from its effective date." });
};

export const updateProcurementLimit = async (req, res) => {
  const row = await withAuditTransaction(async (transaction, audit) => {
    const limit = await ProcurementLimit.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!limit) throw workflowError("Applicable limit not found.", 404);
    const beforeState = serializeLimit(limit);
    const values = await validateLimit({ ...beforeState, ...req.body }, transaction);
    await limit.update(values, { transaction });
    await audit(actorAudit(req, { actionType: "settings.threshold.updated", entityRef: "procurementLimit", entityId: limit.id, summary: `Applicable limits updated for ${limit.procurementMethod}`, beforeState, afterState: values }));
    return limit;
  });
  res.json({ ...serializeLimit(row), message: "Applicable limit updated. The previous values are preserved in the Audit Trail." });
};
