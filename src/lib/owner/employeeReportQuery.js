import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import Employee from "@/models/Employee";
import Patient from "@/models/Patient";
import Interviewer from "@/models/Interviewer";
import Payable from "@/models/Payable";
import Transactions from "@/models/Transactions";
import { buildPayableAggregationStages } from "@/lib/payableAggregation";
import { fetchCallby, CallbyError } from "@/lib/callby";
import { employeeSection, SECTION_LABELS } from "@/lib/owner/employeeSections";
import { scoreCohort, ROLE_PERFORMANCE_CONFIG } from "@/lib/owner/performance";
import { parsePageParams, parseEmployeeFilters } from "@/lib/owner/pagination";

// One query builder behind all five Employees list pages (Owner Panel v2, Part 1).
// Each role route is a one-line wrapper: `runEmployeeReportQuery(req, "Agent")`.
// See the Part 1 plan for the full reasoning; short version:
//   - Employee.role is free text — section bucketing (employeeSection()) is a JS
//     classifier that can't be expressed as a Mongo $match, so the Mongo-filterable
//     subset (branch/isactive/search) is fetched once, then bucketed + paginated
//     in Node. This is bounded by employee count (a few hundred, see Part 0's
//     326-employee reconciliation), never by the underlying Patient/CallLog scale.
//   - Performance is peer-relative, so it's computed over the WHOLE filtered
//     cohort, then sorted/paginated — the one deliberate exception to
//     paginate-in-Mongo, and still bounded by employee count.
//   - Every heavier join (Patient/Payable/Interviewer/callby) is grouped down to
//     one row per employee before it leaves the database/callby.

const ALLOWED_ROLES = ["owner", "super-admin"];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function daysInPeriod(from, to) {
  if (!from || !to) return 1;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;

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
    const params = {};
    if (from) params.from = from;
    if (to) params.to = to;
    const result = await fetchCallby("/api/leads/workforce-summary", { params });
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
  if (from || to) {
    match["personal.visitDate"] = {};
    if (from) match["personal.visitDate"].$gte = new Date(from);
    if (to) match["personal.visitDate"].$lte = new Date(to);
  }
  const rows = await Patient.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$personal.reference",
        totalPatients: { $sum: 1 },
        // Matches src/app/api/super-admin/performance/route.js's by-reference
        // aggregation — the established "agent conversion" definition.
        converted: { $sum: { $cond: [{ $in: ["$ops.status", ["SURGERY_BOOKED", "CLOSED"]] }, 1, 0] } },
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
  if (from || to) {
    match["personal.visitDate"] = {};
    if (from) match["personal.visitDate"].$gte = new Date(from);
    if (to) match["personal.visitDate"].$lte = new Date(to);
  }
  const rows = await Patient.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$counselling.counsellor",
        patientsConsulted: { $sum: 1 },
        // A booking token paid — matches this route's own pre-Part-1 "tokens"
        // figure (src/app/api/owner/counsellor-conversion). Flagged for
        // sign-off: could instead mean surgery-closed.
        converted: { $sum: { $cond: [{ $gt: ["$payments.amountReceived", 0] }, 1, 0] } },
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
  const dateMatch = { "surgery.surgeryDate": { $exists: true, $ne: null } };
  if (from) dateMatch["surgery.surgeryDate"].$gte = new Date(from);
  if (to) dateMatch["surgery.surgeryDate"].$lte = new Date(to);

  const facet = {};
  for (const field of SURGERY_ROLE_FIELDS) {
    facet[field] = [
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
    for (const row of result[field] || []) {
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
  if (from || to) {
    match.date = {};
    if (from) match.date.$gte = new Date(from);
    if (to) match.date.$lte = new Date(to);
  }
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

export async function buildCompensationMetrics(employees, { from, to }) {
  const metricsById = new Map();
  for (const e of employees) {
    metricsById.set(String(e._id), { salaryPayable: 0, salaryPaid: 0, incentivePayable: 0, incentivePaid: 0 });
  }

  const ids = employees.map((e) => e._id);
  const match = { "payee.kind": "EMPLOYEE", "payee.refId": { $in: ids }, isCancelled: { $ne: true } };
  if (from || to) {
    match.createdAt = {};
    if (from) { const f = new Date(from); f.setHours(0, 0, 0, 0); match.createdAt.$gte = f; }
    if (to) { const t = new Date(to); t.setHours(23, 59, 59, 999); match.createdAt.$lte = t; }
  }

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
        conversionRate: m.totalLeads ? m.converted / m.totalLeads : 0,
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

function buildKpis(section, enriched) {
  const headcount = enriched.length;
  const active = enriched.filter((e) => e.isactive).length;
  const linked = enriched.filter((e) => e.callbyLinked).length;
  const totalSalaryPaid = enriched.reduce((s, e) => s + (e.salaryPaid || 0), 0);
  const totalIncentivePaid = enriched.reduce((s, e) => s + (e.incentivePaid || 0), 0);
  const scored = enriched.filter((e) => e.performance && e.performance.insufficientData === false);
  const avgScore = scored.length ? Math.round(scored.reduce((s, e) => s + e.performance.score, 0) / scored.length) : null;

  const base = [
    { label: "Headcount", value: headcount, sub: `${SECTION_LABELS[section]} in view`, kind: "info" },
    { label: "Active", value: active, sub: `${headcount - active} inactive`, kind: "good" },
    { label: "Linked to callby", value: linked, sub: `${headcount - linked} not linked`, kind: linked === headcount ? "good" : "warn" },
    { label: "Salary Paid", value: totalSalaryPaid, sub: "This period", kind: "info", format: "currency" },
    { label: "Incentive Paid", value: totalIncentivePaid, sub: "This period", kind: "info", format: "currency" },
    { label: "Avg. Performance", value: avgScore == null ? "—" : `${avgScore}`, sub: `${scored.length} scored`, kind: "good" },
  ];

  if (section === "Agent") {
    base.push({ label: "Total Calls", value: enriched.reduce((s, e) => s + (e.totalCalls || 0), 0), sub: "This period", kind: "info" });
    base.push({ label: "Total Leads", value: enriched.reduce((s, e) => s + (e.totalLeads || 0), 0), sub: "Assigned", kind: "info" });
  } else if (section === "Counsellor") {
    base.push({ label: "Patients Consulted", value: enriched.reduce((s, e) => s + (e.patientsConsulted || 0), 0), sub: "This period", kind: "info" });
  } else if (section === "Surgery") {
    base.push({ label: "Patients Operated", value: enriched.reduce((s, e) => s + (e.patientsOperated || 0), 0), sub: "This period", kind: "info" });
    base.push({ label: "Grafts Implanted", value: enriched.reduce((s, e) => s + (e.graftsImplanted || 0), 0), sub: "This period", kind: "info" });
  } else if (section === "HR") {
    base.push({ label: "Interviews", value: enriched.reduce((s, e) => s + (e.totalInterviews || 0), 0), sub: "This period", kind: "info" });
    base.push({ label: "Selected", value: enriched.reduce((s, e) => s + (e.selected || 0), 0), sub: "This period", kind: "good" });
  }

  return base;
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
  const { page, pageSize, skip, limit } = parsePageParams(searchParams);

  const match = { mergedInto: null };
  if (filters.isactive !== null) match.isactive = filters.isactive;
  if (filters.branch && filters.branch !== "All") match.branch = filters.branch;
  if (filters.search) {
    const re = new RegExp(escapeRegex(filters.search), "i");
    match.$or = [{ name: re }, { phone: re }, { employeeId: re }, { tlName: re }];
  }

  // Employee documents are small and bounded — see the module comment above for
  // why this reads the whole Mongo-filterable set instead of paginating here.
  const allMatching = await Employee.find(match)
    .select("name phone employeeId role branch isactive callbyUserId tlName dateOfJoining managerName salaryStructure incentiveRate")
    .lean();

  let employees = allMatching.filter((e) => employeeSection(e.role) === section);
  if (filters.tlName) {
    const wanted = filters.tlName.trim().toLowerCase();
    employees = employees.filter((e) => (e.tlName || "").trim().toLowerCase() === wanted);
  }

  if (employees.length === 0) {
    return NextResponse.json({
      success: true, rows: [], total: 0, page, pageSize,
      kpis: buildKpis(section, []), callbyError: null,
    });
  }

  const period = { from: filters.dateFrom || "", to: filters.dateTo || "" };
  const periodDays = daysInPeriod(period.from, period.to);

  const [compensationById, sectionResult] = await Promise.all([
    buildCompensationMetrics(employees, period),
    (SECTION_METRIC_BUILDERS[section] || buildOtherMetrics)(employees, period),
  ]);
  const { metricsById: sectionMetricsById, callbyError } = sectionResult;

  const cohort = employees.map((e) => {
    const id = String(e._id);
    const sectionMetrics = sectionMetricsById.get(id) || {};
    return {
      id,
      sample: sampleValue(section, sectionMetrics),
      metrics: derivePerfMetrics(section, sectionMetrics, periodDays),
    };
  });
  const performanceById = scoreCohort(section, cohort);

  const enriched = employees.map((e) => {
    const id = String(e._id);
    const sectionMetrics = sectionMetricsById.get(id) || {};
    const comp = compensationById.get(id) || {};
    return {
      id,
      name: e.name,
      phone: e.phone,
      employeeId: e.employeeId,
      dateOfJoining: e.dateOfJoining,
      tlName: e.tlName,
      managerName: e.managerName,
      branch: e.branch,
      isactive: e.isactive,
      callbyLinked: !!e.callbyUserId,
      salary: e.salaryStructure?.baseSalary || 0,
      incentiveRate: e.incentiveRate || 0,
      ...comp,
      ...sectionMetrics,
      performance: performanceById.get(id) || null,
    };
  });

  const dir = filters.sortDir === "desc" ? -1 : 1;
  const sortKey = filters.sortBy || "name";
  enriched.sort((a, b) => {
    const av = sortKey === "performance" ? (a.performance?.score ?? -1) : a[sortKey];
    const bv = sortKey === "performance" ? (b.performance?.score ?? -1) : b[sortKey];
    if (typeof av === "string" || typeof bv === "string") {
      return dir * String(av || "").localeCompare(String(bv || ""));
    }
    return dir * ((av || 0) - (bv || 0));
  });

  const total = enriched.length;
  const rows = enriched.slice(skip, skip + limit);
  const kpis = buildKpis(section, enriched);

  return NextResponse.json({ success: true, rows, total, page, pageSize, kpis, callbyError: callbyError || null });
}
