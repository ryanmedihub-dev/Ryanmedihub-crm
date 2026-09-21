import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import Employee from "@/models/Employee";
import { employeeSection, SECTION_LABELS } from "@/lib/owner/employeeSections";
import {
  SECTION_METRIC_BUILDERS, buildCompensationMetrics, derivePerfMetrics, sampleValue,
} from "@/lib/owner/employeeReportQuery";
import { daysInPeriod } from "@/lib/owner/dates";
import { scoreCohort } from "@/lib/owner/performance";
import { parseEmployeeFilters } from "@/lib/owner/pagination";
import { cacheKey, cached } from "@/lib/cache";

const ALLOWED_ROLES = ["owner", "super-admin"];
const SCORED_SECTIONS = ["Agent", "Counsellor", "Surgery", "HR"];

// Backs the /owner/employees section landing: headcount by role/branch, active
// vs inactive, total salary+incentive paid this period, and each scored
// section's top/bottom performers. "Other" has no performance formula (see
// src/lib/owner/performance.js) so it's headcount-only here.
export async function GET(req) {
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    if (!session || !ALLOWED_ROLES.includes(session?.user?.role)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const { dateFrom, dateTo, branch } = parseEmployeeFilters(searchParams);
    const period = { from: dateFrom, to: dateTo };
    const periodDays = daysInPeriod(period.from, period.to);

    const meta = {};
    const key = cacheKey("owner", { route: "employees-overview", ...Object.fromEntries(searchParams) }, session);
    const data = await cached(key, 120, async () => {
    const allEmployees = await Employee.find({ mergedInto: null })
      .select("name role branch isactive callbyUserId employeeId tlName salaryStructure incentiveRate")
      .lean();

    const scoped = branch && branch !== "All" ? allEmployees.filter((e) => e.branch === branch) : allEmployees;

    const bySection = {};
    for (const e of scoped) {
      const section = employeeSection(e.role);
      (bySection[section] ||= []).push(e);
    }

    const headcount = Object.keys(SECTION_LABELS).map((section) => {
      const list = bySection[section] || [];
      return {
        section,
        label: SECTION_LABELS[section],
        total: list.length,
        active: list.filter((e) => e.isactive !== false).length,
      };
    });

    const byBranch = {};
    for (const e of scoped) {
      const key = e.branch || "";
      byBranch[key] ||= { branch: e.branch || "", label: e.branch || "(no branch)", total: 0, active: 0 };
      byBranch[key].total += 1;
      if (e.isactive !== false) byBranch[key].active += 1;
    }

    // Compensation for everyone in scope + one metric build per scored section,
    // all in parallel — each is an independent aggregation.
    const sectionJobs = SCORED_SECTIONS.map(async (section) => {
      const employees = (bySection[section] || []).filter((e) => e.isactive !== false);
      if (employees.length === 0) return { section, employees, metricsById: new Map(), callbyError: null };
      const { metricsById, callbyError } = await SECTION_METRIC_BUILDERS[section](employees, period);
      return { section, employees, metricsById, callbyError };
    });
    const [compById, ...sectionResults] = await Promise.all([buildCompensationMetrics(scoped, period), ...sectionJobs]);

    let totalSalaryPaid = 0;
    let totalIncentivePaid = 0;
    for (const c of compById.values()) {
      totalSalaryPaid += c.salaryPaid || 0;
      totalIncentivePaid += c.incentivePaid || 0;
    }

    // Top/bottom performers per scored section (active employees only).
    let callbyError = null;
    const performers = {};
    for (const { section, employees, metricsById, callbyError: err } of sectionResults) {
      if (err) callbyError = callbyError || err;
      if (employees.length === 0) {
        performers[section] = { top: [], bottom: [], scoredCount: 0, total: 0 };
        continue;
      }

      const cohort = employees.map((e) => {
        const m = metricsById.get(String(e._id)) || {};
        return { id: String(e._id), sample: sampleValue(section, m), metrics: derivePerfMetrics(section, m, periodDays) };
      });
      const perfById = scoreCohort(section, cohort);

      const scored = employees
        .map((e) => ({ id: String(e._id), name: e.name, branch: e.branch, performance: perfById.get(String(e._id)) }))
        .filter((r) => r.performance && r.performance.insufficientData === false)
        .sort((a, b) => b.performance.score - a.performance.score);

      const top = scored.slice(0, 3);
      performers[section] = {
        top,
        bottom: scored.slice(-3).reverse().filter((r) => !top.some((t) => t.id === r.id)),
        scoredCount: scored.length,
        total: employees.length,
      };
    }

    return {
      success: true,
      headcount,
      byBranch: Object.values(byBranch),
      totalSalaryPaid,
      totalIncentivePaid,
      performers,
      callbyError,
    };
    }, meta);

    const res = NextResponse.json(data);
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (err) {
    console.error("owner employees overview error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
