import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { CallbyError } from "@/lib/callby";
import { toISTDateKey } from "@/lib/owner/dates";

const ALLOWED_ROLES = ["owner", "super-admin"];

export function withCallbyRoute(fn) {
  return async (req, ctx) => {
    try {
      const session = await getServerSession(authOptions);
      if (!session || !ALLOWED_ROLES.includes(session?.user?.role)) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
      }
      return await fn(req, session, ctx);
    } catch (err) {
      if (err instanceof CallbyError) {
        return NextResponse.json(
          { success: false, message: err.message },
          { status: err.status && err.status !== 500 ? err.status : 502 },
        );
      }
      console.error("owner callby route error:", err);
      return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
  };
}

export function toCallDateParams(dateFrom, dateTo) {
  const params = {};
  if (dateFrom) params.startDate = toISTDateKey(dateFrom);
  if (dateTo) params.endDate = toISTDateKey(dateTo);
  return params;
}

export function toLeadDateParams(dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return {};
  return {
    range: "custom",
    startDate: toISTDateKey(dateFrom || dateTo),
    endDate: toISTDateKey(dateTo || dateFrom),
  };
}
