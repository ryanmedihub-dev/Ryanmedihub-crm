import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import { buildPreview } from "@/lib/employees/mergeEngine";

const ALLOWED_ROLES = ["admin", "super-admin"];

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const survivorId = searchParams.get("survivorId") || "";
    const duplicateId = searchParams.get("duplicateId") || "";
    if (!survivorId || !duplicateId) {
      return NextResponse.json({ error: "survivorId and duplicateId are required" }, { status: 400 });
    }

    const preview = await buildPreview({ survivorId, duplicateId });
    return NextResponse.json(preview, { status: preview.success ? 200 : 400 });
  } catch (error) {
    console.error("Merge preview error:", error);
    return NextResponse.json({ error: "Failed to build merge preview" }, { status: 500 });
  }
}
