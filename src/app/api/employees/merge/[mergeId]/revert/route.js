import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import { runRevert } from "@/lib/employees/mergeEngine";

const ALLOWED_ROLES = ["admin", "super-admin"];

export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();
    const { mergeId } = await params;

    const { status, body } = await runRevert({
      mergeId,
      actor: { name: session.user.name, email: session.user.email },
    });
    return NextResponse.json(body, { status });
  } catch (error) {
    console.error("Employee merge revert error:", error);
    return NextResponse.json({ success: false, error: error.message || "Revert failed" }, { status: 500 });
  }
}
