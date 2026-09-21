import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import Employee from "@/models/Employee";
import { loadLinkedPatients } from "@/lib/owner/employeeDetailQuery";
import { cacheKey, cached } from "@/lib/cache";

const ALLOWED_ROLES = ["owner", "super-admin"];

// Separate from the main /api/owner/employees/[id] route deliberately — this is a distinct,
// independently-paginated section (see loadLinkedPatients's header comment for why it's not
// folded into the role-specific rows that route already returns).
export async function GET(req, { params }) {
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    if (!session || !ALLOWED_ROLES.includes(session?.user?.role)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Employee not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);

    const meta = {};
    const key = cacheKey("owner", { route: "employees-linked-patients", id, ...Object.fromEntries(searchParams) }, session);
    const data = await cached(key, 120, async () => {
      const employee = await Employee.findOne({ _id: id, mergedInto: null }).select("patient").lean();
      if (!employee) return null;
      const detail = await loadLinkedPatients(employee, { searchParams });
      return { success: true, ...detail };
    }, meta);

    if (!data) {
      return NextResponse.json({ success: false, message: "Employee not found" }, { status: 404 });
    }

    const res = NextResponse.json(data);
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (error) {
    console.error("owner employee linked-patients error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
