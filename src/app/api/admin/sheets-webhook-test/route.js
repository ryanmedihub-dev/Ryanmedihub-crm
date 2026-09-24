import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const ALLOWED_ROLES = ["admin", "super-admin"];

// Fires one sample row at the Google Sheets webhook so SHEETS_WEBHOOK_URL/SHEETS_WEBHOOK_SECRET
// can be verified without creating a real payable/receivable/advance/transaction. See
// src/lib/sheetsWebhook.js for the real per-model hooks this exercises the same send path of.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
  }

  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) {
    return NextResponse.json(
      { success: false, message: "SHEETS_WEBHOOK_URL is not set — nothing to test." },
      { status: 400 },
    );
  }

  const row = {
    "Entry Type": "Test",
    "Created On": new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    "Entry Date": new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }),
    "Party": "Test Party",
    "Employee ID": "",
    "Purpose / Category": "Test Category",
    "Sub-type": "",
    "Direction": "Test",
    "Amount": 1,
    "Cash Impact": "—",
    "Branch": "Delhi",
    "Account": "Cash Book",
    "Method": "Test",
    "Reference": "TEST-REF",
    "Status": "Test",
    "Remarks": "sheets-webhook-test route",
    "Created By": "sheets-webhook-test route",
    "Entry ID": "TEST-ID",
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: process.env.SHEETS_WEBHOOK_SECRET || "", row }),
    });
    const text = await res.text().catch(() => "");
    return NextResponse.json({ success: res.ok, status: res.status, response: text.slice(0, 500) });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
