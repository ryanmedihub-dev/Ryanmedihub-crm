// ---------------------------------------------------------------------------
// scripts/backfill-collab-case-discount.mjs
//
// Collab cases banaye gaye the discount ko DO BAAR minus karke:
//     packageAmount = patient ka package − discount      (case pe)
//     + wahi discount creation revenue transaction pe bhi
// Aur har balance calculation hai: packageAmount − collected − tx discounts.
// Toh discount humare share se do baar kata, aur case 1 discount pehle hi
// "fully collected" ho gaya.
//
// Fix (code mein ho chuka hai): case patient ka POORA package rakhta hai,
// discount sirf transaction pe. Yeh script purane cases ko wahi shape deti hai:
//     packageAmount += creation discount        (= patient.payments.totalAmount)
//
// SAFETY
//   • Default DRY RUN. --commit ke bina DB mein kuch nahi likhta.
//   • Sirf tab chhedta hai jab gap (patient package − case package) EXACTLY
//     creation transaction ke discount ke barabar ho. Warna AMBIGUOUS mein
//     daal deta hai (patient ka package baad mein badla, ya packageAmount
//     manually edit hua) — aise cases haath se dekho.
//   • Pehle se sahi cases (gap = 0) skip.
//   • Case ke log mein "Package Revised" entry jati hai, toh app mein dikhega.
//   • --commit pe ek JSON report scripts/reports/ mein (purani value saath).
//
// Jo cases discount ki wajah se jaldi crystallise ho gaye the: unka clinic-share
// payable/receivable AMOUNT galat nahi tha (sirf timing early thi), aur
// clinicShareSettledAt set hai toh dobara crystallise nahi hoga. Backfill ke
// baad woh cases sahi outstanding (= discount) ke saath khul jayenge.
//
// USAGE (project root se)
//   node --env-file=.env scripts/backfill-collab-case-discount.mjs            # dry run
//   node --env-file=.env scripts/backfill-collab-case-discount.mjs --commit   # likho
//   node --env-file=.env scripts/backfill-collab-case-discount.mjs --case=<caseId>
// ---------------------------------------------------------------------------

import mongoose from "mongoose";
import fs from "node:fs";
import path from "node:path";

const COMMIT = process.argv.includes("--commit");
const ONLY_CASE = (process.argv.find((a) => a.startsWith("--case=")) || "").split("=")[1] || "";

const ACTOR = { name: "System Backfill", email: "admin@ryanclinic.com" };
const EPSILON = 0.01;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const rupee = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error(
      "MONGODB_URI set nahi hai. Aise chalao:\n  node --env-file=.env scripts/backfill-collab-case-discount.mjs",
    );
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection;
  const Cases = db.collection("collabcases");
  const Transactions = db.collection("transactions");
  const Patients = db.collection("patients");

  const caseFilter = ONLY_CASE ? { _id: new mongoose.Types.ObjectId(ONLY_CASE) } : {};
  const cases = await Cases.find(caseFilter).toArray();
  if (cases.length === 0) {
    console.log("Koi collab case nahi mila.");
    return;
  }

  const fixable = [];
  const ambiguous = [];
  const reversed = [];
  let alreadyOk = 0;

  for (const c of cases) {
    const patient = await Patients.findOne(
      { _id: c.patient },
      { projection: { "personal.name": 1, "payments.totalAmount": 1 } },
    );
    const patientTotal = round2(patient?.payments?.totalAmount || 0);
    const gap = round2(patientTotal - (c.packageAmount || 0));

    if (Math.abs(gap) <= EPSILON) {
      alreadyOk++;
      continue;
    }

    // Creation ka transaction = case ke revenue transactions mein sabse pehla
    // (crystallisation aur reversal entries chhodkar). Discount usi pe stamp hua tha.
    // reversalOf schema mein default null hai — $exists: false use NA karo.
    const txs = await Transactions.find(
      {
        "collabRef.caseId": c._id,
        costType: "Revenue",
        "collabRef.crystallisation": { $ne: true },
        reversalOf: null,
      },
      { projection: { amount: 1, discount: 1, method: 1, createdAt: 1, isReversed: 1 } },
    )
      .sort({ createdAt: 1, _id: 1 })
      .toArray();

    const creationTx = txs[0];
    const creationDiscount = round2(creationTx?.discount || 0);
    const row = {
      caseId: String(c._id),
      patient: patient?.personal?.name || "Unknown",
      clinic: c.clinic,
      packageAmount: round2(c.packageAmount || 0),
      patientTotal,
      gap,
      creationDiscount,
      txCount: txs.length,
    };

    // Creation reverse ho chuka hai -> reversal discount ko wapas nahi karta,
    // toh case ka sahi package manually decide karna padega. Haath mat lagao.
    if (creationTx?.isReversed) {
      reversed.push(row);
      continue;
    }

    if (gap > 0 && Math.abs(gap - creationDiscount) <= EPSILON) fixable.push(row);
    else ambiguous.push(row);
  }

  console.log(`\nCollab cases dekhe: ${cases.length}`);
  console.log(`  pehle se sahi : ${alreadyOk}`);
  console.log(`  backfill hone : ${fixable.length}`);
  console.log(`  reversed      : ${reversed.length}`);
  console.log(`  ambiguous     : ${ambiguous.length}\n`);

  if (fixable.length > 0) {
    console.log("BACKFILL (case package → patient ka poora package):");
    for (const r of fixable) {
      console.log(
        `  ${r.patient} · ${r.clinic} — ${rupee(r.packageAmount)} → ${rupee(r.patientTotal)}  (discount ${rupee(r.creationDiscount)})  ${r.caseId}`,
      );
    }
    console.log("");
  }

  if (reversed.length > 0) {
    console.log("REVERSED creation — script skip karegi, haath se dekho:");
    for (const r of reversed) {
      console.log(
        `  ${r.patient} · ${r.clinic} — case ${rupee(r.packageAmount)}, patient ${rupee(r.patientTotal)}, creation discount ${rupee(r.creationDiscount)}  ${r.caseId}`,
      );
    }
    console.log("");
  }

  if (ambiguous.length > 0) {
    console.log("AMBIGUOUS — haath se dekho, script inhe nahi chhedegi:");
    for (const r of ambiguous) {
      console.log(
        `  ${r.patient} · ${r.clinic} — case ${rupee(r.packageAmount)}, patient ${rupee(r.patientTotal)}, gap ${rupee(r.gap)}, creation discount ${rupee(r.creationDiscount)}  ${r.caseId}`,
      );
    }
    console.log("");
  }

  if (!COMMIT) {
    console.log("DRY RUN — kuch nahi likha. Likhne ke liye --commit do.\n");
    return;
  }
  if (fixable.length === 0) {
    console.log("Backfill karne ke liye kuch nahi hai.\n");
    return;
  }

  let written = 0;
  for (const r of fixable) {
    const res = await Cases.updateOne(
      { _id: new mongoose.Types.ObjectId(r.caseId), packageAmount: r.packageAmount },
      {
        $set: { packageAmount: r.patientTotal },
        $push: {
          log: {
            action: "Package Revised",
            previousValue: String(r.packageAmount),
            newValue: String(r.patientTotal),
            note: `Backfill — discount of ${rupee(r.creationDiscount)} do baar kat raha tha (case package + transaction). Case ab patient ka poora package rakhta hai; discount sirf transaction pe.`,
            performedBy: ACTOR,
            performedAt: new Date(),
          },
        },
      },
    );
    if (res.modifiedCount === 1) written++;
    else console.log(`  SKIP (beech mein badal gaya): ${r.caseId}`);
  }

  const dir = path.join("scripts", "reports");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `backfill-collab-case-discount-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify({ written, fixable, reversed, ambiguous }, null, 2));

  console.log(`Likhe gaye cases: ${written}/${fixable.length}`);
  console.log(`Report: ${file}\n`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
