// Report authorization and projection rules are shared by viewing and exports.
// Filters run only on this projection, so search cannot reveal a sealed value.
export const anyPermission = (permissions, keys) => keys.some((key) => permissions.has(key));
export const PROCUREMENT_REPORT_PERMISSIONS = ["bidding.view"];
export const REPORTS = [
  ["procurement-summary", "Procurement Summary", "procurement"],
  ["procurement-status", "Procurement Status Report", "procurement"],
  ["procurement-plans", "Procurement Plan Report", "plans"],
  ["bidding-activities", "Bidding Activities Report", "procurement"],
  ["bidder-participation", "Bidder Participation Report", "bids"],
  ["bid-evaluation", "Bid Evaluation Report", "evaluations"],
  ["twg-evaluation", "TWG Evaluation Report", "twg"],
  ["bac-actions", "BAC Actions and Resolutions", "bac"],
  ["failed-procurement", "Failed Procurement Report", "attempts"],
  ["rebids", "Rebid Report", "attempts"],
  ["negotiated-procurement", "Negotiated Procurement Report", "negotiated"],
  ["awarded-contracts", "Awarded Contracts Report", "contracts"],
  ["procurement-timeline", "Procurement Timeline Report", "timeline"],
  ["audit-trail", "Audit Trail Report", "audit"],
].map(([key, title, source]) => ({ key, title, source }));

export function canReadReport(report, permissions) {
  if (!report) return false;
  if (report.source === "plans") return anyPermission(permissions, ["app.view", "app.viewPublished"]);
  if (report.source === "audit") return anyPermission(permissions, ["audit.viewAll", "audit.viewLogs"]);
  if (report.source === "contracts") return anyPermission(permissions, ["contract.view", "contract.viewPublished", "delivery.submitInvoice"]);
  if (["evaluations", "twg", "bids"].includes(report.source)) {
    return anyPermission(permissions, ["bidding.view", "bidding.evaluate", "bidding.technicalInput"]);
  }
  return anyPermission(permissions, PROCUREMENT_REPORT_PERMISSIONS);
}

export function planScope(user, permissions) {
  const scope = {};
  if (!permissions.has("app.view")) scope.publishedOnly = true;
  const broad = anyPermission(permissions, ["app.consolidate", "app.certify", "app.approve", "audit.viewAll"]);
  if (!broad && permissions.has("app.create")) scope.departmentId = user.departmentId ?? -1;
  return scope;
}

export function bidDisclosure(bid, rfq) {
  const blind = !["evaluated", "awarded"].includes(rfq.status);
  return {
    bidder: blind ? (bid.blindLabel || "Sealed bidder") : (bid.vendor?.businessName || bid.blindLabel || "Bidder"),
    amount: !blind && !bid.financialSealed && bid.totalBidPrice != null ? Number(bid.totalBidPrice) : null,
    blind,
  };
}

export function csvCell(value) {
  const raw = value == null ? "" : String(value);
  const safe = /^[\s]*[=+@-]|^[\t\r\n]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function filterReportRows(rows, query, columns) {
  const from = query.from ? `${query.from}T00:00:00+08:00` : null;
  const to = query.to ? `${query.to}T23:59:59.999+08:00` : null;
  for (const day of [query.from, query.to].filter(Boolean)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day) {
      throw Object.assign(new Error("Enter a valid report date in YYYY-MM-DD format."), { status: 400 });
    }
  }
  if (from && to && Date.parse(from) > Date.parse(to)) throw Object.assign(new Error("The end date must be on or after the start date."), { status: 400 });
  const fieldKeys = columns.map((column) => column.key);
  const exact = ["year", "category", "method", "status", "department", "bidder", "action", "attempt", "outcome"];
  const search = String(query.search || "").trim().toLocaleLowerCase();
  const filtered = rows.filter((row) => {
    if (from && (!row.date || Date.parse(row.date) < Date.parse(from))) return false;
    if (to && (!row.date || Date.parse(row.date) > Date.parse(to))) return false;
    if (exact.some((key) => query[key] && String(row[key] ?? "") !== String(query[key]))) return false;
    return !search || fieldKeys.some((key) => String(row[key] ?? "").toLocaleLowerCase().includes(search));
  });
  const sort = fieldKeys.includes(query.sort) ? query.sort : (fieldKeys.includes("date") ? "date" : fieldKeys[0]);
  const direction = query.direction === "asc" ? 1 : -1;
  return filtered.sort((a, b) => {
    const left = a[sort] ?? "";
    const right = b[sort] ?? "";
    const order = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), undefined, { numeric: true });
    return direction * order || String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
  });
}
