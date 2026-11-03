import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Employee from "@/models/Employee";
import { NAME_COLLATION } from "@/lib/sortOptions";
import { requireAuth } from "@/lib/apiGuard";

export async function GET() {
  const { session, error: authError } = await requireAuth();
  if (authError) return authError;

  try {
    await dbConnect();
    const employees = await Employee.find({ role: "Hr", isactive: true })
      .select("_id name")
      .sort({ name: 1 })
      .collation(NAME_COLLATION)
      .lean();
    return NextResponse.json({ success: true, employees });
  } catch (err) {
    console.error("HR employees list error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
