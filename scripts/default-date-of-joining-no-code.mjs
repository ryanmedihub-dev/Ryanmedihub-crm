// scripts/default-date-of-joining-no-code.mjs
//
// For the employees the code-based backfill (backfill-date-of-joining.mjs) couldn't reach
// — no employeeId at all — sets dateOfJoining to a fixed default (2026-04-01), per the
// user's explicit instruction. Only ever touches employees with NO employeeId AND no
// dateOfJoining already set; never overwrites.
//
// Dry run:  node --env-file=.env scripts/default-date-of-joining-no-code.mjs
// Apply:    node --env-file=.env scripts/default-date-of-joining-no-code.mjs --apply

import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Set MONGODB_URI (run with: node --env-file=.env scripts/default-date-of-joining-no-code.mjs [--apply])");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");
const DEFAULT_DOJ = new Date(Date.UTC(2026, 3, 1)); // 1 Apr 2026 (month is 0-indexed)

await mongoose.connect(MONGODB_URI);
const Employee = mongoose.connection.collection("employees");

const filter = { mergedInto: null, employeeId: { $in: [null, ""] }, dateOfJoining: null };
const matched = await Employee.find(filter).project({ name: 1 }).toArray();

console.log(`Matched ${matched.length} employee(s) with no employeeId and no dateOfJoining.`);
console.log("Sample:", matched.slice(0, 5).map((e) => e.name).join(", "));

if (!APPLY) {
  console.log(`\nDRY RUN — would set dateOfJoining = ${DEFAULT_DOJ.toISOString().slice(0, 10)} on ${matched.length} employee(s). Re-run with --apply to write.`);
} else {
  const result = await Employee.updateMany(filter, { $set: { dateOfJoining: DEFAULT_DOJ } });
  console.log(`Modified ${result.modifiedCount} document(s).`);
}

await mongoose.disconnect();
