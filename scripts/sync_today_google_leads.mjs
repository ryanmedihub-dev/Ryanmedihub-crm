import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

// 1. Load environment variables from .env.local
const envLocalPath = path.join(projectRoot, ".env.local");
if (fs.existsSync(envLocalPath)) {
  const envContent = fs.readFileSync(envLocalPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

const MONGODB_URI = process.env.MONGODB_URI;
const WEBHOOK_URL = process.env.GOOGLE_LEADS_SHEET_WEBHOOK_URL;
const isDryRun = process.argv.includes("--dry-run");

// Start boundary: 14 October 2026 00:00:00 IST = 13 October 2026 18:30:00.000 UTC
const START_DATE_UTC = new Date("2026-10-13T18:30:00.000Z");

const fmtISTDateTime = (v) =>
  v ? new Date(v).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "";
const fmtISTDay = (v) =>
  v ? new Date(v).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "";

export function formatGoogleLeadRow(doc) {
  return {
    "Lead ID": String(doc._id || ""),
    "Received At (IST)": fmtISTDateTime(doc.createdAt || new Date()),
    "Name": doc.name || "",
    "Phone": doc.phone || "",
    "Email": doc.email || "-",
    "City / Location": doc.city || doc.location || "-",
    "Tag": doc.tag || "Google Leads",
    "Visit Date": fmtISTDay(doc.visitDate),
    "Visit Plan": doc.visitPlan || "-",
    "Remarks": doc.remarks || "-",
  };
}

async function sendRow(url, row) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const payload = {
      row,
      secret: process.env.GOOGLE_LEADS_SHEET_WEBHOOK_SECRET || "",
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      return { success: false, status: res.status, error: `HTTP ${res.status}` };
    }

    const text = await res.text().catch(() => "");
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Body may be HTML if Google redirects to a login or permission page
    }

    if (!parsed || parsed.success !== true) {
      const isHtml = typeof text === "string" && text.trim().startsWith("<");
      const failureReason = isHtml
        ? "Received HTML response (possible Google login redirect or permission error)"
        : (parsed?.error || "Invalid response format from Apps Script");

      return { success: false, error: failureReason };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.name === "AbortError" ? "Timeout (8s)" : err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log("================================================================================");
  console.log(" RyanCRM Google Leads Backfill Tool (14 October 2026 Onward)");
  console.log("================================================================================");
  console.log(`Execution Mode : ${isDryRun ? "DRY-RUN (No external sync)" : "LIVE SYNC"}`);
  console.log(`Start Date IST : 14 October 2026 00:00:00 IST`);
  console.log(`Start Date UTC : ${START_DATE_UTC.toISOString()}`);
  console.log(`Webhook URL    : ${WEBHOOK_URL ? WEBHOOK_URL.slice(0, 45) + "..." : "[NOT CONFIGURED]"}`);
  console.log("--------------------------------------------------------------------------------");

  if (!MONGODB_URI) {
    console.error("FATAL: MONGODB_URI is not set in environment or .env.local");
    process.exit(1);
  }

  if (!isDryRun && !WEBHOOK_URL) {
    console.error("FATAL: GOOGLE_LEADS_SHEET_WEBHOOK_URL is not set. Cannot run in LIVE mode.");
    process.exit(1);
  }

  console.log("Connecting to MongoDB (read-only query)...");
  await mongoose.connect(MONGODB_URI);
  console.log("Connected successfully.\n");

  const LeadsSchema = new mongoose.Schema({}, { strict: false, collection: "leads" });
  const Leads = mongoose.models.Leads || mongoose.model("Leads", LeadsSchema);

  const query = {
    tag: "Google Leads",
    createdAt: { $gte: START_DATE_UTC },
  };

  const leads = await Leads.find(query).sort({ createdAt: 1 }).lean();
  console.log(`Found ${leads.length} Google lead(s) created on or after 14 Oct 2026 00:00:00 IST:\n`);

  if (leads.length === 0) {
    console.log("No Google leads match the criteria for today.");
    await mongoose.disconnect();
    return;
  }

  let successCount = 0;
  let failureCount = 0;
  const failedLeadIds = [];

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const row = formatGoogleLeadRow(lead);
    const maskedPhone = lead.phone ? `${lead.phone.slice(0, 3)}****${lead.phone.slice(-3)}` : "-";

    console.log(
      `[${i + 1}/${leads.length}] ID: ${lead._id} | Received: ${row["Received At (IST)"]} | Name: ${lead.name} | Phone: ${maskedPhone}`
    );

    if (isDryRun) {
      // In dry-run, do not make external HTTP requests
      continue;
    }

    // LIVE SYNC
    process.stdout.write("      --> Dispatching to Google Sheets... ");
    const result = await sendRow(WEBHOOK_URL, row);
    if (result.success) {
      console.log("OK (Synced)");
      successCount++;
    } else {
      console.log(`FAILED (${result.error || `Status ${result.status}`})`);
      failureCount++;
      failedLeadIds.push(String(lead._id));
    }

    // Gentle pacing between Apps Script web app requests (250ms)
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  console.log("\n--------------------------------------------------------------------------------");
  if (isDryRun) {
    console.log(`[DRY-RUN COMPLETE] Total leads scanned: ${leads.length}. Zero external requests made.`);
  } else {
    console.log(
      `[LIVE SYNC COMPLETE] Total: ${leads.length} | Synced: ${successCount} | Failed: ${failureCount}`
    );
    if (failedLeadIds.length > 0) {
      console.log(`Failed Lead IDs: ${failedLeadIds.join(", ")}`);
    }
  }
  console.log("================================================================================\n");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Unexpected backfill error:", err);
  process.exit(1);
});
