import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import { runMerge } from "@/lib/employees/mergeEngine";
import { cacheInvalidate } from "@/lib/cache";

// A merge repoints the finance ledger — tighter than the delete route, NOT looser: hr is out.
const ALLOWED_ROLES = ["admin", "super-admin"];

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();

    const { survivorId, duplicateId, fieldChoices, conflictResolutions, confirmToken, note } = await request.json();
    if (!survivorId || !duplicateId) {
      return NextResponse.json({ success: false, error: "survivorId and duplicateId are required" }, { status: 400 });
    }

    const { status, body } = await runMerge({
      survivorId,
      duplicateId,
      fieldChoices: fieldChoices || {},
      conflictResolutions: conflictResolutions || {},
      confirmToken,
      note,
      actor: { name: session.user.name, email: session.user.email },
    });
    if (status < 400) await cacheInvalidate("employees", "owner");
    return NextResponse.json(body, { status });
  } catch (error) {
    console.error("Employee merge error:", error);
    return NextResponse.json({ success: false, error: error.message || "Merge failed" }, { status: 500 });
  }
}
