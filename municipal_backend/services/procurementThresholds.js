// Procurement monetary ceilings, transcribed from the Implementing Rules and
// Regulations of RA No. 12009, 1st Edition (as of March 30, 2026):
// https://www.gppb.gov.ph/wp-content/uploads/2026/05/IRR-of-RA-12009-1st-Edition.pdf
//
// IMPORTANT: the CivicBid design document quotes a ₱2,000,000 Small Value
// Procurement ceiling. That is the figure for National Government Agencies
// (Sec. 34.1). Sec. 34.2 sets a *separate, lower* table for LGUs by income
// classification — for a municipality it is ₱400,000 or ₱200,000. Since this
// system serves a municipal LGU, the Sec. 34.2 table is what governs.
//
// The GPPB is authorised to adjust these amounts, so they are computed from
// configuration rather than hardcoded at call sites.

// Sec. 34.2 — maximum ABC that may use Small Value Procurement, by LGU
// classification. Rows are income class, columns are LGU type.
const SVP_CEILING_BY_LGU = {
  province: { "1st": 2_000_000, "2nd": 2_000_000, "3rd": 2_000_000, "4th": 1_600_000, "5th": 1_200_000 },
  city: { "1st": 2_000_000, "2nd": 2_000_000, "3rd": 1_600_000, "4th": 1_200_000, "5th": 800_000 },
  municipality: { "1st": 400_000, "2nd": 400_000, "3rd": 400_000, "4th": 200_000, "5th": 200_000 },
};

// Sec. 34.2 — "For Barangays, 100,000." (no income-class breakdown).
const BARANGAY_SVP_CEILING = 100_000;

export const LGU_TYPES = ["province", "city", "municipality", "barangay"];
export const LGU_INCOME_CLASSES = ["1st", "2nd", "3rd", "4th", "5th"];

// Sec. 32.1 — Direct Acquisition is limited to an ABC not exceeding ₱200,000.
export const DIRECT_ACQUISITION_CEILING = 200_000;

// Sec. 34.3(b) and 50.3.2(c) — an SVP with an ABC of ₱200,000 or below need
// not be posted; above that, posting is required for three calendar days.
export const SVP_POSTING_EXEMPTION_CEILING = 200_000;

// Sec. 51.1 — a pre-bid conference is mandatory at an ABC of ₱3,000,000 or more
// for competitive selection modes.
export const MANDATORY_PREBID_CONFERENCE_FLOOR = 3_000_000;

export const svpCeilingFor = ({ lguType, incomeClass }) => {
  if (lguType === "barangay") return BARANGAY_SVP_CEILING;

  const row = SVP_CEILING_BY_LGU[lguType];
  if (!row) throw new Error(`Unknown LGU type: ${lguType}`);

  const ceiling = row[incomeClass];
  if (ceiling === undefined) throw new Error(`Unknown LGU income class: ${incomeClass}`);

  return ceiling;
};

// Competitive Bidding is the default mode and has no ceiling — it is always
// available. Alternative modes are what carry limits, so the suggestion below
// only ever narrows *downward* from Competitive Bidding.
export const suggestProcurementMode = (abc, lgu) => {
  const svpCeiling = svpCeilingFor(lgu);

  if (abc <= DIRECT_ACQUISITION_CEILING) {
    return {
      suggested: "directAcquisition",
      alternatives: ["smallValueProcurement", "competitiveBidding"],
      rationale: `ABC is within the ₱${DIRECT_ACQUISITION_CEILING.toLocaleString()} Direct Acquisition ceiling (IRR Sec. 32.1).`,
      requiresPosting: false,
      citation: "IRR Sec. 32.1",
    };
  }

  if (abc <= svpCeiling) {
    return {
      suggested: "smallValueProcurement",
      alternatives: ["competitiveBidding"],
      rationale: `ABC is within this LGU's ₱${svpCeiling.toLocaleString()} Small Value Procurement ceiling (IRR Sec. 34.2).`,
      requiresPosting: abc > SVP_POSTING_EXEMPTION_CEILING,
      citation: "IRR Sec. 34.2",
    };
  }

  return {
    suggested: "competitiveBidding",
    alternatives: [],
    rationale: `ABC exceeds this LGU's ₱${svpCeiling.toLocaleString()} Small Value Procurement ceiling, so Competitive Bidding applies unless a documented alternative mode is justified and approved (IRR Sec. 34.2).`,
    requiresPosting: true,
    citation: "IRR Sec. 34.2, 50.3.1",
  };
};

export const requiresPrebidConference = (abc) => abc >= MANDATORY_PREBID_CONFERENCE_FLOOR;
