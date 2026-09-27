import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import Employee from "@/models/Employee";
import TlManagerMap from "@/models/TlManagerMap";
import { employeeSection } from "@/lib/owner/employeeSections";
import { buildAgentMetrics, derivePerfMetrics, sampleValue, UNASSIGNED_TEAM } from "@/lib/owner/employeeReportQuery";
import { daysInPeriod } from "@/lib/owner/dates";
import { scoreCohort, teamPerformanceFromMembers } from "@/lib/owner/performance";
import { parseEmployeeFilters } from "@/lib/owner/pagination";
import { cacheKey, cached } from "@/lib/cache";

const ALLOWED_ROLES = ["owner", "super-admin"];

export async function GET(req) {
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    if (!session || !ALLOWED_ROLES.includes(session?.user?.role)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const { dateFrom, dateTo, branch, isactive } = parseEmployeeFilters(searchParams);
    const period = { from: dateFrom, to: dateTo };

    const meta = {};
    const key = cacheKey("owner", { route: "employees-leadership", ...Object.fromEntries(searchParams) }, session);
    const data = await cached(key, 120, async () => {
      const allEmployees = await Employee.find({ mergedInto: null })
        .select("name role branch isactive callbyUserId employeeId tlName salaryStructure incentiveRate")
        .lean();

      let agents = allEmployees.filter((e) => employeeSection(e.role) === "Agent");
      
      if (isactive === null || isactive === true) agents = agents.filter((e) => e.isactive !== false);
      else agents = agents.filter((e) => e.isactive === false);
      if (branch && branch !== "All") agents = agents.filter((e) => e.branch === branch);

      if (agents.length === 0) {
        return { success: true, teams: [], callbyError: null };
      }

      const { metricsById, callbyError } = await buildAgentMetrics(agents, period);

      
      
      const periodDays = daysInPeriod(period.from, period.to);
      const cohort = agents.map((e) => {
        const id = String(e._id);
        const m = metricsById.get(id) || {};
        return { id, sample: sampleValue("Agent", m), metrics: derivePerfMetrics("Agent", m, periodDays) };
      });
      const perfById = scoreCohort("Agent", cohort);

      const groups = new Map(); 
      for (const e of agents) {
        const raw = (e.tlName || "").trim();
        const tlNameKeyValue = raw.toLowerCase() || UNASSIGNED_TEAM;
        if (!groups.has(tlNameKeyValue)) groups.set(tlNameKeyValue, { rawNames: new Set(), members: [] });
        const g = groups.get(tlNameKeyValue);
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
              interested: acc.interested + (m.interested || 0),
              visited: acc.visited + (m.visited || 0),
              converted: acc.converted + (m.converted || 0),
            }),
            { totalCalls: 0, interested: 0, visited: 0, converted: 0 },
          );

          
          
          
          const tlEmployee = tlNameKey !== UNASSIGNED_TEAM ? empByLowerName.get(tlNameKey) : null;

          return {
            tlNameKey,
            tlName: [...g.rawNames][0] || "Unassigned",
            distinctSpellings: [...g.rawNames],
            branch: [...new Set(g.members.map((m) => m.branch).filter(Boolean))].join(", ") || "—",
            teamSize: g.members.length,
            
            
            
            
            
            teamLinkedCount: memberIds.filter((id) => metricsById.get(id)?.callbyLinked).length,
            teamTotalCalls: teamTotals.totalCalls,
            teamInterested: teamTotals.interested,
            teamPatientsVisited: teamTotals.visited,
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

      return { success: true, teams, callbyError: callbyError || null };
    }, meta);

    const res = NextResponse.json(data);
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (err) {
    console.error("owner leadership error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
