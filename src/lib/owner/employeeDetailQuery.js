import Employee from "@/models/Employee";
import Patient from "@/models/Patient";
import Interviewer from "@/models/Interviewer";
import { fetchCallby, CallbyError } from "@/lib/callby";
import { employeeSection } from "@/lib/owner/employeeSections";
import {
  buildCompensationMetrics, SECTION_METRIC_BUILDERS, derivePerfMetrics, sampleValue, codeKey,
} from "@/lib/owner/employeeReportQuery";
import { scoreCohort } from "@/lib/owner/performance";
import { CONVERTED_STATUSES, VISITED_EXCLUDED_STATUSES } from "@/lib/owner/patientStatus";
import { sumInterestedBands } from "@/lib/owner/engagementBands";
import { istDayBucket, periodBounds, daysInPeriod } from "@/lib/owner/dates";
import { parseSortParams, parsePageParams, pagedFacet, unpackFacet, pageMeta } from "@/lib/owner/pagination";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function periodMatch(field, from, to) {
  const bounds = periodBounds(from, to);
  return bounds ? { [field]: bounds } : {};
}

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

const AGENT_SORT = { visitDate: "personal.visitDate", name: "personal.name", amountReceived: "payments.amountReceived", status: "ops.status" };

async function resolveCallbyUserId(employee, { from, to }) {
  if (employee.employeeId) {
    try {
      const params = {};
      if (from) params.dateFrom = from;
      if (to) params.dateTo = to;
      const result = await fetchCallby("/api/leads/workforce-summary", { params });
      const agents = result?.data?.agents || result?.agents || [];
      const code = codeKey(employee.employeeId);
      const match = agents.find((a) => code && codeKey(a?.ryanEmployeeCode) === code);
      const uid = match ? (match.employeeId ?? match.userId ?? match.id ?? match._id ?? null) : null;
      if (uid) return String(uid);
    } catch {
      
      
    }
  }
  return employee.callbyUserId ? String(employee.callbyUserId) : null;
}

async function agentDetail(employee, { from, to, searchParams }) {
  let callby = null;
  let callbyError = null;
  const callbyUserId = await resolveCallbyUserId(employee, { from, to });
  if (callbyUserId) {
    try {
      const params = {};
      if (from) params.dateFrom = from;
      if (to) params.dateTo = to;
      const result = await fetchCallby(`/api/leads/agent-detail/${callbyUserId}`, { params });
      callby = result?.data || result;
    } catch (err) {
      callbyError = err instanceof CallbyError ? err.message : "Failed to load callby data";
    }
  } else {
    callbyError = "Not linked to callby — see /owner/employees/links";
  }

  const { sort, sortBy, sortDir } = parseSortParams(searchParams, { allowed: AGENT_SORT, defaultKey: "visitDate", defaultDir: "desc" });
  const { skip, limit } = parsePageParams(searchParams);
  const { rows, totals, total, trend } = await pagedDetail(Patient, {
    match: { "personal.reference": employee._id, ...periodMatch("personal.visitDate", from, to) },
    dateField: "personal.visitDate",
    sort, skip, limit,
    project: { name: "$personal.name", phone: "$personal.phone", visitDate: "$personal.visitDate", status: "$ops.status", amountReceived: { $ifNull: ["$payments.amountReceived", 0] } },
    totalsGroup: {
      referred: { $sum: 1 },
      visited: { $sum: { $cond: [{ $in: ["$ops.status", VISITED_EXCLUDED_STATUSES] }, 0, 1] } },
      converted: { $sum: { $cond: [{ $in: ["$ops.status", CONVERTED_STATUSES] }, 1, 0] } },
      amountReceived: { $sum: { $ifNull: ["$payments.amountReceived", 0] } },
    },
  });

  const calls = callby?.calls || {};
  const byEngagement = calls.byEngagement;
  const kpis = [
    kpi("Referred Patients", totals.referred || 0, "This period"),
    kpi("Visited", totals.visited || 0, "Actually turned up"),
    kpi("Converted", totals.converted || 0, "Paid in full / surgery done", "good"),
    kpi("Amount Received", round2(totals.amountReceived), "From referred patients", "info", "currency"),
    kpi("Total Calls", calls.total ?? "—", callbyUserId ? "This period (callby)" : "Not linked to callby"),
    kpi("Connected", calls.connected ?? "—", calls.total ? `${Math.round(((calls.connected || 0) / calls.total) * 100)}% connect rate` : "This period (callby)"),
    kpi("Not Connected", byEngagement ? (byEngagement.NOT_CONNECTED || 0) : "—", "Zero-duration / missed / rejected"),
    kpi("Interested", byEngagement ? sumInterestedBands(byEngagement) : "—", "3+ min calls — a duration signal, not Lead.status"),
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

const COUNSELLOR_SORT = {
  visitDate: "personal.visitDate", name: "personal.name", amountReceived: "payments.amountReceived",
  packageAfterConsult: "counselling.finlpackage", discount: "payments.discount", status: "ops.status",
};

async function counsellorDetail(employee, { from, to, searchParams }) {
  const { sort, sortBy, sortDir } = parseSortParams(searchParams, { allowed: COUNSELLOR_SORT, defaultKey: "visitDate", defaultDir: "desc" });
  const { skip, limit } = parsePageParams(searchParams);
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

const SURGERY_ROLE_FIELDS = [
  "surgery.doctor", "surgery.seniorTech", "surgery.implanterRight",
  "surgery.implanterLeft", "surgery.graftingPerson", "surgery.helper",
];
const SURGERY_SORT = { surgeryDate: "surgery.surgeryDate", name: "personal.name", graftsImplanted: "surgery.graftsImplanted", technique: "surgery.technique" };

async function surgeryDetail(employee, { from, to, searchParams }) {
  const { sort, sortBy, sortDir } = parseSortParams(searchParams, { allowed: SURGERY_SORT, defaultKey: "surgeryDate", defaultDir: "desc" });
  const { skip, limit } = parsePageParams(searchParams);
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

const HR_SORT = { interviewDate: "date", candidateName: "name", position: "position", status: "status", finalSalary: "finalSalary" };

async function hrDetail(employee, { from, to, searchParams }) {
  const { sort, sortBy, sortDir } = parseSortParams(searchParams, { allowed: HR_SORT, defaultKey: "interviewDate", defaultDir: "desc" });
  const { skip, limit } = parsePageParams(searchParams);
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

async function computePerformanceForEmployee(employee, section, { from, to }) {
  const builder = SECTION_METRIC_BUILDERS[section];
  if (!builder) return null; 

  const peers = await Employee.find({ mergedInto: null, isactive: true })
    .select("name role callbyUserId employeeId")
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
  const salaryPending = (compensation.salaryPayable || 0) - (compensation.salaryPaid || 0);
  const kpis = [
    ...sectionData.kpis,
    kpi("Salary Due", round2(compensation.salaryPayable), "Pay months in range", "info", "currency"),
    kpi("Salary Paid", round2(compensation.salaryPaid), `of ${fmt(compensation.salaryPayable)} due · pay months in range`, "info", "currency"),
    kpi("Salary Pending", round2(salaryPending), "Due minus paid", salaryPending ? "warn" : "good", "currency"),
    kpi("Incentive Earned", round2(compensation.incentivePayable), `${fmt(compensation.incentivePaid)} paid · pay months in range`, "good", "currency"),
    kpi("Incentive Paid", round2(compensation.incentivePaid), "Pay months in range", "good", "currency"),
  ];

  return { section, compensation, performance, ...sectionData, kpis };
}

const ROLE_CHECK_FIELDS = [
  ["personal.reference", "Referred"],
  ["counselling.counsellor", "Counselled"],
  ["surgery.doctor", "Surgery — Doctor"],
  ["surgery.seniorTech", "Surgery — Senior Tech"],
  ["surgery.implanterRight", "Surgery — Implanter"],
  ["surgery.implanterLeft", "Surgery — Implanter"],
  ["surgery.graftingPerson", "Surgery — Grafting"],
  ["surgery.helper", "Surgery — Helper"],
];

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}

function rolesFor(patient, employeeIdStr) {
  const labels = new Set();
  for (const [path, label] of ROLE_CHECK_FIELDS) {
    const v = getPath(patient, path);
    const hit = Array.isArray(v)
      ? v.some((x) => String(x) === employeeIdStr)
      : v != null && String(v) === employeeIdStr;
    if (hit) labels.add(label);
  }
  return [...labels];
}

const LINKED_PATIENTS_PROJECTION =
  "personal.name personal.phone personal.branch personal.visitDate ops.status " +
  "payments.totalAmount payments.amountReceived payments.pendingAmount " +
  "personal.reference counselling.counsellor surgery.doctor surgery.seniorTech " +
  "surgery.implanterRight surgery.implanterLeft surgery.graftingPerson surgery.helper";

export async function loadLinkedPatients(employee, { searchParams }) {
  const { page, pageSize, skip, limit } = parsePageParams(searchParams);
  const allIds = employee.patient || [];
  const total = allIds.length;
  const pageIds = allIds.slice(skip, skip + limit);

  if (pageIds.length === 0) {
    return { rows: [], ...pageMeta({ page, pageSize, total }) };
  }

  const patients = await Patient.find({ _id: { $in: pageIds } }).select(LINKED_PATIENTS_PROJECTION).lean();
  const byId = new Map(patients.map((p) => [String(p._id), p]));
  const employeeIdStr = String(employee._id);

  
  
  const rows = pageIds
    .map((id) => byId.get(String(id)))
    .filter(Boolean)
    .map((p) => ({
      id: String(p._id),
      name: p.personal?.name || "Unknown",
      phone: p.personal?.phone || "",
      branch: p.personal?.branch || "",
      visitDate: p.personal?.visitDate || null,
      status: p.ops?.status || "",
      totalAmount: p.payments?.totalAmount || 0,
      amountReceived: p.payments?.amountReceived || 0,
      pendingAmount: p.payments?.pendingAmount || 0,
      roles: rolesFor(p, employeeIdStr),
    }));

  return { rows, ...pageMeta({ page, pageSize, total }) };
}
