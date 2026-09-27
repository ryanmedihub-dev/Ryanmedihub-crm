import { NextResponse } from "next/server";
import { fetchCallby } from "@/lib/callby";
import { withCallbyRoute } from "@/lib/owner/callbyRoute";

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
