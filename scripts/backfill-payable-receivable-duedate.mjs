// One-time backfill: every Payable/Receivable needs a dueDate for the assets/liabilities
// ledger pages' date-range filter to work — documents with no dueDate are invisible to any
// `from`/`to` query (Mongo never matches a range comparison against a missing/null field), so
// they silently vanished from a filtered list regardless of the range picked.
//
// Only documents with no dueDate (null or missing) are touched. dueDate is set to the
// document's own createdAt (falling back to the _id's embedded timestamp on the rare document
// created before `timestamps: true` was added, if any). Nothing else on the document changes.
// Safe to run repeatedly — it's a no-op once every document has a dueDate.
//
// Dry run:  node --env-file=.env scripts/backfill-payable-receivable-duedate.mjs
// Apply:    node --env-file=.env scripts/backfill-payable-receivable-duedate.mjs --apply

import mongoose from "mongoose";

const MONGODB_URI = 'mongodb://sachindashzer:user8520@ac-pu86ixj-shard-00-00.hwjor1r.mongodb.net:27017,ac-pu86ixj-shard-00-01.hwjor1r.mongodb.net:27017,ac-pu86ixj-shard-00-02.hwjor1r.mongodb.net:27017/?ssl=true&replicaSet=atlas-ool7b4-shard-0&authSource=admin&appName=crm';
if (!MONGODB_URI) {
  console.error("Set MONGODB_URI (run with: node --env-file=.env scripts/backfill-payable-receivable-duedate.mjs)");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");

const MISSING_DUE_DATE = { $or: [{ dueDate: null }, { dueDate: { $exists: false } }] };

async function backfillCollection(collectionName) {
  const coll = mongoose.connection.collection(collectionName);
  const rows = await coll
    .find(MISSING_DUE_DATE, { projection: { createdAt: 1, totalAmount: 1, "payee.label": 1, "payer.label": 1 } })
    .toArray();

  if (rows.length === 0) {
    console.log(`${collectionName}: nothing to backfill — every document already has a dueDate.`);
    return;
  }

  console.log(
    `${collectionName}: ${rows.length} document(s) ${APPLY ? "being" : "would be"} backfilled (dueDate = createdAt):\n`,
  );
  for (const r of rows.slice(0, 10)) {
    const label = r.payee?.label || r.payer?.label || "—";
    const when = r.createdAt || r._id.getTimestamp();
    console.log(`  ${label.padEnd(28)} amount ${r.totalAmount ?? "—"} -> dueDate ${when.toISOString().slice(0, 10)}`);
  }
  if (rows.length > 10) console.log(`  ... and ${rows.length - 10} more`);

  if (APPLY) {
    const ops = rows.map((r) => ({
      updateOne: {
        filter: { _id: r._id },
        update: { $set: { dueDate: r.createdAt || r._id.getTimestamp() } },
      },
    }));
    const res = await coll.bulkWrite(ops);
    console.log(`\n${collectionName}: applied. Modified ${res.modifiedCount} document(s).`);
  } else {
    console.log(`\n${collectionName}: dry run only. Re-run with --apply to write these changes.`);
  }
}

async function main() {
  await mongoose.connect(MONGODB_URI);

  await backfillCollection("payables");
  console.log("");
  await backfillCollection("receivables");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
