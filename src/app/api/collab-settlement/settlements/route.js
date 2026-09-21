import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import CollabSettlement from "@/models/CollabSettlement";
import { COLLAB_BRANCHES } from "@/lib/branches";
import { cacheKey, cached } from "@/lib/cache";

const ALLOWED_ROLES = ["collab", "admin", "super-admin"];

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const clinic = searchParams.get("clinic") || "";
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";

    const query = { clinic: { $in: COLLAB_BRANCHES } };
    if (clinic) {
      if (!COLLAB_BRANCHES.includes(clinic)) {
        return NextResponse.json({ error: "Invalid clinic" }, { status: 400 });
      }
      query.clinic = clinic;
    }
    if (dateFrom || dateTo) {
      query.date = {};
      if (dateFrom) {
        const from = new Date(dateFrom);
        from.setHours(0, 0, 0, 0);
        query.date.$gte = from;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        query.date.$lte = to;
      }
    }

    const meta = {};
    const key = cacheKey("finance", { route: "collab-settlements", clinic, dateFrom, dateTo, page, limit }, session);
    const { settlements, total } = await cached(key, 30, async () => {
      const [settlements, total] = await Promise.all([
        CollabSettlement.find(query)
          .sort({ date: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        CollabSettlement.countDocuments(query),
      ]);
      return { settlements, total };
    }, meta);

    const res = NextResponse.json({ success: true, settlements, total, page, limit });
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (error) {
    console.error("Error listing collab settlements:", error);
    return NextResponse.json({ error: "Failed to fetch settlements" }, { status: 500 });
  }
}
