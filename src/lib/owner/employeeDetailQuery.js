import Employee from "@/models/Employee";
import Patient from "@/models/Patient";
import Interviewer from "@/models/Interviewer";
import { fetchCallby, CallbyError } from "@/lib/callby";
import { employeeSection } from "@/lib/owner/employeeSections";
import {
  buildCompensationMetrics, SECTION_METRIC_BUILDERS, derivePerfMetrics, sampleValue,
} from "@/lib/owner/employeeReportQuery";
import { scoreCohort } from "@/lib/owner/performance";
import { CONVERTED_STATUSES } from "@/lib/owner/patientStatus";
import { istDayBucket, periodBounds, daysInPeriod } from "@/lib/owner/dates";
import { parseSortParams, pagedFacet, unpackFacet } from "@/lib/owner/pagination";

// Backs /api/owner/employees/[id] — one detail route for all six roles (Owner
// Panel v2, Part 1). Loads the Employee elsewhere; this builds the
// role-specific KPIs, rows (paginated), trend and compensation for one
// employee, all scoped to the same [from, to] window.

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function periodMatch(field, from, to) {
  const bounds = periodBounds(from, to);
  return bounds ? { [field]: bounds } : {};
}

/**
 * One aggregation: a page of rows + totals over the whole filtered set + the
 * per-day trend, all from the same $match.
 */
async function pagedDetail(Model, { match, dateField, sort, skip, limit, project, totalsGroup }) {
  const [result] = await Model.aggregate([
    { $match: match },
    {
      $facet: {
        ...pagedFacet({ sort, skip, limit, rowStages: [{ $project: project }], totals: [{ $group: { _id: null, ...totalsGroup } }] }).$facet,
        trend: [
          { $match: { [dateField]: { $ne: null, $exists: true } } },
          { $group: { _id: istDayBucket(`$${dateField}`), value: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ]);
  const { rows, totals, total } = unpackFacet(result);
  return { rows, totals: totals || {}, total, trend: (result?.trend || []).map((r) => ({ date: r._id, value: r.value })) };
}

const kpi = (label, value, sub, kind = "info", format) => ({ label, value, sub, kind, ...(format ? { format } : {}) });

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------
const AGENT_SORT = { visitDate: "personal.visitDate", name: "personal.name", amountReceived: "payments.amountReceived", status: "ops.status" };

async function agentDetail(employee, { from, to, searchParams }) {
  let callby = null;
  let callbyError = null;
  if (employee.callbyUserId) {
    try {
      const params = {};
      if (from) params.dateFrom = from;
      if (to) params.dateTo = to;
      const result = await fetchCallby(`/api/leads/agent-detail/${employee.callbyUserId}`, { params });
      callby = result?.data || result;
    } catch (err) {
      callbyError = err instanceof CallbyError ? err.message : "Failed to load callby data";
    }
  } else {
    callbyError = "Not linked to callby — see /owner/employees/links";
  }

  const { sort, skip, limit, sortBy, sortDir } = parseSortParams(searchParams, { allowed: AGENT_SORT, defaultKey: "visitDate", defaultDir: "desc" });
  const { rows, totals, total, trend } = await pagedDetail(Patient, {
    match: { "personal.reference": employee._id, ...periodMatch("personal.visitDate", from, to) },
    dateField: "personal.visitDate",
    sort, skip, limit,
    project: { name: "$personal.name", phone: "$personal.phone", visitDate: "$personal.visitDate", status: "$ops.status", amountReceived: { $ifNull: ["$payments.amountReceived", 0] } },
    totalsGroup: {
      referred: { $sum: 1 },
      converted: { $sum: { $cond: [{ $in: ["$ops.status", CONVERTED_STATUSES] }, 1, 0] } },
      amountReceived: { $sum: { $ifNull: ["$payments.amountReceived", 0] } },
    },
  });

  const calls = callby?.calls || {};
  const kpis = [
    kpi("Referred Patients", totals.referred || 0, "Visited in this period"),
    kpi("Converted", totals.converted || 0, "Paid in full / surgery done", "good"),
    kpi("Amount Received", round2(totals.amountReceived), "From referred patients", "info", "currency"),
    kpi("Total Calls", calls.total ?? "—", employee.callbyUserId ? "This period (callby)" : "Not linked to callby"),
    kpi("Connected", calls.connected ?? "—", calls.total ? `${Math.round(((calls.connected || 0) / calls.total) * 100)}% connect rate` : "This period (callby)"),
  ];

  return {
    kpis, trend, total, sortBy, sortDir,
    rows: rows.map((p) => ({ ...p, id: String(p._id), name: p.name || "Unknown", phone: p.phone || "" })),
    rowsLabel: "Referred patients",
    callby, callbyError,
    recentCalls: callby?.recentCalls || [],
    recentLeadChangelog: callby?.recentLeadChangelog || [],
  };
}

// ---------------------------------------------------------------------------
// Counsellor
// ---------------------------------------------------------------------------
const COUNSELLOR_SORT = {
  visitDate: "personal.visitDate", name: "personal.name", amountReceived: "payments.amountReceived",
  packageAfterConsult: "counselling.finlpackage", discount: "payments.discount", status: "ops.status",
};

async function counsellorDetail(employee, { from, to, searchParams }) {
  const { sort, skip, limit, sortBy, sortDir } = parseSortParams(searchParams, { allowed: COUNSELLOR_SORT, defaultKey: "visitDate", defaultDir: "desc" });
  const { rows, totals, total, trend } = await pagedDetail(Patient, {
    match: { "counselling.counsellor": employee._id, ...periodMatch("personal.visitDate", from, to) },
    dateField: "personal.visitDate",
    sort, skip, limit,
    project: {
      name: "$personal.name", phone: "$personal.phone", visitDate: "$personal.visitDate",
      packageBeforeConsult: { $ifNull: ["$personal.packageQuoted", 0] },
      packageAfterConsult: { $ifNull: ["$counselling.finlpackage", 0] },
      discount: { $ifNull: ["$payments.discount", 0] },
      amountReceived: { $ifNull: ["$payments.amountReceived", 0] },
      status: "$ops.status",
    },
    totalsGroup: {
      consulted: { $sum: 1 },
      converted: { $sum: { $cond: [{ $in: ["$ops.status", CONVERTED_STATUSES] }, 1, 0] } },
      amountReceived: { $sum: { $ifNull: ["$payments.amountReceived", 0] } },
      avgDiscount: { $avg: { $ifNull: ["$payments.discount", 0] } },
    },
  });

  const kpis = [
    kpi("Patients Consulted", totals.consulted || 0, "Visited in this period"),
    kpi("Converted", totals.converted || 0, "Paid in full / surgery done", "good"),
    kpi("Amount Received", round2(totals.amountReceived), "From consulted patients", "info", "currency"),
    kpi("Avg. Discount", round2(totals.avgDiscount), "Per patient", "info", "currency"),
  ];

  return {
    kpis, trend, total, sortBy, sortDir,
    rows: rows.map((p) => ({ ...p, id: String(p._id), name: p.name || "Unknown", phone: p.phone || "" })),
    rowsLabel: "Patients consulted",
    callby: null, callbyError: null,
  };
}

// ---------------------------------------------------------------------------
// Surgery
// ---------------------------------------------------------------------------
const SURGERY_ROLE_FIELDS = [
  "surgery.doctor", "surgery.seniorTech", "surgery.implanterRight",
  "surgery.implanterLeft", "surgery.graftingPerson", "surgery.helper",
];
const SURGERY_SORT = { surgeryDate: "surgery.surgeryDate", name: "personal.name", graftsImplanted: "surgery.graftsImplanted", technique: "surgery.technique" };

async function surgeryDetail(employee, { from, to, searchParams }) {
  const { sort, skip, limit, sortBy, sortDir } = parseSortParams(searchParams, { allowed: SURGERY_SORT, defaultKey: "surgeryDate", defaultDir: "desc" });
  const { rows, totals, total, trend } = await pagedDetail(Patient, {
    match: {
      $or: SURGERY_ROLE_FIELDS.map((f) => ({ [f]: employee._id })),
      "surgery.surgeryDate": { $ne: null, ...(periodBounds(from, to) || {}) },
    },
    dateField: "surgery.surgeryDate",
    sort, skip, limit,
    project: {
      name: "$personal.name", phone: "$personal.phone", surgeryDate: "$surgery.surgeryDate",
      technique: { $ifNull: ["$surgery.technique", ""] }, graftsImplanted: { $ifNull: ["$surgery.graftsImplanted", 0] }, OT: "$surgery.OT",
    },
    totalsGroup: {
      surgeries: { $sum: 1 },
      grafts: { $sum: { $ifNull: ["$surgery.graftsImplanted", 0] } },
      techniques: { $addToSet: "$surgery.technique" },
    },
  });

  const surgeries = totals.surgeries || 0;
  const kpis = [
    kpi("Surgeries", surgeries, "This period"),
    kpi("Grafts Implanted", totals.grafts || 0, "This period", "good"),
    kpi("Avg. Grafts / Surgery", surgeries ? Math.round((totals.grafts || 0) / surgeries) : 0, "This period"),
    kpi("Techniques", (totals.techniques || []).filter(Boolean).length, "Distinct techniques"),
  ];

  return {
    kpis, trend, total, sortBy, sortDir,
    rows: rows.map((p) => ({ ...p, id: String(p._id), name: p.name || "Unknown", phone: p.phone || "" })),
    rowsLabel: "Surgeries",
    callby: null, callbyError: null,
  };
}

// ---------------------------------------------------------------------------
// HR
// ---------------------------------------------------------------------------
const HR_SORT = { interviewDate: "date", candidateName: "name", position: "position", status: "status", finalSalary: "finalSalary" };

async function hrDetail(employee, { from, to, searchParams }) {
  const { sort, skip, limit, sortBy, sortDir } = parseSortParams(searchParams, { allowed: HR_SORT, defaultKey: "interviewDate", defaultDir: "desc" });
  const { rows, totals, total, trend } = await pagedDetail(Interviewer, {
    match: { assignedHr: employee._id, ...periodMatch("date", from, to) },
    dateField: "date",
    sort, skip, limit,
    project: { candidateName: "$name", position: 1, status: 1, interviewDate: { $ifNull: ["$interviewDate", "$date"] }, finalSalary: { $ifNull: ["$finalSalary", 0] } },
    totalsGroup: {
      interviews: { $sum: 1 },
      selected: { $sum: { $cond: [{ $eq: ["$status", "Selected"] }, 1, 0] } },
      rejected: { $sum: { $cond: [{ $eq: ["$status", "Rejected"] }, 1, 0] } },
      hold: { $sum: { $cond: [{ $eq: ["$status", "On Hold"] }, 1, 0] } },
    },
  });

  const interviews = totals.interviews || 0;
  const kpis = [
    kpi("Total Interviews", interviews, "This period"),
    kpi("Selected", totals.selected || 0, interviews ? `${Math.round(((totals.selected || 0) / interviews) * 100)}% selection rate` : "This period", "good"),
    kpi("Rejected", totals.rejected || 0, "This period", "bad"),
    kpi("On Hold", totals.hold || 0, "This period", "warn"),
  ];

  return {
    kpis, trend, total, sortBy, sortDir,
    rows: rows.map((i) => ({ ...i, id: String(i._id) })),
    rowsLabel: "Interviews",
    callby: null, callbyError: null,
  };
}

const SECTION_DETAIL_BUILDERS = {
  Agent: agentDetail,
  Counsellor: counsellorDetail,
  Surgery: surgeryDetail,
  HR: hrDetail,
};

// Performance is peer-relative (src/lib/owner/performance.js), so even a single
// employee's badge needs the whole section's cohort to rank against — same cost
// as a list-page load for that section, bounded by employee count, run once per
// detail-page visit. The peer set is the ACTIVE members of the section (what
// the list page shows by default) plus this employee if inactive.
async function computePerformanceForEmployee(employee, section, { from, to }) {
  const builder = SECTION_METRIC_BUILDERS[section];
  if (!builder) return null; // "Other" — no formula

  const peers = await Employee.find({ mergedInto: null, isactive: true })
    .select("name role callbyUserId")
    .lean();
  const cohortEmployees = peers.filter((e) => employeeSection(e.role) === section);
  if (!cohortEmployees.some((e) => String(e._id) === String(employee._id))) {
    cohortEmployees.push(employee);
  }

  const { metricsById } = await builder(cohortEmployees, { from, to });
  const periodDays = daysInPeriod(from, to);
  const cohort = cohortEmployees.map((e) => {
    const id = String(e._id);
    const m = metricsById.get(id) || {};
    return { id, sample: sampleValue(section, m), metrics: derivePerfMetrics(section, m, periodDays) };
  });
  const perfById = scoreCohort(section, cohort);
  return perfById.get(String(employee._id)) || null;
}

export async function loadEmployeeDetail(employee, { from, to, searchParams }) {
  const section = employeeSection(employee.role);
  const builder = SECTION_DETAIL_BUILDERS[section];

  const [compById, performance, sectionData] = await Promise.all([
    buildCompensationMetrics([employee], { from, to }),
    computePerformanceForEmployee(employee, section, { from, to }),
    builder
      ? builder(employee, { from, to, searchParams })
      : Promise.resolve({ kpis: [], trend: [], rows: [], total: 0, rowsLabel: null, callby: null, callbyError: null }),
  ]);
  const compensation = compById.get(String(employee._id)) || {};

  const fmt = (n) => `₹${new Intl.NumberFormat("en-IN").format(Math.round(n || 0))}`;
  const kpis = [
    ...sectionData.kpis,
    kpi("Salary Paid", round2(compensation.salaryPaid), `of ${fmt(compensation.salaryPayable)} due · pay months in range`, "info", "currency"),
    kpi("Incentive Earned", round2(compensation.incentivePayable), `${fmt(compensation.incentivePaid)} paid · pay months in range`, "good", "currency"),
  ];

  return { section, compensation, performance, ...sectionData, kpis };
}
