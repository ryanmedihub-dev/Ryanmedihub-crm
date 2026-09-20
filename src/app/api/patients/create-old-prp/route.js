import Patient from "@/models/Patient";
import { withDB } from "@/lib/withDB";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { cacheInvalidate } from "@/lib/cache";

const FALLBACK_DATE = new Date("2025-01-01T00:00:00.000Z");

const handler = async (req) => {
  const session = await getServerSession(authOptions);
  const rawUserBranch = session?.user?.branch || null;
  const userBranch = rawUserBranch === "Collab" ? null : rawUserBranch;

  const body = await req.json();
  const { personal, surgery, afterSurgery, payments } = body;

  if (!personal?.phone?.trim() || !personal?.name?.trim()) {
    return NextResponse.json(
      { success: false, error: "Patient name and phone are required" },
      { status: 400 }
    );
  }

  const existing = await Patient.findOne({ "personal.phone": personal.phone.trim() });
  if (existing) {
    return NextResponse.json(
      { success: false, error: "A patient with this phone number already exists" },
      { status: 409 }
    );
  }

  try {
    const newPatient = new Patient({
      personal: {
        name: personal.name.trim(),
        phone: personal.phone.trim(),
        age: personal.age || null,
        gender: personal.gender || "MALE",
        branch: personal.branch || userBranch || "",
        visitDate: surgery?.surgeryDate ? new Date(surgery.surgeryDate) : FALLBACK_DATE,
      },
      surgery: {
        surgeryDate: surgery?.surgeryDate ? new Date(surgery.surgeryDate) : FALLBACK_DATE,
        technique: surgery?.technique || "",
        graftsneed: surgery?.graftsneed || 0,
        graftsImplanted: surgery?.graftsImplanted || 0,
        location: personal.branch || userBranch || "",
      },
      afterSurgery: {
        prp: (afterSurgery?.prp || []).map((s, i) => ({
          prpNumber: s.prpNumber || i + 1,
          date: s.date ? new Date(s.date) : null,
          type: s.type || "PRP",
        })),
      },
      payments: {
        totalAmount: payments?.totalAmount || 0,
        amountReceived: payments?.amountReceived || 0,
        pendingAmount: payments?.pendingAmount || 0,
      },
      ops: { status: "CLOSED" },
      editors: [],
    });

    const saved = await newPatient.save();

    const createdAt = surgery?.surgeryDate ? new Date(surgery.surgeryDate) : FALLBACK_DATE;
    await Patient.collection.updateOne(
      { _id: saved._id },
      { $set: { createdAt, updatedAt: createdAt } }
    );

    await cacheInvalidate("finance", "owner", "patients");
    return NextResponse.json(
      { success: true, message: "Old PRP patient added successfully", patientId: saved._id },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating old PRP patient:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
};

export const POST = withDB(handler);
