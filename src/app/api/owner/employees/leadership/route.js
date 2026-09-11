import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import Employee from "@/models/Employee";
import TlManagerMap from "@/models/TlManagerMap";
import { employeeSection } from "@/lib/owner/employeeSections";
import { buildAgentMetrics, buildCompensationMetrics, daysInPeriod } from "@/lib/owner/employeeReportQuery";
import { scoreCohort, teamPerformanceFromMembers } from "@/lib/owner/performance";
import { parseEmployeeFilters } from "@/lib/owner/pagination";

const ALLOWED_ROLES = ["owner", "super-admin"];

// TL & Manager page (Owner Panel v2, Part 1) — rows are TEAMS, not individuals.
// Scoped to Agent-section employees: `tlName` is a callby concept (one string
// shared by many agents making calls) — counsellors/surgery/HR have no
// comparable team structure in the data today.
//
// `tlName` is free text with no normalization at entry, so grouping is only as
// clean as the data. This groups on trim+lowercase and reports every distinct
// raw spelling feeding each group, so typos ("Ashu" vs "ashu ") are visible
// instead of silently creating phantom teams.

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

    const allEmployees = await Employee.find({ mergedInto: null })
      .select("name role branch isactive callbyUserId tlName salaryStructure incentiveRate")
      .lean();

    let agents = allEmployees.filter((e) => employeeSection(e.role) === "Agent" && e.isactive !== false);
    if (branch && branch !== "All") agents = agents.filter((e) => e.branch === branch);

    if (agents.length === 0) {
      return NextResponse.json({ success: true, teams: [], callbyError: null });
    }

    const [{ metricsById, callbyError }, compById] = await Promise.all([
      buildAgentMetrics(agents, period),
      buildCompensationMetrics(agents, period),
    ]);

    const periodDays = daysInPeriod(period.from, period.to);
    const cohort = agents.map((e) => {
      const m = metricsById.get(String(e._id)) || {};
      return {
        id: String(e._id),
        sample: m.totalLeads || 0,
        metrics: {
          connectRate: m.totalCalls ? m.connected / m.totalCalls : 0,
          conversionRate: m.totalLeads ? m.converted / m.totalLeads : 0,
          targetAttainment: m.dailyTarget ? m.totalCalls / (m.dailyTarget * periodDays) : 0,
        },
      };
    });
    const perfById = scoreCohort("Agent", cohort);

    const groups = new Map(); // tlNameKey -> { rawNames: Set, members: [] }
    for (const e of agents) {
      const raw = (e.tlName || "").trim();
      const key = raw.toLowerCase() || "(unassigned)";
      if (!groups.has(key)) groups.set(key, { rawNames: new Set(), members: [] });
      const g = groups.get(key);
      if (raw) g.rawNames.add(raw);
      g.members.push(e);
    }

    const tlMaps = await TlManagerMap.find({ isActive: true }).lean();
    const managerByKey = new Map(tlMaps.map((m) => [m.tlNameKey, m.managerName]));
    const empByLowerName = new Map(allEmployees.map((e) => [e.name.trim().toLowerCase(), e]));

    const teams = [...groups.entries()]
      .map(([tlNameKey, g]) => {
        const memberIds = g.members.map((e) => String(e._id));
        const memberMetrics = memberIds.map((id) => metricsById.get(id) || {});
        const memberPerf = memberIds.map((id) => perfById.get(id));

        const teamTotals = memberMetrics.reduce(
          (acc, m) => ({
            totalCalls: acc.totalCalls + (m.totalCalls || 0),
            totalLeads: acc.totalLeads + (m.totalLeads || 0),
            totalPatients: acc.totalPatients + (m.totalPatients || 0),
            converted: acc.converted + (m.converted || 0),
          }),
          { totalCalls: 0, totalLeads: 0, totalPatients: 0, converted: 0 },
        );

        // Best-effort: the TL's own Employee record, matched by name — there is
        // no employeeId link from callby's tlName string to an Employee. Flagged
        // via tlEmployeeFound rather than guessing when ambiguous/absent.
        const tlEmployee = tlNameKey !== "(unassigned)" ? empByLowerName.get(tlNameKey) : null;

        return {
          tlNameKey,
          tlName: [...g.rawNames][0] || "Unassigned",
          distinctSpellings: [...g.rawNames],
          branch: [...new Set(g.members.map((m) => m.branch))].join(", "),
          teamSize: g.members.length,
          teamTotalCalls: teamTotals.totalCalls,
          teamTotalLeads: teamTotals.totalLeads,
          teamPatientsVisited: teamTotals.totalPatients,
          teamConverted: teamTotals.converted,
          teamPerformance: teamPerformanceFromMembers(memberPerf),
          managerName: managerByKey.get(tlNameKey) || null,
          managerMapped: managerByKey.has(tlNameKey),
          tlEmployeeFound: !!tlEmployee,
          tlSalary: tlEmployee?.salaryStructure?.baseSalary ?? null,
          tlIncentiveRate: tlEmployee?.incentiveRate ?? null,
        };
      })
      .sort((a, b) => b.teamTotalCalls - a.teamTotalCalls);

    return NextResponse.json({ success: true, teams, callbyError: callbyError || null });
  } catch (err) {
    console.error("owner leadership error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
