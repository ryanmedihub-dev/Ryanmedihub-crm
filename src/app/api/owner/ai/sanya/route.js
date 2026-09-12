import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import { runSanyaTurn } from "@/lib/sanya/engine";
import { OPENAI_TOOL_DEFS } from "@/lib/sanya/tools";
import { SANYA_MODEL, SANYA_MONTHLY_BUDGET_USD, SANYA_RATE_LIMIT } from "@/lib/sanya/config";

// Sanya — the Owner-panel assistant (Owner Panel v2, Part 6 / Step 4).
//
// POST { messages: [{role:"user"|"assistant", content}] } → a newline-delimited
// JSON event stream (Content-Type: application/x-ndjson):
//   {type:"tool",  name, args, verifyAt, ms, ok}   a tool the model called, as it runs
//   {type:"delta", text}                            answer text as it streams
//   {type:"done",  verify:[{label,href}], usage, refused}
//   {type:"error", message, code}
// Owner/super-admin only; the engine enforces the per-user rate limit and the
// monthly cost ceiling and logs every turn to SanyaUsage (see /owner/ai/health).
// The model only ever sees aggregates returned by the fixed tool set in
// src/lib/sanya/tools.js — never the database, never a name or phone.

const ALLOWED_ROLES = ["owner", "super-admin"];
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body?.messages) || !body.messages.length) {
    return NextResponse.json({ success: false, message: "messages[] is required" }, { status: 400 });
  }

  await dbConnect();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          /* client went away */
        }
      };
      await runSanyaTurn({
        user: { email: session.user.email, role: session.user.role },
        messages: body.messages,
        emit,
        signal: req.signal,
      });
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

// GET — what the assistant can do (tool catalogue + limits), for the page header.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
  }
  return NextResponse.json({
    success: true,
    model: SANYA_MODEL,
    monthlyBudgetUsd: SANYA_MONTHLY_BUDGET_USD,
    rateLimit: SANYA_RATE_LIMIT,
    tools: OPENAI_TOOL_DEFS.map((t) => ({ name: t.function.name, description: t.function.description })),
  });
}
