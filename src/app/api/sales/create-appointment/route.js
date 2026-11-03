import Patient from "@/models/Patient";
import { withDB } from "@/lib/withDB";
import { NextResponse } from "next/server";
import { cacheInvalidate } from "@/lib/cache";
import { requireSession } from "@/lib/apiGuard";
import { normalizePhone } from "@/lib/phone";

const ALLOWED_ROLES = ["super-admin", "admin", "sales", "reception", "collab", "counsellor", "owner"];

const handler = async (req) => {
  if (req.method !== "POST") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { session, error: authError } = await requireSession(ALLOWED_ROLES);
  if (authError) return authError;

  try {
    const data = await req.json();

    if (!data.personal || !data.personal.name?.trim() || !data.personal.phone?.trim()) {
      return NextResponse.json(
        { success: false, error: "Patient name and phone are required" },
        { status: 400 }
      );
    }

    const isPrivileged = ["super-admin", "admin", "owner"].includes(session.user.role);
    if (!isPrivileged && session.user.branch && session.user.branch !== "All") {
      data.personal.branch = session.user.branch;
    }

    const phoneNormalized = normalizePhone(data.personal.phone);
    if (phoneNormalized) {
      data.personal.phoneNormalized = phoneNormalized;
    }

    const patient = new Patient({
      personal: data.personal,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await patient.save();

    await cacheInvalidate("patients", "owner");
    return NextResponse.json({
      success: true,
      message: "Appointment booked successfully",
      data: patient,
    });
  } catch (error) {
    console.error("Error creating appointment:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to book appointment",
      },
      { status: 500 }
    );
  }
};

export const POST = withDB(handler);