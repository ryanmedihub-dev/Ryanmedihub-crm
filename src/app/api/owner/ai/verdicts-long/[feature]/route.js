import { handleVerdictsPOST } from "@/lib/ai/verdictsHandler";

// Same contract as /api/owner/ai/verdicts/[feature] — see insight-long's
// route file for why this has to be a separate file.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = handleVerdictsPOST;
