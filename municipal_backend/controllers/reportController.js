import { REPORTS, canReadReport, filterReportRows, csvCell } from "../services/reportPolicy.js";
import { columnsForReport, loadReportRows } from "../services/reportService.js";
import { auditFromRequest } from "../services/auditLog.js";

export const listReportCatalog = (req, res) => res.json(REPORTS.filter((report) => canReadReport(report, req.permissions)).map((report) => ({
  key: report.key, title: report.title, columns: columnsForReport(report),
  canExport: report.source !== "audit" || req.permissions.has("audit.export"),
})));

export async function getReport(req, res) {
  const report = REPORTS.find((entry) => entry.key === req.params.type);
  if (!report) return res.status(404).json({ message: "Report not found." });
  if (!canReadReport(report, req.permissions)) return res.status(403).json({ message: "You do not have permission to view this report." });
  const format = req.query.format || "json";
  if (!["json", "csv", "print"].includes(format)) return res.status(400).json({ message: "Choose an on-screen, CSV, or print report." });
  if (format !== "json" && report.source === "audit" && !req.permissions.has("audit.export")) return res.status(403).json({ message: "Audit export permission is required to export or print audit reports." });

  const columns = columnsForReport(report);
  const rawRows = await loadReportRows(report, req.currentUser, req.permissions);
  const rows = filterReportRows(rawRows, req.query, columns);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 25));
  const page = Math.min(Math.max(1, Math.ceil(rows.length / pageSize)), Math.max(1, Number.parseInt(req.query.page, 10) || 1));
  // Explicit projection prevents future ORM fields from silently becoming exports.
  const project = (row) => Object.fromEntries([["id", row.id], ...columns.map(({ key }) => [key, row[key] ?? null])]);
  res.setHeader("Cache-Control", "private, no-store");
  if (format !== "json") {
    if (rows.length > 10000) return res.status(422).json({ message: "This report contains more than 10,000 rows. Narrow the date range or filters before exporting." });
    await auditFromRequest(req, { actionType: "report.exported", entityRef: "report", summary: `${report.title}: ${rows.length} records exported for ${format === "csv" ? "CSV" : "printing"}.`, afterState: { report: report.key, rowCount: rows.length, format } });
    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${report.key}-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(`\uFEFF${columns.map((column) => csvCell(column.label)).join(",")}\r\n${rows.map((row) => columns.map((column) => csvCell(row[column.key])).join(",")).join("\r\n")}\r\n`);
    }
  }
  const filterKeys = ["year", "category", "method", "status", "department", "bidder", "action", "attempt", "outcome"];
  const filters = Object.fromEntries(filterKeys.filter((key) => columns.some((column) => column.key === key) || key === "year").map((key) => [key, [...new Set(rawRows.map((row) => row[key]).filter((value) => value != null && value !== ""))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))]));
  return res.json({ key: report.key, title: report.title, generatedAt: new Date().toISOString(), timezone: "Asia/Manila", columns, rows: (format === "print" ? rows : rows.slice((page - 1) * pageSize, page * pageSize)).map(project), total: rows.length, page, pageSize, filters });
}
