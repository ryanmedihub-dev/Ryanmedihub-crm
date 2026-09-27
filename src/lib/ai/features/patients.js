import { GET as overviewGET } from "@/app/api/owner/patients/overview/route";
import { GET as patientsGET } from "@/app/api/owner/patients/route";
import { GET as patientDetailGET } from "@/app/api/owner/patients/[id]/route";
import { POST as counsellorConversionPOST } from "@/app/api/owner/counsellor-conversion/route";
import { POST as surgeryPlannerPOST } from "@/app/api/owner/surgery-planner/route";
import { toISTDateKey } from "@/lib/owner/dates";
import { PRESET_STATUS } from "@/lib/owner/patientStatus";
import { callRoute } from "../sources";
import { AI_BRIEF_MODEL, AI_DEEP_MODEL } from "../config";
import { round, pct, topN, bottomN, sumBy, capPayload } from "./_helpers";

const SAMPLE_CAP = 200;

function daysAgo(date) {
  if (!date) return null;
  const ms = Date.now() - new Date(date).getTime();
  return ms >= 0 ? Math.floor(ms / 86400000) : null;
}
function median(nums) {
  const s = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : round((s[mid - 1] + s[mid]) / 2, 1);
}
function bucketize(value, edges, labels) {
  if (value == null) return null;
  for (let i = 0; i < edges.length; i++) if (value <= edges[i]) return labels[i];
  return labels[labels.length - 1];
}
const AGE_BUCKET_EDGES = [1, 3, 7, 30];
const AGE_BUCKET_LABELS = ["0-1d", "2-3d", "4-7d", "8-30d", "30+d"];
const emptyAgeBuckets = () => Object.fromEntries(AGE_BUCKET_LABELS.map((l) => [l, 0]));
const PENDING_BUCKET_EDGES = [0, 25_000, 50_000, 100_000];
const PENDING_BUCKET_LABELS = ["0", "1-25k", "25-50k", "50k-1L", "1L+"];
const emptyPendingBuckets = () => Object.fromEntries(PENDING_BUCKET_LABELS.map((l) => [l, 0]));

function topEntries(map, n) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

const patientsFeatures = {
  "patients.overview": {
    title: "Patients Overview", page: "/owner/patients", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 30 },
    scopeParams: ["dateFrom", "dateTo", "branch"],
    focus: { brief: "Patient pipeline health end to end; branch differences." },
    async collect(scope) {
      return callRoute(overviewGET, { path: "/api/owner/patients/overview", params: scope });
    },
    compute(raw, book, scope) {
      const facts = capPayload({
        period: { from: scope.dateFrom || "", to: scope.dateTo || "" },
        branch: scope.branch || "All",
        totals: {
          total: raw.total || 0, receivedSum: round(raw.receivedSum), packageSum: round(raw.packageSum),
          converted: raw.converted || 0, conversionRate: raw.conversionRate || 0,
        },
        statusBreakdown: raw.statusBreakdown || [],
        byBranch: raw.byBranch || [],
        dailyTrend: (raw.daywise || []).slice(-31),
      });
      return { facts, rowsAnalyzed: (raw.statusBreakdown || []).length };
    },
  },

  "patients.preset": {
    title: "Patients", page: "/owner/patients", kinds: ["brief", "verdicts"],
    model: { brief: AI_BRIEF_MODEL, verdicts: AI_BRIEF_MODEL }, ttlMin: { brief: 30, verdicts: 30 },
    scopeParams: ["preset", "dateFrom", "dateTo", "branch", "status", "sortBy", "sortDir", "page", "pageSize"],
    focus: {
      brief: "Check facts.preset and apply the matching angle: 'all' = volume and mix, anything unusual this period; 'notConverted' = recoverable patients — recent visit + high quoted package first; 'bookingDone' = bookings at risk — long gap since registration without a surgery date, large pending amounts; 'converted' = revenue realised vs pending, package trends; 'surgeryDone' = collection completeness and grafts trend; 'direct' = walk-in share of total and conversion vs referred (facts.othersComparison has the referred-patient baseline).",
      verdicts: "Rate each patient as a FOLLOW-UP PRIORITY, not a performance score: 'star' = call today (recoverable, high value, recently active), 'solid' = follow up this week, 'watch' = low priority, 'at_risk' = probably lost, 'insufficient_data' when too little history exists.",
    },
    async collect(scope, ctx, kind) {
      const params = kind === "brief"
        ? { ...scope, page: 1, pageSize: SAMPLE_CAP, sortBy: scope.sortBy || "createdAt", sortDir: scope.sortDir || "desc" }
        : scope;
      return callRoute(patientsGET, { path: "/api/owner/patients", params });
    },
    compute(raw, book, scope, kind) {
      const rows = raw.rows || [];
      const rowsAnalyzed = rows.length;
      const dataErrors = [];
      if (raw.total > rowsAnalyzed && kind === "brief") dataErrors.push(`Sample covers ${rowsAnalyzed} of ${raw.total} patients.`);
      const period = { from: scope.dateFrom || "", to: scope.dateTo || "" };

      const patientRow = (r) => ({
        patient: book.alias("P", r.id, r.name),
        status: r.status || null,
        branch: r.branch || "",
        daysSinceRegistration: daysAgo(r.createdAt),
        daysSinceVisit: daysAgo(r.visitDate),
        daysSinceActivity: daysAgo(r.lastActivityAt),
        packageAmount: round(r.packageAmount),
        amountReceived: round(r.amountReceived),
        pendingAmount: round(r.pendingAmount),
        counsellorAlias: r.counsellor ? book.alias("E", r.counsellor.name, r.counsellor.name) : null,
        referredBy: r.reference ? book.alias("E", r.reference.name, r.reference.name) : "direct",
      });

      if (kind === "verdicts") {
        const facts = capPayload({
          period, preset: scope.preset || "",
          cohort: {
            medianPending: median(rows.map((r) => r.pendingAmount)),
            medianDaysSinceVisit: median(rows.map((r) => daysAgo(r.visitDate))),
          },
          patients: rows.map(patientRow),
          dataErrors,
        });
        return { facts, rowsAnalyzed };
      }

      
      
      
      const ageBuckets = emptyAgeBuckets();
      const pendingBuckets = emptyPendingBuckets();
      const byBranch = new Map(); const bySource = new Map(); const byCounsellor = new Map();
      for (const r of rows) {
        const ageLabel = bucketize(daysAgo(r.visitDate), AGE_BUCKET_EDGES, AGE_BUCKET_LABELS);
        if (ageLabel) ageBuckets[ageLabel]++;
        const pendingLabel = bucketize(r.pendingAmount || 0, PENDING_BUCKET_EDGES, PENDING_BUCKET_LABELS);
        if (pendingLabel) pendingBuckets[pendingLabel]++;
        byBranch.set(r.branch || "Unspecified", (byBranch.get(r.branch || "Unspecified") || 0) + 1);
        bySource.set(r.reference?.name || "direct", (bySource.get(r.reference?.name || "direct") || 0) + 1);
        if (r.counsellor?.name) byCounsellor.set(r.counsellor.name, (byCounsellor.get(r.counsellor.name) || 0) + 1);
      }

      const facts = capPayload({
        period, preset: scope.preset || "",
        totals: raw.totals || {},
        ageBucketsSinceVisit: ageBuckets,
        pendingAmountBuckets: pendingBuckets,
        byBranch: [...byBranch.entries()].map(([branch, count]) => ({ branch, count })),
        bySource: topEntries(bySource, 10).map(([source, count]) => (source === "direct" ? { source: "direct", count } : { source: book.alias("E", source, source), count })),
        byCounsellor: topEntries(byCounsellor, 8).map(([name, count]) => ({ counsellorAlias: book.alias("E", name, name), count })),
        
        stale: raw.stats?.stale ?? null,
        withSurgeryDate: raw.stats?.withSurgeryDate ?? null,
        surgeryStats: raw.surgeryStats || null,
        techniqueMix: raw.techniqueMix || null,
        othersComparison: raw.others || null,
        dataErrors,
      });
      return { facts, rowsAnalyzed };
    },
  },

  "patients.counsellorConversion": {
    title: "Counsellor Conversion", page: "/owner/patients/counsellor-conversion", kinds: ["brief", "verdicts"],
    model: { brief: AI_BRIEF_MODEL, verdicts: AI_BRIEF_MODEL }, ttlMin: { brief: 60, verdicts: 60 },
    scopeParams: ["branch", "from", "to"],
    focus: {
      brief: "Which counsellors convert, at what revenue, with how much discount.",
      verdicts: "Rate each counsellor against the cohort medians for conversion rate and revenue.",
    },
    async collect(scope) {
      return callRoute(counsellorConversionPOST, { path: "/api/owner/counsellor-conversion", body: { branch: scope.branch || "All", from: scope.from, to: scope.to } });
    },
    compute(raw, book, scope, kind) {
      const rows = raw.rows || [];
      const commonRow = (r) => ({
        alias: book.alias("E", r.counsellorId, r.counsellorName),
        visits: r.visits || 0, plans: r.plans || 0, tokens: r.tokens || 0, surgeries: r.surgeries || 0,
        revenue: round(r.revenue), avgDiscount: round(r.avgDiscount), conversionRate: pct(r.surgeries, r.visits),
      });
      const period = { from: scope.from || "", to: scope.to || "" };

      if (kind === "verdicts") {
        const facts = capPayload({
          period,
          cohort: { medianRevenue: median(rows.map((r) => r.revenue)), medianConversionRate: median(rows.map((r) => pct(r.surgeries, r.visits))) },
          counsellors: rows.map(commonRow),
        });
        return { facts, rowsAnalyzed: rows.length };
      }

      const scored = rows.map((r) => ({ ...commonRow(r), score: pct(r.surgeries, r.visits) }));
      const facts = capPayload({
        period,
        totals: { visits: sumBy(rows, "visits"), plans: sumBy(rows, "plans"), tokens: sumBy(rows, "tokens"), surgeries: sumBy(rows, "surgeries"), revenue: round(sumBy(rows, "revenue")) },
        top5: topN(scored, "revenue", 5),
        bottom5: bottomN(scored, "revenue", 5),
      });
      return { facts, rowsAnalyzed: rows.length };
    },
  },

  "patients.surgeryPlanner": {
    title: "Surgery & OT Planner", page: "/owner/patients/surgery-planner", kinds: ["brief"],
    model: { brief: AI_BRIEF_MODEL }, ttlMin: { brief: 60 },
    scopeParams: ["branch", "from", "to"],
    focus: { brief: "OT utilisation and bottlenecks for the coming days — flag any day whose count looks high relative to the rest of the window." },
    async collect(scope) {
      return callRoute(surgeryPlannerPOST, { path: "/api/owner/surgery-planner", body: { branch: scope.branch || "All", from: scope.from, to: scope.to } });
    },
    compute(raw, book, scope) {
      const surgeries = raw.surgeries || [];
      const byDay = new Map(); const byBranch = new Map();
      for (const s of surgeries) {
        const day = s.surgeryDate ? toISTDateKey(s.surgeryDate) : null;
        if (day) byDay.set(day, (byDay.get(day) || 0) + 1);
        byBranch.set(s.branch || "Unspecified", (byBranch.get(s.branch || "Unspecified") || 0) + 1);
      }
      const facts = capPayload({
        period: { from: scope.from || "", to: scope.to || "" },
        windowSurgeries: surgeries.length,
        byDay: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
        byBranch: [...byBranch.entries()].map(([branch, count]) => ({ branch, count })),
        todayOTCapacity: raw.todayOTCapacity || [],
        graftsPlanned: round(sumBy(surgeries, "graftsneed")),
      });
      return { facts, rowsAnalyzed: surgeries.length };
    },
  },

  "patient.deep": {
    title: "Patient Deep Review", page: "/owner/patients", kinds: ["deep"],
    model: { deep: AI_DEEP_MODEL }, ttlMin: { deep: 180 },
    scopeParams: ["id"],
    focus: { deep: "Where this patient is in the journey, what's blocking conversion or payment, next best action for the team. No medical opinions — operational data only." },
    async collect(scope) {
      const detail = await callRoute(patientDetailGET, { path: `/api/owner/patients/${scope.id}`, routeParams: { id: scope.id } });
      const status = detail.patient?.ops?.status;
      const preset = { NOT_CONVERTED: "notConverted", BOOKING_DONE: "bookingDone", SURGERY_BOOKED: "converted", CLOSED: "surgeryDone" }[status];
      const cohort = preset
        ? await callRoute(patientsGET, { path: "/api/owner/patients", params: { preset, page: 1, pageSize: SAMPLE_CAP, sortBy: "createdAt", sortDir: "desc" } })
        : null;
      return { detail, cohort };
    },
    compute(raw, book, scope) {
      const p = raw.detail?.patient || {};
      const alias = book.alias("P", scope.id, p.personal?.name);
      const pushEvent = (events, event, date) => {
        if (date) events.push({ event, daysAgo: daysAgo(date) });
      };

      const events = [];
      pushEvent(events, "Registered", p.createdAt);
      pushEvent(events, "Visited", p.personal?.visitDate);
      for (const t of p.payments?.transactions || []) pushEvent(events, `Payment (${t.costType || "revenue"})`, t.date);
      pushEvent(events, "Surgery", p.surgery?.surgeryDate);
      pushEvent(events, "Headwash", p.afterSurgery?.headwashDate);
      pushEvent(events, "Bandage removal", p.afterSurgery?.bandageRemovalDate);
      for (const prp of p.afterSurgery?.prp || []) pushEvent(events, `PRP/GFC (${prp.type || "session"})`, prp.date);
      events.sort((a, b) => (b.daysAgo ?? 0) - (a.daysAgo ?? 0));

      const aliasPerson = (person) => (person ? book.alias("E", String(person._id || person.name), person.name) : null);

      const cohortRows = raw.cohort?.rows || [];
      const peerBenchmarks = cohortRows.length
        ? {
            sampleSize: cohortRows.length,
            medianDaysSinceRegistration: median(cohortRows.map((r) => daysAgo(r.createdAt))),
            medianPackage: median(cohortRows.map((r) => r.packageAmount)),
            medianPendingAmount: median(cohortRows.map((r) => r.pendingAmount)),
          }
        : null;

      const facts = capPayload({
        patient: {
          alias, status: p.ops?.status || null, branch: p.personal?.branch || "",
          daysSinceRegistration: daysAgo(p.createdAt), daysSinceVisit: daysAgo(p.personal?.visitDate), daysSinceSurgery: daysAgo(p.surgery?.surgeryDate),
          packageQuoted: round(p.personal?.packageQuoted), finalPackage: round(p.counselling?.finlpackage),
          techniqueQuoted: p.personal?.techniqueQuoted || null, techniqueSuggested: p.counselling?.techniqueSuggested || null,
          graftsSuggested: p.counselling?.graftsSuggested ?? null, readyForSurgery: !!p.counselling?.readyForSurgery,
          referredBy: aliasPerson(p.personal?.reference) || "direct",
          counsellorAlias: aliasPerson(p.counselling?.counsellor),
          surgeryTechnique: p.surgery?.technique || null, graftsNeeded: p.surgery?.graftsneed ?? null, graftsImplanted: p.surgery?.graftsImplanted ?? null,
        },
        journey: events,
        payments: {
          totalAmount: round(p.payments?.totalAmount), amountReceived: round(p.payments?.amountReceived),
          pendingAmount: round(p.payments?.pendingAmount), discount: round(p.payments?.discount),
        },
        peerBenchmarks,
        dataErrors: raw.detail?.callbyError ? [raw.detail.callbyError] : [],
      });
      return { facts, rowsAnalyzed: 1 };
    },
  },
};

export default patientsFeatures;
