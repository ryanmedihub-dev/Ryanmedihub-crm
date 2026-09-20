import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { withDB } from "@/lib/withDB";
import { getPatientsByStatus } from "@/lib/owner/metrics/patients";
import { parseEmployeeFilters } from "@/lib/owner/pagination";
import { cacheKey, cached } from "@/lib/cache";

const ALLOWED_ROLES = ["owner", "super-admin"];

// /owner/patients section landing — total patients, status funnel, revenue,
// conversion rate, branch split, daily trend. The numbers come from
// src/lib/owner/metrics/patients.js, shared with Sanya's tools.
const getHandler = async (req) => {
  const session = await getServerSession(authOptions);
  if (!session || !ALLOWED_ROLES.includes(session?.user?.role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const { dateFrom, dateTo, branch } = parseEmployeeFilters(searchParams);

  const meta = {};
  const key = cacheKey("owner", { route: "patients-overview", ...Object.fromEntries(searchParams) }, session);
  const data = await cached(key, 60, async () => {
    const stats = await getPatientsByStatus({ dateFrom, dateTo, branch });
    return { success: true, ...stats };
  }, meta);

  const res = NextResponse.json(data);
  res.headers.set("X-Cache", meta.status);
  return res;
};

export const GET = withDB(getHandler);
