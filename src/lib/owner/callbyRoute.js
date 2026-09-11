import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { CallbyError } from "@/lib/callby";

const ALLOWED_ROLES = ["owner", "super-admin"];

// Shared shell for every Owner Panel v2 Calls/Leads route (Part 2) — all of
// them are "check the session, ask callby something, map its errors" with
// nothing else in common worth re-typing ~10 times. A CallbyError becomes a
// real status + message (never a generic "Network error"); anything else is
// a 500 with the details logged server-side, not leaked to the client.
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

/** {dateFrom, dateTo} (ISO) -> callby's date-only `startDate`/`endDate` for GET /api/calls. */
export function toCallDateParams(dateFrom, dateTo) {
  const params = {};
  if (dateFrom) params.startDate = dateFrom.slice(0, 10);
  if (dateTo) params.endDate = dateTo.slice(0, 10);
  return params;
}

/**
 * {dateFrom, dateTo} (ISO) -> callby's `range=custom&startDate&endDate` for
 * GET /api/leads and /api/reports/leads-periodic — those routes only apply a
 * date filter when `range` is present, so startDate/endDate alone is a no-op.
 */
export function toLeadDateParams(dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return {};
  return {
    range: "custom",
    startDate: (dateFrom || dateTo).slice(0, 10),
    endDate: (dateTo || dateFrom).slice(0, 10),
  };
}
