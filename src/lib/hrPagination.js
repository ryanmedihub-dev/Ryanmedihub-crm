/**
 * Server-side pagination & filter utilities for HR Candidate endpoints.
 */

export function parsePaginationParams(searchParams) {
  const get = (key) => typeof searchParams?.get === "function" ? searchParams.get(key) : searchParams?.[key];
  const rawPage  = parseInt(get("page")  || "1", 10);
  const rawLimit = parseInt(get("limit") || "50", 10);
  const page  = Number.isFinite(rawPage)  && rawPage  > 0 ? rawPage  : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50;
  const skip  = (page - 1) * limit;
  return { page, limit, skip };
}

export function buildCandidateQuery(searchParams) {
  const get = (key) => typeof searchParams?.get === "function" ? searchParams.get(key) : searchParams?.[key];
  const status         = get("status");
  const source         = get("source");
  const position       = get("position");
  const from           = get("from") || get("appliedFrom");
  const to             = get("to") || get("appliedTo");
  const search         = get("search");
  const experienceType = get("experienceType");
  const assignedHr     = get("assignedHr");
  const interviewFrom  = get("interviewFrom");
  const interviewTo    = get("interviewTo");
  const salaryMin      = get("salaryMin");
  const salaryMax      = get("salaryMax");

  const query = {};

  if (status) query.status = status;
  if (source) query.source = source;
  if (position) query.position = { $regex: position, $options: "i" };
  if (experienceType) query.experienceType = experienceType;

  if (assignedHr === "unassigned") {
    query.assignedHr = null;
  } else if (assignedHr) {
    query.assignedHr = assignedHr;
  }

  if (from || to) {
    query.createdAt = {};
    if (from) {
      const fromDate = new Date(from);
      if (!isNaN(fromDate.getTime())) query.createdAt.$gte = fromDate;
    }
    if (to) {
      const toDate = new Date(to);
      if (!isNaN(toDate.getTime())) {
        toDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = toDate;
      }
    }
    if (Object.keys(query.createdAt).length === 0) delete query.createdAt;
  }

  if (interviewFrom || interviewTo) {
    query.interviewDate = {};
    if (interviewFrom) {
      const iFrom = new Date(interviewFrom);
      if (!isNaN(iFrom.getTime())) query.interviewDate.$gte = iFrom;
    }
    if (interviewTo) {
      const iTo = new Date(interviewTo);
      if (!isNaN(iTo.getTime())) {
        iTo.setHours(23, 59, 59, 999);
        query.interviewDate.$lte = iTo;
      }
    }
    if (Object.keys(query.interviewDate).length === 0) delete query.interviewDate;
  }

  if (salaryMin || salaryMax) {
    query.expectedSalary = {};
    if (salaryMin && !isNaN(Number(salaryMin))) query.expectedSalary.$gte = Number(salaryMin);
    if (salaryMax && !isNaN(Number(salaryMax))) query.expectedSalary.$lte = Number(salaryMax);
    if (Object.keys(query.expectedSalary).length === 0) delete query.expectedSalary;
  }

  if (search) {
    query.$or = [
      { name:            { $regex: search, $options: "i" } },
      { email:           { $regex: search, $options: "i" } },
      { phone:           { $regex: search, $options: "i" } },
      { position:        { $regex: search, $options: "i" } },
      { previousCompany: { $regex: search, $options: "i" } },
    ];
  }

  return query;
}

export function buildCandidateSort(searchParams) {
  const get = (key) => typeof searchParams?.get === "function" ? searchParams.get(key) : searchParams?.[key];
  const sortBy = get("sortBy");
  let sort = { createdAt: -1 };
  if (sortBy === "oldest")             sort = { createdAt: 1 };
  else if (sortBy === "name")          sort = { name: 1 };
  else if (sortBy === "salary_asc")    sort = { expectedSalary: 1 };
  else if (sortBy === "salary_desc")   sort = { expectedSalary: -1 };
  else if (sortBy === "interview_asc") sort = { interviewDate: 1 };
  return sort;
}

export function calculatePaginationMeta(total, limit, page) {
  const totalPages = Math.ceil(total / limit) || 1;
  return { total, page, limit, totalPages };
}

