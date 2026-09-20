import Patient from "@/models/Patient";
import { withDB } from "@/lib/withDB";
import { NextResponse } from "next/server";
import { cacheInvalidate } from "@/lib/cache";

const handler = async (req) => {
  if (req.method !== 'POST') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const data = await req.json();

    const patient = new Patient({
      personal: data.personal,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await patient.save();

    await cacheInvalidate("patients", "owner");
    return NextResponse.json({
      success: true,
      message: "Appointment booked successfully",
      data: patient
    });
  } catch (error) {
    console.error("Error creating appointment:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to book appointment"
      },
      { status: 500 }
    );
  }
};

export const POST = withDB(handler);