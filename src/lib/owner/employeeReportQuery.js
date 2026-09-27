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
import { CONVERTED_STATUSES, VISITED_EXCLUDED_STATUSES } from "@/lib/owner/patientStatus";
import { sumInterestedBands } from "@/lib/owner/engagementBands";
import { cacheKey, cached } from "@/lib/cache";

export const UNASSIGNED_TEAM = "(unassigned)";

const ALLOWED_ROLES = ["owner", "super-admin"];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export { daysInPeriod };

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
const rupee0 = (n) => `₹${new Intl.NumberFormat("en-IN").format(Math.round(Number(n) || 0))}`;

export const codeKey = (v) => String(v ?? "").trim().toUpperCase().replace(/\s+/g, "");

export async function buildAgentMetrics(employees, { from, to }) {
  const metricsById = new Map();
  for (const e of employees) {
    metricsById.set(String(e._id), {
      totalCalls: 0, connected: 0, dailyTarget: 100,
      notConnected: null, interested: null, avgCallSeconds: null,
      referred: 0, visited: 0, converted: 0, nonConverted: 0, amountReceived: 0,
      
      
      callbyLinked: !!e.employeeId || !!e.callbyUserId,
      callbyMatched: false,
    });
  }

  let callbyError = null;
  try {
    
    
    const params = {};
    if (from) params.dateFrom = from;
    if (to) params.dateTo = to;
    const result = await fetchCallbyCached("/api/leads/workforce-summary", { params });
    const agents = result?.data?.agents || result?.agents || [];

    const byCode = new Map();
    const byUserId = new Map();
    for (const a of agents) {
      const code = codeKey(a?.ryanEmployeeCode);
      if (code) byCode.set(code, a);
      const uid = String(a?.employeeId ?? a?.userId ?? a?.id ?? a?._id ?? "");
      if (uid) byUserId.set(uid, a);
    }

    for (const e of employees) {
      const m = metricsById.get(String(e._id));
      let a = null;
      const empCode = codeKey(e.employeeId);
      if (empCode && byCode.has(empCode)) {
        a = byCode.get(empCode);
      } else if (e.callbyUserId) {
        a = byUserId.get(String(e.callbyUserId)) || null;
      }
      if (!a) continue;

      m.callbyMatched = true;
      m.totalCalls = a.calls?.total || 0;
      m.connected = a.calls?.connected || 0;
      m.dailyTarget = a.dailyTarget || 100;

      
      
      
      
      
      const byEngagement = a.calls?.byEngagement;
      m.notConnected = byEngagement ? (byEngagement.NOT_CONNECTED || 0) : null;
      
      
      
      m.interested = byEngagement ? sumInterestedBands(byEngagement) : null;
      m.avgCallSeconds = a.calls?.total ? Math.round((a.calls?.totalDurationSeconds || 0) / a.calls.total) : null;
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
        referred: { $sum: 1 },
        
        
        
        visited: { $sum: { $cond: [{ $in: ["$ops.status", VISITED_EXCLUDED_STATUSES] }, 0, 1] } },
        converted: { $sum: { $cond: [{ $in: ["$ops.status", CONVERTED_STATUSES] }, 1, 0] } },
        amountReceived: { $sum: { $ifNull: ["$payments.amountReceived", 0] } },
      },
    },
  ]);
  for (const r of rows) {
    const m = metricsById.get(String(r._id));
    if (!m) continue;
    m.referred = r.referred;
    m.visited = r.visited;
    m.converted = r.converted;
    
    
    m.nonConverted = r.visited - r.converted;
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

  
  
  
  for (const field of SURGERY_ROLE_FIELDS) {
    for (const row of result[facetKey(field)] || []) {
      const m = metricsById.get(String(row._id));
      if (!m) continue;
      m.patientsOperated += row.patientsOperated;
      m.graftsImplanted += row.graftsImplanted;
    }
  }
  
  
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

export function derivePerfMetrics(section, m, periodDays) {
  switch (section) {
    case "Agent":
      return {
        connectRate: m.totalCalls ? m.connected / m.totalCalls : 0,
        
        
        
        conversionRate: m.visited ? m.converted / m.visited : 0,
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

function buildKpis(section, t) {
  const headcount = t?.headcount || 0;
  const active = t?.active || 0;
  const linked = t?.linked || 0;
  const scoredCount = t?.scoredCount || 0;
  const avgScore = scoredCount ? Math.round((t.scoreSum || 0) / scoredCount) : null;

  
  
  
  const linkedTile = section === "Agent" && t
    ? (() => {
        const matched = t.callbyMatched || 0;
        const hasCodeNoRow = t.callbyHasCodeNoRow || 0;
        const noCode = headcount - matched - hasCodeNoRow;
        return {
          label: "Linked to callby", value: matched,
          sub: `${hasCodeNoRow} code set, no callby row · ${noCode} no code`,
          kind: matched === headcount ? "good" : "warn",
        };
      })()
    : { label: "Linked to callby", value: linked, sub: `${headcount - linked} not linked`, kind: linked === headcount ? "good" : "warn" };

  const base = [
    { label: "Headcount", value: headcount, sub: `${SECTION_LABELS[section]} in view`, kind: "info" },
    { label: "Active", value: active, sub: `${headcount - active} inactive`, kind: "good" },
    linkedTile,
    { label: "Salary Paid", value: round(t?.salaryPaid), sub: `of ${rupee0(t?.salaryPayable)} due · pay months in range`, kind: "info", format: "currency" },
    { label: "Incentive Earned", value: round(t?.incentivePayable), sub: `${rupee0(t?.incentivePaid)} paid · pay months in range`, kind: "good", format: "currency" },
    { label: "Avg. Performance", value: avgScore == null ? "—" : `${avgScore}`, sub: `${scoredCount} scored`, kind: "good" },
  ];

  if (section === "Agent") {
    base.push({ label: "Total Calls", value: t?.totalCalls || 0, sub: "This period", kind: "info" });
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

const SECTION_METRIC_KEYS = {
  Agent: new Set(["totalCalls", "connected", "dailyTarget", "notConnected", "interested", "avgCallSeconds", "referred", "visited", "converted", "nonConverted", "amountReceived"]),
  Counsellor: new Set(["patientsConsulted", "converted", "nonConverted", "amountReceived", "avgDiscount", "packageBeforeConsult", "packageAfterConsult"]),
  Surgery: new Set(["patientsOperated", "graftsImplanted", "surgeriesAttempted"]),
  HR: new Set(["totalInterviews", "selected", "rejected", "hold"]),
  Other: new Set([]),
};

const SECTION_KPI_SUMS = {
  Agent: { totalCalls: "$_m.totalCalls" },
  Counsellor: { patientsConsulted: "$_m.patientsConsulted" },
  Surgery: { patientsOperated: "$_m.patientsOperated", graftsImplanted: "$_m.graftsImplanted" },
  HR: { totalInterviews: "$_m.totalInterviews", selected: "$_m.selected" },
  Other: {},
};

const ROW_FIELDS = [
  "name", "phone", "email", "employeeId", "role", "dateOfJoining", "tlName", "managerName", "branch", "isactive",
];

export async function buildSectionMatch(section, filters = {}) {
  const distinctRoles = await Employee.distinct("role", { mergedInto: null });
  let sectionRoles = distinctRoles.filter((r) => employeeSection(r) === section);
  
  
  if (section === "Other") sectionRoles.push(null, "");
  
  
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

export async function runEmployeeReportQuery(req, section) {
  const session = await getServerSession(authOptions);
  if (!session || !ALLOWED_ROLES.includes(session?.user?.role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const filters = parseEmployeeFilters(searchParams);
  const pageParams = parsePageParams(searchParams);

  
  
  
  
  const meta = {};
  const key = cacheKey("owner", { route: "employees-section", section, ...Object.fromEntries(searchParams) }, session);
  const data = await cached(key, 120, () => queryEmployeeSection({ section, filters, ...pageParams }), meta);

  const res = NextResponse.json(data);
  res.headers.set("X-Cache", meta.status);
  return res;
}

export async function queryEmployeeSection({ section, filters, page, pageSize, skip, limit }) {
  const sortPath = resolveSortPath(section, filters.sortBy);
  const sortDir = filters.sortDir === "desc" ? -1 : 1;

  const match = await buildSectionMatch(section, filters);

  
  
  
  const cohort = await Employee.find(match).select("_id callbyUserId employeeId").lean();

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

  
  
  const performanceById = scoreCohort(
    section,
    cohort.map((e) => {
      const id = String(e._id);
      const m = sectionMetricsById.get(id) || {};
      return { id, sample: sampleValue(section, m), metrics: derivePerfMetrics(section, m, periodDays) };
    }),
  );

  
  
  
  const metricRows = cohort.map((e) => {
    const id = String(e._id);
    return {
      _id: e._id,
      ...(compensationById.get(id) || {}),
      ...(sectionMetricsById.get(id) || {}),
      performance: performanceById.get(id) || null,
    };
  });

  
  
  
  
  if (cohort.length > 1000) {
    console.warn(`queryEmployeeSection: cohort of ${cohort.length} exceeds 1000 — the $literal/$filter metricRows join in employeeReportQuery.js is O(cohort^2) and needs restructuring before this grows further.`);
  }

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
              
              
              
              linked: { $sum: { $cond: [{ $ifNull: ["$_m.callbyLinked", "$callbyLinked"] }, 1, 0] } },
              callbyMatched: { $sum: { $cond: [{ $eq: ["$_m.callbyMatched", true] }, 1, 0] } },
              callbyHasCodeNoRow: { $sum: { $cond: [{ $and: [{ $eq: ["$_m.callbyLinked", true] }, { $eq: ["$_m.callbyMatched", false] }] }, 1, 0] } },
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
  ]).collation({ locale: "en", strength: 2 }); 

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

const emptyBands = () => ({ ...Object.fromEntries(PERFORMANCE_BANDS.map((b) => [b, 0])), insufficientData: 0 });
function bandsFromTotals(t) {
  const out = emptyBands();
  if (!t) return out;
  for (const b of PERFORMANCE_BANDS) out[b] = t[`band_${b}`] || 0;
  out.insufficientData = t.insufficientData || 0;
  return out;
}
