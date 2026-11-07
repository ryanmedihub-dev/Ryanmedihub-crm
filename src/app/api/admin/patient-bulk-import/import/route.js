import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import Patient from "@/models/Patient";
import ImportLog from "@/models/ImportLog";
import { normalizePhone } from "@/lib/phone";
import { cacheInvalidate } from "@/lib/cache";

const ALLOWED_ROLES = ["super-admin", "owner"];

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !ALLOWED_ROLES.includes(session.user?.role)) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Super Admin access required." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      importId,
      batchIndex = 0,
      totalBatches = 1,
      mode = "dry_run",
      records = [],
      defaultBranch = "",
      allowMissingNameExistingUpdate = true, // Whether to update status for existing patients whose name was empty in CSV
    } = body;

    if (!importId) {
      return NextResponse.json(
        { success: false, message: "Missing importId" },
        { status: 400 }
      );
    }

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json(
        { success: false, message: "No records in batch" },
        { status: 400 }
      );
    }

    await dbConnect();

    // Query DB for any existing patients matching this batch's phone numbers
    const validPhonesInBatch = records
      .map((r) => r.phoneNormalized || normalizePhone(r.phone))
      .filter((p) => p && p.length === 10);

    const existingPatients = await Patient.find(
      { "personal.phoneNormalized": { $in: validPhonesInBatch } },
      { "personal.phoneNormalized": 1, "personal.name": 1, "ops.status": 1, "personal.branch": 1 }
    ).lean();

    const phoneToDocsMap = new Map();
    existingPatients.forEach((p) => {
      const ph = p.personal?.phoneNormalized;
      if (ph) {
        if (!phoneToDocsMap.has(ph)) phoneToDocsMap.set(ph, []);
        phoneToDocsMap.get(ph).push(p);
      }
    });

    const batchResults = [];
    let createdCount = 0;
    let statusUpdatedCount = 0;
    let alreadyClosedCount = 0;
    let ambiguousCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const rec of records) {
      const rowIndex = rec.rowIndex;
      const phone = (rec.phone || "").trim();
      const phoneNormalized = rec.phoneNormalized || normalizePhone(phone);
      const name = (rec.name || "").trim().toUpperCase();
      const branchToUse = rec.branch || defaultBranch || "";

      // 1. Missing or invalid phone
      if (!phoneNormalized || phoneNormalized.length !== 10) {
        skippedCount++;
        batchResults.push({
          rowIndex,
          name,
          phone,
          result: "invalid_phone",
          reason: "Invalid or missing phone number",
        });
        continue;
      }

      // Check live DB matches for this phone
      const dbDocs = phoneToDocsMap.get(phoneNormalized) || [];

      // 2. Ambiguous match (>1 patient in DB) -> Never update automatically
      if (dbDocs.length > 1) {
        ambiguousCount++;
        batchResults.push({
          rowIndex,
          name,
          phone,
          phoneNormalized,
          result: "ambiguous_match",
          reason: `Matches ${dbDocs.length} patients in DB — manual review required`,
        });
        continue;
      }

      // 3. Exactly 1 matching patient in DB
      if (dbDocs.length === 1) {
        const existingDoc = dbDocs[0];
        const currentStatus = existingDoc.ops?.status || "UNKNOWN";

        if (currentStatus === "CLOSED") {
          alreadyClosedCount++;
          batchResults.push({
            rowIndex,
            name: name || existingDoc.personal?.name,
            phone,
            phoneNormalized,
            patientId: existingDoc._id,
            oldStatus: "CLOSED",
            newStatus: "CLOSED",
            result: "existing_closed",
            reason: "Already CLOSED in database — skipped",
          });
          continue;
        }

        // Patient exists and is NOT CLOSED -> Update ONLY ops.status
        if (!name && !allowMissingNameExistingUpdate) {
          skippedCount++;
          batchResults.push({
            rowIndex,
            name: "",
            phone,
            phoneNormalized,
            patientId: existingDoc._id,
            result: "skipped",
            reason: "Name missing in CSV — skipped existing patient update",
          });
          continue;
        }

        if (mode === "dry_run") {
          statusUpdatedCount++;
          batchResults.push({
            rowIndex,
            name: name || existingDoc.personal?.name,
            phone,
            phoneNormalized,
            patientId: existingDoc._id,
            oldStatus: currentStatus,
            newStatus: "CLOSED",
            result: "status_updated",
            reason: `[Dry Run] Ready to update ops.status from ${currentStatus} to CLOSED (preserves all other fields)`,
          });
        } else {
          // Commit mode: Narrowly scoped update touching ONLY ops.status
          try {
            await Patient.updateOne(
              { _id: existingDoc._id },
              { $set: { "ops.status": "CLOSED" } }
            );

            // Update in-memory map to reflect new status for subsequent batch rows
            existingDoc.ops = existingDoc.ops || {};
            existingDoc.ops.status = "CLOSED";

            statusUpdatedCount++;
            batchResults.push({
              rowIndex,
              name: name || existingDoc.personal?.name,
              phone,
              phoneNormalized,
              patientId: existingDoc._id,
              oldStatus: currentStatus,
              newStatus: "CLOSED",
              result: "status_updated",
              reason: `Successfully updated ops.status from ${currentStatus} to CLOSED (all other patient data preserved)`,
            });
          } catch (err) {
            console.error(`Error updating status for patient ${existingDoc._id}:`, err);
            errorCount++;
            batchResults.push({
              rowIndex,
              name: name || existingDoc.personal?.name,
              phone,
              phoneNormalized,
              patientId: existingDoc._id,
              result: "error",
              reason: `Failed to update status: ${err.message}`,
            });
          }
        }
        continue;
      }

      // 4. Not in live DB -> New Patient Creation
      if (!name) {
        skippedCount++;
        batchResults.push({
          rowIndex,
          name: "",
          phone,
          phoneNormalized,
          result: "missing_name",
          reason: "Missing required patient name in source CSV (cannot create)",
        });
        continue;
      }

      if (mode === "dry_run") {
        createdCount++;
        batchResults.push({
          rowIndex,
          name,
          phone,
          phoneNormalized,
          branch: branchToUse,
          gender: rec.gender || null,
          result: "created",
          reason: "[Dry Run] Ready for creation with ops.status = CLOSED",
        });
      } else {
        // Commit mode: Create new patient document
        try {
          const remarksParts = [];
          if (rec.service) remarksParts.push(`Service: ${rec.service}`);
          if (rec.sourceFile) remarksParts.push(`Source: ${rec.sourceFile}`);
          remarksParts.push("Historical completed surgery patient (Bulk Import)");

          const newPatient = new Patient({
            personal: {
              name,
              phone,
              phoneNormalized,
              branch: branchToUse,
              gender: rec.gender || "MALE",
              ...(rec.age ? { age: rec.age } : {}),
              remarks: remarksParts.join(" | "),
            },
            ops: {
              status: "CLOSED",
            },
          });

          // In-memory flag tells pre-save hook to preserve CLOSED status
          newPatient.$locals.preserveImportedStatus = true;
          const saved = await newPatient.save();

          // Add to phoneToDocsMap to ensure idempotency within the batch
          phoneToDocsMap.set(phoneNormalized, [saved]);

          createdCount++;
          batchResults.push({
            rowIndex,
            name,
            phone,
            phoneNormalized,
            branch: branchToUse,
            result: "created",
            patientId: saved._id,
            reason: "Successfully created with ops.status = CLOSED",
          });
        } catch (err) {
          console.error(`Error creating patient row ${rowIndex}:`, err);
          errorCount++;
          batchResults.push({
            rowIndex,
            name,
            phone,
            phoneNormalized,
            result: "error",
            reason: err.message,
          });
        }
      }
    }

    const isLastBatch = batchIndex >= totalBatches - 1;

    // Persist audit log
    const logDoc = await ImportLog.findOneAndUpdate(
      { importId },
      {
        $setOnInsert: {
          importId,
          mode: mode === "dry_run" ? "dry_run" : "committed",
          importedBy: {
            name: session.user.name || "Admin",
            email: session.user.email || "",
            branch: session.user.branch || "",
          },
          totalRows: 0,
          created: 0,
          statusUpdated: 0,
          alreadyClosed: 0,
          ambiguous: 0,
          skipped: 0,
          errors: 0,
        },
        $inc: {
          totalRows: records.length,
          created: createdCount,
          statusUpdated: statusUpdatedCount,
          alreadyClosed: alreadyClosedCount,
          ambiguous: ambiguousCount,
          skipped: skippedCount,
          errors: errorCount,
        },
        $push: {
          records: {
            $each: batchResults.map((r) => ({
              rowIndex: r.rowIndex,
              name: r.name,
              phone: r.phone,
              phoneNormalized: r.phoneNormalized,
              branch: r.branch || "",
              result: r.result,
              patientId: r.patientId || null,
              oldStatus: r.oldStatus || null,
              newStatus: r.newStatus || null,
              reason: r.reason,
            })),
          },
        },
        $set: {
          ...(isLastBatch ? { completedAt: new Date() } : {}),
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    if (isLastBatch && mode === "commit") {
      try {
        await cacheInvalidate("patients:*");
      } catch (cErr) {
        console.error("Cache invalidation error:", cErr);
      }
    }

    return NextResponse.json({
      success: true,
      importId,
      batchIndex,
      totalBatches,
      isLastBatch,
      summary: {
        batchProcessed: records.length,
        created: createdCount,
        statusUpdated: statusUpdatedCount,
        alreadyClosed: alreadyClosedCount,
        ambiguous: ambiguousCount,
        skipped: skippedCount,
        errors: errorCount,
        totalCumulativeCreated: logDoc.created,
        totalCumulativeUpdated: logDoc.statusUpdated,
      },
      results: batchResults,
    });
  } catch (err) {
    console.error("Bulk import batch error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
