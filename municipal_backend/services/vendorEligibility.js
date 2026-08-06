// ── VENDOR ELIGIBILITY ───────────────────────────────────────────────────────
// Eligibility is not a one-off gate passed at registration. A supplier can be
// blacklisted after bidding, and a PhilGEPS Platinum certificate expires after
// a year. Both were stored and neither was ever read, so a supplier whose
// registration lapsed — or who was blacklisted the week after bidding — could
// still be awarded a contract.
//
// Checked at two moments, because they are two different risks:
//   · at bid submission  — is this supplier eligible to compete at all
//   · at award           — is this supplier STILL eligible, now that it matters

export const checkVendorEligibility = (vendor, { asOf = new Date() } = {}) => {
  if (!vendor) {
    return { eligible: false, reason: "No supplier registration on record." };
  }

  // A blacklisting that has run its term is spent. Checked before the status so
  // a supplier whose one or two years have elapsed is not barred forever by a
  // flag nobody thought to clear.
  if (
    vendor.registrationStatus === "blacklisted" &&
    vendor.blacklistedUntil &&
    new Date() > new Date(vendor.blacklistedUntil)
  ) {
    return { eligible: true, expiredBlacklist: true };
  }

  if (vendor.registrationStatus === "blacklisted") {
    return {
      eligible: false,
      reason: "This supplier is blacklisted and may not participate in procurement.",
      code: "blacklisted",
    };
  }

  if (vendor.registrationStatus !== "verified") {
    return {
      eligible: false,
      reason: `Supplier registration is "${vendor.registrationStatus}" and must be verified.`,
      code: "unverified",
    };
  }

  // A lapsed PhilGEPS registration is a hard bar: the certificate is one of the
  // eligibility documents the BAC actually collects, and an expired one is not
  // a document at all.
  if (vendor.philgepsExpiry) {
    const expiry = new Date(vendor.philgepsExpiry);
    // Compare on date, not timestamp — a certificate is valid through the whole
    // of its expiry day.
    expiry.setHours(23, 59, 59, 999);

    if (expiry < asOf) {
      return {
        eligible: false,
        reason:
          `The supplier's PhilGEPS registration expired on ${vendor.philgepsExpiry}. ` +
          `A current certificate is required before participating.`,
        code: "philgepsExpired",
        expiredOn: vendor.philgepsExpiry,
      };
    }
  }

  return { eligible: true };
};

// Days until the PhilGEPS certificate lapses — negative once expired. Surfaced
// on the vendor list so the Secretariat can chase a renewal before it blocks a
// live bid rather than after.
export const philgepsDaysRemaining = (vendor, asOf = new Date()) => {
  if (!vendor?.philgepsExpiry) return null;
  return Math.ceil((new Date(vendor.philgepsExpiry) - asOf) / 86400000);
};
