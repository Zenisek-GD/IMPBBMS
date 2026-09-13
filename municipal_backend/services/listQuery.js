import { Op } from "sequelize";

// ── SHARED SERVER-SIDE LIST QUERIES ──────────────────────────────────────────
// One pagination / sorting / search convention for every growing list, so the
// ninth converted endpoint works exactly like the first:
//
//   GET /api/audit?page=2&pageSize=25&search=award&sort=recordedAt:desc&outcome=failed
//
// Rules enforced here, not per controller:
//   · Page sizes are capped (10, 25, 50 or 100 requested; anything else is
//     clamped into range). A browser must never be able to ask for a million.
//   · Sort fields come from each endpoint's allowlist. Raw column names from
//     the browser are never passed to the database.
//   · Search is a bounded LIKE over allowlisted columns, capped in length.
//   · The response always carries the total, so the UI can print
//     "Showing 1–25 of 1,248 records" instead of bare page numbers.
const PAGE_SIZES = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LENGTH = 120;

const clampPageSize = (value) => {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(size), MAX_PAGE_SIZE);
};

const parseSort = (raw, allowlist, defaultSort) => {
  // Accepted as "field" (ascending) or "field:desc". Anything not on the
  // allowlist falls back to the endpoint default — silently, because a stale
  // bookmarked sort must still return a list rather than a 400.
  if (typeof raw === "string" && raw.length > 0) {
    const [field, direction] = raw.split(":");
    const mapped = allowlist?.[field];
    if (mapped) {
      const dir = direction === "desc" ? "DESC" : direction === "asc" ? "ASC" : null;
      if (dir) {
        const columns = Array.isArray(mapped) ? mapped : [mapped];
        return columns.map((column) => [column, dir]);
      }
    }
  }
  const fallback = allowlist?.[defaultSort?.field] ?? null;
  const fallbackColumns = fallback ? (Array.isArray(fallback) ? fallback : [fallback]) : [];
  return fallbackColumns.map((column) => [column, defaultSort?.direction === "asc" ? "ASC" : "DESC"]);
};

// Builds a bounded OR-of-LIKEs search condition, or null when there is no
// usable search term.
export const searchCondition = (term, columns) => {
  if (typeof term !== "string") return null;
  const needle = term.trim().slice(0, MAX_SEARCH_LENGTH);
  if (!needle) return null;
  return { [Op.or]: columns.map((column) => ({ [column]: { [Op.like]: `%${needle}%` } })) };
};

const pageOf = (value) => {
  const page = Number(value);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
};

// Full parse: returns Sequelize-ready { where, order, limit, offset } plus the
// echoed page/pageSize for the envelope. `baseWhere` carries the endpoint's
// own scoping (e.g. recipientId); `and` carries additional AND conditions such
// as filters and search.
export const parseListParams = (query = {}, options = {}) => {
  const page = pageOf(query.page);
  const pageSize = clampPageSize(query.pageSize ?? options.defaultPageSize);
  const order = parseSort(query.sort, options.sorts ?? {}, options.defaultSort);

  return { page, pageSize, order, limit: pageSize, offset: (page - 1) * pageSize };
};

export const pageEnvelope = ({ rows, total, page, pageSize }) => ({
  rows,
  total,
  page,
  pageSize,
  totalPages: Math.max(1, Math.ceil(total / pageSize)),
});

export { PAGE_SIZES, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };
