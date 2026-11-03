import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import ImportLog from "@/models/ImportLog";

const ALLOWED_ROLES = ["super-admin", "owner"];

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !ALLOWED_ROLES.includes(session.user?.role)) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Super Admin access required." },
        { status: 403 }
      );
    }

    await dbConnect();

    const { searchParams } = new URL(req.url);
    const importId = searchParams.get("importId");

    if (importId) {
      const log = await ImportLog.findOne({ importId }).lean();
      if (!log) {
        return NextResponse.json({ success: false, message: "Log not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, log });
    }

    const logs = await ImportLog.find(
      {},
      { records: { $slice: 10 } } // return first 10 sample records to keep payload small
    )
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return NextResponse.json({ success: true, logs });
  } catch (err) {
    console.error("Fetch import logs error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
