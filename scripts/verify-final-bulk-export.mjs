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
const targetDirArg = process.argv[2] || "patient-pdf-export-final";
const FINAL_DIR = path.isAbsolute(targetDirArg) ? targetDirArg : path.join(ROOT_DIR, targetDirArg);
const PDFS_DIR = path.join(FINAL_DIR, "PDFs");

console.log("==================================================================");
console.log("    RyanCRM Final Bulk Export Integrity Verification Suite       ");
console.log("==================================================================");

async function verifyFinalExport() {
  const uri = process.env.MONGODB_URI;
  assert.ok(uri, "MONGODB_URI must be set");

  // 1. Database Connection & Enumeration
  console.log("Step 1: Connecting to MongoDB and verifying patient count...");
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  const dbTotalPatients = await db.collection("patients").countDocuments();
  console.log(`  Live Database Total Patients: ${dbTotalPatients}`);

  // 2. Manifest and Summary Verification
  console.log("Step 2: Checking manifest files...");
  const manifestJsonPath = path.join(FINAL_DIR, "manifest.json");
  const manifestCsvPath = path.join(FINAL_DIR, "manifest.csv");
  const summaryJsonPath = path.join(FINAL_DIR, "export-summary.json");
  const errorsJsonPath = path.join(FINAL_DIR, "errors.json");
  const attachErrorsPath = path.join(FINAL_DIR, "attachment-errors.json");

  assert.ok(fs.existsSync(manifestJsonPath), "manifest.json must exist in patient-pdf-export-final");
  assert.ok(fs.existsSync(manifestCsvPath), "manifest.csv must exist in patient-pdf-export-final");
  assert.ok(fs.existsSync(summaryJsonPath), "export-summary.json must exist in patient-pdf-export-final");
  assert.ok(fs.existsSync(errorsJsonPath), "errors.json must exist in patient-pdf-export-final");
  assert.ok(fs.existsSync(attachErrorsPath), "attachment-errors.json must exist in patient-pdf-export-final");

  const manifest = JSON.parse(await fsp.readFile(manifestJsonPath, "utf8"));
  const summary = JSON.parse(await fsp.readFile(summaryJsonPath, "utf8"));
  const records = Object.values(manifest.records || {});
  console.log(`  Manifest Total Records: ${records.length}`);
  console.log(`  Summary Database Count: ${summary.databasePatientCount}`);
  console.log(`  Summary Verified Files On Disk: ${summary.verifiedFilesOnDisk}`);
  console.log(`  Summary Failed Exports: ${summary.failedExports}`);

  assert.equal(records.length, dbTotalPatients, `Manifest records (${records.length}) must equal DB count (${dbTotalPatients})`);
  assert.equal(summary.failedExports, 0, "Summary failedExports must be 0");

  // 3. Duplicate ID and Filename Collision Verification
  console.log("Step 3: Checking for duplicate patient IDs and filename collisions...");
  const seenIds = new Set();
  const seenFilenames = new Set();
  let successCount = 0;
  let failedCount = 0;

  for (const r of records) {
    assert.ok(!seenIds.has(r.patientId), `Duplicate patient ID found: ${r.patientId}`);
    seenIds.add(r.patientId);

    assert.ok(!seenFilenames.has(r.filename), `Duplicate filename found: ${r.filename}`);
    seenFilenames.add(r.filename);

    if (r.exportStatus === "SUCCESS") {
      successCount++;
    } else {
      failedCount++;
    }
  }

  console.log(`  Unique Patient IDs Verified : ${seenIds.size}`);
  console.log(`  Unique Filenames Verified   : ${seenFilenames.size}`);
  console.log(`  Successful Export Records   : ${successCount}`);
  console.log(`  Failed Export Records       : ${failedCount}`);
  assert.equal(failedCount, 0, "No records should have failed export status");
  assert.equal(successCount, dbTotalPatients, "All patients must be marked SUCCESS");

  // 4. Filesystem PDF Verification
  console.log("Step 4: Scanning filesystem PDFs directory...");
  assert.ok(fs.existsSync(PDFS_DIR), "PDFs directory must exist");
  const filesOnDisk = await fsp.readdir(PDFS_DIR);
  console.log(`  Total PDF files found on disk: ${filesOnDisk.length}`);
  assert.equal(filesOnDisk.length, dbTotalPatients, `Files on disk (${filesOnDisk.length}) must equal DB patient count (${dbTotalPatients})`);

  let totalBytes = 0;
  let emptyCount = 0;
  let invalidHeaderCount = 0;

  // Verify sample and check all headers
  console.log("Step 5: Verifying binary signatures (%PDF-) and file sizes across all PDFs...");
  const fdBuffer = Buffer.alloc(5);
  for (let i = 0; i < filesOnDisk.length; i++) {
    const fn = filesOnDisk[i];
    const fullPath = path.join(PDFS_DIR, fn);
    const stat = fs.statSync(fullPath);
    totalBytes += stat.size;

    if (stat.size === 0) {
      emptyCount++;
      continue;
    }

    const fd = fs.openSync(fullPath, "r");
    fs.readSync(fd, fdBuffer, 0, 5, 0);
    fs.closeSync(fd);

    if (fdBuffer.toString("ascii") !== "%PDF-") {
      invalidHeaderCount++;
    }

    if ((i + 1) % 2500 === 0 || i + 1 === filesOnDisk.length) {
      console.log(`  Checked ${i + 1} / ${filesOnDisk.length} files...`);
    }
  }

  console.log(`  Total Directory Size: ${(totalBytes / (1024 ** 2)).toFixed(2)} MB (${(totalBytes / (1024 ** 3)).toFixed(3)} GB)`);
  console.log(`  Empty Files (0 bytes): ${emptyCount}`);
  console.log(`  Invalid Magic Bytes: ${invalidHeaderCount}`);
  assert.equal(emptyCount, 0, "Zero empty files allowed");
  assert.equal(invalidHeaderCount, 0, "All files must start with %PDF- header");

  // 5. Deep parse a sample of PDFs with pdf-lib to ensure structural validity
  console.log("Step 6: Parsing sample PDFs with pdf-lib...");
  const sampleIndices = [0, 500, 1500, 3000, 6000, 9300, filesOnDisk.length - 1];
  for (const idx of sampleIndices) {
    if (idx < filesOnDisk.length) {
      const sampleFile = filesOnDisk[idx];
      const bytes = await fsp.readFile(path.join(PDFS_DIR, sampleFile));
      const doc = await PDFDocument.load(bytes);
      const pageCount = doc.getPageCount();
      assert.ok(pageCount >= 1, `Sample ${sampleFile} must have at least 1 page`);
      console.log(`  Verified sample [${idx}]: ${sampleFile} (${pageCount} page(s), ${bytes.length} bytes)`);
    }
  }

  // 6. Attachment Accounting
  console.log("Step 7: Validating attachment accounting in manifest...");
  const attachRecords = records.filter(r => (r.attachmentsDiscovered || 0) > 0);
  console.log(`  Patients with Attachments Discovered: ${attachRecords.length}`);
  let totalDiscovered = 0;
  let totalEmbeddedImages = 0;
  let totalMergedPdfPages = 0;
  let totalUnavailable = 0;
  let totalFailed = 0;

  for (const r of records) {
    totalDiscovered += (r.attachmentsDiscovered || 0);
    totalEmbeddedImages += (r.embeddedImages || 0);
    totalMergedPdfPages += (r.embeddedPdfPages || 0);
    totalUnavailable += (r.attachmentsUnavailable || 0);
    totalFailed += (r.attachmentsFailed || 0);
  }

  console.log(`  Total Discovered Attachments: ${totalDiscovered}`);
  console.log(`  Total Embedded Images (in Collages): ${totalEmbeddedImages}`);
  console.log(`  Total Native Merged PDF Pages: ${totalMergedPdfPages}`);
  console.log(`  Total Unavailable (Storage 404): ${totalUnavailable}`);
  console.log(`  Total Failed Attachments: ${totalFailed}`);

  // 7. Check that no DB patient silently disappeared
  console.log("Step 8: Verifying complete 1-to-1 DB mapping with zero omissions...");
  const allDbPatients = await db.collection("patients").find({}, { projection: { _id: 1 } }).toArray();
  const dbIdSet = new Set(allDbPatients.map(p => p._id.toString()));
  let missingCount = 0;
  for (const p of allDbPatients) {
    if (!manifest.records[p._id.toString()]) {
      missingCount++;
    }
  }
  console.log(`  Missing DB Patients in Export: ${missingCount}`);
  assert.equal(missingCount, 0, "Every single database patient must exist in the export manifest");

  await mongoose.disconnect();
  console.log("==================================================================");
  console.log("ALL FINAL BULK EXPORT INTEGRITY CHECKS PASSED SUCCESSFULLY!");
  console.log("==================================================================");
}

verifyFinalExport().catch(async (err) => {
  console.error("VERIFICATION FAILED:", err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
