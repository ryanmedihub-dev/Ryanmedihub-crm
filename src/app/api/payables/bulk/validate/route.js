import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import { runValidatePipeline, MAX_ROWS } from "@/lib/uploads/validatePipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ALLOWED_ROLES = ["admin", "super-admin"];

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const rows = Array.isArray(body.rows) ? body.rows : null;
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "No rows to validate." }, { status: 400 });
    }
    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `Max ${MAX_ROWS} rows per upload. Split the file.` },
        { status: 400 },
      );
    }

    await connectDB();
    const { summary, results } = await runValidatePipeline(rows);

    return NextResponse.json({ summary, results });
  } catch (error) {
    console.error("bulk payable validate failed:", error);
    return NextResponse.json({ error: "Validation failed" }, { status: 500 });
  }
}
