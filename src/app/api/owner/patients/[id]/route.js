import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Patient from "@/models/Patient";
import "@/models/Employee";
import "@/models/Stock";
import "@/models/Transactions";
import { PATIENT_STATUS_LABELS, PATIENT_STATUS_EXPLANATION } from "@/lib/owner/patientStatus";
import { cacheKey, cached } from "@/lib/cache";

export async function GET(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["super-admin", "owner"].includes(session?.user?.role)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    await connectDB();

    const { id } = await params;

    const meta = {};
    const key = cacheKey("owner", { route: "patients-detail", id }, session);
    const data = await cached(key, 60, async () => {
      const patient = await Patient.findById(id)
        .populate("personal.reference", "name role")
        .populate("counselling.counsellor", "name role")
        .populate("surgery.doctor", "name role")
        .populate("surgery.seniorTech", "name role")
        .populate("surgery.implanterRight", "name role")
        .populate("surgery.implanterLeft", "name role")
        .populate("surgery.graftingPerson", "name role")
        .populate("surgery.helper", "name role")
        .populate("products.stocks", "name unit")
        .populate({
          path: "payments.transactions",
          select: "date amount method procedure costType transactionCategory",
          options: { sort: { date: -1 }, limit: 20 },
        })
        .lean();

      if (!patient) return null;

      const status = patient.ops?.status;
      return {
        success: true,
        patient,
        statusLabel: PATIENT_STATUS_LABELS[status] || status,
        statusExplanation: PATIENT_STATUS_EXPLANATION[status] || null,
      };
    }, meta);

    if (!data) {
      return NextResponse.json({ success: false, message: "Patient not found" }, { status: 404 });
    }

    const res = NextResponse.json(data);
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (err) {
    console.error("owner patient detail error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
