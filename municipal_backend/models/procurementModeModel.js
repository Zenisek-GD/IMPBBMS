import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

// ── WHAT A MODE ACTUALLY CHANGES ─────────────────────────────────────────────
// The eleven procurement modes used to differ only in their reference prefix
// and a posting flag — all of them then ran the identical sealed two-envelope
// pipeline. That made the mode selector decoration: Direct Contracting is
// single-source and has no bidding at all, a Repeat Order re-awards a previous
// contract at the same price, and Small Value Procurement collects three
// quotations rather than sealed bids.
//
// The fields below are what let the workflow branch on the mode instead of
// pretending they are all competitive bidding.

// Reference table for the 11 modes in design doc Section 3. Kept as rows rather
// than an enum so the BAC can see which modes demand justification or prior
// HOPE approval, and so ceilings can be attached without a code change.
export const ProcurementMode = sequelize.define("ProcurementMode", {
  key: { type: DataTypes.STRING, allowNull: false, unique: true },
  name: { type: DataTypes.STRING, allowNull: false },
  isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

  // Section 3: every mode other than Competitive Bidding is an alternative mode
  // requiring documented justification; select modes need prior HOPE approval.
  requiresJustification: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  requiresHopeApproval: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

  citation: { type: DataTypes.STRING, allowNull: true },
  sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

  // Whether the mode runs a sealed, advertised, two-envelope competition. False
  // for the single-source and quotation-based modes, which reach an award by a
  // different route entirely.
  requiresCompetitiveBidding: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

  // How many offers must be in hand before an award can be recommended.
  //   Competitive Bidding / Limited Source  — 2, a competition needs a contest
  //   Small Value Procurement               — 3 quotations
  //   Direct Contracting / Repeat Order     — 1, single-source by definition
  minimumOffers: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 2 },

  // True where the mode reaches an award without any bidding stage — the BAC
  // resolves to procure from a named source and documents why.
  allowsDirectAward: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

  // Bid security is not collected on modes that have no bidding.
  requiresBidSecurity: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
});

export { sequelize };
