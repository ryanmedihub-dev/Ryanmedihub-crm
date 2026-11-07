import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

// 1. Load environment variables
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
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

// Outage window boundaries:
// Last successful lead: Renu Kumari at 2026-11-05T07:16:42.897Z (12:46:42 PM IST)
// Restoration point:   2026-11-07T05:14:50.000Z (10:44:50 AM IST)
const OUTAGE_START = new Date("2026-11-05T07:16:42.897Z");
const OUTAGE_END = new Date("2026-11-07T05:14:50.000Z");

const isExecute = process.argv.includes("--execute");
const filePath = process.argv.find((arg) => !arg.startsWith("--") && arg.endsWith(".csv"));

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCSV(content) {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, "_"));

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || "";
    });
    rows.push(row);
  }
  return rows;
}

export function normalizeLead(row, sourceHint = "Auto") {
  // Extract Name
  const name =
    row.full_name ||
    row.name ||
    row.your_name ||
    `${row.first_name || ""} ${row.last_name || ""}`.trim() ||
    "Unknown Lead";

  // Extract Phone
  let phone =
    row.phone_number ||
    row.phone ||
    row.mobile ||
    row.contact ||
    row.telephone ||
    "";
  phone = phone.replace(/^['"]|['"]$/g, "").trim();

  // Extract Email
  const email = (row.email || row.your_email || "").trim().toLowerCase();

  // Extract Location / City
  const location =
    row.city ||
    row.location ||
    row.city___location ||
    row.postal_code ||
    row.state ||
    "";

  // Extract Timestamp
  const timeRaw =
    row.created_time ||
    row.created_at ||
    row.lead_submit_time ||
    row.date ||
    row.timestamp ||
    "";
  const createdAt = timeRaw ? new Date(timeRaw) : new Date();

  // Extract Source Submission ID
  const sourceSubmissionId =
    row.id ||
    row.lead_id ||
    row.leadgen_id ||
    row.submission_id ||
    row.entry_id ||
    "";

  // Detect Tag
  let tag = "Google Leads";
  if (sourceHint === "Meta" || row.ad_id || row.leadgen_id || row.campaign_name?.toLowerCase().includes("meta")) {
    tag = "Meta Leads";
  } else if (sourceHint === "Website" || row.form_id || row.form_name) {
    tag = "Form Leads";
  }

  // Compile Remarks from Custom Questions
  const excludeKeys = new Set([
    "id", "lead_id", "leadgen_id", "submission_id", "entry_id",
    "full_name", "name", "your_name", "first_name", "last_name",
    "phone_number", "phone", "mobile", "contact", "telephone",
    "email", "your_email", "city", "location", "city___location",
    "created_time", "created_at", "lead_submit_time", "date", "timestamp"
  ]);

  const customFields = [];
  for (const [k, v] of Object.entries(row)) {
    if (!excludeKeys.has(k) && v && v !== "-" && v.trim() !== "") {
      const cleanKey = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      customFields.push(`${cleanKey}: ${v}`);
    }
  }

  let remarks = customFields.join(" | ");
  if (sourceSubmissionId) {
    remarks = `[SourceID: ${sourceSubmissionId}] ${remarks}`.trim();
  }

  return {
    sourceSubmissionId,
    name: name.trim(),
    phone: phone.trim(),
    email: email || undefined,
    location: location || undefined,
    tag,
    remarks: remarks || undefined,
    createdAt: isNaN(createdAt.getTime()) ? new Date() : createdAt,
  };
}

async function main() {
  console.log("================================================================================");
  console.log(" RyanCRM Outage Missed Leads Recovery & Reconciliation Tool");
  console.log(` Mode:             ${isExecute ? "LIVE RESTORATION (DATABASE INSERTION)" : "DRY-RUN / AUDIT (ZERO WRITES)"}`);
  console.log(` Outage Boundary:  ${OUTAGE_START.toISOString()} to ${OUTAGE_END.toISOString()}`);
  console.log("================================================================================\n");

  if (!filePath) {
    console.log("Usage:");
    console.log("  node scripts/reconcile_and_recover_missed_leads.mjs <path-to-export.csv> [--dry-run]");
    console.log("  node scripts/reconcile_and_recover_missed_leads.mjs <path-to-export.csv> --execute\n");
    console.log("Supported CSV export sources:");
    console.log("  1. Meta Business Suite (Instant Forms / Lead Center)");
    console.log("  2. Google Ads Manager (Lead Form Assets)");
    console.log("  3. Website Form Submissions (WordPress / Elementor / WPForms)\n");
    return;
  }

  if (!fs.existsSync(filePath)) {
    console.error(`FATAL: File not found at "${filePath}"`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(filePath, "utf8");
  const rawRows = parseCSV(fileContent);
  console.log(`Loaded ${rawRows.length} raw records from ${path.basename(filePath)}`);

  await mongoose.connect(process.env.MONGODB_URI);
  const collection = mongoose.connection.collection("leads");

  const candidates = [];
  const existingInDb = [];
  const outsideOutageWindow = [];
  const invalidPhone = [];

  for (const raw of rawRows) {
    const lead = normalizeLead(raw);

    // Validation: Phone digits >= 5
    const digits = (lead.phone || "").replace(/\D/g, "");
    if (digits.length < 5) {
      invalidPhone.push(lead);
      continue;
    }

    // Check if timestamp falls within outage window
    if (lead.createdAt < OUTAGE_START || lead.createdAt > OUTAGE_END) {
      outsideOutageWindow.push(lead);
    }

    // Reconciliation against MongoDB:
    // 1. Check by source submission ID in remarks
    let match = null;
    if (lead.sourceSubmissionId) {
      match = await collection.findOne({
        remarks: { $regex: lead.sourceSubmissionId }
      });
    }

    // 2. If no source ID match, check if exact same lead (phone + exact createdAt second) exists
    if (!match) {
      const windowStart = new Date(lead.createdAt.getTime() - 2000);
      const windowEnd = new Date(lead.createdAt.getTime() + 2000);
      match = await collection.findOne({
        phone: lead.phone,
        createdAt: { $gte: windowStart, $lte: windowEnd }
      });
    }

    if (match) {
      existingInDb.push({ lead, matchedId: match._id });
    } else {
      candidates.push(lead);
    }
  }

  console.log("\n--------------------------------------------------------------------------------");
  console.log(" RECONCILIATION SUMMARY");
  console.log("--------------------------------------------------------------------------------");
  console.log(`Total Rows Parsed:           ${rawRows.length}`);
  console.log(`Invalid / Malformed Records: ${invalidPhone.length}`);
  console.log(`Outside Outage Window:       ${outsideOutageWindow.length} (pre-outage or post-restoration)`);
  console.log(`Already in Production DB:    ${existingInDb.length}`);
  console.log(`CONFIRMED MISSED LEADS:      ${candidates.length}`);
  console.log("--------------------------------------------------------------------------------\n");

  if (candidates.length > 0) {
    console.log("--- Sample Confirmed Missed Leads (First 5) ---");
    candidates.slice(0, 5).forEach((c, idx) => {
      console.log(`[${idx + 1}] SourceID: ${c.sourceSubmissionId || "N/A"} | Date: ${c.createdAt.toISOString()} | Name: ${c.name} | Phone: ${c.phone} | Tag: ${c.tag}`);
    });
    console.log("");
  }

  if (isExecute) {
    console.log(`Beginning insertion of ${candidates.length} recovered leads into MongoDB...`);
    let insertedCount = 0;
    for (const item of candidates) {
      const doc = {
        name: item.name,
        phone: item.phone,
        email: item.email,
        location: item.location,
        remarks: item.remarks,
        tag: item.tag,
        createdAt: item.createdAt,
        updatedAt: item.createdAt,
      };
      await collection.insertOne(doc);
      insertedCount++;
    }
    console.log(`✔ SUCCESS: Inserted ${insertedCount} leads into MongoDB collection 'leads'.`);
  } else {
    console.log("DRY-RUN COMPLETE: Zero writes executed. Provide '--execute' flag after owner approval to insert.");
  }

  await mongoose.disconnect();
}

main().catch(console.error);

