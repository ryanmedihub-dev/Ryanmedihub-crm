import { POST as marketingSummaryPOST } from "@/app/api/owner/marketing-summary/route";
import { GET as comparisonGET } from "@/app/api/owner/marketing/comparison/route";
import { GET as campaignsGET } from "@/app/api/owner/marketing/campaigns/route";
import { GET as adSpendGET } from "@/app/api/owner/ad-spend/route";
import { GET as campaignLeadsBatchesGET } from "@/app/api/owner/marketing/campaign-leads/batches/route";
import { GET as campaignPerformanceGET } from "@/app/api/owner/marketing/campaign-performance/route";
import { toISTDateKey } from "@/lib/owner/dates";
import { callRoute } from "../sources";
import { AI_BRIEF_MODEL } from "../config";
import { round, pct, topN, bottomN, sumBy, capPayload } from "./_helpers";

function median(nums) {
  const s = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : round((s[mid - 1] + s[mid]) / 2, 1);
}
const money2 = (n) => (n == null ? null : round(n, 2));

const marketingFeatures = {
  "marketing.overview": {
    title: "Marketing Overview", page: "/owner/marketing", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 60 },
    scopeParams: ["branch", "from", "to"],
    focus: { brief: "Is marketing money working this period; where to shift budget." },
    async collect(scope) {
      return callRoute(marketingSummaryPOST, { path: "/api/owner/marketing-summary", body: { branch: scope.branch || "All", from: scope.from, to: scope.to } });
    },
    compute(raw, book, scope) {
      const rows = raw.rows || [];
      const byPlatform = new Map();
      for (const r of rows) {
        if (!byPlatform.has(r.platform)) byPlatform.set(r.platform, []);
        byPlatform.get(r.platform).push(r);
      }
      const platforms = [];
      let totalSpend = 0, totalLeads = 0, totalConverted = 0, totalRevenue = 0;
      for (const [platform, prows] of byPlatform) {
        const totalRow = prows.find((r) => r.isPlatformTotal) || (prows.length === 1 ? prows[0] : null);
        if (!totalRow) continue;
        platforms.push({
          platform, spend: round(totalRow.spend), leads: totalRow.leads || 0, cpl: money2(totalRow.cpl),
          converted: totalRow.converted || 0, cac: money2(totalRow.cac), revenue: round(totalRow.revenue), roas: money2(totalRow.roas),
        });
        totalSpend += totalRow.spend || 0; totalLeads += totalRow.leads || 0;
        totalConverted += totalRow.converted || 0; totalRevenue += totalRow.revenue || 0;
      }
      const facts = capPayload({
        period: { from: scope.from || "", to: scope.to || "" }, branch: scope.branch || "All",
        totals: {
          spend: round(totalSpend), leads: totalLeads, cpl: totalLeads ? money2(totalSpend / totalLeads) : null,
          converted: totalConverted, cac: totalConverted ? money2(totalSpend / totalConverted) : null,
          revenue: round(totalRevenue), roas: totalSpend ? money2(totalRevenue / totalSpend) : null,
        },
        byPlatform: platforms,
        dataErrors: raw.note ? [raw.note] : [],
      });
      return { facts, rowsAnalyzed: platforms.length };
    },
  },

  "marketing.platforms": {
    title: "Meta & Google", page: "/owner/marketing/platforms", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 60 },
    scopeParams: ["branch", "from", "to"],
    focus: { brief: "Platform × campaign efficiency for the selected branch scope." },
    async collect(scope) {
      return callRoute(marketingSummaryPOST, { path: "/api/owner/marketing-summary", body: { branch: scope.branch || "All", from: scope.from, to: scope.to } });
    },
    compute(raw, book, scope) {
      const rows = raw.rows || [];
      const byPlatformCount = new Map();
      for (const r of rows) byPlatformCount.set(r.platform, (byPlatformCount.get(r.platform) || 0) + 1);
      const platformTotals = rows
        .filter((r) => r.isPlatformTotal || byPlatformCount.get(r.platform) === 1)
        .map((r) => ({ platform: r.platform, spend: round(r.spend), leads: r.leads || 0, cpl: money2(r.cpl), converted: r.converted || 0, revenue: round(r.revenue), roas: money2(r.roas) }));
      const campaigns = rows
        .filter((r) => !r.isPlatformTotal && r.campaignName)
        .map((r) => ({
          campaign: book.alias("C", r.campaignName, r.campaignName), platform: r.platform,
          spend: round(r.spend), leads: r.leads || 0, cpl: money2(r.cpl), converted: r.converted || 0, cac: money2(r.cac), revenue: round(r.revenue), roas: money2(r.roas),
        }));
      const facts = capPayload({
        period: { from: scope.from || "", to: scope.to || "" }, branch: scope.branch || "All",
        platformTotals, campaigns,
        dataErrors: raw.note ? [raw.note] : [],
      });
      return { facts, rowsAnalyzed: campaigns.length };
    },
  },

  "marketing.comparison": {
    title: "Meta vs Google", page: "/owner/marketing/comparison", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 60 },
    scopeParams: ["dateFrom", "dateTo", "branch"],
    focus: { brief: "Head-to-head verdict with the metric that decides it. Name the platform ('Meta' or 'Google') explicitly when you have a clear pick." },
    async collect(scope) {
      return callRoute(comparisonGET, { path: "/api/owner/marketing/comparison", params: scope });
    },
    compute(raw, book, scope) {
      const metrics = ["spend", "clicks", "leads", "cpl", "cpc", "converted", "revenue", "cac", "roas"];
      const platformFacts = (p) => {
        const cur = raw.current?.[p] || {}; const prev = raw.previous?.[p] || {};
        const current = {}; const previousDeltaPct = {};
        for (const m of metrics) {
          current[m] = money2(cur[m]);
          previousDeltaPct[m] = cur[m] != null && prev[m] ? pct(cur[m] - prev[m], prev[m]) : null;
        }
        return { current, previousDeltaPct };
      };
      const facts = capPayload({
        period: { from: scope.dateFrom || "", to: scope.dateTo || "" }, branch: scope.branch || "All",
        Meta: platformFacts("Meta"), Google: platformFacts("Google"),
        byBranch: (raw.byBranch || []).slice(0, 10),
        dailySpendTrend: (raw.daily || []).slice(-31),
        dataErrors: raw.note ? [raw.note] : [],
      });
      return { facts, rowsAnalyzed: 2 };
    },
  },

  "marketing.campaigns": {
    title: "Active Ads", page: "/owner/marketing/campaigns", kinds: ["brief", "verdicts"],
    model: { brief: AI_BRIEF_MODEL, verdicts: AI_BRIEF_MODEL }, ttlMin: { brief: 60, verdicts: 60 },
    scopeParams: ["dateFrom", "dateTo", "branch", "status", "platform"],
    focus: {
      brief: "Which active ads to scale, fix, or pause. Leads/CPL/converted are NOT available per campaign (the lead source tag only distinguishes platform, not campaign) — judge on spend/CPC/budget pacing only.",
      verdicts: "star='Scale', solid='Keep', watch='Optimise', at_risk='Pause candidate', insufficient_data='Too early' (a campaign running under a few days). Judge on spend vs budget and CPC only — leads/CPL are not available per campaign.",
    },
    async collect(scope) {
      return callRoute(campaignsGET, { path: "/api/owner/marketing/campaigns", params: scope });
    },
    compute(raw, book, scope, kind) {
      const rows = raw.campaigns || [];
      const daysRunning = (c) => {
        if (!c.startDate) return null;
        const end = c.endDate ? new Date(c.endDate) : new Date();
        return Math.max(0, Math.floor((end.getTime() - new Date(c.startDate).getTime()) / 86400000));
      };
      const commonRow = (c) => ({
        campaign: book.alias("C", c._id, c.name), platform: c.platform, status: c.status, branch: c.branch,
        daysRunning: daysRunning(c), dailyBudget: round(c.dailyBudget), spend: round(c.spend), cpc: money2(c.cpc),
      });
      const period = { from: scope.dateFrom || "", to: scope.dateTo || "" };

      if (kind === "verdicts") {
        const facts = capPayload({ period, cohort: { medianSpend: median(rows.map((r) => r.spend)) }, campaigns: rows.map(commonRow) });
        return { facts, rowsAnalyzed: rows.length };
      }
      const facts = capPayload({
        period,
        totals: { count: rows.length, activeCampaigns: rows.filter((r) => r.status === "Active").length, totalSpend: round(sumBy(rows, "spend")) },
        campaigns: rows.map(commonRow),
      });
      return { facts, rowsAnalyzed: rows.length };
    },
  },

  "marketing.adSpend": {
    title: "Ad Spend Entry", page: "/owner/marketing/ad-spend", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 60 },
    scopeParams: ["branch", "platform", "from", "to"],
    focus: { brief: "Spend pacing and data-entry gaps — days in the window with no spend entered." },
    async collect(scope) {
      const params = { ...scope };
      if (scope.from && scope.to) params.withReturn = "true";
      return callRoute(adSpendGET, { path: "/api/owner/ad-spend", params });
    },
    compute(raw, book, scope) {
      const entries = raw.entries || [];
      const byDay = new Map();
      for (const e of entries) {
        const day = toISTDateKey(e.date);
        if (day) byDay.set(day, (byDay.get(day) || 0) + (e.amount || 0));
      }
      const dailySpendSeries = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date, amount: round(amount) })).slice(-31);

      let missingEntryDays = null;
      if (scope.from && scope.to) {
        const totalDays = Math.max(1, Math.round((new Date(scope.to).getTime() - new Date(scope.from).getTime()) / 86400000) + 1);
        missingEntryDays = Math.max(0, totalDays - byDay.size);
      }

      const facts = capPayload({
        period: { from: scope.from || "", to: scope.to || "" }, branch: scope.branch || "All", platform: scope.platform || "All",
        totalSpend: round(sumBy(entries, "amount")), entryCount: entries.length,
        dailySpendSeries, missingEntryDays,
        returnByPlatform: raw.returnByPlatform || null,
      });
      return { facts, rowsAnalyzed: entries.length };
    },
  },

  "marketing.campaignLeads": {
    title: "Campaign Leads", page: "/owner/marketing/campaign-leads", kinds: ["brief"], long: true,
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 30 },
    scopeParams: [],
    focus: { brief: "Upload hygiene and match-rate quality; stale uploads." },
    async collect() {
      return callRoute(campaignLeadsBatchesGET, { path: "/api/owner/marketing/campaign-leads/batches", params: {} });
    },
    compute(raw) {
      const batches = raw.batches || [];
      const totalRows = sumBy(batches, "totalRows");
      const totalCreated = sumBy(batches, "created");
      const totalFailed = sumBy(batches, "failed");
      const lastUpload = batches[0]?.createdAt || null; 
      const daysAgo = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null);
      const facts = capPayload({
        batchCount: batches.length, totalRowsUploaded: totalRows, totalCreated, totalFailed,
        importRate: pct(totalCreated, totalRows),
        lastUploadDaysAgo: daysAgo(lastUpload),
        recentBatches: batches.slice(0, 10).map((b) => ({ batchNo: b.batchNo, totalRows: b.totalRows, created: b.created, failed: b.failed, status: b.status, daysAgo: daysAgo(b.createdAt) })),
      });
      return { facts, rowsAnalyzed: batches.length };
    },
  },

  "marketing.performance": {
    title: "Campaign Performance", page: "/owner/marketing/performance", kinds: ["brief", "verdicts"], long: true,
    model: { brief: AI_BRIEF_MODEL, verdicts: AI_BRIEF_MODEL }, ttlMin: { brief: 60, verdicts: 60 },
    scopeParams: ["from", "to", "branch", "platform", "campaignId"],
    focus: {
      brief: "True campaign ROI from lead → call → patient → revenue.",
      verdicts: "star='Scale', solid='Keep', watch='Optimise', at_risk='Pause candidate', insufficient_data='Too early'. Judge primarily on ROAS and cost per patient.",
    },
    async collect(scope) {
      return callRoute(campaignPerformanceGET, { path: "/api/owner/marketing/campaign-performance", params: scope });
    },
    compute(raw, book, scope, kind) {
      const rows = raw.campaigns || [];
      const commonRow = (c) => ({
        campaign: book.alias("C", c.campaignId, c.campaignName), platform: c.platform, branch: c.branch,
        spend: round(c.spend), cpc: money2(c.cpc),
        leadsUploaded: c.leadsUploaded || 0, leadsCalled: c.leadsCalled ?? null, leadsConnected: c.leadsConnected ?? null, leadsInterested: c.leadsInterested ?? null,
        avgCallSeconds: c.avgCallSeconds ?? null, patientsMatched: c.patientsMatched || 0, visited: c.visited || 0, converted: c.converted || 0,
        revenue: round(c.revenue), cpl: money2(c.cpl), cac: money2(c.cac), roas: money2(c.roas),
      });
      const period = { from: scope.from || "", to: scope.to || "" };
      const dataErrors = raw.callbyError ? [raw.callbyError] : [];

      if (kind === "verdicts") {
        const facts = capPayload({
          period,
          cohort: { medianRoas: median(rows.map((r) => r.roas)), medianCpl: median(rows.map((r) => r.cpl)) },
          campaigns: rows.map(commonRow),
          dataErrors,
        });
        return { facts, rowsAnalyzed: rows.length };
      }

      const scored = rows.filter((r) => r.roas != null).map((r) => ({ ...commonRow(r), score: r.roas }));
      const facts = capPayload({
        period,
        totals: { spend: round(sumBy(rows, "spend")), leadsUploaded: sumBy(rows, "leadsUploaded"), converted: sumBy(rows, "converted"), revenue: round(sumBy(rows, "revenue")) },
        overlapCount: raw.overlapCount || 0,
        attributionWindow: raw.window || [],
        top5: topN(scored, "score", 5),
        bottom5: bottomN(scored, "score", 5),
        dataErrors,
      });
      return { facts, rowsAnalyzed: rows.length };
    },
  },
};

export default marketingFeatures;
