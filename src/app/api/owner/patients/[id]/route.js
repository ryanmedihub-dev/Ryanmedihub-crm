import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Patient from "@/models/Patient";
import "@/models/Employee";
import "@/models/Stock";
import "@/models/Transactions";
import { PATIENT_STATUS_LABELS, PATIENT_STATUS_EXPLANATION } from "@/lib/owner/patientStatus";

// Moved from /api/owner/patient-journey/[id] (Owner Panel v2, Part 3) — same
// query (it already populated everything the Patients detail page needs), plus
// a statusExplanation string so "what does this status mean" is answered
// on the page itself, not left to be looked up in code.
export async function GET(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["super-admin", "owner"].includes(session?.user?.role)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    await connectDB();

    const { id } = await params;

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

    if (!patient) {
      return NextResponse.json({ success: false, message: "Patient not found" }, { status: 404 });
    }

    const status = patient.ops?.status;

    return NextResponse.json({
      success: true,
      patient,
      statusLabel: PATIENT_STATUS_LABELS[status] || status,
      statusExplanation: PATIENT_STATUS_EXPLANATION[status] || null,
    });
  } catch (err) {
    console.error("owner patient detail error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
