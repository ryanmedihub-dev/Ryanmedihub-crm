import { GET as statisticsGET } from "@/app/api/owner/statistics/route";
import { callRoute } from "../sources";
import { AI_BRIEF_MODEL } from "../config";
import { topN, capPayload } from "./_helpers";

const statisticsFeatures = {
  "statistics.funnel": {
    title: "Statistics",
    page: "/owner/statistics",
    kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL },
    ttlMin: { brief: 60 },
    // The route only ever reads these three — confirmed against
    // src/app/api/owner/statistics/route.js (no `branch`/`from`/`to`).
    scopeParams: ["dateFrom", "dateTo", "breakdownBy"],
    focus: {
      brief: "Find the single biggest leak in the funnel and the breakdown group that explains it. Compare stage rates, not raw counts.",
    },
    async collect(scope) {
      return callRoute(statisticsGET, { path: "/api/owner/statistics", params: scope });
    },
    compute(raw, book, scope) {
      const stages = (raw.stages || []).map((s, i) => ({
        label: raw.stageDefinitions?.[i]?.label || s.key,
        value: s.value,
        stageRate: s.stageConversionRate,
        overallRate: s.overallRate,
      }));

      const breakdownBy = scope.breakdownBy && scope.breakdownBy !== "none" ? scope.breakdownBy : null;
      const breakdown = breakdownBy
        ? topN(raw.breakdown || [], "leadsCreated", 8).map((r) => ({
            key: breakdownBy === "source" ? r.key : book.alias(breakdownBy === "team" ? "T" : "E", r.key, r.key),
            leadsCreated: r.leadsCreated, interested: r.interested, converted: r.converted,
            bookingDone: r.bookingDone, surgeryDone: r.surgeryDone,
          }))
        : [];

      const facts = capPayload({
        period: { from: scope.dateFrom || "", to: scope.dateTo || "" },
        totalLeads: raw.totalLeadsInPeriod || 0,
        truncated: !!raw.truncated,
        stages,
        breakdownBy: breakdownBy || "none",
        breakdown,
      });
      return { facts, rowsAnalyzed: stages.length + breakdown.length };
    },
  },
};

export default statisticsFeatures;
