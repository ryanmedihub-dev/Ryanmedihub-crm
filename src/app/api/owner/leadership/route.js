
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { fetchCallby, CallbyError } from "@/lib/callby";
import { cacheKey, cached } from "@/lib/cache";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["super-admin", "owner"].includes(session?.user?.role)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const meta = {};
    const key = cacheKey("owner", { route: "leadership" }, session);
    const data = await cached(key, 120, async () => {
      const result = await fetchCallby("/api/leads/workforce-summary");
      const teamTotals = result.data?.teamTotals || [];

      const tlRows = teamTotals
        .map((t) => ({
          tlName: t.tlName,
          agentCount: t.agentCount,
          totalCalls: t.calls?.total || 0,
          connected: t.calls?.connected || 0,
          connectRate: Math.round((t.calls?.connectRate || 0) * 100),
          leadsAssigned: t.leads?.assigned || 0,
          converted: t.leads?.byStatus?.converted || 0,
        }))
        .sort((a, b) => b.connectRate - a.connectRate || b.totalCalls - a.totalCalls);

      return { success: true, tlRows };
    }, meta);

    const res = NextResponse.json(data);
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (err) {
    if (err instanceof CallbyError) {
      console.error("leadership callby error:", err.message);
      return NextResponse.json({ success: false, message: err.message }, { status: err.status === 500 ? 500 : 502 });
    }
    console.error("leadership error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
