import { handleInsightSSE } from "@/lib/ai/sseHandler";

// Same SSE contract as /api/owner/ai/insight/[feature] — only exists because
// maxDuration must be a static export per route file. Used by features
// backed by a slow source route (see src/lib/ai/client/featureMeta.js).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = handleInsightSSE;
