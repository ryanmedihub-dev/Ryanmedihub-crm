import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import mongoose from "mongoose";
import connectDB from "@/lib/db";
import { fetchOpenReceivablesForPatient } from "@/lib/receivableAllocation";
import { cacheKey, cached } from "@/lib/cache";

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get("patientId") || "";
    if (!patientId || !mongoose.Types.ObjectId.isValid(patientId)) {
      return NextResponse.json({ success: true, receivables: [] });
    }

    const meta = {};
    const key = cacheKey("finance", { route: "receivables-open", patientId }, session);
    const data = await cached(key, 45, async () => {
      const receivables = await fetchOpenReceivablesForPatient(patientId, null);
      return {
        success: true,
        receivables: receivables.map((r) => ({
          _id: r._id,
          purpose: r.purpose,
          totalAmount: r.totalAmount,
          received: r.received,
          pending: r.pending,
          dueDate: r.dueDate || null,
          status: r.status,
        })),
      };
    }, meta);
    const res = NextResponse.json(data);
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (error) {
    console.error("Error fetching open receivables:", error);
    return NextResponse.json({ error: "Failed to fetch open receivables" }, { status: 500 });
  }
}
