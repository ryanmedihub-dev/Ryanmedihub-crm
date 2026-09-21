import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Employee from "@/models/Employee";
import { NAME_COLLATION } from "@/lib/sortOptions";
import { cacheKey, cached } from "@/lib/cache";

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const role = searchParams.get("role") || "";
    const isactive = searchParams.get("isactive");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "30")));

    const query = { mergedInto: null }; // hide records merged away as duplicates
    // Role is free-form text stored in mixed case — match it case-insensitively.
    if (role) query.role = new RegExp(`^${role.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    if (isactive === "true") query.isactive = true;
    if (isactive === "false") query.isactive = false;
    if (search) {
      const searchRegex = { $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
      query.$or = [
        { name: searchRegex },
        { phone: searchRegex },
        { email: searchRegex },
        { employeeId: searchRegex },
      ];
    }

    const meta = {};
    const key = cacheKey("employees", { search, role, isactive, page, limit }, session);
    const { employees, total } = await cached(key, 30, async () => {
      const [employees, total] = await Promise.all([
        Employee.find(query)
          .select("name phone email employeeId role isactive salaryStructure incentiveRate")
          .sort({ name: 1 })
          .collation(NAME_COLLATION)
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        Employee.countDocuments(query),
      ]);
      return { employees, total };
    }, meta);

    const res = NextResponse.json({ success: true, employees, total, page, limit });
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (error) {
    console.error("Error listing employees:", error);
    return NextResponse.json({ error: "Failed to fetch employees" }, { status: 500 });
  }
}
