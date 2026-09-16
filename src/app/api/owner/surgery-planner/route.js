
import { NextResponse } from "next/server";
import { getISTStartOfDay, getISTEndOfDay } from "@/lib/dateHelpers";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Patient from "@/models/Patient";
import "@/models/Employee";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["super-admin", "owner"].includes(session?.user?.role)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    await connectDB();

    const { branch = "All", from, to } = await req.json();
    if (!from || !to) {
      return NextResponse.json({ success: false, message: "from and to are required" }, { status: 400 });
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const branchFilter = branch === "All" ? {} : { "personal.branch": branch };

    const surgeries = await Patient.find({
      ...branchFilter,
      "surgery.surgeryDate": { $gte: fromDate, $lte: toDate },
    })
      .select("personal.name personal.phone personal.branch surgery")
      .populate("surgery.doctor", "name")
      .populate("surgery.seniorTech", "name")
      .populate("surgery.implanterRight", "name")
      .populate("surgery.implanterLeft", "name")
      .populate("surgery.graftingPerson", "name")
      .populate("surgery.helper", "name")
      .sort({ "surgery.surgeryDate": 1 })
      .lean();

    // "Today" for OT capacity is the IST calendar day, not the server's.
    const todayStart = getISTStartOfDay();
    const todayEnd = getISTEndOfDay();

    const capacityAgg = await Patient.aggregate([
      { $match: { ...branchFilter, "surgery.surgeryDate": { $gte: todayStart, $lte: todayEnd } } },
      { $group: { _id: "$surgery.OT", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    return NextResponse.json({
      success: true,
      surgeries: surgeries.map((p) => ({
        id: String(p._id),
        name: p.personal?.name || "Unknown",
        phone: p.personal?.phone || "",
        branch: p.personal?.branch || "",
        surgeryDate: p.surgery?.surgeryDate,
        OT: p.surgery?.OT ?? null,
        technique: p.surgery?.technique || "",
        graftsneed: p.surgery?.graftsneed ?? null,
        graftsImplanted: p.surgery?.graftsImplanted ?? null,
        doctor: (p.surgery?.doctor || []).map((d) => d.name).filter(Boolean).join(", "),
        seniorTech: (p.surgery?.seniorTech || []).map((d) => d.name).filter(Boolean).join(", "),
        implanterRight: (p.surgery?.implanterRight || []).map((d) => d.name).filter(Boolean).join(", "),
        implanterLeft: (p.surgery?.implanterLeft || []).map((d) => d.name).filter(Boolean).join(", "),
      })),
      todayOTCapacity: capacityAgg.map((r) => ({ OT: r._id ?? "Unassigned", count: r.count })),
    });
  } catch (err) {
    console.error("owner surgery-planner error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
