// One-time cleanup: canonicalise Employee.role casing/spelling.
//
// Employee.role is free-form text, so the same profile ended up stored many ways
// ("counsellor", "Counsellor", "COUNSELLOR", "Councellor"). The app now folds these together
// at read time, but normalising the stored value too keeps raw-role consumers (exports,
// ad-hoc queries) consistent.
//
// ONLY rows whose role matches a known variant are rewritten (agent / counsellor / doctor /
// technician / implanter / hr). A genuinely custom designation ("SEO Specialist") is left
// exactly as-is. Safe to run repeatedly — it's a no-op once clean.
//
// Dry run:  node --env-file=.env scripts/normalize-employee-roles.mjs
// Apply:    node --env-file=.env scripts/normalize-employee-roles.mjs --apply

import mongoose from "mongoose";
import { canonicalEmployeeRole, OTHER_EMPLOYEE_ROLE } from "../src/constants/employeeRoles.js";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Set MONGODB_URI (run with: node --env-file=.env scripts/normalize-employee-roles.mjs)");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");

async function main() {
  await mongoose.connect(MONGODB_URI);
  const coll = mongoose.connection.collection("employees");

  const rows = await coll.find({}, { projection: { role: 1, name: 1 } }).toArray();
  const changes = [];
  for (const r of rows) {
    const current = r.role || "";
    const canon = canonicalEmployeeRole(current);
    // Rewrite only when it maps to a real bucket AND the stored text differs from it.
    if (canon !== OTHER_EMPLOYEE_ROLE && canon !== current) {
      changes.push({ _id: r._id, name: r.name, from: current, to: canon });
    }
  }

  if (changes.length === 0) {
    console.log("Nothing to normalise — every role is already canonical or custom.");
  } else {
    console.log(`${changes.length} employee role(s) ${APPLY ? "being" : "would be"} rewritten:\n`);
    for (const c of changes) {
      console.log(`  ${c.name.padEnd(28)} "${c.from}" -> "${c.to}"`);
    }
    if (APPLY) {
      const ops = changes.map((c) => ({
        updateOne: { filter: { _id: c._id }, update: { $set: { role: c.to } } },
      }));
      const res = await coll.bulkWrite(ops);
      console.log(`\nApplied. Modified ${res.modifiedCount} document(s).`);
    } else {
      console.log("\nDry run only. Re-run with --apply to write these changes.");
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
