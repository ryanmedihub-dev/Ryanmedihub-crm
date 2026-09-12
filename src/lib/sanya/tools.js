import { ALL_BRANCHES } from "@/lib/branches";
import { EMPLOYEE_SECTIONS, SECTION_LABELS } from "@/lib/owner/employeeSections";
import { getPatientsByStatus } from "@/lib/owner/metrics/patients";
import { getBranchProfitability, getFinanceTrend, getExpenseSummary } from "@/lib/owner/metrics/finance";
import { getLeadFunnel, getCallStats } from "@/lib/owner/metrics/leadsCalls";
import { getMarketingSummary } from "@/lib/owner/metrics/marketing";
import { getAttentionItems } from "@/lib/owner/metrics/attention";
import { getEmployeeStats } from "@/lib/owner/metrics/employees";
import { assertNoPII } from "./pii";

// Sanya's tool catalogue. Every tool:
//   • is READ-ONLY and takes only dates / branch / section — never free text,
//     never an id, never a query the model authored;
//   • calls the SAME src/lib/owner/metrics/* function the corresponding Owner
//     page calls, so its numbers are the page's numbers for the same filters;
//   • PROJECTS an explicit allow-list of aggregate fields (names, phones and
//     per-person rows never enter the result) and is then re-checked by
//     assertNoPII before anything leaves runTool();
//   • returns `verifyAt` — the exact page + filters where every number in the
//     result can be checked by eye. The route surfaces these links under the
//     answer whether or not the model cites them.

// --- date handling ------------------------------------------------------------
// Tools take calendar dates (YYYY-MM-DD, IST). The pages build their window as
// local-midnight → local-end-of-day and Owner users are in IST, so the same
// bounds are produced here explicitly (Vercel runs in UTC).
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function istWindow(dateFrom, dateTo) {
  if (!DATE_RE.test(dateFrom || "") || !DATE_RE.test(dateTo || "")) {
    throw new Error("dateFrom and dateTo must be YYYY-MM-DD");
  }
  if (dateTo < dateFrom) throw new Error("dateTo is before dateFrom");
  return {
    from: new Date(`${dateFrom}T00:00:00.000+05:30`).toISOString(),
    to: new Date(`${dateTo}T23:59:59.999+05:30`).toISOString(),
  };
}
function branchOf(args) {
  const b = args.branch || "All";
  if (b !== "All" && !ALL_BRANCHES.includes(b)) throw new Error(`Unknown branch "${b}" — one of All, ${ALL_BRANCHES.join(", ")}`);
  return b;
}
function pageLink(path, { dateFrom, dateTo, branch }) {
  const p = new URLSearchParams({ range: "Custom", from: dateFrom, to: dateTo });
  if (branch && branch !== "All") p.set("branch", branch);
  return `${path}?${p.toString()}`;
}
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const DATE_PARAMS = {
  dateFrom: { type: "string", description: "Start date, YYYY-MM-DD (inclusive, IST)" },
  dateTo: { type: "string", description: "End date, YYYY-MM-DD (inclusive, IST)" },
};
const BRANCH_PARAM = {
  branch: { type: "string", enum: ["All", ...ALL_BRANCHES], description: "Clinic branch, or All" },
};

// --- the tools ------------------------------------------------------------------
export const TOOLS = [
  {
    name: "get_patients_by_status",
    description:
      "Patient counts for a period (by createdAt): total, status funnel (NEW / NOT_VISITED / NOT_CONVERTED / BOOKING_DONE / SURGERY_BOOKED / CLOSED), amount received, conversion rate (SURGERY_BOOKED + CLOSED over total), split by branch. Same numbers as the /owner/patients page.",
    parameters: { type: "object", properties: { ...DATE_PARAMS, ...BRANCH_PARAM }, required: ["dateFrom", "dateTo"] },
    async run(args) {
      const { from, to } = istWindow(args.dateFrom, args.dateTo);
      const branch = branchOf(args);
      const d = await getPatientsByStatus({ dateFrom: from, dateTo: to, branch });
      return {
        data: {
          period: { dateFrom: args.dateFrom, dateTo: args.dateTo, branch },
          totalPatients: d.total,
          amountReceived: r2(d.receivedSum),
          converted: d.converted,
          conversionRatePct: d.conversionRate,
          byStatus: d.statusBreakdown.map((s) => ({ status: s.status || "UNKNOWN", count: s.count })),
          byBranch: d.byBranch.map((b) => ({ branch: b.branch, count: b.count })),
          dailyCounts: d.daywise.length <= 92 ? d.daywise.map((x) => ({ date: x.date, count: x.value })) : undefined,
          dailyCountsOmitted: d.daywise.length > 92 ? `${d.daywise.length} days — ask for a shorter range for a daily series` : undefined,
        },
        verifyAt: { label: "Patients overview", href: pageLink("/owner/patients", { ...args, branch }) },
      };
    },
  },
  {
    name: "get_finance_summary",
    description:
      "Finance for a period: revenue, expense and profit per branch (approved, settled transactions), cash-basis receipts vs payments totals, and the top expense heads. Same numbers as the /owner/finance landing page.",
    parameters: { type: "object", properties: { ...DATE_PARAMS, ...BRANCH_PARAM }, required: ["dateFrom", "dateTo"] },
    async run(args) {
      const { from, to } = istWindow(args.dateFrom, args.dateTo);
      const branch = branchOf(args);
      const [bp, trend, expenses] = await Promise.all([
        getBranchProfitability({ from, to }),
        getFinanceTrend({ from, to, branch: branch === "All" ? "" : branch }),
        getExpenseSummary({ from, to, branch, top: 8 }),
      ]);
      const rows = branch === "All" ? bp.rows : bp.rows.filter((r) => r.branch === branch);
      return {
        data: {
          period: { dateFrom: args.dateFrom, dateTo: args.dateTo, branch },
          profitabilityByBranch: rows.map((r) => ({ branch: r.branch, revenue: r.revenue, expense: r.expense, profit: r.profit })),
          profitabilityTotal: branch === "All" ? bp.totals : rows.reduce((t, r) => ({ revenue: r2(t.revenue + r.revenue), expense: r2(t.expense + r.expense), profit: r2(t.profit + r.profit) }), { revenue: 0, expense: 0, profit: 0 }),
          cashBasis: { receipts: trend.totals.receipts, payments: trend.totals.payments, note: "cash-basis receipts/payments, not P&L" },
          expenses: { totalExpense: expenses.totalExpense, entries: expenses.entries, topHeads: expenses.top.map((e) => ({ category: e.category, subType: e.subType, total: r2(e.total), count: e.count })) },
        },
        verifyAt: { label: "Finance overview", href: pageLink("/owner/finance", { ...args, branch }) },
      };
    },
  },
  {
    name: "get_expense_breakdown",
    description: "Expense heads for a period, grouped by category and sub-type with totals and entry counts (top 25). Same numbers as /owner/finance/expenses.",
    parameters: { type: "object", properties: { ...DATE_PARAMS, ...BRANCH_PARAM }, required: ["dateFrom", "dateTo"] },
    async run(args) {
      const { from, to } = istWindow(args.dateFrom, args.dateTo);
      const branch = branchOf(args);
      const e = await getExpenseSummary({ from, to, branch, top: 25 });
      return {
        data: {
          period: { dateFrom: args.dateFrom, dateTo: args.dateTo, branch },
          totalExpense: e.totalExpense,
          entries: e.entries,
          distinctHeads: e.heads,
          heads: e.top.map((x) => ({ category: x.category, subType: x.subType, total: r2(x.total), count: x.count })),
        },
        verifyAt: { label: "Expenses", href: pageLink("/owner/finance/expenses", { ...args, branch }) },
      };
    },
  },
  {
    name: "get_lead_funnel",
    description:
      "Lead funnel from callby for a period (by lead created date): leads by status with average attempts, uncontacted / not-connected / contacted / converted counts, follow-ups due, leads by source with conversion rate, and a day-wise series. Not branch-scoped (leads have no branch). Same numbers as /owner/leads.",
    parameters: { type: "object", properties: { ...DATE_PARAMS }, required: ["dateFrom", "dateTo"] },
    async run(args) {
      const { from, to } = istWindow(args.dateFrom, args.dateTo);
      const d = await getLeadFunnel({ dateFrom: from, dateTo: to });
      const byStatus = Object.entries(d.summary || {}).map(([status, v]) => ({ status, leads: v?.leads ?? 0, avgAttempts: v?.avgAttempts ?? 0 }));
      return {
        data: {
          period: { dateFrom: args.dateFrom, dateTo: args.dateTo },
          byStatus,
          counts: {
            uncontacted: d.sidebarStats?.uncontacted ?? null,
            notConnected: d.sidebarStats?.notConnected ?? null,
            contacted: d.sidebarStats?.contacted ?? null,
            converted: d.sidebarStats?.converted ?? null,
            followUpsDue: d.sidebarStats?.followUpsDue ?? null,
            uniqueSources: d.sidebarStats?.uniqueSources ?? null,
          },
          bySource: (d.sources || []).slice(0, 25).map((s) => ({ source: s.source, total: s.total, converted: s.converted, lost: s.lost, conversionRatePct: s.conversionRate })),
          daily: (d.daywise || []).length <= 92 ? (d.daywise || []).map((x) => ({ date: x.date, total: x.total, converted: x.converted })) : undefined,
        },
        verifyAt: { label: "Leads overview", href: pageLink("/owner/leads", args) },
      };
    },
  },
  {
    name: "get_call_stats",
    description:
      "Call volume from callby for a period: total / incoming / outgoing / missed / rejected / never-attended calls, connected calls, unique clients, total talk time, average duration, active agents count, and calls per hour of day. Not branch-scoped. Same numbers as /owner/calls.",
    parameters: { type: "object", properties: { ...DATE_PARAMS }, required: ["dateFrom", "dateTo"] },
    async run(args) {
      const { from, to } = istWindow(args.dateFrom, args.dateTo);
      const d = await getCallStats({ dateFrom: from, dateTo: to });
      const s = d.selected || {};
      const pick = (x) => ({
        totalCalls: x.totalCalls ?? 0, connectedCalls: x.connectedCalls ?? 0,
        connectRatePct: x.totalCalls ? Math.round((x.connectedCalls / x.totalCalls) * 1000) / 10 : 0,
        incoming: x.incoming ?? 0, outgoing: x.outgoing ?? 0, missed: x.missed ?? 0, rejected: x.rejected ?? 0,
        neverAttended: x.neverAttended ?? 0, notPickupByClient: x.notPickupByClient ?? 0,
        uniqueClients: x.uniqueClients ?? 0, totalTalkTime: x.callDuration ?? null, avgDurationSec: x.avgDuration ?? 0,
        activeAgents: x.activeEmployees ?? 0,
      });
      return {
        data: {
          period: { dateFrom: args.dateFrom, dateTo: args.dateTo },
          ...pick(s),
          callsPerHour: (d.callsPerHour || []).map((h) => ({ hour: h.hour, count: h.count })),
          today: d.today ? pick(d.today) : undefined,
        },
        verifyAt: { label: "Calls overview", href: pageLink("/owner/calls", args) },
      };
    },
  },
  {
    name: "get_marketing_summary",
    description:
      "Marketing for a period: ad spend, leads, cost per lead, converted, CAC, attributed revenue and ROAS per platform (Meta, Google) and per campaign. Spend can be branch-scoped; leads/revenue are all-branch. Same numbers as /owner/marketing.",
    parameters: { type: "object", properties: { ...DATE_PARAMS, ...BRANCH_PARAM }, required: ["dateFrom", "dateTo"] },
    async run(args) {
      const { from, to } = istWindow(args.dateFrom, args.dateTo);
      const branch = branchOf(args);
      const d = await getMarketingSummary({ branch, from, to });
      return {
        data: {
          period: { dateFrom: args.dateFrom, dateTo: args.dateTo, branch },
          note: d.note || undefined,
          rows: d.rows.map((r) => ({
            platform: r.platform, campaign: r.campaignName, isPlatformTotal: r.isPlatformTotal,
            spend: r.spend, leads: r.leads, cpl: r.cpl, converted: r.converted, cac: r.cac, revenue: r.revenue, roas: r.roas,
          })),
          spendLastEnteredAt: d.lastUpdatedAt || null,
        },
        verifyAt: { label: "Marketing overview", href: pageLink("/owner/marketing", { ...args, branch }) },
      };
    },
  },
  {
    name: "get_attention_items",
    description:
      "Counts of things needing attention right now (threshold rules, not predictions): overdue follow-ups, interested leads with no recent call, stale Booking Done / Surgery Booked patients (with pending amount at risk), and poor-performing employees for the period. Counts only — the page lists the individual records.",
    parameters: { type: "object", properties: { ...DATE_PARAMS }, required: ["dateFrom", "dateTo"] },
    async run(args) {
      const { from, to } = istWindow(args.dateFrom, args.dateTo);
      const d = await getAttentionItems({ from, to });
      return {
        data: {
          period: { dateFrom: args.dateFrom, dateTo: args.dateTo },
          totalFlagged: d.totalFlagged,
          totalPendingAmountAtRisk: r2(d.totalValueAtRisk),
          rules: d.rules.map((r) => ({
            rule: r.key, label: r.label, description: r.description, count: r.count,
            pendingAmountAtRisk: r.valueAtRisk == null ? null : r2(r.valueAtRisk),
            dataError: r.error || null, detailPage: r.drillHref,
          })),
          thresholds: d.thresholds,
        },
        verifyAt: { label: "Needs attention", href: pageLink("/owner/ai/attention", args) },
      };
    },
  },
  {
    name: "get_employee_stats",
    description:
      "Aggregate employee statistics for one section for a period: headcount, active, linked to callby, salary and incentive paid, average peer-relative performance score and the Excellent/Good/Average/Bad band split, plus section totals (Agents: total calls & leads; Counsellors: patients consulted; Surgery: patients operated & grafts; HR: interviews & selected). No per-person data — the page has the roster. Same numbers as /owner/employees/<section>.",
    parameters: {
      type: "object",
      properties: {
        section: { type: "string", enum: EMPLOYEE_SECTIONS, description: `Which staff group: ${EMPLOYEE_SECTIONS.map((s) => `${s} = ${SECTION_LABELS[s]}`).join("; ")}` },
        ...DATE_PARAMS, ...BRANCH_PARAM,
        isactive: { type: "boolean", description: "true = active employees only, false = inactive only; omit for both" },
      },
      required: ["section", "dateFrom", "dateTo"],
    },
    async run(args) {
      const { from, to } = istWindow(args.dateFrom, args.dateTo);
      const branch = branchOf(args);
      const isactive = typeof args.isactive === "boolean" ? args.isactive : null;
      const d = await getEmployeeStats({ section: args.section, dateFrom: from, dateTo: to, branch, isactive });
      const slug = { Agent: "agents", Counsellor: "counsellors", Surgery: "surgery-staff", HR: "hr", Other: "other-staff" }[args.section];
      const href = pageLink(`/owner/employees/${slug}`, { ...args, branch }) + (isactive === null ? "" : `&isactive=${isactive}`);
      return {
        data: {
          period: { dateFrom: args.dateFrom, dateTo: args.dateTo, branch, isactive },
          section: d.label,
          headcount: d.headcount,
          kpis: d.kpis.map((k) => ({ label: k.label, value: k.value, note: k.sub, unit: k.format === "currency" ? "INR" : undefined })),
          performanceBands: d.performanceBands,
          dataError: d.callbyError || null,
        },
        verifyAt: { label: `Employees — ${d.label}`, href },
      };
    },
  },
];

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** OpenAI chat/completions `tools` payload. */
export const OPENAI_TOOL_DEFS = TOOLS.map((t) => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

/**
 * Run one tool by name. The result is aggregate-only by construction and is
 * re-checked by assertNoPII — a leak throws PIIError and nothing is returned.
 */
export async function runTool(name, args) {
  const tool = BY_NAME.get(name);
  if (!tool) throw new Error(`Unknown tool ${name}`);
  const result = await tool.run(args || {});
  assertNoPII(result.data, name);
  return result;
}
