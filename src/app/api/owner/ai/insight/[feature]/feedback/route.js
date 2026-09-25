import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import AiInsight from "@/models/AiInsight";
import { fingerprint } from "@/lib/ai/fingerprint";

// POST /api/owner/ai/insight/[feature]/feedback — Body: { kind, scope, vote }.
// Thumbs up/down on a cached insight. scope must match exactly what the
// insight was generated for (same whitelisted params), so this re-derives
// the same scopeKey the engine used rather than trusting a key from the client.

const ALLOWED_ROLES = ["owner", "super-admin"];

export async function POST(req, { params }) {
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
  const { kind, scope, vote } = body || {};
  if (!kind || !["up", "down"].includes(vote)) {
    return NextResponse.json({ success: false, message: "kind and vote (up|down) are required" }, { status: 400 });
  }

  await dbConnect();
  const scopeKey = fingerprint(scope || {});
  const key = `${feature}|${kind}|${scopeKey}`;
  const inc = vote === "up" ? { "feedback.up": 1 } : { "feedback.down": 1 };
  const updated = await AiInsight.findOneAndUpdate(
    { key },
    { $inc: inc, $set: { "feedback.lastBy": session.user.email } },
    { new: true },
  ).lean();

  if (!updated) return NextResponse.json({ success: false, message: "No matching insight to vote on" }, { status: 404 });
  return NextResponse.json({ success: true, feedback: updated.feedback });
}
