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
  const callbyLinkedRaw = get("callbyLinked");
  const callbyLinked = callbyLinkedRaw === "true" ? true : callbyLinkedRaw === "false" ? false : null;
  const search = (get("search") || "").trim();
  const sortBy = get("sortBy") || "name";
  const sortDir = get("sortDir") === "desc" ? "desc" : "asc";

  return { dateFrom, dateTo, branch, tlName, isactive, callbyLinked, search, sortBy, sortDir };
}

/**
 * Parse + whitelist sort params. `allowed` maps the public sortBy key to the
 * Mongo field path to sort on (often identical). Unknown keys fall back to
 * `defaultKey`, so a crafted URL can never sort on an arbitrary path.
 * Returns { sortBy, sortDir, sort } where `sort` is ready for $sort and always
 * carries `tiebreak` as a secondary key — without a total order, rows can
 * repeat or vanish between pages whenever many share a value.
 */
export function parseSortParams(searchParams, { allowed, defaultKey, defaultDir = "asc", tiebreak = "_id" }) {
  const get = typeof searchParams?.get === "function"
    ? (k) => searchParams.get(k)
    : (k) => searchParams?.[k];
  const requested = get("sortBy");
  const sortBy = requested && Object.prototype.hasOwnProperty.call(allowed, requested) ? requested : defaultKey;
  const sortDir = (get("sortDir") || defaultDir) === "desc" ? "desc" : "asc";
  const dir = sortDir === "desc" ? -1 : 1;
  const sort = { [allowed[sortBy]]: dir };
  if (tiebreak && allowed[sortBy] !== tiebreak) sort[tiebreak] = 1;
  return { sortBy, sortDir, sort };
}

/**
 * The standard $facet for a paginated list: one page of rows, the KPI totals
 * over the WHOLE filtered set, and the total row count — one round trip.
 *   pagedFacet({ sort, skip, limit, rowStages: [...after the slice], totals: [{ $group: ... }] })
 * Unpack with unpackFacet().
 */
export function pagedFacet({ sort, skip, limit, rowStages = [], totals = [] }) {
  return {
    $facet: {
      rows: [{ $sort: sort }, { $skip: skip }, { $limit: limit }, ...rowStages],
      totals: totals.length ? totals : [{ $group: { _id: null, n: { $sum: 1 } } }],
      count: [{ $count: "n" }],
    },
  };
}

export function unpackFacet(aggregateResult) {
  const r = Array.isArray(aggregateResult) ? aggregateResult[0] : aggregateResult;
  return {
    rows: r?.rows || [],
    totals: r?.totals?.[0] || null,
    total: r?.count?.[0]?.n || 0,
  };
}
