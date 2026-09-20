import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import Interviewer from "@/models/Interviewer";
import { parseEmployeeFilters, parsePageParams } from "@/lib/owner/pagination";
import { cacheKey, cached } from "@/lib/cache";

const ALLOWED_ROLES = ["owner", "super-admin"];
const PRESET_STATUS = { selected: "Selected", rejected: "Rejected" };

const SORT_FIELD_MAP = {
  date: "date",
  name: "name",
  position: "position",
  expectedSalary: "expectedSalary",
  finalSalary: "finalSalary",
};

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Backs /owner/hr/selected and /owner/hr/rejected — one route, one shared
// client component (InterviewStatusReportPage), a `preset` param picks the
// status filter. Same pattern as Part 2's /api/owner/leads/by-status.
export async function GET(req) {
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    if (!session || !ALLOWED_ROLES.includes(session?.user?.role)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const preset = searchParams.get("preset");
    const status = PRESET_STATUS[preset];
    if (!status) {
      return NextResponse.json({ success: false, message: `Unknown preset: ${preset}` }, { status: 400 });
    }

    const { dateFrom, dateTo, search, sortBy, sortDir } = parseEmployeeFilters(searchParams);
    const { page, pageSize, skip, limit } = parsePageParams(searchParams);

    const meta = {};
    const key = cacheKey("owner", { route: "hr-by-status", ...Object.fromEntries(searchParams) }, session);
    const data = await cached(key, 180, async () => {
      const match = { status };
      if (dateFrom || dateTo) {
        match.date = {};
        if (dateFrom) match.date.$gte = new Date(dateFrom);
        if (dateTo) match.date.$lte = new Date(dateTo);
      }
      if (search) {
        const re = new RegExp(escapeRegex(search), "i");
        match.$or = [{ name: re }, { phone: re }, { position: re }];
      }

      const sortField = SORT_FIELD_MAP[sortBy] || "date";
      const sortDirNum = sortDir === "asc" ? 1 : -1;

      const facet = {
        rows: [
          { $sort: { [sortField]: sortDirNum, _id: 1 } },
          { $skip: skip },
          { $limit: limit },
        ],
        totals: [{ $group: { _id: null, count: { $sum: 1 } } }],
      };
      if (preset === "rejected") {
        facet.byPosition = [
          { $group: { _id: "$position", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ];
      }

      const [result] = await Interviewer.aggregate([{ $match: match }, { $facet: facet }]);
      let rows = result.rows || [];

      // Populate assignedHr (name only) on the page slice only.
      if (rows.length) {
        rows = await Interviewer.populate(rows, { path: "assignedHr", select: "name" });
      }

      return {
        success: true,
        rows: rows.map((r) => ({ ...r, id: String(r._id) })),
        total: result.totals?.[0]?.count || 0,
        page,
        pageSize,
        byPosition: preset === "rejected" ? (result.byPosition || []).map((p) => ({ position: p._id || "Unspecified", count: p.count })) : null,
      };
    }, meta);

    const res = NextResponse.json(data);
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (err) {
    console.error("owner hr by-status error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
