import { NextResponse } from "next/server";
import { fetchCallby } from "@/lib/callby";
import { withCallbyRoute } from "@/lib/owner/callbyRoute";

// "Create Lead" action on /owner/calls/untracked — reuses callby's existing
// POST /api/leads/from-call (src/lib/leadFromCall.js) rather than a new
// endpoint. assignedTo is pinned to the call's own employee so the lead lands
// with the agent who made the call, not the owner-panel's service account.
export const POST = withCallbyRoute(async (req) => {
  const { callId, name, phone, employeeId } = await req.json();
  if (!callId || !phone) {
    return NextResponse.json({ success: false, message: "callId and phone are required" }, { status: 400 });
  }

  const result = await fetchCallby("/api/leads/from-call", {
    method: "POST",
    body: {
      callId,
      name: name || phone,
      phone,
      source: "Call",
      status: "new",
      assignedTo: employeeId || undefined,
    },
  });

  return NextResponse.json({ success: true, lead: result?.data || null });
});
