import Employee from "@/models/Employee";
import Patient from "@/models/Patient";
import { fetchCallby, CallbyError } from "@/lib/callby";
import { ATTENTION_THRESHOLDS } from "@/lib/owner/attentionThresholds";
import { employeeSection } from "@/lib/owner/employeeSections";
import { SECTION_METRIC_BUILDERS, derivePerfMetrics, sampleValue, daysInPeriod } from "@/lib/owner/employeeReportQuery";
import { scoreCohort } from "@/lib/owner/performance";

const LEAD_SAMPLE_CAP = 2000;
const DAY_MS = 86400000;
const ageInDays = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / DAY_MS) : null);

export async function overdueFollowUps() {
  try {
    const result = await fetchCallby("/api/leads", {
      params: { status: "follow_up", limit: String(LEAD_SAMPLE_CAP), sortBy: "followUpDate", sortDir: "1" },
    });
    const leads = result?.data?.leads || [];
    const now = Date.now();
    const overdue = leads.filter((l) => l.followUpDate && new Date(l.followUpDate).getTime() < now);
    return {
      items: overdue.map((l) => ({
        id: l._id,
        name: l.name || "Unknown",
        phone: l.phone || "",
        agent: l.assignedTo?.name || "Unassigned",
        age: ageInDays(l.followUpDate),
      })),
      error: null,
    };
  } catch (err) {
    return { items: [], error: err instanceof CallbyError ? err.message : "Failed to load lead data" };
  }
}

export async function interestedNoRecentCall() {
  try {
    const result = await fetchCallby("/api/leads", {
      params: { status: "interested", limit: String(LEAD_SAMPLE_CAP), sortBy: "lastCallAt", sortDir: "1" },
    });
    const leads = result?.data?.leads || [];
    const cutoff = Date.now() - ATTENTION_THRESHOLDS.interestedNoCallDays * DAY_MS;
    const stale = leads.filter((l) => !l.lastCallAt || new Date(l.lastCallAt).getTime() < cutoff);
    return {
      items: stale.map((l) => ({
        id: l._id,
        name: l.name || "Unknown",
        phone: l.phone || "",
        agent: l.assignedTo?.name || "Unassigned",
        age: l.lastCallAt ? ageInDays(l.lastCallAt) : null,
      })),
      error: null,
    };
  } catch (err) {
    return { items: [], error: err instanceof CallbyError ? err.message : "Failed to load lead data" };
  }
}

export async function stalePatients(status, staleDays) {
  const cutoff = new Date(Date.now() - staleDays * DAY_MS);
  const patients = await Patient.find({ "ops.status": status, updatedAt: { $lt: cutoff } })
    .select("personal.name personal.phone personal.branch payments.pendingAmount updatedAt")
    .lean();
  return patients.map((p) => ({
    id: String(p._id),
    name: p.personal?.name || "Unknown",
    phone: p.personal?.phone || "",
    branch: p.personal?.branch || "",
    pendingAmount: p.payments?.pendingAmount || 0,
    age: ageInDays(p.updatedAt),
  }));
}

export async function poorPerformers({ from, to }) {
  const period = from || to ? { from, to } : { from: new Date(Date.now() - 30 * DAY_MS).toISOString(), to: new Date().toISOString() };
  const periodDays = daysInPeriod(period.from, period.to);

  const employees = await Employee.find({ isactive: true, mergedInto: null })
    .select("name role branch tlName callbyUserId employeeId")
    .lean();

  const bySection = new Map();
  for (const e of employees) {
    const section = employeeSection(e.role);
    if (!SECTION_METRIC_BUILDERS[section]) continue; 
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section).push(e);
  }

  const flagged = [];
  let callbyError = null;
  for (const [section, sectionEmployees] of bySection) {
    let metricsById;
    try {
      const result = await SECTION_METRIC_BUILDERS[section](sectionEmployees, period);
      metricsById = result.metricsById;
      if (result.callbyError) callbyError = callbyError || result.callbyError;
    } catch {
      continue;
    }
    const cohort = sectionEmployees.map((e) => {
      const id = String(e._id);
      const m = metricsById.get(id) || {};
      return { id, sample: sampleValue(section, m), metrics: derivePerfMetrics(section, m, periodDays) };
    });
    const scored = scoreCohort(section, cohort);
    for (const e of sectionEmployees) {
      const r = scored.get(String(e._id));
      if (r && r.insufficientData === false && r.band === "Bad") {
        flagged.push({ id: String(e._id), name: e.name, role: e.role, section, branch: e.branch, score: r.score });
      }
    }
  }
  return { items: flagged, error: callbyError };
}

export async function getAttentionItems({ from = "", to = "" } = {}) {
  const [followUps, interested, bookingDone, surgeryBooked, performers] = await Promise.all([
    overdueFollowUps(),
    interestedNoRecentCall(),
    stalePatients("BOOKING_DONE", ATTENTION_THRESHOLDS.bookingDoneStaleDays),
    stalePatients("SURGERY_BOOKED", ATTENTION_THRESHOLDS.surgeryBookedStaleDays),
    poorPerformers({ from, to }),
  ]);

  const rules = [
    {
      key: "overdueFollowUps",
      label: "Overdue follow-ups",
      description: "callby leads with status \"follow_up\" whose follow-up date has already passed",
      drillHref: "/owner/leads/follow-ups",
      count: followUps.items.length,
      valueAtRisk: null,
      error: followUps.error,
      items: followUps.items,
    },
    {
      key: "interestedNoCall",
      label: `Interested, no call in ${ATTENTION_THRESHOLDS.interestedNoCallDays}+ days`,
      description: `callby leads marked "interested" with no call logged in the last ${ATTENTION_THRESHOLDS.interestedNoCallDays} days`,
      drillHref: "/owner/leads/interested",
      count: interested.items.length,
      valueAtRisk: null,
      error: interested.error,
      items: interested.items,
    },
    {
      key: "bookingDoneStale",
      label: `Booking done, not visited ${ATTENTION_THRESHOLDS.bookingDoneStaleDays}+ days`,
      description: `Patients at Booking Done with no record update in ${ATTENTION_THRESHOLDS.bookingDoneStaleDays}+ days`,
      drillHref: "/owner/patients/booking-done",
      count: bookingDone.length,
      valueAtRisk: bookingDone.reduce((s, r) => s + (r.pendingAmount || 0), 0),
      error: null,
      items: bookingDone,
    },
    {
      key: "surgeryBookedStale",
      label: `Surgery booked, not closed ${ATTENTION_THRESHOLDS.surgeryBookedStaleDays}+ days`,
      description: `Patients at Surgery Booked with no record update in ${ATTENTION_THRESHOLDS.surgeryBookedStaleDays}+ days`,
      drillHref: "/owner/patients/converted",
      count: surgeryBooked.length,
      valueAtRisk: surgeryBooked.reduce((s, r) => s + (r.pendingAmount || 0), 0),
      error: null,
      items: surgeryBooked,
    },
    {
      key: "poorPerformers",
      label: "Poor-performing employees",
      description: "Scored employees (sufficient sample size) whose peer-relative performance band is \"Bad\" — see /owner/employees for the full methodology",
      drillHref: "/owner/employees",
      count: performers.items.length,
      valueAtRisk: null,
      error: performers.error,
      items: performers.items,
    },
  ];

  rules.sort((a, b) => (b.valueAtRisk || 0) - (a.valueAtRisk || 0) || b.count - a.count);

  return {
    thresholds: ATTENTION_THRESHOLDS,
    totalFlagged: rules.reduce((s, r) => s + r.count, 0),
    totalValueAtRisk: rules.reduce((s, r) => s + (r.valueAtRisk || 0), 0),
    rules,
  };
}
