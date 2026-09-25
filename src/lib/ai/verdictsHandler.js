import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import { runInsight } from "@/lib/ai/engine";
import { AI_VERDICT_MAX_ROWS } from "@/lib/ai/config";

// Shared body behind /api/owner/ai/verdicts/[feature] (maxDuration 60) and
// /api/owner/ai/verdicts-long/[feature] (maxDuration 300) — see sseHandler.js
// for why this can't just be one file with two exported maxDurations.
//
// Body: { scope } — the same filters + page/pageSize/sort the table is
// currently showing, so the AI rates exactly the visible rows. The client
// never sends row data; the server recomputes from `scope` via the feature's
// own collect().

const ALLOWED_ROLES = ["owner", "super-admin"];

export async function handleVerdictsPOST(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
  }

  const { feature } = await params;
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON" }, { status: 400 });
  }
  const rawScope = { ...(body?.scope || {}) };
  const pageSize = parseInt(rawScope.pageSize, 10);
  rawScope.pageSize = Number.isFinite(pageSize) ? Math.min(pageSize, AI_VERDICT_MAX_ROWS) : AI_VERDICT_MAX_ROWS;

  await dbConnect();

  let result = { status: "error" };
  const emit = (event) => {
    if (event.type === "status") result = { status: event.status };
    else if (event.type === "error") result = { status: event.code, message: event.message };
    else if (event.type === "done") result = event;
  };

  await runInsight({ featureKey: feature, kind: "verdicts", rawScope, session, emit, signal: req.signal });

  if (result.type !== "done") {
    return NextResponse.json({ success: false, status: result.status, message: result.message || "AI verdicts unavailable" });
  }

  const byId = {};
  const aliasToEntity = result.entities || {};
  for (const row of result.output?.rows || []) {
    const entity = aliasToEntity[row.alias];
    if (!entity) continue;
    byId[entity.id] = { verdict: row.verdict, score: row.score, oneLiner: row.oneLiner, tags: row.tags };
  }

  return NextResponse.json({
    success: true,
    cached: !!result.cached,
    generatedAt: result.generatedAt || result.meta?.generatedAt,
    byId,
    cohortNote: result.output?.cohortNote || "",
    meta: result.meta || null,
    status: result.status || "ok",
  });
}
