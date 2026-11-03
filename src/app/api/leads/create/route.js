import { NextResponse } from "next/server";
import { withDB } from "@/lib/withDB";
import Leads from "@/models/Leads";
import { cacheInvalidate } from "@/lib/cache";
import { fireGoogleLeadsSheetWebhook } from "@/lib/googleLeadsSheetWebhook";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const handler = async (req) => {
  const session = await getServerSession(authOptions);
  const apiKey = req.headers.get("x-api-key");
  const webhookSecret = process.env.LEADS_API_KEY || process.env.WEBHOOK_SECRET;

  const isAuthorized = session?.user || (webhookSecret && apiKey === webhookSecret);
  if (!isAuthorized) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 }
    );
  }

  const { name, phone, email, location, visitPlan, visitDate, remarks, tag } =
    await req.json();

  if (!name || !phone) {
    return NextResponse.json(
      { success: false, message: "Name and phone are required" },
      { status: 400 }
    );
  }

  const newLead = new Leads({
    name: name.trim(),
    phone: phone.trim(),
    email: email?.trim(),
    location,
    visitPlan,
    visitDate,
    remarks,
    tag,
  });

  await newLead.save();

  if (newLead.tag === "Google Leads") {
    fireGoogleLeadsSheetWebhook(newLead);
  }

  await cacheInvalidate("patients", "owner");
  return NextResponse.json(
    { success: true, message: "Lead created successfully", lead: newLead },
    { status: 201 }
  );
};

export const POST = withDB(handler);
