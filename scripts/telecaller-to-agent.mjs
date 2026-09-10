// scripts/telecaller-to-agent.mjs
//
// Re-designates every employee whose role reads as "telecaller" (any casing / spacing —
// "TELECALLER", "Tele Caller", "tele-caller", …) to "Agent".
//
// Dry run:  node --env-file=.env scripts/telecaller-to-agent.mjs
// Apply:    node --env-file=.env scripts/telecaller-to-agent.mjs --apply

import mongoose from "mongoose";

const MONGODB_URI = 'mongodb://sachindashzer:user8520@ac-pu86ixj-shard-00-00.hwjor1r.mongodb.net:27017,ac-pu86ixj-shard-00-01.hwjor1r.mongodb.net:27017,ac-pu86ixj-shard-00-02.hwjor1r.mongodb.net:27017/?ssl=true&replicaSet=atlas-ool7b4-shard-0&authSource=admin&appName=crm';
if (!MONGODB_URI) {
  console.error("Set MONGODB_URI (run with: node --env-file=.env scripts/telecaller-to-agent.mjs)");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");
const TARGET = "Agent";

const isTelecaller = (role) =>
  String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "") === "telecaller";

async function main() {
  await mongoose.connect(MONGODB_URI);
  const coll = mongoose.connection.db.collection("employees");

  const rows = await coll.find({}, { projection: { name: 1, role: 1, branch: 1 } }).toArray();
  const hits = rows.filter((e) => isTelecaller(e.role) && e.role !== TARGET);

  if (hits.length === 0) {
    console.log("No telecaller employees found — nothing to do.");
  } else {
    console.log(`${hits.length} employee(s) ${APPLY ? "being" : "would be"} re-designated to "${TARGET}":\n`);
    for (const e of hits) {
      console.log(`  ${String(e.name || "(no name)").padEnd(30)} "${e.role}" -> "${TARGET}"   ${e.branch || "-"}`);
    }

    if (APPLY) {
      const res = await coll.updateMany(
        { _id: { $in: hits.map((e) => e._id) } },
        { $set: { role: TARGET } },
      );
      console.log(`\nApplied. Modified ${res.modifiedCount} employee(s).`);
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
