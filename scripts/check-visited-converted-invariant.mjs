// scripts/check-visited-converted-invariant.mjs
//
// Read-only sanity check for the Task 1 Employee KPI rework: asserts, over every employee
// who has referred patients, that `visited <= referred` and `converted <= visited`. Runs the
// exact same Patient aggregation buildAgentMetrics (src/lib/owner/employeeReportQuery.js)
// uses, against real data, with no date window (all-time) so it's the widest possible check.
//
// Run: node --env-file=.env scripts/check-visited-converted-invariant.mjs

import mongoose from "mongoose";
import { CONVERTED_STATUSES, VISITED_EXCLUDED_STATUSES } from "../src/lib/owner/patientStatus.js";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Set MONGODB_URI (run with: node --env-file=.env scripts/check-visited-converted-invariant.mjs)");
  process.exit(1);
}

await mongoose.connect(MONGODB_URI);
const Patient = mongoose.connection.collection("patients");

const rows = await Patient.aggregate([
  { $match: { "personal.reference": { $ne: null } } },
  {
    $group: {
      _id: "$personal.reference",
      referred: { $sum: 1 },
      visited: { $sum: { $cond: [{ $in: ["$ops.status", VISITED_EXCLUDED_STATUSES] }, 0, 1] } },
      converted: { $sum: { $cond: [{ $in: ["$ops.status", CONVERTED_STATUSES] }, 1, 0] } },
    },
  },
]).toArray();

let violations = 0;
for (const r of rows) {
  if (r.visited > r.referred) {
    violations++;
    console.error(`FAIL employee ${r._id}: visited (${r.visited}) > referred (${r.referred})`);
  }
  if (r.converted > r.visited) {
    violations++;
    console.error(`FAIL employee ${r._id}: converted (${r.converted}) > visited (${r.visited})`);
  }
}

console.log(`Checked ${rows.length} employees with referred patients.`);
console.log(violations === 0 ? "PASS: visited <= referred and converted <= visited for every row." : `FAIL: ${violations} invariant violation(s).`);

await mongoose.disconnect();
process.exit(violations === 0 ? 0 : 1);
