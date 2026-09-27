import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import { runInsight } from "@/lib/ai/engine";

const ALLOWED_ROLES = ["owner", "super-admin"];

export async function handleInsightSSE(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
  }

  const { feature } = await params;
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind") || "brief";
  const force = searchParams.get("force") === "1";
  const rawScope = {};
  for (const [k, v] of searchParams.entries()) {
    if (k === "kind" || k === "force") continue;
    rawScope[k] = v;
  }

  await dbConnect();

  const encoder = new TextEncoder();
  let pingTimer;
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          
        }
      };
      pingTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          
        }
      }, 10_000);

      await runInsight({ featureKey: feature, kind, rawScope, session, force, emit, signal: req.signal });

      clearInterval(pingTimer);
      try {
        controller.close();
      } catch {
        
      }
    },
    cancel() {
      clearInterval(pingTimer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
