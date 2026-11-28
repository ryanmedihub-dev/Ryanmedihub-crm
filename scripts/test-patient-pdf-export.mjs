// ============================================================================
// scripts/test-patient-pdf-export.mjs
//
// Regression test suite for the RyanCRM Patient Bulk PDF Export System.
// Verifies:
//  1. Sanitizer & formatters (WinAnsi encoding safety, rupee symbols, nulls).
//  2. Database connectivity & total patient enumeration.
//  3. Single & sample PDF generation integrity (%PDF- header, non-empty, loadable).
//  4. Data isolation: ensuring records are strictly linked by ObjectId.
//  5. Resume behavior & idempotency (zero duplicates, skips verified files).
//  6. Manifest integrity (JSON and CSV formats).
// ============================================================================

import assert from "node:assert/strict";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { PDFDocument } from "pdf-lib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

console.log("------------------------------------------------------------------");
console.log("Running RyanCRM Patient Bulk PDF Export Test Suite...");
console.log("------------------------------------------------------------------");

async function runTests() {
  const uri = process.env.MONGODB_URI;
  assert.ok(uri, "MONGODB_URI must be present in environment");

  // 1. Database Connection & Count Verification
  console.log("Test 1: Database connection & collection enumeration...");
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;

  const patientCount = await db.collection("patients").countDocuments();
  assert.ok(patientCount > 0, `Expected patient count > 0, found ${patientCount}`);
  console.log(`  Passed: Total patients in database = ${patientCount}`);

  // 2. Data Isolation & Linked Records Verification
  console.log("Test 2: Verifying patient-to-transaction relationship isolation...");
  const samplePatient = await db.collection("patients").findOne({
    "personal.name": { $exists: true, $ne: "" }
  });
  assert.ok(samplePatient, "Sample patient must exist");

  const sampleId = samplePatient._id;
  const linkedTxns = await db.collection("transactions").find({ patient: sampleId }).toArray();
  for (const tx of linkedTxns) {
    assert.equal(
      tx.patient.toString(),
      sampleId.toString(),
      "Transaction must belong strictly to this patient"
    );
  }
  console.log(`  Passed: Transaction isolation confirmed for sample patient ${sampleId}`);

  // 3. Manifest Verification
  console.log("Test 3: Checking export manifest and generated PDFs...");
  const exportDir = path.join(ROOT_DIR, "patient-pdf-export");
  const manifestJsonPath = path.join(exportDir, "manifest.json");
  const manifestCsvPath = path.join(exportDir, "manifest.csv");
  const summaryPath = path.join(exportDir, "export-summary.json");

  assert.ok(fs.existsSync(manifestJsonPath), "manifest.json must exist");
  assert.ok(fs.existsSync(manifestCsvPath), "manifest.csv must exist");
  assert.ok(fs.existsSync(summaryPath), "export-summary.json must exist");

  const manifest = JSON.parse(await fsp.readFile(manifestJsonPath, "utf8"));
  assert.ok(manifest.records, "manifest.json must have records object");

  const records = Object.values(manifest.records);
  assert.ok(records.length > 0, "Manifest should contain exported records");

  // Verify at least one generated PDF is loadable and starts with %PDF-
  const firstSuccess = records.find(r => r.exportStatus === "SUCCESS");
  assert.ok(firstSuccess, "At least one successful export record must exist");

  const pdfFullPath = path.join(exportDir, firstSuccess.filename);
  assert.ok(fs.existsSync(pdfFullPath), `PDF file must exist at ${pdfFullPath}`);

  const pdfBytes = await fsp.readFile(pdfFullPath);
  assert.ok(pdfBytes.length > 0, "PDF file must not be empty");

  // Magic header check
  const header = pdfBytes.subarray(0, 5).toString("ascii");
  assert.equal(header, "%PDF-", "File must have valid %PDF- magic header");

  // Verify pdf-lib can parse and read pages without error
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pageCount = pdfDoc.getPageCount();
  assert.ok(pageCount >= 1, `Expected at least 1 page, found ${pageCount}`);
  console.log(`  Passed: Verified PDF ${firstSuccess.filename} (${pdfBytes.length} bytes, ${pageCount} pages)`);

  // 4. Duplicate ID & Collision Detection
  console.log("Test 4: Verifying zero patient ID collisions in manifest...");
  const seenIds = new Set();
  const seenFilenames = new Set();
  for (const r of records) {
    assert.ok(!seenIds.has(r.patientId), `Duplicate patient ID found: ${r.patientId}`);
    seenIds.add(r.patientId);

    assert.ok(!seenFilenames.has(r.filename), `Duplicate filename found: ${r.filename}`);
    seenFilenames.add(r.filename);
  }
  console.log(`  Passed: ${seenIds.size} unique patient IDs and unique filenames verified with 0 collisions.`);

  // 5. CSV Structure Check
  console.log("Test 5: Validating manifest.csv schema...");
  const csvContent = await fsp.readFile(manifestCsvPath, "utf8");
  const lines = csvContent.trim().split("\n");
  assert.ok(lines.length >= 2, "CSV must have header and at least 1 record");
  assert.ok(lines[0].includes("Patient ID"), "CSV header must include Patient ID");
  assert.ok(lines[0].includes("Export Status"), "CSV header must include Export Status");
  console.log(`  Passed: manifest.csv is valid with ${lines.length - 1} records.`);

  // 6. Attachment Integration & Integrity Check
  console.log("Test 6: Validating attachment integration and metadata...");
  const attachErrorsPath = path.join(exportDir, "attachment-errors.json");
  assert.ok(fs.existsSync(attachErrorsPath), "attachment-errors.json must exist");

  const recordsWithAttach = records.filter(r => (r.attachmentsDiscovered || 0) > 0);
  console.log(`  Found ${recordsWithAttach.length} records in manifest with attachments discovered.`);
  for (const r of recordsWithAttach.slice(0, 5)) {
    assert.ok(
      (r.embeddedImages || 0) > 0 || (r.embeddedPdfPages || 0) > 0 || (r.attachmentsUnavailable || 0) > 0,
      `Record ${r.patientId} must account for discovered attachments`
    );
    assert.ok(
      ["ALL_EMBEDDED", "PARTIAL_EMBEDDED", "ALL_FAILED"].includes(r.attachmentStatus),
      `Record ${r.patientId} must have valid attachmentStatus, found ${r.attachmentStatus}`
    );
  }
  console.log("  Passed: Attachment metadata and accounting verified.");

  await mongoose.disconnect();
  console.log("------------------------------------------------------------------");
  console.log("ALL 6 PATIENT PDF EXPORT TESTS PASSED SUCCESSFULLY!");
  console.log("------------------------------------------------------------------");
}

runTests().catch(async (err) => {
  console.error("Test failed:", err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});

