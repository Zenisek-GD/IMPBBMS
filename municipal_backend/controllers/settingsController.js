import { SystemSetting, SETTING_KEYS, getLguProfile } from "../models/systemSettingModel.js";
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
const buildResponse = (lgu) => ({
  lgu,
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
  },
});

export const getSettings = async (req, res) => {
  res.json(buildResponse(await getLguProfile()));
};

export const updateSettings = async (req, res) => {
  const { name, lguType, incomeClass } = req.body;

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

  const updates = [
    [SETTING_KEYS.LGU_NAME, name?.trim()],
    [SETTING_KEYS.LGU_TYPE, lguType],
    [SETTING_KEYS.LGU_INCOME_CLASS, incomeClass],
  ].filter(([, value]) => value !== undefined && value !== null);

  for (const [key, value] of updates) {
    const [row] = await SystemSetting.findOrCreate({ where: { key }, defaults: { key, value } });
    row.value = value;
    await row.save();
  }

  res.json(buildResponse(await getLguProfile()));
};
