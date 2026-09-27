

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 200;

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

export function pageMeta({ page, pageSize, total }) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil((total || 0) / pageSize)),
  };
}

export function parseEmployeeFilters(searchParams) {
  const get = typeof searchParams?.get === "function"
    ? (k) => searchParams.get(k)
    : (k) => searchParams?.[k];
  const toNum = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };

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

  
  
  const role = (get("role") || "").trim();
  const dojFrom = get("dojFrom") || "";
  const dojTo = get("dojTo") || "";
  const salaryMin = toNum(get("salaryMin"));
  const salaryMax = toNum(get("salaryMax"));
  const incentiveRateMin = toNum(get("incentiveRateMin"));
  const incentiveRateMax = toNum(get("incentiveRateMax"));

  return {
    dateFrom, dateTo, branch, tlName, isactive, callbyLinked, search, sortBy, sortDir,
    role, dojFrom, dojTo, salaryMin, salaryMax, incentiveRateMin, incentiveRateMax,
  };
}

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
