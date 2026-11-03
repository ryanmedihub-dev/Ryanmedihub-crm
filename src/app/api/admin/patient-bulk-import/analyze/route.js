import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import Patient from "@/models/Patient";
import { normalizePhone } from "@/lib/phone";
import { ALL_BRANCHES } from "@/lib/branches";
import fs from "fs";
import path from "path";

const ALLOWED_ROLES = ["super-admin", "owner"];

/** Parse TSV or CSV text, ignoring trailing blank lines */
function parseDelimited(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return { headers: [], rows: [] };

  const delim = lines[0].includes("\t") ? "\t" : ",";

  const headers = lines[0]
    .split(delim)
    .map((h) => h.trim().replace(/^\uFEFF/, "").replace(/^"/, "").replace(/"$/, ""));

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue; // Skip empty lines
    const cells = lines[i].split(delim);
    const row = {};
    headers.forEach((h, idx) => {
      let val = (cells[idx] || "").trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1).trim();
      }
      row[h] = val;
    });
    rows.push(row);
  }
  return { headers, rows };
}

/** Map a raw CSV row to normalized import record */
function mapRow(row, rowIndex) {
  const name = (row["Patient name"] || "").trim().toUpperCase();
  const phone = (row["Phone"] || "").trim();
  const branch = (row["Branch (source)"] || "").trim();
  const service = (row["Service / procedure (source)"] || "").trim();
  const sourceFile = (row["Source file(s)"] || "").trim();

  const genderRaw = (row["Healcon gender"] || row["Gender (legacy activity)"] || "").trim().toLowerCase();
  let gender = null;
  if (genderRaw === "male") gender = "MALE";
  else if (genderRaw === "female") gender = "FEMALE";

  const ageRaw = (row["Healcon age"] || "").trim();
  let age = null;
  if (ageRaw) {
    const parsedAge = parseInt(ageRaw, 10);
    if (!isNaN(parsedAge) && parsedAge > 0 && parsedAge < 120) {
      age = parsedAge;
    }
  }

  const phoneNormalized = normalizePhone(phone);
  const isPhoneValid = Boolean(phoneNormalized && phoneNormalized.length === 10);

  const issues = [];
  if (!name) issues.push("missing_name");
  if (!phone || !isPhoneValid) issues.push("invalid_phone");
  if (!branch) {
    issues.push("missing_branch");
  } else if (!ALL_BRANCHES.includes(branch)) {
    issues.push("invalid_branch");
  }
  if (!service) issues.push("missing_service");

  return {
    rowIndex,
    name,
    phone,
    phoneNormalized: isPhoneValid ? phoneNormalized : null,
    branch,
    service,
    sourceFile,
    gender,
    age,
    issues,
  };
}

async function analyzeTextContent(text) {
  const { rows } = parseDelimited(text);

  if (!rows.length) {
    return { success: false, message: "File is empty or could not be parsed" };
  }

  const mapped = rows.map((row, idx) => mapRow(row, idx + 1));

  await dbConnect();

  const validPhones = mapped
    .filter((r) => r.phoneNormalized)
    .map((r) => r.phoneNormalized);

  // Live database query for all phones
  const existingInDb = await Patient.find(
    { "personal.phoneNormalized": { $in: validPhones } },
    { "personal.phoneNormalized": 1, "personal.name": 1, "ops.status": 1, "personal.branch": 1 }
  ).lean();

  // Group DB documents by normalized phone to detect ambiguous matches
  const phoneToDbDocsMap = new Map();
  existingInDb.forEach((doc) => {
    const p = doc.personal?.phoneNormalized;
    if (p) {
      if (!phoneToDbDocsMap.has(p)) phoneToDbDocsMap.set(p, []);
      phoneToDbDocsMap.get(p).push(doc);
    }
  });

  // Intra-file duplicate detection
  const seenPhones = new Map();

  const analysis = mapped.map((r) => {
    const rec = { ...r };

    // 1. Invalid or missing phone
    if (!r.phoneNormalized) {
      rec.classification = "invalid_phone";
      rec.action = "skip";
      rec.reason = "Invalid or missing phone number";
      return rec;
    }

    // 2. Intra-file duplicate phone
    if (seenPhones.has(r.phoneNormalized)) {
      rec.classification = "duplicate_source";
      rec.duplicateOfRow = seenPhones.get(r.phoneNormalized);
      rec.action = "skip";
      rec.reason = `Duplicate phone in file (first seen on row ${seenPhones.get(r.phoneNormalized)})`;
      return rec;
    }
    seenPhones.set(r.phoneNormalized, r.rowIndex);

    // 3. Match against live CRM database
    const dbMatches = phoneToDbDocsMap.get(r.phoneNormalized) || [];

    // 3a. Ambiguous match (>1 patient document in DB with this phone)
    if (dbMatches.length > 1) {
      rec.classification = "ambiguous_match";
      rec.action = "review";
      rec.ambiguousDocs = dbMatches.map((d) => ({
        id: d._id,
        name: d.personal?.name,
        status: d.ops?.status,
        branch: d.personal?.branch,
      }));
      rec.reason = `Matches ${dbMatches.length} existing patient records in DB — requires manual review`;
      return rec;
    }

    // 3b. Exactly 1 matching patient in DB
    if (dbMatches.length === 1) {
      const existing = dbMatches[0];
      rec.existingPatient = {
        _id: existing._id,
        name: existing.personal?.name,
        status: existing.ops?.status || "UNKNOWN",
        branch: existing.personal?.branch,
      };

      if (existing.ops?.status === "CLOSED") {
        rec.classification = "existing_already_closed";
        rec.action = "skip";
        rec.reason = `Already CLOSED in database (ID: ${existing._id})`;
      } else {
        // Not CLOSED: requires ops.status update to CLOSED
        if (!r.name) {
          rec.classification = "missing_name_existing_in_db";
          rec.action = "update_status_only";
          rec.reason = `Existing patient (Status: ${existing.ops?.status || "UNKNOWN"}). Name missing in CSV but present in DB (${existing.personal?.name}). Will update ops.status to CLOSED only.`;
        } else {
          rec.classification = "existing_needs_update";
          rec.action = "update_status_only";
          rec.reason = `Existing patient (Status: ${existing.ops?.status || "UNKNOWN"}). Will update ops.status to CLOSED only without touching any other field.`;
        }
      }
      return rec;
    }

    // 4. Not in live DB
    if (!r.name) {
      rec.classification = "missing_name_skipped";
      rec.action = "skip";
      rec.reason = "Missing required patient name in source CSV (not in DB, cannot create)";
      return rec;
    }

    // Eligible new patient creation
    rec.classification = "new_patient";
    rec.action = "create";
    rec.reason = "New patient — will create with ops.status = CLOSED";
    return rec;
  });

  // Mutually exclusive counts
  const newPatients = analysis.filter((r) => r.classification === "new_patient");
  const alreadyClosed = analysis.filter((r) => r.classification === "existing_already_closed");
  const needsUpdate = analysis.filter((r) => r.classification === "existing_needs_update");
  const missingNameInDb = analysis.filter((r) => r.classification === "missing_name_existing_in_db");
  const ambiguous = analysis.filter((r) => r.classification === "ambiguous_match");
  const missingNameSkipped = analysis.filter((r) => r.classification === "missing_name_skipped");
  const invalidPhones = analysis.filter((r) => r.classification === "invalid_phone");
  const duplicateSource = analysis.filter((r) => r.classification === "duplicate_source");

  const counts = {
    total: analysis.length,

    // Primary workflow classifications (mutually exclusive)
    new_patient_creations: newPatients.length,
    existing_already_closed: alreadyClosed.length,
    existing_needs_update: needsUpdate.length,
    missing_name_existing_in_db: missingNameInDb.length,
    total_status_updates: needsUpdate.length + missingNameInDb.length,
    ambiguous_matches: ambiguous.length,
    missing_name_skipped: missingNameSkipped.length,
    invalid_phone: invalidPhones.length,
    duplicate_source: duplicateSource.length,

    // Total operations planned
    total_creations_planned: newPatients.length,
    total_updates_planned: needsUpdate.length + missingNameInDb.length,

    // Sub-field issue stats (among new patients)
    new_patients_missing_branch: newPatients.filter((r) => r.issues.includes("missing_branch")).length,
    new_patients_missing_service: newPatients.filter((r) => r.issues.includes("missing_service")).length,
  };

  return {
    success: true,
    counts,
    records: analysis,
  };
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !ALLOWED_ROLES.includes(session.user?.role)) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Super Admin access required." },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file) {
      return NextResponse.json({ success: false, message: "No file uploaded" }, { status: 400 });
    }

    const text = await file.text();
    const result = await analyzeTextContent(text);
    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("Bulk import analyze POST error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !ALLOWED_ROLES.includes(session.user?.role)) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Super Admin access required." },
        { status: 403 }
      );
    }

    const filePath = path.join(process.cwd(), "data", "imports");
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ success: false, message: "Bundled data/imports file not found" }, { status: 404 });
    }

    const text = fs.readFileSync(filePath, "utf8");
    const result = await analyzeTextContent(text);
    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json({ ...result, fileName: "data/imports (Bundled Dataset)" });
  } catch (err) {
    console.error("Bulk import analyze GET error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
