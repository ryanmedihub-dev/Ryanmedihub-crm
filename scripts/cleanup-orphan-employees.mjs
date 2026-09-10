// scripts/cleanup-orphan-employees.mjs
//
// Deletes employees that are safe to remove: ALL of
//   1. no `employeeId` (staff code) set
//   2. no patients — empty `Employee.patient[]` AND not referenced on any Patient path
//   3. no active finance record — zero payables / receivables / advances / borrowings /
//      expense transactions, and zero interview assignments
//
// The reference surface is driven off src/constants/employeeReferences.js, so it stays in
// step with the schemas. Merged-away duplicates (`mergedInto != null`) are skipped — those
// belong to the merge/revert flow.
//
// SAFETY: dry run by default. Nothing is deleted unless you pass --apply. Every deletion is
// written to the `deletelogs` collection (entityType "Employee") for an audit trail.
//
// Dry run:  node --env-file=.env scripts/cleanup-orphan-employees.mjs
// Apply:    node --env-file=.env scripts/cleanup-orphan-employees.mjs --apply

import mongoose from "mongoose";
import { EMPLOYEE_REFERENCES } from "../src/constants/employeeReferences.js";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Set MONGODB_URI (run with: node --env-file=.env scripts/cleanup-orphan-employees.mjs)");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");

// model name -> collection name (Mongoose default pluralisation; no `collection:` override
// on any of these schemas)
const COLL = {
  Employee: "employees",
  Patient: "patients",
  Payable: "payables",
  Receivable: "receivables",
  Advance: "advances",
  Borrowing: "borrowings",
  Transactions: "transactions",
  Interviewer: "interviewers",
};

const PATIENT_REFS = EMPLOYEE_REFERENCES.filter((r) => r.model === "Patient");
const NON_PATIENT_REFS = EMPLOYEE_REFERENCES.filter((r) => r.model !== "Patient");

async function main() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  const employees = await db
    .collection("employees")
    .find({ mergedInto: null }, { projection: { name: 1, employeeId: 1, role: 1, branch: 1, patient: 1, createdAt: 1 } })
    .toArray();

  console.log(`Scanning ${employees.length} live employees…\n`);

  const orphans = [];
  const kept = { hasEmployeeId: 0, hasPatients: 0, hasFinance: 0 };

  for (const e of employees) {
    if (e.employeeId && String(e.employeeId).trim()) {
      kept.hasEmployeeId++;
      continue;
    }
    if (Array.isArray(e.patient) && e.patient.length > 0) {
      kept.hasPatients++;
      continue;
    }

    // patient references (reference / counsellor / surgery team / incentive rows)
    let patientRefs = 0;
    for (const ref of PATIENT_REFS) {
      patientRefs += await db.collection("patients").countDocuments({ [ref.path]: e._id, ...(ref.guard || {}) });
      if (patientRefs) break;
    }
    if (patientRefs) {
      kept.hasPatients++;
      continue;
    }

    // finance + interview references
    const byPath = [];
    let financeRefs = 0;
    for (const ref of NON_PATIENT_REFS) {
      const n = await db.collection(COLL[ref.model]).countDocuments({ [ref.path]: e._id, ...(ref.guard || {}) });
      if (n) byPath.push(`${ref.model}.${ref.path}=${n}`);
      financeRefs += n;
    }
    if (financeRefs) {
      kept.hasFinance++;
      continue;
    }

    orphans.push(e);
  }

  console.log(
    `Kept: ${kept.hasEmployeeId} with an employee ID · ${kept.hasPatients} with patients · ${kept.hasFinance} with finance/interview records\n`,
  );

  if (orphans.length === 0) {
    console.log("No orphan employees to delete.");
  } else {
    console.log(`${orphans.length} orphan employee(s) ${APPLY ? "being deleted" : "would be deleted"}:\n`);
    for (const e of orphans) {
      console.log(`  ${String(e.name || "(no name)").padEnd(30)} ${e.role || "-"}  ${e.branch || "-"}  ${e._id}`);
    }

    if (APPLY) {
      const now = new Date();
      const logs = orphans.map((e) => ({
        entityType: "Employee",
        entityId: String(e._id),
        entityName: e.name || "",
        entityDetails: { role: e.role, branch: e.branch, employeeId: e.employeeId || "", reason: "orphan-cleanup: no employeeId, no patients, no finance records" },
        deletedBy: { name: "cleanup-orphan-employees.mjs", email: "" },
        branch: e.branch || null,
        deletedAt: now,
        createdAt: now,
        updatedAt: now,
      }));
      if (logs.length) await db.collection("deletelogs").insertMany(logs);
      const res = await db.collection("employees").deleteMany({ _id: { $in: orphans.map((e) => e._id) } });
      console.log(`\nDeleted ${res.deletedCount} employee(s). ${logs.length} delete log(s) written.`);
    } else {
      console.log("\nDry run only. Re-run with --apply to delete these.");
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
