import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import SanyaUsage from "@/models/SanyaUsage";
import { SANYA_MODEL, SANYA_MONTHLY_BUDGET_USD, SANYA_RATE_LIMIT } from "@/lib/sanya/config";
import { parseEmployeeFilters } from "@/lib/owner/pagination";

const ALLOWED_ROLES = ["owner", "super-admin"];

// /owner/ai/health — Sanya's operational picture, from SanyaUsage (one row per
// turn). Everything here is a count/sum over that log: turn volume, tool-call
// volume per tool, latency percentiles, error / refusal / blocked rates, token
// and dollar cost, month-to-date against the ceiling. No question or answer
// text is stored, so none is shown.
export async function GET(req) {
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    if (!session || !ALLOWED_ROLES.includes(session?.user?.role)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const { dateFrom, dateTo } = parseEmployeeFilters(searchParams);
    const match = {};
    if (dateFrom || dateTo) {
      match.createdAt = {};
      if (dateFrom) match.createdAt.$gte = new Date(dateFrom);
      if (dateTo) match.createdAt.$lte = new Date(dateTo);
    }

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const [result] = await SanyaUsage.aggregate([
      {
        $facet: {
          period: [
            { $match: match },
            {
              $group: {
                _id: null,
                turns: { $sum: 1 },
                ok: { $sum: { $cond: [{ $eq: ["$outcome", "ok"] }, 1, 0] } },
                errors: { $sum: { $cond: [{ $eq: ["$outcome", "error"] }, 1, 0] } },
                rateLimited: { $sum: { $cond: [{ $eq: ["$outcome", "rate_limited"] }, 1, 0] } },
                budgetExceeded: { $sum: { $cond: [{ $eq: ["$outcome", "budget_exceeded"] }, 1, 0] } },
                piiBlocked: { $sum: { $cond: [{ $eq: ["$outcome", "pii_blocked"] }, 1, 0] } },
                refused: { $sum: { $cond: ["$refused", 1, 0] } },
                toolCalls: { $sum: { $size: { $ifNull: ["$toolCalls", []] } } },
                promptTokens: { $sum: "$promptTokens" },
                completionTokens: { $sum: "$completionTokens" },
                costUsd: { $sum: "$costUsd" },
                latencyAvg: { $avg: "$latencyMs" },
                latencyMax: { $max: "$latencyMs" },
                users: { $addToSet: "$userEmail" },
              },
            },
          ],
          latencyP: [
            { $match: { ...match, outcome: "ok" } },
            { $group: { _id: null, p50: { $percentile: { input: "$latencyMs", p: [0.5, 0.95], method: "approximate" } } } },
          ],
          byTool: [
            { $match: match },
            { $unwind: "$toolCalls" },
            {
              $group: {
                _id: "$toolCalls.name",
                calls: { $sum: 1 },
                failed: { $sum: { $cond: ["$toolCalls.ok", 0, 1] } },
                avgMs: { $avg: "$toolCalls.ms" },
                maxMs: { $max: "$toolCalls.ms" },
              },
            },
            { $sort: { calls: -1 } },
          ],
          daily: [
            { $match: match },
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                turns: { $sum: 1 },
                errors: { $sum: { $cond: [{ $in: ["$outcome", ["error", "pii_blocked"]] }, 1, 0] } },
                costUsd: { $sum: "$costUsd" },
              },
            },
            { $sort: { _id: 1 } },
          ],
          monthToDate: [
            { $match: { createdAt: { $gte: monthStart } } },
            { $group: { _id: null, costUsd: { $sum: "$costUsd" }, turns: { $sum: 1 } } },
          ],
          recentErrors: [
            { $match: { ...match, outcome: { $in: ["error", "pii_blocked"] } } },
            { $sort: { createdAt: -1 } },
            { $limit: 10 },
            { $project: { _id: 0, createdAt: 1, outcome: 1, errorMessage: 1, latencyMs: 1 } },
          ],
        },
      },
    ]);

    const p = result.period?.[0] || null;
    const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
    const mtd = result.monthToDate?.[0] || { costUsd: 0, turns: 0 };
    const percentiles = result.latencyP?.[0]?.p50 || [];

    return NextResponse.json({
      success: true,
      config: { model: SANYA_MODEL, monthlyBudgetUsd: SANYA_MONTHLY_BUDGET_USD, rateLimit: SANYA_RATE_LIMIT },
      monthToDate: { costUsd: mtd.costUsd, turns: mtd.turns, budgetUsedPct: pct(mtd.costUsd, SANYA_MONTHLY_BUDGET_USD) },
      summary: p
        ? {
            turns: p.turns,
            users: p.users.length,
            okRatePct: pct(p.ok, p.turns),
            errorRatePct: pct(p.errors + p.piiBlocked, p.turns),
            refusalRatePct: pct(p.refused, p.turns),
            rateLimited: p.rateLimited,
            budgetExceeded: p.budgetExceeded,
            piiBlocked: p.piiBlocked,
            toolCalls: p.toolCalls,
            toolCallsPerTurn: p.turns ? Math.round((p.toolCalls / p.turns) * 10) / 10 : 0,
            promptTokens: p.promptTokens,
            completionTokens: p.completionTokens,
            costUsd: p.costUsd,
            latencyAvgMs: Math.round(p.latencyAvg || 0),
            latencyP50Ms: Math.round(percentiles[0] || 0),
            latencyP95Ms: Math.round(percentiles[1] || 0),
            latencyMaxMs: p.latencyMax || 0,
          }
        : null,
      byTool: (result.byTool || []).map((t) => ({ tool: t._id, calls: t.calls, failed: t.failed, avgMs: Math.round(t.avgMs || 0), maxMs: t.maxMs })),
      daily: (result.daily || []).map((d) => ({ date: d._id, turns: d.turns, errors: d.errors, costUsd: d.costUsd })),
      recentErrors: result.recentErrors || [],
    });
  } catch (err) {
    console.error("owner ai health error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
