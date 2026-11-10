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
const WEBHOOK_SECRET = process.env.GOOGLE_LEADS_SHEET_WEBHOOK_SECRET;
const isDryRun = process.argv.includes("--dry-run");

// Approved boundaries:
// Start: Amit Kumar (2 Apr 2026 14:51:45.274Z = 8:21:45 PM IST)
const START_DATE_UTC = new Date("2026-04-02T14:51:45.274Z");
// End: Immediately before webhook activation (15 Oct 2026 07:04:52.000Z = 12:34:52 PM IST)
const END_DATE_UTC = new Date("2026-10-15T07:04:52.000Z");

// 22 Clearly identified synthetic test leads to exclude:
export const EXCLUDED_TEST_LEAD_IDS = [
  "6a28f8f219fd07333f2a7003", // test
  "6a28f969f8cbe052aba8b1c2", // test test
  "6a28f99019fd07333f2a7016", // test test
  "6a293e724990862833b43174", // Test
  "6a295ab144230ef445bd8c85", // test test
  "6a295ad49b9569a7ac038337", // test test
  "6a5e048b0a4d5d74888117e6", // Test User
  "6a6c412ece7bfb3f62dbf6e1", // testing backend team
  "6a6c438205937ebaa79ceaac", // testing backend
  "6a6c43ccce7bfb3f62dbf6e3", // testing 01
  "6a6c44ce05937ebaa79ceab1", // final testing
  "6a7c62966ded979fd6b1464b", // Testing
  "6a7c62b76ded979fd6b1464c", // Testing
  "6a7c62e16ded979fd6b1464d", // Testing
  "6a7c648d6ded979fd6b14651", // QA Test Visitor
  "6a7c650c6ded979fd6b14653", // testing
  "6a7c65216ded979fd6b14654", // testing
  "6a7c65846ded979fd6b14655", // testing
  "6a7d4e1754518e76a1791186", // testing
  "6a7d51961567b61f4e63d834", // testing
  "6a7d59253888de18941c47b5", // Testing by aman
  "6ac5cbf91d1a7c007490677d", // testing
];

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
      secret: WEBHOOK_SECRET || "",
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
      // Body may be HTML if Google redirects to login
    }

    if (!parsed || parsed.success !== true) {
      const isHtml = typeof text === "string" && text.trim().startsWith("<");
      const failureReason = isHtml
        ? "Received HTML response (Google login or permission error)"
        : (parsed?.error || "Invalid response format from Apps Script");

      return { success: false, error: failureReason };
    }

    return {
      success: true,
      action: parsed.action || "appended",
      leadId: parsed.leadId || row["Lead ID"],
    };
  } catch (err) {
    return {
      success: false,
      error: err.name === "AbortError" ? "Timeout (8s)" : err.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log("================================================================================");
  console.log(" RyanCRM Google Leads Historical Backfill (Segment C: 2 Apr – 15 Oct 2026)");
  console.log("================================================================================");
  console.log(`Execution Mode     : ${isDryRun ? "DRY-RUN (Zero external writes)" : "LIVE EXECUTION"}`);
  console.log(`Start Timestamp    : ${START_DATE_UTC.toISOString()} (${fmtISTDateTime(START_DATE_UTC)} IST)`);
  console.log(`End Timestamp      : ${END_DATE_UTC.toISOString()} (${fmtISTDateTime(END_DATE_UTC)} IST)`);
  console.log(`Excluded Test Leads: ${EXCLUDED_TEST_LEAD_IDS.length} synthetic records`);
  console.log(`Webhook URL        : ${WEBHOOK_URL ? WEBHOOK_URL.slice(0, 45) + "..." : "[NOT CONFIGURED]"}`);
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
  console.log(`Connected to database: "${mongoose.connection.db.databaseName}".\n`);

  const LeadsSchema = new mongoose.Schema({}, { strict: false, collection: "leads" });
  const Leads = mongoose.models.Leads || mongoose.model("Leads", LeadsSchema);

  // Exclude test IDs
  const excludedObjectIds = EXCLUDED_TEST_LEAD_IDS.map((id) => new mongoose.Types.ObjectId(id));

  const query = {
    tag: "Google Leads",
    createdAt: { $gte: START_DATE_UTC, $lt: END_DATE_UTC },
    _id: { $nin: excludedObjectIds },
  };

  const leads = await Leads.find(query).sort({ createdAt: 1 }).lean();
  console.log(`Eligible leads in query: ${leads.length} records\n`);

  if (leads.length === 0) {
    console.log("No leads match criteria.");
    await mongoose.disconnect();
    return;
  }

  console.log(`First lead: ID: ${leads[0]._id} | ${fmtISTDateTime(leads[0].createdAt)} IST | ${leads[0].name}`);
  console.log(`Last lead : ID: ${leads[leads.length - 1]._id} | ${fmtISTDateTime(leads[leads.length - 1].createdAt)} IST | ${leads[leads.length - 1].name}\n`);

  if (isDryRun) {
    console.log("--------------------------------------------------------------------------------");
    console.log(`[DRY-RUN COMPLETE]`);
    console.log(`  Total eligible records to sync: ${leads.length}`);
    console.log(`  Zero HTTP requests sent.`);
    console.log(`  Zero Google Sheet rows created or modified.`);
    console.log(`  Zero MongoDB records modified.`);
    console.log("================================================================================\n");
    await mongoose.disconnect();
    return;
  }

  // LIVE EXECUTION
  console.log("Starting live backfill with 250ms pacing...\n");
  let appendedCount = 0;
  let updatedCount = 0;
  let failedCount = 0;
  const failureLog = [];

  const startTime = Date.now();

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const row = formatGoogleLeadRow(lead);
    const maskedPhone = lead.phone ? `${lead.phone.slice(0, 3)}****${lead.phone.slice(-3)}` : "-";

    process.stdout.write(
      `[${i + 1}/${leads.length}] ID: ${lead._id} | ${row["Received At (IST)"]} | ${lead.name.padEnd(22).slice(0, 22)} | ${maskedPhone} -> `
    );

    const result = await sendRow(WEBHOOK_URL, row);

    if (result.success) {
      if (result.action === "updated") {
        console.log(`UPDATED`);
        updatedCount++;
      } else {
        console.log(`APPENDED`);
        appendedCount++;
      }
    } else {
      console.log(`FAILED (${result.error || `Status ${result.status}`})`);
      failedCount++;
      failureLog.push({
        leadId: String(lead._id),
        name: lead.name,
        createdAt: lead.createdAt,
        error: result.error || `HTTP ${result.status}`,
      });
    }

    // 250ms pacing between requests
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const durationSec = Math.round((Date.now() - startTime) / 1000);

  console.log("\n================================================================================");
  console.log(" HISTORICAL BACKFILL EXECUTION SUMMARY");
  console.log("================================================================================");
  console.log(`Total Leads Processed : ${leads.length}`);
  console.log(`Appended (New Rows)   : ${appendedCount}`);
  console.log(`Updated (Existing)    : ${updatedCount}`);
  console.log(`Failed                : ${failedCount}`);
  console.log(`Total Duration        : ${Math.floor(durationSec / 60)}m ${durationSec % 60}s`);

  if (failureLog.length > 0) {
    console.log(`\nFailed Lead IDs (${failureLog.length}):`);
    failureLog.forEach((f) => console.log(`  - ID: ${f.leadId} | Error: ${f.error}`));
  }

  // Save report
  const reportDir = path.join(projectRoot, "scripts", "reports");
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const reportFile = path.join(reportDir, `historical_google_leads_backfill_${Date.now()}.json`);
  fs.writeFileSync(
    reportFile,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        total: leads.length,
        appended: appendedCount,
        updated: updatedCount,
        failed: failedCount,
        failures: failureLog,
        durationSeconds: durationSec,
      },
      null,
      2
    )
  );
  console.log(`\nDetailed execution report saved to: ${reportFile}`);
  console.log("================================================================================\n");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Fatal backfill error:", err);
  process.exit(1);
});

