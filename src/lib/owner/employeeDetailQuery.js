import Employee from "@/models/Employee";
import Patient from "@/models/Patient";
import Interviewer from "@/models/Interviewer";
import { fetchCallby, CallbyError } from "@/lib/callby";
import { employeeSection } from "@/lib/owner/employeeSections";
import {
  buildCompensationMetrics, SECTION_METRIC_BUILDERS, derivePerfMetrics, sampleValue, daysInPeriod,
} from "@/lib/owner/employeeReportQuery";
import { scoreCohort } from "@/lib/owner/performance";

// Backs /api/owner/employees/[id] — one detail route for all six roles (Owner
// Panel v2, Part 1). Loads the Employee elsewhere; this builds the
// role-specific rows + trend + compensation for a single employee.

function dateMatch(field, from, to) {
  if (!from && !to) return {};
  const m = {};
  if (from) m.$gte = new Date(from);
  if (to) m.$lte = new Date(to);
  return { [field]: m };
}

async function dailyTrend(Model, match, dateField) {
  const rows = await Model.aggregate([
    { $match: { ...match, [dateField]: { $ne: null, $exists: true } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: `$${dateField}` } }, value: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ date: r._id, value: r.value }));
}

async function agentDetail(employee, { from, to }) {
  let callby = null;
  let callbyError = null;
  if (employee.callbyUserId) {
    try {
      const result = await fetchCallby(`/api/leads/agent-detail/${employee.callbyUserId}`);
      callby = result?.data || result;
    } catch (err) {
      callbyError = err instanceof CallbyError ? err.message : "Failed to load callby data";
    }
  } else {
    callbyError = "Not linked to callby — see /owner/employees/links";
  }

  const match = { "personal.reference": employee._id, ...dateMatch("personal.visitDate", from, to) };
  const rows = await Patient.find(match)
    .select("personal.name personal.phone personal.visitDate ops.status payments.amountReceived")
    .sort({ "personal.visitDate": -1 })
    .limit(500)
    .lean();

  const trend = await dailyTrend(Patient, { "personal.reference": employee._id }, "personal.visitDate");

  return {
    trend,
    rows: rows.map((p) => ({
      id: String(p._id),
      name: p.personal?.name || "Unknown",
      phone: p.personal?.phone || "",
      visitDate: p.personal?.visitDate,
      status: p.ops?.status,
      amountReceived: p.payments?.amountReceived || 0,
    })),
    rowsLabel: "Referred patients",
    callby,
    callbyError,
    recentCalls: callby?.recentCalls || [],
    recentLeadChangelog: callby?.recentLeadChangelog || [],
  };
}

async function counsellorDetail(employee, { from, to }) {
  const match = { "counselling.counsellor": employee._id, ...dateMatch("personal.visitDate", from, to) };
  const rows = await Patient.find(match)
    .select("personal.name personal.phone personal.visitDate personal.packageQuoted counselling.finlpackage payments.amountReceived payments.discount ops.status")
    .sort({ "personal.visitDate": -1 })
    .limit(500)
    .lean();

  const trend = await dailyTrend(Patient, { "counselling.counsellor": employee._id }, "personal.visitDate");

  return {
    trend,
    rows: rows.map((p) => ({
      id: String(p._id),
      name: p.personal?.name || "Unknown",
      phone: p.personal?.phone || "",
      visitDate: p.personal?.visitDate,
      packageBeforeConsult: p.personal?.packageQuoted || 0,
      packageAfterConsult: p.counselling?.finlpackage || 0,
      discount: p.payments?.discount || 0,
      amountReceived: p.payments?.amountReceived || 0,
      status: p.ops?.status,
    })),
    rowsLabel: "Patients consulted",
    callby: null,
    callbyError: null,
  };
}

const SURGERY_ROLE_FIELDS = [
  "surgery.doctor", "surgery.seniorTech", "surgery.implanterRight",
  "surgery.implanterLeft", "surgery.graftingPerson", "surgery.helper",
];

async function surgeryDetail(employee, { from, to }) {
  const match = {
    $or: SURGERY_ROLE_FIELDS.map((f) => ({ [f]: employee._id })),
    ...dateMatch("surgery.surgeryDate", from, to),
  };
  const rows = await Patient.find(match)
    .select("personal.name personal.phone surgery.surgeryDate surgery.technique surgery.graftsImplanted surgery.OT")
    .sort({ "surgery.surgeryDate": -1 })
    .limit(500)
    .lean();

  const trend = await dailyTrend(
    Patient,
    { $or: SURGERY_ROLE_FIELDS.map((f) => ({ [f]: employee._id })) },
    "surgery.surgeryDate",
  );

  return {
    trend,
    rows: rows.map((p) => ({
      id: String(p._id),
      name: p.personal?.name || "Unknown",
      phone: p.personal?.phone || "",
      surgeryDate: p.surgery?.surgeryDate,
      technique: p.surgery?.technique || "",
      graftsImplanted: p.surgery?.graftsImplanted || 0,
      OT: p.surgery?.OT ?? null,
    })),
    rowsLabel: "Surgeries",
    callby: null,
    callbyError: null,
  };
}

async function hrDetail(employee, { from, to }) {
  const match = { assignedHr: employee._id, ...dateMatch("date", from, to) };
  const rows = await Interviewer.find(match)
    .select("name position status interviewDate finalSalary date")
    .sort({ date: -1 })
    .limit(500)
    .lean();

  const trend = await dailyTrend(Interviewer, { assignedHr: employee._id }, "date");

  return {
    trend,
    rows: rows.map((i) => ({
      id: String(i._id),
      candidateName: i.name,
      position: i.position,
      status: i.status,
      interviewDate: i.interviewDate,
      finalSalary: i.finalSalary || 0,
    })),
    rowsLabel: "Interviews",
    callby: null,
    callbyError: null,
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
// detail-page visit.
async function computePerformanceForEmployee(employee, section, { from, to }) {
  const builder = SECTION_METRIC_BUILDERS[section];
  if (!builder) return null; // "Other" — no formula

  const peers = await Employee.find({ mergedInto: null, isactive: { $ne: false } })
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

export async function loadEmployeeDetail(employee, { from, to }) {
  const section = employeeSection(employee.role);

  const [compById, performance] = await Promise.all([
    buildCompensationMetrics([employee], { from, to }),
    computePerformanceForEmployee(employee, section, { from, to }),
  ]);
  const compensation = compById.get(String(employee._id)) || {};

  const builder = SECTION_DETAIL_BUILDERS[section];
  const sectionData = builder
    ? await builder(employee, { from, to })
    : { trend: [], rows: [], rowsLabel: null, callby: null, callbyError: null };

  return { section, compensation, performance, ...sectionData };
}
