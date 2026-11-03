// ---------------------------------------------------------------------------
// scripts/import-surgery-done-patients.js
//
// Standalone, one-time script to execute the approved historical completed
// surgery patient import directly against production MongoDB.
//
// SAFETY:
//   • DEFAULT IS DRY-RUN ONLY. No database modifications occur without --commit.
//   • --commit requires explicit confirmation phrase:
//       node scripts/import-surgery-done-patients.js --commit --confirm="IMPORT_SURGERY_DONE_PATIENTS"
//   • Validates expected database name before permitting any writes.
//   • Never drops collections, deletes documents, or resets data.
//   • Idempotent: Re-running safely skips already completed creates and updates.
//   • Generates full CSV and JSON audit reports in scripts/reports/.
//
// USAGE:
//   # 1. Dry run (Default simulation — zero database writes):
//   node --env-file=.env.local scripts/import-surgery-done-patients.js
//
//   # 2. Production Commit (Requires explicit confirmation):
//   node --env-file=.env.local scripts/import-surgery-done-patients.js --commit --confirm="IMPORT_SURGERY_DONE_PATIENTS"
//
//   # Optional flags:
//   #   --file=<path>             Custom input file (default: data/imports)
//   #   --batch-size=<number>     Batch size (default: 50, range 25-100)
//   #   --fallback-branch=<name>  Fallback branch for rows without branch (default: Delhi)
// ---------------------------------------------------------------------------

import mongoose from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Patient from "../src/models/Patient.js";
import { normalizePhone } from "../src/lib/phone.js";
import { ALL_BRANCHES } from "../src/lib/branches.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

// ============================== CLI PARSING ===============================

const args = process.argv.slice(2);
function getArg(prefix, fallback = null) {
  const match = args.find((a) => a.startsWith(prefix));
  if (!match) return fallback;
  return match.includes("=") ? match.split("=").slice(1).join("=") : true;
}

const isCommit = args.includes("--commit");
const confirmPhrase = getArg("--confirm", "");
const inputFilePath = path.resolve(ROOT_DIR, getArg("--file", "data/imports"));
const fallbackBranch = getArg("--fallback-branch", "Delhi");
const batchSize = Math.max(25, Math.min(100, parseInt(getArg("--batch-size", "50"), 10) || 50));

const REQUIRED_CONFIRM_PHRASE = "IMPORT_SURGERY_DONE_PATIENTS";
const EXPECTED_DB_NAME = "test"; // RyanCRM production database name in Atlas

// =========================== CREDENTIALS & DB =============================

function getMongoUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI.trim();

  const envPath = path.join(ROOT_DIR, ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const l of lines) {
      if (l.trim().startsWith("MONGODB_URI=")) {
        return l.trim().replace("MONGODB_URI=", "").trim();
      }
    }
  }
  return null;
}

function maskUri(uri) {
  if (!uri) return "(none)";
  return uri.replace(/\/\/[^:]+:[^@]+@/, "//***:***@");
}

// ============================== DATA PARSING ===============================

function parseDelimitedFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Input file not found at: ${filePath}`);
  }

  const rawText = fs.readFileSync(filePath, "utf8");
  const lines = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) {
    throw new Error(`Input file is empty or missing headers`);
  }

  const delim = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0]
    .split(delim)
    .map((h) => h.trim().replace(/^\uFEFF/, "").replace(/^"/, "").replace(/"$/, ""));

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue; // Skip blank lines
    const cells = lines[i].split(delim);
    const row = {};
    headers.forEach((h, idx) => {
      let val = (cells[idx] || "").trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1).trim();
      }
      row[h] = val;
    });

    const phoneRaw = (row["Phone"] || "").trim();
    const phoneNorm = normalizePhone(phoneRaw);
    const nameRaw = (row["Patient name"] || "").trim().toUpperCase();
    const branchRaw = (row["Branch (source)"] || "").trim();
    const serviceRaw = (row["Service / procedure (source)"] || "").trim();
    const sourceFileRaw = (row["Source file(s)"] || "").trim();

    // Gender parsing
    const genderRaw = (row["Healcon gender"] || row["Gender (legacy activity)"] || "").trim().toLowerCase();
    let gender = null;
    if (genderRaw === "male") gender = "MALE";
    else if (genderRaw === "female") gender = "FEMALE";

    // Age parsing
    let age = null;
    const ageRaw = (row["Healcon age"] || "").trim();
    if (ageRaw) {
      const parsedAge = parseInt(ageRaw, 10);
      if (!isNaN(parsedAge) && parsedAge > 0 && parsedAge < 120) {
        age = parsedAge;
      }
    }

    rows.push({
      _lineIndex: i + 1,
      _name: nameRaw,
      _phoneRaw: phoneRaw,
      _phoneNorm: phoneNorm,
      _branchRaw: branchRaw,
      _serviceRaw: serviceRaw,
      _sourceFile: sourceFileRaw,
      _gender: gender,
      _age: age,
      _raw: row,
    });
  }

  return rows;
}

// ============================== MAIN SCRIPT ===============================

async function main() {
  const startTime = new Date();
  const importId = `direct_import_${startTime.getTime()}_${Math.random().toString(36).substring(2, 7)}`;

  console.log("===============================================================================");
  console.log("            RYANCRM — PRODUCTION BULK PATIENT IMPORT UTILITY                   ");
  console.log("===============================================================================");
  console.log(`Timestamp:        ${startTime.toISOString()}`);
  console.log(`Import ID:        ${importId}`);
  console.log(`Input File:       ${inputFilePath}`);
  console.log(`Fallback Branch:  ${fallbackBranch}`);
  console.log(`Batch Size:       ${batchSize}`);
  console.log(`Execution Mode:   ${isCommit ? ">>> LIVE PRODUCTION COMMIT <<<" : "DRY-RUN (SIMULATION ONLY)"}`);
  console.log("===============================================================================\n");

  // Safety checks for commit mode
  if (isCommit) {
    if (confirmPhrase !== REQUIRED_CONFIRM_PHRASE) {
      console.error("FATAL SAFETY ERROR: Missing required confirmation phrase for production commit!");
      console.error(`You must pass: --confirm="${REQUIRED_CONFIRM_PHRASE}"`);
      console.error("\nExecution aborted safely. Zero database modifications made.");
      process.exit(1);
    }
  }

  // 1. Connect to MongoDB
  const mongoUri = getMongoUri();
  if (!mongoUri) {
    console.error("FATAL ERROR: MONGODB_URI not found in environment or .env.local!");
    process.exit(1);
  }

  console.log(`Connecting to MongoDB: ${maskUri(mongoUri)} ...`);
  await mongoose.connect(mongoUri);
  const dbName = mongoose.connection.name;
  console.log(`Connected successfully. Active Database Name: "${dbName}"`);

  // Confirm database name
  if (dbName !== EXPECTED_DB_NAME) {
    console.error(`WARNING: Connected DB name "${dbName}" does not match expected "${EXPECTED_DB_NAME}"`);
    if (isCommit) {
      console.error("Aborting commit due to database name mismatch!");
      await mongoose.disconnect();
      process.exit(1);
    }
  }

  // 2. Parse source data
  console.log(`\nParsing source dataset: ${inputFilePath} ...`);
  const parsedRows = parseDelimitedFile(inputFilePath);
  console.log(`Successfully parsed ${parsedRows.length} data rows.`);

  // 3. Live Database Pre-Scan & Classification
  console.log("\nQuerying live RyanCRM database for existing phone numbers...");
  const validPhones = parsedRows
    .map((r) => r._phoneNorm)
    .filter((p) => p && p.length === 10);

  const coll = mongoose.connection.collection("patients");
  const existingDocs = await coll
    .find(
      { "personal.phoneNormalized": { $in: validPhones } },
      { projection: { "personal.phoneNormalized": 1, "personal.name": 1, "ops.status": 1, "personal.branch": 1 } }
    )
    .toArray();

  const phoneToDbDocsMap = new Map();
  existingDocs.forEach((doc) => {
    const p = doc.personal?.phoneNormalized;
    if (p) {
      if (!phoneToDbDocsMap.has(p)) phoneToDbDocsMap.set(p, []);
      phoneToDbDocsMap.get(p).push(doc);
    }
  });

  console.log(`Matched ${existingDocs.length} patient documents across ${phoneToDbDocsMap.size} distinct phones in live DB.`);

  // Classify each row mutually exclusively
  const seenPhones = new Map();
  const classifiedRows = [];

  const counts = {
    total: parsedRows.length,
    new_patient_creations: 0,
    existing_already_closed: 0,
    existing_needs_update: 0,
    ambiguous_matches: 0,
    missing_name_skipped: 0,
    invalid_phones: 0,
    duplicate_source: 0,
  };

  for (const r of parsedRows) {
    const item = { ...r };

    // Invalid phone
    if (!r._phoneNorm || r._phoneNorm.length !== 10) {
      item.classification = "invalid_phone";
      item.action = "skip";
      item.reason = "Invalid or missing phone number";
      counts.invalid_phones++;
      classifiedRows.push(item);
      continue;
    }

    // Intra-file duplicate
    if (seenPhones.has(r._phoneNorm)) {
      item.classification = "duplicate_source";
      item.duplicateOf = seenPhones.get(r._phoneNorm);
      item.action = "skip";
      item.reason = `Duplicate phone in file (first seen on row ${seenPhones.get(r._phoneNorm)})`;
      counts.duplicate_source++;
      classifiedRows.push(item);
      continue;
    }
    seenPhones.set(r._phoneNorm, r._lineIndex);

    // Live DB match
    const dbMatches = phoneToDbDocsMap.get(r._phoneNorm) || [];

    // Ambiguous (>1 in DB)
    if (dbMatches.length > 1) {
      item.classification = "ambiguous_match";
      item.action = "skip";
      item.ambiguousDocs = dbMatches;
      item.reason = `Matches ${dbMatches.length} patient records in DB — manual review required`;
      counts.ambiguous_matches++;
      classifiedRows.push(item);
      continue;
    }

    // Single match in DB
    if (dbMatches.length === 1) {
      const existing = dbMatches[0];
      item.existingDoc = existing;
      item.currentStatus = existing.ops?.status || "UNKNOWN";

      if (existing.ops?.status === "CLOSED") {
        item.classification = "existing_already_closed";
        item.action = "skip";
        item.reason = `Already CLOSED in database (ID: ${existing._id})`;
        counts.existing_already_closed++;
      } else {
        item.classification = "existing_needs_update";
        item.action = "update_status_only";
        item.reason = `Existing patient (Status: ${item.currentStatus}). Needs ops.status updated to CLOSED.`;
        counts.existing_needs_update++;
      }
      classifiedRows.push(item);
      continue;
    }

    // Not in DB: Missing name
    if (!r._name) {
      item.classification = "missing_name_skipped";
      item.action = "skip";
      item.reason = "Missing required patient name in source CSV (not in DB, cannot create)";
      counts.missing_name_skipped++;
      classifiedRows.push(item);
      continue;
    }

    // New patient creation
    item.classification = "new_patient";
    item.action = "create";
    item.branchToUse = r._branchRaw || fallbackBranch;
    item.reason = "New patient — eligible to create with ops.status = CLOSED";
    counts.new_patient_creations++;
    classifiedRows.push(item);
  }

  // Reconciliation Output
  console.log("\n===============================================================================");
  console.log("                   LIVE RECONCILIATION SUMMARY                                 ");
  console.log("===============================================================================");
  console.log(`1. Total Source Records:                      ${counts.total}`);
  console.log(`2. New Patient Creations (ops.status = CLOSED): ${counts.new_patient_creations}`);
  console.log(`3. Existing Patients Requiring Status Update:  ${counts.existing_needs_update}`);
  console.log(`4. Existing Patients Already CLOSED (Skip):    ${counts.existing_already_closed}`);
  console.log(`5. Ambiguous Matches (Skip / Manual Review):   ${counts.ambiguous_matches}`);
  console.log(`6. Missing Required Patient Names (Skip):     ${counts.missing_name_skipped}`);
  console.log(`7. Missing / Invalid Phones:                   ${counts.invalid_phones}`);
  console.log(`8. Intra-File Duplicate Phones:                ${counts.duplicate_source}`);
  console.log("-------------------------------------------------------------------------------");
  const sumReconciled =
    counts.new_patient_creations +
    counts.existing_needs_update +
    counts.existing_already_closed +
    counts.ambiguous_matches +
    counts.missing_name_skipped +
    counts.invalid_phones +
    counts.duplicate_source;

  console.log(`RECONCILIATION CHECK: ${sumReconciled} === ${counts.total}  =>  ${sumReconciled === counts.total ? "MATCH [PASSED]" : "MISMATCH [FAILED]"}`);
  console.log(`TOTAL ACTIONS PLANNED: ${counts.new_patient_creations} Creations + ${counts.existing_needs_update} Status Updates = ${counts.new_patient_creations + counts.existing_needs_update} Operations`);
  console.log("===============================================================================\n");

  if (counts.ambiguous_matches > 0) {
    const amb = classifiedRows.filter((r) => r.classification === "ambiguous_match");
    console.log("Ambiguous Records Details (Skipped from automatic modification):");
    amb.forEach((a) => {
      console.log(`  - Phone: ${a._phoneNorm} (Row ${a._lineIndex})`);
      a.ambiguousDocs.forEach((d) => {
        console.log(`      Doc ID: ${d._id} | Name: ${d.personal?.name} | Status: ${d.ops?.status} | Branch: ${d.personal?.branch}`);
      });
    });
    console.log("");
  }

  // 4. Batch Execution (Dry Run or Commit)
  const operationsQueue = classifiedRows.filter(
    (r) => r.action === "create" || r.action === "update_status_only"
  );

  console.log(`Queue prepared: ${operationsQueue.length} operations to process in batches of ${batchSize}.`);
  if (!isCommit) {
    console.log("DRY-RUN MODE: Simulating operations without writing to MongoDB...\n");
  } else {
    console.log("COMMIT MODE: Starting live sequential production writes...\n");
  }

  const auditRecords = [];
  let successfulCreations = 0;
  let successfulUpdates = 0;
  let failedOperations = 0;

  const totalBatches = Math.ceil(operationsQueue.length / batchSize);

  for (let b = 0; b < totalBatches; b++) {
    const startIdx = b * batchSize;
    const batch = operationsQueue.slice(startIdx, startIdx + batchSize);
    const batchNum = b + 1;

    let batchCreates = 0;
    let batchUpdates = 0;
    let batchErrors = 0;

    for (const item of batch) {
      if (!isCommit) {
        // DRY RUN SIMULATION
        if (item.action === "create") {
          batchCreates++;
          successfulCreations++;
          auditRecords.push({
            rowIndex: item._lineIndex,
            patientName: item._name,
            phone: item._phoneRaw,
            phoneNormalized: item._phoneNorm,
            branch: item.branchToUse,
            action: "CREATE",
            status: "SIMULATED_SUCCESS",
            oldStatus: "N/A",
            newStatus: "CLOSED",
            patientId: "SIMULATED_ID",
            reason: "Dry run: ready for creation with ops.status = CLOSED",
          });
        } else if (item.action === "update_status_only") {
          batchUpdates++;
          successfulUpdates++;
          auditRecords.push({
            rowIndex: item._lineIndex,
            patientName: item._name || item.existingDoc?.personal?.name,
            phone: item._phoneRaw,
            phoneNormalized: item._phoneNorm,
            branch: item.existingDoc?.personal?.branch || item._branchRaw,
            action: "STATUS_UPDATE",
            status: "SIMULATED_SUCCESS",
            oldStatus: item.currentStatus,
            newStatus: "CLOSED",
            patientId: String(item.existingDoc._id),
            reason: `Dry run: ready to update status from ${item.currentStatus} to CLOSED`,
          });
        }
        continue;
      }

      // COMMIT EXECUTION
      if (item.action === "create") {
        try {
          // Double-check live DB before insert (duplicate protection)
          const liveCheck = await coll.findOne({ "personal.phoneNormalized": item._phoneNorm });
          if (liveCheck) {
            console.log(`[IDEMPOTENT SKIP] Row ${item._lineIndex}: Phone ${item._phoneNorm} already exists in DB (ID: ${liveCheck._id}). Skipping creation.`);
            auditRecords.push({
              rowIndex: item._lineIndex,
              patientName: item._name,
              phone: item._phoneRaw,
              phoneNormalized: item._phoneNorm,
              branch: item.branchToUse,
              action: "CREATE",
              status: "ALREADY_EXISTS_SKIPPED",
              oldStatus: liveCheck.ops?.status || "UNKNOWN",
              newStatus: liveCheck.ops?.status || "UNKNOWN",
              patientId: String(liveCheck._id),
              reason: "Pre-insert live check detected existing record; safely skipped.",
            });
            continue;
          }

          const remarksParts = [];
          if (item._serviceRaw) remarksParts.push(`Service: ${item._serviceRaw}`);
          if (item._sourceFile) remarksParts.push(`Source: ${item._sourceFile}`);
          remarksParts.push("Historical completed surgery patient (Bulk Import)");

          const newPatient = new Patient({
            personal: {
              name: item._name,
              phone: item._phoneRaw,
              phoneNormalized: item._phoneNorm,
              branch: item.branchToUse,
              gender: item._gender || "MALE",
              ...(item._age ? { age: item._age } : {}),
              remarks: remarksParts.join(" | "),
            },
            ops: {
              status: "CLOSED",
            },
          });

          // In-memory flag tells pre-save hook to preserve CLOSED status
          newPatient.$locals.preserveImportedStatus = true;
          const savedDoc = await newPatient.save();

          batchCreates++;
          successfulCreations++;
          auditRecords.push({
            rowIndex: item._lineIndex,
            patientName: item._name,
            phone: item._phoneRaw,
            phoneNormalized: item._phoneNorm,
            branch: item.branchToUse,
            action: "CREATE",
            status: "COMMITTED_SUCCESS",
            oldStatus: "N/A",
            newStatus: "CLOSED",
            patientId: String(savedDoc._id),
            reason: "Created with ops.status = CLOSED",
          });
        } catch (err) {
          batchErrors++;
          failedOperations++;
          console.error(`[ERROR] Row ${item._lineIndex} create failed:`, err.message);
          auditRecords.push({
            rowIndex: item._lineIndex,
            patientName: item._name,
            phone: item._phoneRaw,
            phoneNormalized: item._phoneNorm,
            branch: item.branchToUse,
            action: "CREATE",
            status: "ERROR",
            oldStatus: "N/A",
            newStatus: "N/A",
            patientId: "FAILED",
            reason: err.message,
          });
        }
      } else if (item.action === "update_status_only") {
        try {
          // Status-only update touching exclusively ops.status
          await Patient.updateOne(
            { _id: item.existingDoc._id },
            { $set: { "ops.status": "CLOSED" } }
          );

          batchUpdates++;
          successfulUpdates++;
          auditRecords.push({
            rowIndex: item._lineIndex,
            patientName: item._name || item.existingDoc?.personal?.name,
            phone: item._phoneRaw,
            phoneNormalized: item._phoneNorm,
            branch: item.existingDoc?.personal?.branch || item._branchRaw,
            action: "STATUS_UPDATE",
            status: "COMMITTED_SUCCESS",
            oldStatus: item.currentStatus,
            newStatus: "CLOSED",
            patientId: String(item.existingDoc._id),
            reason: `ops.status updated from ${item.currentStatus} to CLOSED`,
          });
        } catch (err) {
          batchErrors++;
          failedOperations++;
          console.error(`[ERROR] Row ${item._lineIndex} update failed:`, err.message);
          auditRecords.push({
            rowIndex: item._lineIndex,
            patientName: item._name || item.existingDoc?.personal?.name,
            phone: item._phoneRaw,
            phoneNormalized: item._phoneNorm,
            branch: item.existingDoc?.personal?.branch || item._branchRaw,
            action: "STATUS_UPDATE",
            status: "ERROR",
            oldStatus: item.currentStatus,
            newStatus: "N/A",
            patientId: String(item.existingDoc._id),
            reason: err.message,
          });
        }
      }
    }

    const processedCount = Math.min((b + 1) * batchSize, operationsQueue.length);
    console.log(
      `[Batch ${batchNum}/${totalBatches}] Processed ${processedCount}/${operationsQueue.length} ` +
      `(${Math.round((processedCount / operationsQueue.length) * 100)}%) | ` +
      `Creates: ${batchCreates}, Status Updates: ${batchUpdates}, Errors: ${batchErrors}`
    );
  }

  // Also include skipped rows in the audit trail
  const skippedRows = classifiedRows.filter((r) => r.action === "skip");
  skippedRows.forEach((s) => {
    auditRecords.push({
      rowIndex: s._lineIndex,
      patientName: s._name || s.existingDoc?.personal?.name || "MISSING",
      phone: s._phoneRaw || "MISSING",
      phoneNormalized: s._phoneNorm || "MISSING",
      branch: s._branchRaw || "N/A",
      action: "SKIP",
      status: s.classification.toUpperCase(),
      oldStatus: s.currentStatus || "N/A",
      newStatus: s.currentStatus || "N/A",
      patientId: s.existingDoc ? String(s.existingDoc._id) : "N/A",
      reason: s.reason,
    });
  });

  // Sort audit records by rowIndex
  auditRecords.sort((a, b) => a.rowIndex - b.rowIndex);

  // 5. Generate Audit Report
  const reportsDir = path.join(ROOT_DIR, "scripts", "reports");
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const filePrefix = isCommit ? `commit_${importId}` : `dryrun_${importId}`;
  const csvReportPath = path.join(reportsDir, `${filePrefix}.csv`);
  const jsonReportPath = path.join(reportsDir, `${filePrefix}.json`);

  // CSV formatting
  const csvHeaders = [
    "RowIndex",
    "PatientName",
    "Phone",
    "PhoneNormalized",
    "Branch",
    "Action",
    "Status",
    "OldStatus",
    "NewStatus",
    "PatientId",
    "Reason",
  ];

  const csvRows = auditRecords.map((r) => [
    r.rowIndex,
    `"${(r.patientName || "").replace(/"/g, '""')}"`,
    `"${r.phone || ""}"`,
    `"${r.phoneNormalized || ""}"`,
    `"${r.branch || ""}"`,
    `"${r.action}"`,
    `"${r.status}"`,
    `"${r.oldStatus}"`,
    `"${r.newStatus}"`,
    `"${r.patientId}"`,
    `"${(r.reason || "").replace(/"/g, '""')}"`,
  ]);

  const csvContent = [csvHeaders.join(","), ...csvRows.map((e) => e.join(","))].join("\n");
  fs.writeFileSync(csvReportPath, csvContent, "utf8");

  const summary = {
    importId,
    mode: isCommit ? "commit" : "dry_run",
    timestamp: startTime.toISOString(),
    completedAt: new Date().toISOString(),
    inputFile: inputFilePath,
    databaseName: dbName,
    counts: {
      totalSourceRows: parsedRows.length,
      newPatientCreationsPlanned: counts.new_patient_creations,
      newPatientCreationsExecuted: successfulCreations,
      existingPatientsRequiringUpdatePlanned: counts.existing_needs_update,
      existingPatientsUpdatesExecuted: successfulUpdates,
      existingAlreadyClosedSkipped: counts.existing_already_closed,
      ambiguousMatchesSkipped: counts.ambiguous_matches,
      missingNameSkipped: counts.missing_name_skipped,
      failedOperations,
    },
    csvReport: csvReportPath,
  };

  fs.writeFileSync(jsonReportPath, JSON.stringify(summary, null, 2), "utf8");

  console.log("\n===============================================================================");
  console.log("                           FINAL EXECUTION SUMMARY                             ");
  console.log("===============================================================================");
  console.log(`Execution Mode:                 ${isCommit ? "LIVE COMMIT" : "DRY-RUN (SIMULATED)"}`);
  console.log(`Total Source Records:           ${parsedRows.length}`);
  console.log(`Patients Created (CLOSED):      ${successfulCreations}`);
  console.log(`Patients Status Updated (CLOSED):${successfulUpdates}`);
  console.log(`Patients Already CLOSED (Skip): ${counts.existing_already_closed}`);
  console.log(`Ambiguous Matches (Skip):       ${counts.ambiguous_matches}`);
  console.log(`Missing Name Rows (Skip):       ${counts.missing_name_skipped}`);
  console.log(`Failed / Errors:                ${failedOperations}`);
  console.log("-------------------------------------------------------------------------------");
  console.log(`CSV Audit Report:               ${csvReportPath}`);
  console.log(`JSON Summary Report:            ${jsonReportPath}`);
  console.log("===============================================================================\n");

  await mongoose.disconnect();
  console.log("Database connection closed cleanly.\n");

  if (!isCommit) {
    console.log("NOTICE: This was a DRY-RUN simulation. Zero database records were modified.");
    console.log("To execute live production modifications after approval, run:");
    console.log(`node --env-file=.env.local scripts/import-surgery-done-patients.js --commit --confirm="${REQUIRED_CONFIRM_PHRASE}"\n`);
  }
}

main().catch((err) => {
  console.error("FATAL SCRIPT ERROR:", err);
  process.exit(1);
});
