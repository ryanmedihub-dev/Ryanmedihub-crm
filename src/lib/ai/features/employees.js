import { GET as agentsGET } from "@/app/api/owner/employees/agents/route";
import { GET as counsellorsGET } from "@/app/api/owner/employees/counsellors/route";
import { GET as surgeryGET } from "@/app/api/owner/employees/surgery-staff/route";
import { GET as hrGET } from "@/app/api/owner/employees/hr/route";
import { GET as otherGET } from "@/app/api/owner/employees/other-staff/route";
import { GET as leadershipGET } from "@/app/api/owner/employees/leadership/route";
import { GET as teamRosterGET } from "@/app/api/owner/employees/leadership/[tlNameKey]/route";
import { GET as overviewGET } from "@/app/api/owner/employees/overview/route";
import { GET as employeeDetailGET } from "@/app/api/owner/employees/[id]/route";
import { GET as callbyLinksGET } from "@/app/api/owner/callby-links/route";
import { daysInPeriod } from "@/lib/owner/dates";
import { callRoute } from "../sources";
import { AI_BRIEF_MODEL, AI_DEEP_MODEL } from "../config";
import { round, pct, topN, bottomN, sumBy, capPayload } from "./_helpers";

const SECTION_LIST_SCOPE = ["dateFrom", "dateTo", "branch", "isactive", "callbyLinked", "search", "role", "sortBy", "sortDir", "page", "pageSize"];

function tenureDays(dateOfJoining) {
  if (!dateOfJoining) return null;
  const ms = Date.now() - new Date(dateOfJoining).getTime();
  return ms > 0 ? Math.floor(ms / 86400000) : null;
}
function median(nums) {
  const s = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : round((s[mid - 1] + s[mid]) / 2, 1);
}
function avgBy(rows, key) {
  return rows.length ? sumBy(rows, key) / rows.length : 0;
}

function weeklyBuckets(daily, maxPoints) {
  if (!daily?.length) return [];
  const weeks = new Map();
  for (const d of daily) {
    const dt = new Date(d.date);
    if (Number.isNaN(dt.getTime())) continue;
    const weekStart = new Date(dt);
    weekStart.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
    const key = weekStart.toISOString().slice(0, 10);
    weeks.set(key, (weeks.get(key) || 0) + (d.value || 0));
  }
  const arr = [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value: round(value) }));
  return arr.length > maxPoints ? arr.slice(-maxPoints) : arr;
}

const AGENT_ROW = (r) => ({
  totalCalls: r.totalCalls || 0, connected: r.connected || 0, interested: r.interested ?? null,
  referred: r.referred || 0, visited: r.visited || 0, converted: r.converted || 0, amountReceived: round(r.amountReceived),
});
const AGENT_TOTALS = (rows, { active, days }) => {
  const totals = {
    totalCalls: sumBy(rows, "totalCalls"), connected: sumBy(rows, "connected"),
    interested: sumBy(rows.filter((r) => r.interested != null), "interested"),
    referred: sumBy(rows, "referred"), visited: sumBy(rows, "visited"), converted: sumBy(rows, "converted"),
    amountReceived: round(sumBy(rows, "amountReceived")),
    salaryPayable: round(sumBy(rows, "salaryPayable")), salaryPaid: round(sumBy(rows, "salaryPaid")),
    incentivePayable: round(sumBy(rows, "incentivePayable")), incentivePaid: round(sumBy(rows, "incentivePaid")),
  };
  const rates = {
    connectRate: pct(totals.connected, totals.totalCalls),
    visitRate: pct(totals.visited, totals.referred),
    conversionRate: pct(totals.converted, totals.visited),
    callsPerAgentPerDay: active ? round(totals.totalCalls / active / days, 1) : 0,
    targetCallsPerAgentPerDay: 100,
  };
  return { totals, rates };
};

const COUNSELLOR_ROW = (r) => ({
  patientsConsulted: r.patientsConsulted || 0, converted: r.converted || 0, amountReceived: round(r.amountReceived),
  avgDiscount: round(r.avgDiscount), packageBeforeConsult: round(r.packageBeforeConsult), packageAfterConsult: round(r.packageAfterConsult),
  packageUpliftPct: pct((r.packageAfterConsult || 0) - (r.packageBeforeConsult || 0), r.packageBeforeConsult),
});
const COUNSELLOR_TOTALS = (rows) => {
  const totals = {
    patientsConsulted: sumBy(rows, "patientsConsulted"), converted: sumBy(rows, "converted"),
    amountReceived: round(sumBy(rows, "amountReceived")),
    salaryPayable: round(sumBy(rows, "salaryPayable")), salaryPaid: round(sumBy(rows, "salaryPaid")),
    incentivePayable: round(sumBy(rows, "incentivePayable")), incentivePaid: round(sumBy(rows, "incentivePaid")),
  };
  const avgBefore = round(avgBy(rows, "packageBeforeConsult"));
  const avgAfter = round(avgBy(rows, "packageAfterConsult"));
  const rates = {
    conversionRate: pct(totals.converted, totals.patientsConsulted),
    avgPackageBefore: avgBefore, avgPackageAfter: avgAfter,
    packageUpliftPct: pct(avgAfter - avgBefore, avgBefore),
    avgDiscount: round(avgBy(rows, "avgDiscount")),
  };
  return { totals, rates };
};

const SURGERY_ROW = (r) => ({
  patientsOperated: r.patientsOperated || 0, graftsImplanted: r.graftsImplanted || 0,
  graftsPerSurgery: r.patientsOperated ? round(r.graftsImplanted / r.patientsOperated, 1) : 0,
});
const SURGERY_TOTALS = (rows) => {
  const totals = {
    patientsOperated: sumBy(rows, "patientsOperated"), graftsImplanted: sumBy(rows, "graftsImplanted"),
    salaryPayable: round(sumBy(rows, "salaryPayable")), salaryPaid: round(sumBy(rows, "salaryPaid")),
    incentivePayable: round(sumBy(rows, "incentivePayable")), incentivePaid: round(sumBy(rows, "incentivePaid")),
  };
  const rates = { graftsPerSurgery: totals.patientsOperated ? round(totals.graftsImplanted / totals.patientsOperated, 1) : 0 };
  return { totals, rates };
};

const HR_ROW = (r) => ({
  totalInterviews: r.totalInterviews || 0, selected: r.selected || 0, rejected: r.rejected || 0, hold: r.hold || 0,
  selectionRate: pct(r.selected, r.totalInterviews),
});
const HR_TOTALS = (rows) => {
  const totals = {
    totalInterviews: sumBy(rows, "totalInterviews"), selected: sumBy(rows, "selected"), rejected: sumBy(rows, "rejected"), hold: sumBy(rows, "hold"),
    salaryPayable: round(sumBy(rows, "salaryPayable")), salaryPaid: round(sumBy(rows, "salaryPaid")),
    incentivePayable: round(sumBy(rows, "incentivePayable")), incentivePaid: round(sumBy(rows, "incentivePaid")),
  };
  const rates = { selectionRate: pct(totals.selected, totals.totalInterviews) };
  return { totals, rates };
};

const OTHER_ROW = () => ({});
const OTHER_TOTALS = (rows) => ({
  totals: {
    salaryPayable: round(sumBy(rows, "salaryPayable")), salaryPaid: round(sumBy(rows, "salaryPaid")),
    incentivePayable: round(sumBy(rows, "incentivePayable")), incentivePaid: round(sumBy(rows, "incentivePaid")),
  },
});

const SECTION_CONFIG = {
  Agent: {
    key: "employees.agent", title: "Agent Intelligence", page: "/owner/employees/agents",
    routeGET: agentsGET, path: "/api/owner/employees/agents", defaultSort: "totalCalls",
    rowFacts: AGENT_ROW, totalsFromRows: AGENT_TOTALS,
    focusBrief: "Team productivity vs the 100-call target, connect→interested→referred→visited→converted leakage, who drives revenue, who is slipping, unlinked agents as a data gap.",
    focusVerdicts: "Rate each agent against the cohort medians provided. 'insufficient_data' when calls=0 and not linked to callby.",
  },
  Counsellor: {
    key: "employees.counsellor", title: "Counsellor Intelligence", page: "/owner/employees/counsellors",
    routeGET: counsellorsGET, path: "/api/owner/employees/counsellors", defaultSort: "patientsConsulted",
    rowFacts: COUNSELLOR_ROW, totalsFromRows: COUNSELLOR_TOTALS,
    focusBrief: "Consult→conversion efficiency, discount discipline, package uplift after consult; who converts high-value packages.",
    focusVerdicts: "Rate each counsellor against the cohort medians, weighting conversion rate and package uplift.",
  },
  Surgery: {
    key: "employees.surgery", title: "Surgery Team Intelligence", page: "/owner/employees/surgery-staff",
    routeGET: surgeryGET, path: "/api/owner/employees/surgery-staff", defaultSort: "patientsOperated",
    rowFacts: SURGERY_ROW, totalsFromRows: SURGERY_TOTALS,
    focusBrief: "Throughput and grafts per case; workload balance across the team.",
    focusVerdicts: "Rate each surgery staff member against the cohort medians for patients operated and grafts per surgery.",
  },
  HR: {
    key: "employees.hr", title: "HR Intelligence", page: "/owner/employees/hr",
    routeGET: hrGET, path: "/api/owner/employees/hr", defaultSort: "totalInterviews",
    rowFacts: HR_ROW, totalsFromRows: HR_TOTALS,
    focusBrief: "Hiring funnel per recruiter, selection quality.",
    focusVerdicts: "Rate each recruiter against the cohort medians for interview volume and selection rate.",
  },
  Other: {
    key: "employees.other", title: "Other Staff Intelligence", page: "/owner/employees/other-staff",
    routeGET: otherGET, path: "/api/owner/employees/other-staff", defaultSort: "name",
    rowFacts: OTHER_ROW, totalsFromRows: OTHER_TOTALS,
    focusBrief: "Payroll load vs headcount, pending salary/incentive liabilities.",
    focusVerdicts: "No performance formula exists for this bucket (see src/lib/owner/performance.js) — rate 'insufficient_data' unless tenure/pay context says otherwise.",
  },
};

function commonRowFacts(book, r, rowFacts) {
  return {
    alias: book.alias("E", r.id, r.name),
    performanceScore: r.performance?.insufficientData ? null : (r.performance?.score ?? null),
    band: r.performance?.band || null,
    insufficientData: !!r.performance?.insufficientData,
    tenureDays: tenureDays(r.dateOfJoining),
    ...rowFacts(r),
  };
}

function sectionMedians(rows, rowFacts) {
  const sampleKeys = rows.length ? Object.keys(rowFacts(rows[0])) : [];
  const medians = { medianScore: median(rows.map((r) => r.performance?.score)) };
  for (const k of sampleKeys) {
    medians[`median_${k}`] = median(rows.map((r) => rowFacts(r)[k]).filter((v) => Number.isFinite(v)));
  }
  return medians;
}

function computeSectionCompute(cfg) {
  return function compute(raw, book, scope, kind) {
    const rows = raw.rows || [];
    const rowsAnalyzed = rows.length;
    const dataErrors = raw.callbyError ? [raw.callbyError] : [];
    const period = { from: scope.dateFrom || "", to: scope.dateTo || "" };

    if (kind === "verdicts") {
      const facts = capPayload({
        period,
        cohort: sectionMedians(rows, cfg.rowFacts),
        agents: rows.map((r) => commonRowFacts(book, r, cfg.rowFacts)),
        dataErrors,
      });
      return { facts, rowsAnalyzed };
    }

    const active = rows.filter((r) => r.isactive).length;
    const linked = rows.filter((r) => r.callbyMatched || r.callbyLinked).length;
    if (raw.total > rowsAnalyzed) dataErrors.push(`Brief covers the top ${rowsAnalyzed} of ${raw.total} by ${cfg.defaultSort}.`);
    const b = raw.bands || {};
    const bands = { excellent: b.Excellent || 0, good: b.Good || 0, average: b.Average || 0, bad: b.Bad || 0, insufficientData: b.insufficientData || 0 };
    const scored = rows.filter((r) => !r.performance?.insufficientData && Number.isFinite(r.performance?.score)).map((r) => ({ ...r, score: r.performance.score }));
    const days = daysInPeriod(scope.dateFrom, scope.dateTo);

    const facts = capPayload({
      period,
      cohort: { headcount: raw.total || rowsAnalyzed, active, linkedToCallby: linked, unlinked: rowsAnalyzed - linked, rowsAnalyzed },
      ...cfg.totalsFromRows(rows, { active, days }),
      bands,
      top5: topN(scored, "score", 5).map((r) => commonRowFacts(book, r, cfg.rowFacts)),
      bottom5: bottomN(scored, "score", 5).map((r) => commonRowFacts(book, r, cfg.rowFacts)),
      dataErrors,
    });
    return { facts, rowsAnalyzed };
  };
}

function makeSectionFeature(cfg) {
  return {
    [cfg.key]: {
      title: cfg.title, page: cfg.page, kinds: ["brief", "verdicts"],
      model: { brief: AI_BRIEF_MODEL, verdicts: AI_BRIEF_MODEL }, ttlMin: { brief: 60, verdicts: 60 },
      scopeParams: SECTION_LIST_SCOPE,
      focus: { brief: cfg.focusBrief, verdicts: cfg.focusVerdicts },
      async collect(scope, ctx, kind) {
        const params = kind === "brief" ? { ...scope, page: 1, pageSize: 200, sortBy: cfg.defaultSort, sortDir: "desc" } : scope;
        return callRoute(cfg.routeGET, { path: cfg.path, params });
      },
      compute: computeSectionCompute(cfg),
    },
  };
}

const employeesFeatures = {
  ...makeSectionFeature(SECTION_CONFIG.Agent),
  ...makeSectionFeature(SECTION_CONFIG.Counsellor),
  ...makeSectionFeature(SECTION_CONFIG.Surgery),
  ...makeSectionFeature(SECTION_CONFIG.HR),
  ...makeSectionFeature(SECTION_CONFIG.Other),

  "employees.overview": {
    title: "Employees Overview", page: "/owner/employees", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 60 },
    scopeParams: ["dateFrom", "dateTo", "branch"],
    focus: { brief: "Org-wide headcount and pay across every role section. Which section carries the most payroll relative to headcount, and flag any scored section with a poor top/bottom spread or too few scored employees to trust the ranking." },
    async collect(scope) {
      return callRoute(overviewGET, { path: "/api/owner/employees/overview", params: scope });
    },
    compute(raw, book, scope) {
      const perfRow = (r) => ({ alias: book.alias("E", r.id, r.name), score: r.performance?.score ?? null, band: r.performance?.band || null });
      const performers = {};
      let rowsAnalyzed = 0;
      for (const [section, p] of Object.entries(raw.performers || {})) {
        const top = (p.top || []).map(perfRow);
        const bottom = (p.bottom || []).map(perfRow);
        performers[section] = { top, bottom, scoredCount: p.scoredCount || 0, total: p.total || 0 };
        rowsAnalyzed += top.length + bottom.length;
      }
      const dataErrors = raw.callbyError ? [raw.callbyError] : [];
      const facts = capPayload({
        period: { from: scope.dateFrom || "", to: scope.dateTo || "" },
        branch: scope.branch || "All",
        headcountBySection: (raw.headcount || []).map((h) => ({ section: h.section, label: h.label, total: h.total, active: h.active })),
        headcountByBranch: (raw.byBranch || []).map((b) => ({ branch: b.label, total: b.total, active: b.active })),
        totalSalaryPaid: round(raw.totalSalaryPaid), totalIncentivePaid: round(raw.totalIncentivePaid),
        performers,
        dataErrors,
      });
      return { facts, rowsAnalyzed };
    },
  },

  "employees.leadership": {
    title: "Leadership Intelligence", page: "/owner/employees/leadership", kinds: ["brief", "verdicts"],
    model: { brief: AI_BRIEF_MODEL, verdicts: AI_BRIEF_MODEL }, ttlMin: { brief: 60, verdicts: 60 },
    scopeParams: ["dateFrom", "dateTo", "branch", "isactive"],
    focus: {
      brief: "Team-level totals (team size, team calls, team converted, team performance); salary/incentive are individual — never aggregate them as team pay. Which TL's team is under/over-performing and why.",
      verdicts: "Rate each TEAM as a whole (not the individual agents) against the cohort of teams. 'insufficient_data' when the team has no performance score.",
    },
    async collect(scope) {
      return callRoute(leadershipGET, { path: "/api/owner/employees/leadership", params: scope });
    },
    compute(raw, book, scope, kind) {
      const teams = raw.teams || [];
      const teamRow = (t) => ({
        alias: book.alias("T", t.tlNameKey, t.tlName),
        branch: t.branch || "",
        teamSize: t.teamSize || 0, teamLinkedCount: t.teamLinkedCount || 0,
        teamTotalCalls: t.teamTotalCalls || 0, teamInterested: t.teamInterested || 0,
        teamPatientsVisited: t.teamPatientsVisited || 0, teamConverted: t.teamConverted || 0,
        performanceScore: t.teamPerformance?.insufficientData ? null : (t.teamPerformance?.score ?? null),
        band: t.teamPerformance?.band || null,
        insufficientData: !!t.teamPerformance?.insufficientData,
        managerMapped: !!t.managerMapped,
      });
      const rows = teams.map(teamRow);
      const dataErrors = raw.callbyError ? [raw.callbyError] : [];
      const period = { from: scope.dateFrom || "", to: scope.dateTo || "" };

      if (kind === "verdicts") {
        const facts = capPayload({
          period,
          cohort: { medianScore: median(teams.map((t) => t.teamPerformance?.score)), medianCalls: median(teams.map((t) => t.teamTotalCalls)) },
          teams: rows.map(({ alias, ...rest }) => ({ alias, ...rest })), 
          dataErrors,
        });
        return { facts, rowsAnalyzed: rows.length };
      }

      const scored = rows.filter((r) => !r.insufficientData && r.performanceScore != null);
      const facts = capPayload({
        period,
        totals: {
          teamCount: teams.length, totalAgents: sumBy(teams, "teamSize"), totalCalls: sumBy(teams, "teamTotalCalls"),
          totalConverted: sumBy(teams, "teamConverted"), unmappedManagers: teams.filter((t) => !t.managerMapped).length,
        },
        top5: topN(scored, "performanceScore", 5),
        bottom5: bottomN(scored, "performanceScore", 5),
        dataErrors,
      });
      return { facts, rowsAnalyzed: rows.length };
    },
  },

  "employees.team": {
    title: "Team Intelligence", page: "/owner/employees/leadership", kinds: ["brief", "verdicts"],
    model: { brief: AI_BRIEF_MODEL, verdicts: AI_BRIEF_MODEL }, ttlMin: { brief: 60, verdicts: 60 },
    scopeParams: [...SECTION_LIST_SCOPE, "tlNameKey"],
    focus: {
      brief: "This single team's members vs each other and vs the org agent cohort median (org medians are in facts.orgMedians).",
      verdicts: SECTION_CONFIG.Agent.focusVerdicts,
    },
    async collect(scope, ctx, kind) {
      const tlNameKey = scope.tlNameKey || "";
      const params = kind === "brief" ? { ...scope, page: 1, pageSize: 200, sortBy: "totalCalls", sortDir: "desc" } : scope;
      const [team, org] = await Promise.all([
        callRoute(teamRosterGET, { path: `/api/owner/employees/leadership/${encodeURIComponent(tlNameKey)}`, params, routeParams: { tlNameKey } }),
        callRoute(agentsGET, { path: "/api/owner/employees/agents", params: { page: 1, pageSize: 200, sortBy: "totalCalls", sortDir: "desc" } }),
      ]);
      return { team, org };
    },
    compute(raw, book, scope, kind) {
      const { facts, rowsAnalyzed } = computeSectionCompute(SECTION_CONFIG.Agent)(raw.team, book, scope, kind);
      facts.orgMedians = sectionMedians(raw.org?.rows || [], AGENT_ROW);
      return { facts: capPayload(facts), rowsAnalyzed };
    },
  },

  "employees.links": {
    title: "callby Link Coverage", page: "/owner/employees/links", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 60 },
    scopeParams: [],
    focus: { brief: "callby link coverage as a data-quality issue: how many caller-role employees are unlinked, and the impact on reliability of Agent analytics. Action = link them at /owner/employees/links." },
    async collect() {
      return callRoute(callbyLinksGET, { path: "/api/owner/callby-links", params: {} });
    },
    compute(raw) {
      const unlinkedCallers = (raw.unlinkedEmployees || []).filter((e) => e.isCaller);
      const byBranch = {};
      for (const e of unlinkedCallers) {
        const k = e.branch || "Unspecified";
        byBranch[k] = (byBranch[k] || 0) + 1;
      }
      const facts = capPayload({
        counts: raw.counts || {},
        unlinkedCallersByBranch: Object.entries(byBranch).map(([branch, count]) => ({ branch, count })),
      });
      return { facts, rowsAnalyzed: unlinkedCallers.length };
    },
  },

  "employee.deep": {
    title: "Employee Deep Review", page: "/owner/employees", kinds: ["deep"],
    model: { deep: AI_DEEP_MODEL }, ttlMin: { deep: 180 },
    scopeParams: ["id", "dateFrom", "dateTo"],
    focus: { deep: "Individual review. Compare every metric to the section cohort median and the 100-call target where relevant. Strengths, concerns, a practical coaching plan, outlook. If not linked to callby, say call metrics are unavailable rather than calling them zero." },
    async collect(scope) {
      const detail = await callRoute(employeeDetailGET, {
        path: `/api/owner/employees/${scope.id}`,
        params: { dateFrom: scope.dateFrom, dateTo: scope.dateTo },
        routeParams: { id: scope.id },
      });
      const section = detail.employee?.section;
      const cfg = SECTION_CONFIG[section];
      const cohort = cfg
        ? await callRoute(cfg.routeGET, { path: cfg.path, params: { page: 1, pageSize: 200, sortBy: cfg.defaultSort, sortDir: "desc" } })
        : null;
      return { detail, cohort, section };
    },
    compute(raw, book, scope) {
      const { detail, cohort, section } = raw;
      const emp = detail.employee || {};
      const cfg = SECTION_CONFIG[section];
      const dataErrors = detail.callbyError ? [detail.callbyError] : [];

      const trend = weeklyBuckets(detail.trend || [], 8);

      
      
      const rows = detail.rows || [];
      const statusCounts = {};
      for (const r of rows) {
        if (r.status) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
      }
      const rowStats = {
        count: detail.total || rows.length,
        statusCounts,
        amountReceived: round(sumBy(rows, "amountReceived")),
        graftsImplanted: round(sumBy(rows, "graftsImplanted")),
      };

      let cohortMedians = {};
      let ownMetrics = {};
      if (cfg && cohort) {
        cohortMedians = sectionMedians(cohort.rows || [], cfg.rowFacts);
        const ownRow = (cohort.rows || []).find((r) => r.id === scope.id);
        if (ownRow) ownMetrics = cfg.rowFacts(ownRow);
      }

      const facts = capPayload({
        employee: {
          alias: book.alias("E", emp.id, emp.name),
          section: section || "Other", role: emp.role || "", branch: emp.branch || "",
          tenureDays: tenureDays(emp.dateOfJoining), isactive: !!emp.isactive, callbyLinked: !!emp.callbyLinked,
        },
        period: { from: scope.dateFrom || "", to: scope.dateTo || "" },
        metrics: ownMetrics,
        cohortMedians,
        trend,
        rowStats,
        compensation: {
          salaryPayable: round(detail.compensation?.salaryPayable), salaryPaid: round(detail.compensation?.salaryPaid),
          incentivePayable: round(detail.compensation?.incentivePayable), incentivePaid: round(detail.compensation?.incentivePaid),
        },
        performance: {
          score: emp.performance?.insufficientData ? null : (emp.performance?.score ?? null),
          band: emp.performance?.band || null,
          insufficientData: !!emp.performance?.insufficientData,
        },
        dataErrors,
      });
      return { facts, rowsAnalyzed: rows.length };
    },
  },
};

export default employeesFeatures;
