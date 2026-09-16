import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import Employee from "@/models/Employee";
import Patient from "@/models/Patient";
import Interviewer from "@/models/Interviewer";
import Payable from "@/models/Payable";
import Transactions from "@/models/Transactions";
import { buildPayableAggregationStages } from "@/lib/payableAggregation";
import { fetchCallbyCached, CallbyError } from "@/lib/callby";
import { employeeSection, SECTION_LABELS } from "@/lib/owner/employeeSections";
import { scoreCohort, ROLE_PERFORMANCE_CONFIG, PERFORMANCE_BANDS } from "@/lib/owner/performance";
import { parsePageParams, parseEmployeeFilters, pageMeta } from "@/lib/owner/pagination";
import { daysInPeriod, periodBounds, istMonthKeys } from "@/lib/owner/dates";
import { getISTStartOfDay, getISTEndOfDay } from "@/lib/dateHelpers";
import { CONVERTED_STATUSES } from "@/lib/owner/patientStatus";

// Leadership groups agents with no TL under this key; the roster route pins
// tlName to it, so the section match must read it as "tlName is empty".
export const UNASSIGNED_TEAM = "(unassigned)";

// One query builder behind all five Employees list pages (Owner Panel v2, Part 1).
// Each role route is a one-line wrapper: `runEmployeeReportQuery(req, "Agent")`.
//
// How a request runs (see runEmployeeReportQuery):
//   1. Section → Mongo $match. Employee.role is free text and employeeSection()
//      is a JS classifier, so the DISTINCT role strings (a few dozen) are
//      classified once and the section becomes `role: { $in: [...] }` — an exact
//      DB filter, one classifier implementation.
//   2. Metrics per employee come from the SECTION_METRIC_BUILDERS below — each
//      is one grouped aggregation (Patient/Payable/Interviewer) or one cached
//      callby call, returning ≤ one row per employee. These builders are the
//      single implementation of every metric: dashboard, overview, attention,
//      suggestions, the detail page and Sanya's tools all call the same ones.
//      Performance is peer-relative (scoreCohort), so it needs the whole cohort.
//   3. One Employee.aggregate() with $facet does the rest IN THE DATABASE:
//      attach the per-employee metrics, $sort on any column (employee field,
//      metric, or performance score) with an _id tiebreak so pages never
//      overlap, $skip/$limit the page, and $group the KPI totals — page rows +
//      KPIs in one round trip. Nothing is sliced in Node.
//   Cost is bounded by employee count (a few hundred), never by Patient/CallLog
//   scale. Default page 25, hard max 200 (src/lib/owner/pagination.js).

const ALLOWED_ROLES = ["owner", "super-admin"];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export { daysInPeriod };

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
const rupee0 = (n) => `₹${new Intl.NumberFormat("en-IN").format(Math.round(Number(n) || 0))}`;

// ---------------------------------------------------------------------------
// Section-specific metric builders. Each returns { metricsById, callbyError }.
// metricsById: Map<employeeIdString, { ...raw section metrics }>.
// ---------------------------------------------------------------------------

export async function buildAgentMetrics(employees, { from, to }) {
  const metricsById = new Map();
  for (const e of employees) {
    metricsById.set(String(e._id), {
      totalCalls: 0, connected: 0, dailyTarget: 100,
      totalLeads: 0, interested: 0, notInterested: 0, followUps: 0, unattemptedLeads: 0,
      totalPatients: 0, converted: 0, nonConverted: 0, amountReceived: 0,
    });
  }

  let callbyError = null;
  try {
    // callby reads dateFrom/dateTo (not from/to) and silently defaults to the
    // last 30 days when they're absent. Call figures are period-scoped; the
    // lead figures from this endpoint are a present-moment snapshot.
    const params = {};
    if (from) params.dateFrom = from;
    if (to) params.dateTo = to;
    const result = await fetchCallbyCached("/api/leads/workforce-summary", { params });
    const agents = result?.data?.agents || result?.agents || [];
    const byCallbyId = new Map(
      agents.map((a) => [String(a?.employeeId ?? a?.userId ?? a?.id ?? a?._id ?? ""), a]),
    );
    for (const e of employees) {
      if (!e.callbyUserId) continue;
      const a = byCallbyId.get(String(e.callbyUserId));
      if (!a) continue;
      const m = metricsById.get(String(e._id));
      m.totalCalls = a.calls?.total || 0;
      m.connected = a.calls?.connected || 0;
      m.dailyTarget = a.dailyTarget || 100;
      m.totalLeads = a.leads?.assigned || 0;
      m.interested = a.leads?.byStatus?.interested || 0;
      m.notInterested = a.leads?.byStatus?.not_interested || 0;
      m.followUps = a.leads?.byStatus?.follow_up || 0;
      // No `attempts` field confirmed anywhere callby returns today — this is a
      // documented proxy (never-contacted), not a literal "attempts: 0" count.
      m.unattemptedLeads = a.leads?.byStatus?.new || 0;
    }
  } catch (err) {
    callbyError = err instanceof CallbyError ? err.message : "Failed to load callby data";
  }

  const ids = employees.map((e) => e._id);
  const match = { "personal.reference": { $in: ids } };
  const visitBounds = periodBounds(from, to);
  if (visitBounds) match["personal.visitDate"] = visitBounds;
  const rows = await Patient.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$personal.reference",
        totalPatients: { $sum: 1 },
        converted: { $sum: { $cond: [{ $in: ["$ops.status", CONVERTED_STATUSES] }, 1, 0] } },
        amountReceived: { $sum: { $ifNull: ["$payments.amountReceived", 0] } },
      },
    },
  ]);
  for (const r of rows) {
    const m = metricsById.get(String(r._id));
    if (!m) continue;
    m.totalPatients = r.totalPatients;
    m.converted = r.converted;
    m.nonConverted = r.totalPatients - r.converted;
    m.amountReceived = round(r.amountReceived);
  }

  return { metricsById, callbyError };
}

async function buildCounsellorMetrics(employees, { from, to }) {
  const metricsById = new Map();
  for (const e of employees) {
    metricsById.set(String(e._id), {
      patientsConsulted: 0, converted: 0, nonConverted: 0, amountReceived: 0,
      avgDiscount: 0, packageBeforeConsult: 0, packageAfterConsult: 0,
    });
  }

  const ids = employees.map((e) => e._id);
  const match = { "counselling.counsellor": { $in: ids } };
  const visitBounds = periodBounds(from, to);
  if (visitBounds) match["personal.visitDate"] = visitBounds;
  const rows = await Patient.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$counselling.counsellor",
        patientsConsulted: { $sum: 1 },
        converted: { $sum: { $cond: [{ $in: ["$ops.status", CONVERTED_STATUSES] }, 1, 0] } },
        amountReceived: { $sum: { $ifNull: ["$payments.amountReceived", 0] } },
        avgDiscount: { $avg: { $ifNull: ["$payments.discount", 0] } },
        avgPackageBefore: { $avg: "$personal.packageQuoted" },
        avgPackageAfter: { $avg: "$counselling.finlpackage" },
      },
    },
  ]);
  for (const r of rows) {
    const m = metricsById.get(String(r._id));
    if (!m) continue;
    m.patientsConsulted = r.patientsConsulted;
    m.converted = r.converted;
    m.nonConverted = r.patientsConsulted - r.converted;
    m.amountReceived = round(r.amountReceived);
    m.avgDiscount = round(r.avgDiscount);
    m.packageBeforeConsult = round(r.avgPackageBefore);
    m.packageAfterConsult = round(r.avgPackageAfter);
  }

  return { metricsById, callbyError: null };
}

const SURGERY_ROLE_FIELDS = [
  "surgery.doctor", "surgery.seniorTech", "surgery.implanterRight",
  "surgery.implanterLeft", "surgery.graftingPerson", "surgery.helper",
];

async function buildSurgeryMetrics(employees, { from, to }) {
  const metricsById = new Map();
  for (const e of employees) {
    metricsById.set(String(e._id), { patientsOperated: 0, graftsImplanted: 0, surgeriesAttempted: 0 });
  }

  const ids = employees.map((e) => e._id);
  const dateMatch = { "surgery.surgeryDate": { $exists: true, $ne: null, ...(periodBounds(from, to) || {}) } };

  // $facet output names may not contain "." (Mongo Location16412 — this page
  // 500'd on every load until the keys were flattened), so the field path is
  // stored under a dot-free key and mapped back below.
  const facetKey = (field) => field.replace(/\./g, "_");
  const facet = {};
  for (const field of SURGERY_ROLE_FIELDS) {
    facet[facetKey(field)] = [
      { $match: { ...dateMatch, [field]: { $in: ids } } },
      { $unwind: `$${field}` },
      { $match: { [field]: { $in: ids } } },
      { $group: { _id: `$${field}`, patientsOperated: { $sum: 1 }, graftsImplanted: { $sum: { $ifNull: ["$surgery.graftsImplanted", 0] } } } },
    ];
  }
  const [result] = await Patient.aggregate([{ $facet: facet }]);

  // A staff member listed on more than one of the six role arrays for the same
  // surgery (rare, but possible) is counted once per array here — flagged in
  // the end-of-part report rather than engineered around, given how rare it is.
  for (const field of SURGERY_ROLE_FIELDS) {
    for (const row of result[facetKey(field)] || []) {
      const m = metricsById.get(String(row._id));
      if (!m) continue;
      m.patientsOperated += row.patientsOperated;
      m.graftsImplanted += row.graftsImplanted;
    }
  }
  // No "scheduled but not completed" flag exists on Patient — these read
  // identically until that data exists.
  for (const m of metricsById.values()) m.surgeriesAttempted = m.patientsOperated;

  return { metricsById, callbyError: null };
}

async function buildHrMetrics(employees, { from, to }) {
  const metricsById = new Map();
  for (const e of employees) {
    metricsById.set(String(e._id), { totalInterviews: 0, selected: 0, rejected: 0, hold: 0 });
  }

  const ids = employees.map((e) => e._id);
  const match = { assignedHr: { $in: ids } };
  const dateBounds = periodBounds(from, to);
  if (dateBounds) match.date = dateBounds;
  const rows = await Interviewer.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$assignedHr",
        totalInterviews: { $sum: 1 },
        selected: { $sum: { $cond: [{ $eq: ["$status", "Selected"] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ["$status", "Rejected"] }, 1, 0] } },
        hold: { $sum: { $cond: [{ $eq: ["$status", "On Hold"] }, 1, 0] } },
      },
    },
  ]);
  for (const r of rows) {
    const m = metricsById.get(String(r._id));
    if (!m) continue;
    Object.assign(m, { totalInterviews: r.totalInterviews, selected: r.selected, rejected: r.rejected, hold: r.hold });
  }

  return { metricsById, callbyError: null };
}

async function buildOtherMetrics(employees) {
  const metricsById = new Map();
  for (const e of employees) metricsById.set(String(e._id), {});
  return { metricsById, callbyError: null };
}

export const SECTION_METRIC_BUILDERS = {
  Agent: buildAgentMetrics,
  Counsellor: buildCounsellorMetrics,
  Surgery: buildSurgeryMetrics,
  HR: buildHrMetrics,
  Other: buildOtherMetrics,
};

// ---------------------------------------------------------------------------
// Compensation — shared by every section. Reuses the exact aggregation
// src/app/api/employees/finance-summary/route.js already uses (that route is
// admin/super-admin only, so this calls the aggregation directly rather than
// fetching it over HTTP).
// ---------------------------------------------------------------------------

/**
 * Payables for the pay months a client window covers. Salary/incentive
 * payables are raised weeks after the month they're for (July salary is
 * created mid-September), so matching on createdAt showed nothing for most
 * ranges. Payables without a period fall back to createdAt.
 */
export function payablePeriodMatch(from, to) {
  const months = istMonthKeys(from, to);
  if (!months.length) return {};
  const byPeriod = months.map(({ year, month }) => ({ "period.year": year, "period.month": month }));
  return {
    $or: [
      ...byPeriod,
      { $and: [{ $or: [{ "period.month": null }, { period: { $exists: false } }] }, { createdAt: periodBounds(from, to) }] },
    ],
  };
}

export async function buildCompensationMetrics(employees, { from, to }) {
  const metricsById = new Map();
  for (const e of employees) {
    metricsById.set(String(e._id), { salaryPayable: 0, salaryPaid: 0, incentivePayable: 0, incentivePaid: 0 });
  }

  const ids = employees.map((e) => e._id);
  const match = { "payee.kind": "EMPLOYEE", "payee.refId": { $in: ids }, isCancelled: { $ne: true }, ...payablePeriodMatch(from, to) };

  const forPurpose = (purpose, field) => ({ $sum: { $cond: [{ $eq: ["$purpose", purpose] }, `$${field}`, 0] } });

  const rows = await Payable.aggregate([
    { $match: match },
    ...buildPayableAggregationStages(Transactions.collection.name),
    {
      $group: {
        _id: "$payee.refId",
        salaryPayable: forPurpose("SALARY", "totalAmount"),
        salaryPaid: forPurpose("SALARY", "paid"),
        incentivePayable: forPurpose("INCENTIVE", "totalAmount"),
        incentivePaid: forPurpose("INCENTIVE", "paid"),
      },
    },
  ]);
  for (const r of rows) {
    const m = metricsById.get(String(r._id));
    if (!m) continue;
    Object.assign(m, {
      salaryPayable: round(r.salaryPayable), salaryPaid: round(r.salaryPaid),
      incentivePayable: round(r.incentivePayable), incentivePaid: round(r.incentivePaid),
    });
  }

  return metricsById;
}

// ---------------------------------------------------------------------------
// Performance input derivation — turns raw section metrics into the rate
// inputs src/lib/owner/performance.js's formulas expect (see ROLE_PERFORMANCE_CONFIG).
// ---------------------------------------------------------------------------

export function derivePerfMetrics(section, m, periodDays) {
  switch (section) {
    case "Agent":
      return {
        connectRate: m.totalCalls ? m.connected / m.totalCalls : 0,
        // Both sides from Patient (referred → converted) — callby's lead count
        // is a present snapshot, not the period, so it can't be the denominator.
        conversionRate: m.totalPatients ? m.converted / m.totalPatients : 0,
        targetAttainment: m.dailyTarget ? m.totalCalls / (m.dailyTarget * periodDays) : 0,
      };
    case "Counsellor":
      return {
        conversionRate: m.patientsConsulted ? m.converted / m.patientsConsulted : 0,
        revenuePerPatient: m.patientsConsulted ? m.amountReceived / m.patientsConsulted : 0,
        avgDiscount: m.avgDiscount || 0,
      };
    case "Surgery":
      return {
        graftsPerSurgery: m.patientsOperated ? m.graftsImplanted / m.patientsOperated : 0,
        surgeryVolume: m.patientsOperated || 0,
      };
    case "HR":
      return {
        selectionRate: m.totalInterviews ? m.selected / m.totalInterviews : 0,
        interviewVolume: m.totalInterviews || 0,
      };
    default:
      return {};
  }
}

export function sampleValue(section, m) {
  const config = ROLE_PERFORMANCE_CONFIG[section];
  if (!config) return 0;
  return m[config.sampleField] || 0;
}

// KPI tiles from the $facet totals (one $group over the whole filtered cohort —
// the same rows the table pages through, never a second query).
function buildKpis(section, t) {
  const headcount = t?.headcount || 0;
  const active = t?.active || 0;
  const linked = t?.linked || 0;
  const scoredCount = t?.scoredCount || 0;
  const avgScore = scoredCount ? Math.round((t.scoreSum || 0) / scoredCount) : null;

  const base = [
    { label: "Headcount", value: headcount, sub: `${SECTION_LABELS[section]} in view`, kind: "info" },
    { label: "Active", value: active, sub: `${headcount - active} inactive`, kind: "good" },
    { label: "Linked to callby", value: linked, sub: `${headcount - linked} not linked`, kind: linked === headcount ? "good" : "warn" },
    { label: "Salary Paid", value: round(t?.salaryPaid), sub: `of ${rupee0(t?.salaryPayable)} due · pay months in range`, kind: "info", format: "currency" },
    { label: "Incentive Earned", value: round(t?.incentivePayable), sub: `${rupee0(t?.incentivePaid)} paid · pay months in range`, kind: "good", format: "currency" },
    { label: "Avg. Performance", value: avgScore == null ? "—" : `${avgScore}`, sub: `${scoredCount} scored`, kind: "good" },
  ];

  if (section === "Agent") {
    base.push({ label: "Total Calls", value: t?.totalCalls || 0, sub: "This period", kind: "info" });
    base.push({ label: "Total Leads", value: t?.totalLeads || 0, sub: "Currently assigned (snapshot)", kind: "info" });
  } else if (section === "Counsellor") {
    base.push({ label: "Patients Consulted", value: t?.patientsConsulted || 0, sub: "This period", kind: "info" });
  } else if (section === "Surgery") {
    base.push({ label: "Patients Operated", value: t?.patientsOperated || 0, sub: "This period", kind: "info" });
    base.push({ label: "Grafts Implanted", value: t?.graftsImplanted || 0, sub: "This period", kind: "info" });
  } else if (section === "HR") {
    base.push({ label: "Interviews", value: t?.totalInterviews || 0, sub: "This period", kind: "info" });
    base.push({ label: "Selected", value: t?.selected || 0, sub: "This period", kind: "good" });
  }

  return base;
}

// Columns the table may sort on. Employee-document fields sort on the document
// itself; everything else lives under the attached `_m` metrics object. Anything
// not listed falls back to name so a crafted sortBy can't probe arbitrary paths.
const EMPLOYEE_SORT_FIELDS = new Set([
  "name", "phone", "email", "employeeId", "role", "branch", "tlName", "managerName", "dateOfJoining", "isactive",
]);
const EMPLOYEE_SORT_ALIASES = { salary: "salaryStructure.baseSalary", incentiveRate: "incentiveRate" };
const COMP_KEYS = ["salaryPayable", "salaryPaid", "incentivePayable", "incentivePaid"];

function resolveSortPath(section, sortBy) {
  if (EMPLOYEE_SORT_FIELDS.has(sortBy)) return sortBy;
  if (EMPLOYEE_SORT_ALIASES[sortBy]) return EMPLOYEE_SORT_ALIASES[sortBy];
  if (sortBy === "performance") return "_m.performance.score";
  if (sortBy === "callbyLinked") return "callbyLinked";
  if (COMP_KEYS.includes(sortBy) || SECTION_METRIC_KEYS[section]?.has(sortBy)) return `_m.${sortBy}`;
  return "name";
}

// Metric keys each section's builder emits — derived from the builders' own
// zero-rows so the sort whitelist can't drift from what they actually return.
const SECTION_METRIC_KEYS = {
  Agent: new Set(["totalCalls", "connected", "dailyTarget", "totalLeads", "interested", "notInterested", "followUps", "unattemptedLeads", "totalPatients", "converted", "nonConverted", "amountReceived"]),
  Counsellor: new Set(["patientsConsulted", "converted", "nonConverted", "amountReceived", "avgDiscount", "packageBeforeConsult", "packageAfterConsult"]),
  Surgery: new Set(["patientsOperated", "graftsImplanted", "surgeriesAttempted"]),
  HR: new Set(["totalInterviews", "selected", "rejected", "hold"]),
  Other: new Set([]),
};

// Per-section KPI accumulators for the $facet totals branch.
const SECTION_KPI_SUMS = {
  Agent: { totalCalls: "$_m.totalCalls", totalLeads: "$_m.totalLeads" },
  Counsellor: { patientsConsulted: "$_m.patientsConsulted" },
  Surgery: { patientsOperated: "$_m.patientsOperated", graftsImplanted: "$_m.graftsImplanted" },
  HR: { totalInterviews: "$_m.totalInterviews", selected: "$_m.selected" },
  Other: {},
};

const ROW_FIELDS = [
  "name", "phone", "email", "employeeId", "role", "dateOfJoining", "tlName", "managerName", "branch", "isactive",
];

/**
 * Mongo $match for one section + the standard filters. Exported so any other
 * owner query that needs "the employees on the Agents page" (Sanya's tools,
 * overview) builds the identical filter instead of re-deriving it.
 */
export async function buildSectionMatch(section, filters = {}) {
  const distinctRoles = await Employee.distinct("role", { mergedInto: null });
  let sectionRoles = distinctRoles.filter((r) => employeeSection(r) === section);
  // A missing/blank role classifies as "Other" — $in with null also matches
  // documents without the field.
  if (section === "Other") sectionRoles.push(null, "");
  // "Role" advanced filter narrows the section's own role bucket rather than
  // fighting it with a second `role` match key (Mongo would just keep the last one).
  if (filters.role) {
    const q = filters.role.trim().toLowerCase();
    sectionRoles = sectionRoles.filter((r) => r && r.toLowerCase().includes(q));
  }

  const match = { mergedInto: null, role: { $in: sectionRoles } };
  if (filters.isactive === true || filters.isactive === false) match.isactive = filters.isactive;
  if (filters.callbyLinked === true) match.callbyUserId = { $exists: true, $nin: [null, ""] };
  if (filters.callbyLinked === false) match.$and = [
    ...(match.$and || []),
    { $or: [{ callbyUserId: { $exists: false } }, { callbyUserId: null }, { callbyUserId: "" }] },
  ];
  if (filters.branch && filters.branch !== "All") match.branch = filters.branch;
  if (filters.search) {
    const re = new RegExp(escapeRegex(filters.search), "i");
    match.$or = [
      { name: re }, { phone: re }, { employeeId: re }, { tlName: re },
      { managerName: re }, { email: re }, { role: re },
    ];
  }
  if (filters.tlName === UNASSIGNED_TEAM) {
    match.$and = [...(match.$and || []), { $or: [{ tlName: { $exists: false } }, { tlName: null }, { tlName: "" }] }];
  } else if (filters.tlName) {
    // Exact team, case/whitespace-insensitive — same rule the Leadership page uses.
    match.tlName = new RegExp(`^\\s*${escapeRegex(filters.tlName.trim())}\\s*$`, "i");
  }
  if (filters.dojFrom || filters.dojTo) {
    match.dateOfJoining = {};
    if (filters.dojFrom) match.dateOfJoining.$gte = getISTStartOfDay(filters.dojFrom);
    if (filters.dojTo) match.dateOfJoining.$lte = getISTEndOfDay(filters.dojTo);
  }
  if (filters.salaryMin != null || filters.salaryMax != null) {
    match["salaryStructure.baseSalary"] = {};
    if (filters.salaryMin != null) match["salaryStructure.baseSalary"].$gte = filters.salaryMin;
    if (filters.salaryMax != null) match["salaryStructure.baseSalary"].$lte = filters.salaryMax;
  }
  if (filters.incentiveRateMin != null || filters.incentiveRateMax != null) {
    match.incentiveRate = {};
    if (filters.incentiveRateMin != null) match.incentiveRate.$gte = filters.incentiveRateMin;
    if (filters.incentiveRateMax != null) match.incentiveRate.$lte = filters.incentiveRateMax;
  }
  return match;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runEmployeeReportQuery(req, section) {
  const session = await getServerSession(authOptions);
  if (!session || !ALLOWED_ROLES.includes(session?.user?.role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const filters = parseEmployeeFilters(searchParams);
  const pageParams = parsePageParams(searchParams);
  return NextResponse.json(await queryEmployeeSection({ section, filters, ...pageParams }));
}

/**
 * The Employees list query without the HTTP layer — the payload
 * runEmployeeReportQuery returns. Exported so src/lib/owner/metrics/employees.js
 * (Sanya) reads the same KPI totals the page shows for the same filters.
 */
export async function queryEmployeeSection({ section, filters, page, pageSize, skip, limit }) {
  const sortPath = resolveSortPath(section, filters.sortBy);
  const sortDir = filters.sortDir === "desc" ? -1 : 1;

  const match = await buildSectionMatch(section, filters);

  // The cohort's ids (+ callby link) — the only thing the metric builders need.
  // A projection of two fields over a few hundred docs; the full rows are read
  // by the paginated aggregation below, one page at a time.
  const cohort = await Employee.find(match).select("_id callbyUserId").lean();

  const meta = pageMeta({ page, pageSize, total: 0 });
  const period = { from: filters.dateFrom || "", to: filters.dateTo || "" };

  if (cohort.length === 0) {
    return {
      success: true, rows: [], total: 0, ...meta,
      sortBy: filters.sortBy, sortDir: filters.sortDir,
      kpis: buildKpis(section, null), bands: emptyBands(), callbyError: null,
    };
  }

  const periodDays = daysInPeriod(period.from, period.to);
  const [compensationById, sectionResult] = await Promise.all([
    buildCompensationMetrics(cohort, period),
    (SECTION_METRIC_BUILDERS[section] || buildOtherMetrics)(cohort, period),
  ]);
  const { metricsById: sectionMetricsById, callbyError } = sectionResult;

  // Peer-relative scoring needs every member of the cohort — one scoreCohort
  // call, the same implementation the detail page and dashboard use.
  const performanceById = scoreCohort(
    section,
    cohort.map((e) => {
      const id = String(e._id);
      const m = sectionMetricsById.get(id) || {};
      return { id, sample: sampleValue(section, m), metrics: derivePerfMetrics(section, m, periodDays) };
    }),
  );

  // One small object per employee: section metrics + compensation + performance.
  // Attached to each Employee document inside the aggregation so the DB can
  // sort/paginate/total on them exactly like on document fields.
  const metricRows = cohort.map((e) => {
    const id = String(e._id);
    return {
      _id: e._id,
      ...(compensationById.get(id) || {}),
      ...(sectionMetricsById.get(id) || {}),
      performance: performanceById.get(id) || null,
    };
  });

  const [result] = await Employee.aggregate([
    { $match: match },
    {
      $addFields: {
        _m: {
          $arrayElemAt: [
            { $filter: { input: { $literal: metricRows }, as: "m", cond: { $eq: ["$$m._id", "$_id"] } } },
            0,
          ],
        },
        callbyLinked: { $gt: [{ $strLenCP: { $ifNull: ["$callbyUserId", ""] } }, 0] },
      },
    },
    {
      $facet: {
        rows: [
          // _id tiebreak keeps the order total, so page N+1 can never repeat a
          // row from page N when many employees share a sort value (very common
          // for metrics — dozens of zeros).
          { $sort: { [sortPath]: sortDir, _id: 1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              ...Object.fromEntries(ROW_FIELDS.map((f) => [f, 1])),
              callbyLinked: 1,
              salary: { $ifNull: ["$salaryStructure.baseSalary", 0] },
              incentiveRate: { $ifNull: ["$incentiveRate", 0] },
              _m: 1,
            },
          },
        ],
        totals: [
          {
            $group: {
              _id: null,
              headcount: { $sum: 1 },
              active: { $sum: { $cond: ["$isactive", 1, 0] } },
              linked: { $sum: { $cond: ["$callbyLinked", 1, 0] } },
              salaryPaid: { $sum: { $ifNull: ["$_m.salaryPaid", 0] } },
              salaryPayable: { $sum: { $ifNull: ["$_m.salaryPayable", 0] } },
              incentivePayable: { $sum: { $ifNull: ["$_m.incentivePayable", 0] } },
              incentivePaid: { $sum: { $ifNull: ["$_m.incentivePaid", 0] } },
              scoredCount: { $sum: { $cond: [{ $eq: ["$_m.performance.insufficientData", false] }, 1, 0] } },
              scoreSum: { $sum: { $cond: [{ $eq: ["$_m.performance.insufficientData", false] }, "$_m.performance.score", 0] } },
              ...Object.fromEntries(
                PERFORMANCE_BANDS.map((b) => [`band_${b}`, { $sum: { $cond: [{ $eq: ["$_m.performance.band", b] }, 1, 0] } }]),
              ),
              insufficientData: { $sum: { $cond: [{ $eq: ["$_m.performance.insufficientData", true] }, 1, 0] } },
              ...Object.fromEntries(
                Object.entries(SECTION_KPI_SUMS[section] || {}).map(([k, expr]) => [k, { $sum: { $ifNull: [expr, 0] } }]),
              ),
            },
          },
        ],
      },
    },
  ]).collation({ locale: "en", strength: 2 }); // case-insensitive name/branch ordering

  const totals = result?.totals?.[0] || null;
  const total = totals?.headcount || 0;

  const rows = (result?.rows || []).map((r) => {
    const { _id, _m, ...doc } = r;
    const { _id: _ignored, ...metrics } = _m || {};
    return { id: String(_id), ...doc, ...metrics, performance: metrics.performance ?? null };
  });

  return {
    success: true,
    rows,
    total,
    ...pageMeta({ page, pageSize, total }),
    sortBy: filters.sortBy,
    sortDir: filters.sortDir,
    kpis: buildKpis(section, totals),
    bands: bandsFromTotals(totals),
    callbyError: callbyError || null,
  };
}

// Performance band distribution over the whole cohort (from the $facet totals).
const emptyBands = () => ({ ...Object.fromEntries(PERFORMANCE_BANDS.map((b) => [b, 0])), insufficientData: 0 });
function bandsFromTotals(t) {
  const out = emptyBands();
  if (!t) return out;
  for (const b of PERFORMANCE_BANDS) out[b] = t[`band_${b}`] || 0;
  out.insufficientData = t.insufficientData || 0;
  return out;
}
