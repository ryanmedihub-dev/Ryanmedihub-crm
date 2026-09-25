import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import { runInsight } from "@/lib/ai/engine";

// Shared body behind both /api/owner/ai/insight/[feature] (maxDuration 60)
// and /api/owner/ai/insight-long/[feature] (maxDuration 300, for the handful
// of features backed by a slow source route — see featureMeta.js) — same
// SSE contract either way, only the route's own maxDuration differs, and
// that has to be a static per-file export, so it can't be the shared part.
//
// GET ?kind=brief&force=1&...scope — Server-Sent Events. Each event:
// `data: ${JSON.stringify(evt)}\n\n`, types: status | stage | delta | done |
// error. A `: ping` comment every 10s keeps proxies from closing the
// connection early. Aborts the engine on client disconnect.

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
          /* client went away */
        }
      };
      pingTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          /* client went away */
        }
      }, 10_000);

      await runInsight({ featureKey: feature, kind, rawScope, session, force, emit, signal: req.signal });

      clearInterval(pingTimer);
      try {
        controller.close();
      } catch {
        /* already closed */
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
