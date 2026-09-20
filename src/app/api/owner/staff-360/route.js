
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Employee from "@/models/Employee";
import { cacheKey, cached } from "@/lib/cache";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["super-admin", "owner"].includes(session?.user?.role)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    await connectDB();

    const { searchParams } = new URL(req.url);
    const branch = searchParams.get("branch") || "All";

    const meta = {};
    const key = cacheKey("owner", { route: "staff-360", branch }, session);
    const data = await cached(key, 120, async () => {
      const branchFilter = branch === "All" ? {} : { branch };

      const employees = await Employee.find(branchFilter)
        .select("name role branch isactive incentiveRate salaryStructure.baseSalary patient")
        .sort({ name: 1 })
        .lean();

      return {
        success: true,
        employees: employees.map((e) => ({
          id: String(e._id),
          name: e.name,
          role: e.role,
          branch: e.branch,
          isactive: e.isactive,
          incentiveRate: e.incentiveRate || 0,
          baseSalary: e.salaryStructure?.baseSalary || 0,
          patientsHandled: Array.isArray(e.patient) ? e.patient.length : 0,
        })),
      };
    }, meta);

    const res = NextResponse.json(data);
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (err) {
    console.error("owner staff-360 error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
