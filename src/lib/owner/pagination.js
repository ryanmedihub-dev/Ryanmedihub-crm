// Server-side pagination contract for every owner list endpoint (Owner Panel v2, F5).
//
// Rule: paginate at the DATABASE level — `$skip` / `$limit` inside the aggregation
// (or `.skip().limit()` on a find) — never fetch-all-then-slice in Node. Some of
// these collections (callby CallLog, Patient) run into the hundreds of thousands
// of rows.
//
// Pair with `$facet` when a page needs both a slice of rows AND aggregate totals,
// so it's one round trip:
//   { $facet: { rows: [ ...match, ...sort, { $skip: skip }, { $limit: limit } ],
//               total: [ ...match, { $count: "n" } ] } }

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 200;

/**
 * Parse + clamp pagination params from a URLSearchParams (or any object with a
 * `.get`). Returns { page, pageSize, skip, limit } — always safe to feed to Mongo.
 */
export function parsePageParams(searchParams) {
  const get = typeof searchParams?.get === "function"
    ? (k) => searchParams.get(k)
    : (k) => searchParams?.[k];

  let page = parseInt(get("page"), 10);
  if (!Number.isFinite(page) || page < 1) page = 1;

  let pageSize = parseInt(get("pageSize") ?? get("limit"), 10);
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = DEFAULT_PAGE_SIZE;
  if (pageSize > MAX_PAGE_SIZE) pageSize = MAX_PAGE_SIZE;

  return { page, pageSize, skip: (page - 1) * pageSize, limit: pageSize };
}

/** Standard pagination envelope to return alongside `rows`. */
export function pageMeta({ page, pageSize, total }) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil((total || 0) / pageSize)),
  };
}

/**
 * The standard filter set every Owner Panel v2 Employees endpoint accepts
 * (Part 1): dateFrom/dateTo/branch/tlName/isactive/search + pagination + sort.
 * Always paired with parsePageParams for the page/pageSize/skip/limit half.
 */
export function parseEmployeeFilters(searchParams) {
  const get = typeof searchParams?.get === "function"
    ? (k) => searchParams.get(k)
    : (k) => searchParams?.[k];

  const dateFrom = get("dateFrom") || get("from") || "";
  const dateTo = get("dateTo") || get("to") || "";
  const branch = get("branch") || "All";
  const tlName = get("tlName") || "";
  const isactiveRaw = get("isactive");
  const isactive = isactiveRaw === "true" ? true : isactiveRaw === "false" ? false : null;
  const search = (get("search") || "").trim();
  const sortBy = get("sortBy") || "name";
  const sortDir = get("sortDir") === "desc" ? "desc" : "asc";

  return { dateFrom, dateTo, branch, tlName, isactive, search, sortBy, sortDir };
}
