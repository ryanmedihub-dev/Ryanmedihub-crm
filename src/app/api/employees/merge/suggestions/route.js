import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import { findSuggestions } from "@/lib/employees/mergeEngine";

const ALLOWED_ROLES = ["admin", "super-admin"];

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();
    const pairs = await findSuggestions();
    return NextResponse.json({ success: true, pairs });
  } catch (error) {
    console.error("Merge suggestions error:", error);
    return NextResponse.json({ error: "Failed to load suggestions" }, { status: 500 });
  }
}
