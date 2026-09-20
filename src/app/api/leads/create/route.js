import { NextResponse } from "next/server";
import { withDB } from "@/lib/withDB";
import Leads from "@/models/Leads";
import { cacheInvalidate } from "@/lib/cache";

const handler = async (req) => {
  const { name, phone, email, location, visitPlan, visitDate, remarks, tag } =
    await req.json();

  if (!name || !phone) {
    return NextResponse.json(
      { success: false, message: "Name and phone are required" },
      { status: 400 }
    );
  }

  const newLead = new Leads({
    name,
    phone,
    email,
    location,
    visitPlan,
    visitDate,
    remarks,
    tag,
  });

  await newLead.save();

  await cacheInvalidate("patients", "owner");
  return NextResponse.json(
    { success: true, message: "Lead created successfully", lead: newLead },
    { status: 201 }
  );
};

export const POST = withDB(handler);
