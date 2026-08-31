/**
 * Zero out negative patient outstanding balances.
 *
 * Patient.js keeps this identity (see the pre-save hook):
 *     pendingAmount = totalAmount - amountReceived - discount
 *
 * So a negative pendingAmount is absorbed by pushing it into the discount:
 *     discount += pendingAmount        (pendingAmount is negative -> discount shrinks)
 *     pendingAmount = 0
 * which keeps the identity exact.
 *
 * That only works while `discount + pendingAmount >= 0`. When the overpayment is larger
 * than the discount there is nothing to absorb it — those are genuine overpayments
 * (amountReceived > totalAmount), not over-discounting, and forcing them would leave a
 * negative discount. Those rows are reported and left untouched, for a human to decide.
 *
 * Writes with updateOne so the pre-save hook does NOT run: that hook also re-derives
 * ops.status from pendingAmount, and silently moving patients between pipeline stages is
 * not this script's job.
 *
 *   node scripts/fix-negative-patient-outstanding.mjs            # dry run (default)
 *   node scripts/fix-negative-patient-outstanding.mjs --apply    # write
 */

import mongoose from "mongoose";
import fs from "fs";

for (const f of [".env.local", ".env"]) {
  if (fs.existsSync(f)) {
    try {
      process.loadEnvFile(f);
    } catch {}
  }
}
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("MONGODB_URI missing — checked .env.local and .env.");
  process.exit(1);
}

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const inr = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
    .format(Number(n) || 0);
const pad = (s, n) => String(s ?? "").slice(0, n).padEnd(n);
const padL = (s, n) => String(s ?? "").slice(0, n).padStart(n);

async function run() {
  console.log("=".repeat(100));
  console.log(
    APPLY
      ? "MODE: APPLY  <- will write to the database"
      : "MODE: DRY RUN  <- nothing will be written (re-run with --apply to write)",
  );
  console.log("=".repeat(100) + "\n");

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });

  const Patient =
    mongoose.models.Patient ||
    mongoose.model("Patient", new mongoose.Schema({}, { strict: false, collection: "patients" }));

  const negativeFilter = { "payments.pendingAmount": { $lt: 0 } };

  const totalPatients = await Patient.countDocuments({});
  const negatives = await Patient.find(negativeFilter)
    .select("personal.name personal.phone personal.branch payments")
    .lean();

  console.log(`Total patients:                 ${totalPatients}`);
  console.log(`With negative outstanding:      ${negatives.length}\n`);

  if (negatives.length === 0) {
    console.log("Nothing to fix — no patient has a negative outstanding balance.");
    await mongoose.disconnect();
    return;
  }

  const fixable = [];
  const skipped = [];

  for (const p of negatives) {
    const pay = p.payments || {};
    const pending = round2(pay.pendingAmount);
    const discount = round2(pay.discount);
    const newDiscount = round2(discount + pending);

    const row = {
      _id: p._id,
      name: p.personal?.name || "Unknown",
      phone: p.personal?.phone || "",
      branch: p.personal?.branch || "",
      total: round2(pay.totalAmount),
      received: round2(pay.amountReceived),
      discount,
      pending,
      newDiscount,
    };

    if (newDiscount >= 0) fixable.push(row);
    else skipped.push(row);
  }

  const header =
    pad("Patient", 26) + pad("Phone", 13) + pad("Branch", 12) +
    padL("Total", 13) + padL("Received", 13) + padL("Discount", 13) +
    padL("Pending", 12) + padL("New disc.", 13);

  if (fixable.length > 0) {
    console.log("-".repeat(100));
    console.log(`FIXABLE — discount absorbs the overpayment (${fixable.length})`);
    console.log("-".repeat(100));
    console.log(header);
    fixable.forEach((r) => {
      console.log(
        pad(r.name, 26) + pad(r.phone, 13) + pad(r.branch, 12) +
        padL(inr(r.total), 13) + padL(inr(r.received), 13) + padL(inr(r.discount), 13) +
        padL(inr(r.pending), 12) + padL(inr(r.newDiscount), 13),
      );
    });
    const absorbed = fixable.reduce((s, r) => s + Math.abs(r.pending), 0);
    console.log(`\n  Total negative outstanding cleared: ${inr(absorbed)}`);
    console.log(`  Total discount reduced by:          ${inr(absorbed)}\n`);
  }

  if (skipped.length > 0) {
    console.log("-".repeat(100));
    console.log(`SKIPPED — genuine overpayment, discount too small to absorb it (${skipped.length})`);
    console.log("  These need a human decision: refund, credit note, or a correction to");
    console.log("  totalAmount / amountReceived. Nothing was changed for them.");
    console.log("-".repeat(100));
    console.log(header);
    skipped.forEach((r) => {
      console.log(
        pad(r.name, 26) + pad(r.phone, 13) + pad(r.branch, 12) +
        padL(inr(r.total), 13) + padL(inr(r.received), 13) + padL(inr(r.discount), 13) +
        padL(inr(r.pending), 12) + padL("—", 13),
      );
    });
    const stranded = skipped.reduce((s, r) => s + Math.abs(r.pending), 0);
    console.log(`\n  Total left untouched: ${inr(stranded)}\n`);
  }

  if (!APPLY) {
    console.log("=".repeat(100));
    console.log(`DRY RUN — nothing written. ${fixable.length} patient(s) would be updated.`);
    console.log("Re-run with --apply to write these changes.");
    console.log("=".repeat(100));
    await mongoose.disconnect();
    return;
  }

  if (fixable.length === 0) {
    console.log("Nothing to apply — every negative row needs a human decision.");
    await mongoose.disconnect();
    return;
  }

  const ops = fixable.map((r) => ({
    updateOne: {
      filter: { _id: r._id },
      update: {
        $set: {
          "payments.discount": r.newDiscount,
          "payments.pendingAmount": 0,
        },
      },
    },
  }));

  const result = await Patient.bulkWrite(ops, { ordered: false });
  console.log("=".repeat(100));
  console.log(`APPLIED — matched ${result.matchedCount}, modified ${result.modifiedCount}.`);
  if (skipped.length > 0) {
    console.log(`${skipped.length} genuine overpayment(s) left untouched — see the list above.`);
  }
  console.log("=".repeat(100));

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("Failed:", err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
