// One-time migration: drop the UNIQUE monthly index on the `payables` collection.
//
// Monthly payables are no longer uniqueness-constrained (a payee can legitimately hold
// several payables for the same purpose/month — different heads, re-issued invoices,
// corrections, re-uploads after a cancellation). Mongoose creates the new NON-unique index
// on connect but never drops the old unique one, and while it's there `payable.save()` fails
// with E11000 on any "matching" payable — including cancelled ones the app can't see.
//
// This drops every unique index on the payee + purpose + period key family (both the old
// 6-field key and the later 7-field key that added expenseSubType). Safe to run repeatedly.
//
// Run:  node --env-file=.env scripts/drop-payable-monthly-unique-index.mjs

import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Set MONGODB_URI (run with: node --env-file=.env scripts/drop-payable-monthly-unique-index.mjs)");
  process.exit(1);
}

// Any index whose key is the payee+purpose+period family AND is unique.
const isMonthlyKeyFamily = (key) => {
  const f = Object.keys(key);
  return (
    f.includes("payee.kind") &&
    f.includes("payee.label") &&
    f.includes("purpose") &&
    f.includes("period.month") &&
    f.includes("period.year")
  );
};

async function main() {
  await mongoose.connect(MONGODB_URI);
  const coll = mongoose.connection.collection("payables");

  const indexes = await coll.indexes();
  const targets = indexes.filter((i) => i.unique && isMonthlyKeyFamily(i.key));

  if (targets.length === 0) {
    console.log("No unique monthly index found — nothing to do.");
  } else {
    for (const idx of targets) {
      console.log(`Dropping unique index "${idx.name}"  ${JSON.stringify(idx.key)} …`);
      await coll.dropIndex(idx.name);
      console.log("  dropped.");
    }
  }

  console.log("\nCurrent payables indexes:");
  for (const i of await coll.indexes()) {
    console.log(`  ${i.name}  ${JSON.stringify(i.key)}${i.unique ? "  [unique]" : ""}`);
  }
  console.log("\nThe non-unique replacement is rebuilt automatically the next time the app connects.");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
