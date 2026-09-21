// scripts/backfill-date-of-joining.mjs
//
// Backfills Employee.dateOfJoining from a source spreadsheet (Code* / Employee Name* /
// Mobile No* / Status / Salary / Date of Joining), matched by employeeId (the "Code*"
// column), normalized the same way employeeReportQuery.js's codeKey() does.
//
// SAFETY: only ever WRITES a dateOfJoining that is currently null/unset — never overwrites
// an existing value. Dry run by default; nothing is written unless you pass --apply.
//
// Dry run:  node --env-file=.env scripts/backfill-date-of-joining.mjs "<path to xlsx>"
// Apply:    node --env-file=.env scripts/backfill-date-of-joining.mjs "<path to xlsx>" --apply

import mongoose from "mongoose";
import XLSX from "xlsx";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Set MONGODB_URI (run with: node --env-file=.env scripts/backfill-date-of-joining.mjs <file> [--apply])");
  process.exit(1);
}

const args = process.argv.slice(2).filter((a) => a !== "--apply");
const APPLY = process.argv.includes("--apply");
const filePath = args[0];
if (!filePath) {
  console.error("Usage: node --env-file=.env scripts/backfill-date-of-joining.mjs <path to xlsx> [--apply]");
  process.exit(1);
}

const codeKey = (v) => String(v ?? "").trim().toUpperCase().replace(/\s+/g, "");

const MONTH_NAMES = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** Handles: real Excel date cells (Date objects), "DD Mon YYYY", "DD MM YYYY" (numeric). */
function parseDOJ(raw) {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    return new Date(Date.UTC(raw.getFullYear(), raw.getMonth(), raw.getDate()));
  }
  const s = String(raw ?? "").trim();
  if (!s) return null;

  let m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (m) {
    const [, dStr, monName, yStr] = m;
    const mo = MONTH_NAMES[monName.toLowerCase().slice(0, 3)];
    if (mo !== undefined) {
      const d = Number(dStr), y = Number(yStr);
      const dt = new Date(Date.UTC(y, mo, d));
      if (dt.getUTCMonth() === mo && dt.getUTCDate() === d) return dt;
    }
    return null;
  }

  m = s.match(/^(\d{1,2})\s+(\d{1,2})\s+(\d{4})$/);
  if (m) {
    const [, dStr, moStr, yStr] = m;
    const d = Number(dStr), mo = Number(moStr), y = Number(yStr);
    if (mo >= 1 && mo <= 12) {
      const dt = new Date(Date.UTC(y, mo - 1, d));
      if (dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) return dt;
    }
    return null;
  }

  return null;
}

const wb = XLSX.readFile(filePath, { cellDates: true });
const sheetName = wb.SheetNames.includes("Employees") ? "Employees" : wb.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
console.log(`Read ${rows.length} rows from "${sheetName}".`);

await mongoose.connect(MONGODB_URI);
const Employee = mongoose.connection.collection("employees");

const dbEmployees = await Employee.find({ mergedInto: null, employeeId: { $nin: [null, ""] } })
  .project({ employeeId: 1, name: 1, dateOfJoining: 1 })
  .toArray();
const dbByCode = new Map();
for (const e of dbEmployees) {
  const k = codeKey(e.employeeId);
  if (k) dbByCode.set(k, e);
}
console.log(`${dbByCode.size} active employees in the DB have an employeeId.`);

let updated = 0, alreadySet = 0, noMatch = 0, badDate = 0, blankCode = 0;
const updates = [];
const noMatchSamples = [];
const badDateSamples = [];

for (const row of rows) {
  const code = codeKey(row["Code*"]);
  if (!code) { blankCode++; continue; }

  const emp = dbByCode.get(code);
  if (!emp) { noMatch++; if (noMatchSamples.length < 10) noMatchSamples.push(code); continue; }

  if (emp.dateOfJoining) { alreadySet++; continue; }

  const doj = parseDOJ(row["Date of Joining"]);
  if (!doj) { badDate++; if (badDateSamples.length < 10) badDateSamples.push({ code, raw: row["Date of Joining"] }); continue; }

  updated++;
  updates.push({ _id: emp._id, name: emp.name, code, doj });
}

console.log("\n--- Summary ---");
console.log(`Would update: ${updated}`);
console.log(`Already had a dateOfJoining (skipped, not overwritten): ${alreadySet}`);
console.log(`No matching DB employee for this code: ${noMatch}`);
console.log(`Blank code in sheet: ${blankCode}`);
console.log(`Unparseable date: ${badDate}`);
if (badDateSamples.length) console.log("Unparseable samples:", JSON.stringify(badDateSamples));
if (noMatchSamples.length) console.log("No-match code samples:", noMatchSamples.join(", "));

if (!APPLY) {
  console.log("\nDRY RUN — no writes made. Re-run with --apply to write.");
  console.log("Sample of what would be written:", JSON.stringify(updates.slice(0, 5).map((u) => ({ name: u.name, code: u.code, doj: u.doj.toISOString().slice(0, 10) }))));
} else {
  console.log(`\nApplying ${updates.length} update(s)...`);
  const ops = updates.map((u) => ({
    updateOne: { filter: { _id: u._id }, update: { $set: { dateOfJoining: u.doj } } },
  }));
  if (ops.length) {
    const result = await Employee.bulkWrite(ops, { ordered: false });
    console.log(`Modified ${result.modifiedCount} document(s).`);
  }
}

await mongoose.disconnect();
