// ---------------------------------------------------------------------------
// scripts/backfill-patient-discount.mjs
//
// Collab cases ke saath jo discount transaction pe stamp hua tha, woh kai
// patients ke record pe nahi pahuncha:
//     patient.payments.discount   = 0        (galat)
//     patient.payments.pendingAmount = total − received − 0   (discount abhi
//                                                             bhi "due" dikh raha)
// Matlab patient page pe discount dues ban ke baitha hai, jo kabhi aayega nahi.
//
// App ka apna rule (src/lib/collabDerivation.js → createCollectionTransaction):
//     discount = patient.payments.transactions ke saare Revenue tx ke discount ka sum
//     pending  = max(0, total − amountReceived − discount)
// Yeh script wahi rule purane patients pe chala deti hai. Formula app se hi
// liya hai, toh agli collection pe value wapas nahi palti.
//
// SAFETY
//   • Default DRY RUN. --commit ke bina DB mein kuch nahi likhta.
//   • Sirf collab case waale patients (jahan bug tha).
//   • Discount sirf BADHTA hai. Agar hisaab se discount kam nikle toh chhod
//     deta hai (woh manually daala gaya discount ho sakta hai — mitana nahi hai).
//   • amountReceived ko haath nahi lagata. Clinic ne jo paisa liya woh app ke
//     design ke hisaab se patient ke received mein nahi jata — wahi rehta hai.
//   • --commit pe JSON report scripts/reports/ mein (purani value ke saath).
//
// DHYAN DO: yeh raw driver se likhta hai, toh Patient ka pre-save hook nahi
// chalta — jin patients ka pending 0 ho jayega unka ops.status (SURGERY_BOOKED)
// agli baar patient save hone pe set hoga. Hook ko jaan ke nahi chalaya: woh
// payments.totalAmount ko counselling.finlpackage se overwrite kar deta hai,
// aur revised package waale patients ka data kharab ho jata.
//
// USAGE (project root se)
//   node --env-file=.env scripts/backfill-patient-discount.mjs            # dry run
//   node --env-file=.env scripts/backfill-patient-discount.mjs --commit   # likho
// ---------------------------------------------------------------------------

import mongoose from "mongoose";
import fs from "node:fs";
import path from "node:path";

const COMMIT = process.argv.includes("--commit");
const EPSILON = 0.01;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const rupee = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error(
      "MONGODB_URI set nahi hai. Aise chalao:\n  node --env-file=.env scripts/backfill-patient-discount.mjs",
    );
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection;
  const Cases = db.collection("collabcases");
  const Patients = db.collection("patients");
  const Transactions = db.collection("transactions");

  const patientIds = await Cases.distinct("patient", {});
  console.log(`\nCollab case waale patients: ${patientIds.length}`);

  const fixable = [];
  const manualDiscount = [];
  const reversed = [];
  let alreadyOk = 0;

  for (const pid of patientIds) {
    const p = await Patients.findOne(
      { _id: pid },
      {
        projection: {
          "personal.name": 1,
          "counselling.finlpackage": 1,
          payments: 1,
        },
      },
    );
    if (!p) continue;

    const linked = p.payments?.transactions || [];
    if (linked.length === 0) {
      alreadyOk++;
      continue;
    }

    const txs = await Transactions.find(
      { _id: { $in: linked }, costType: "Revenue" },
      { projection: { discount: 1, isReversed: 1, reversalOf: 1 } },
    ).toArray();

    const storedDiscount = round2(p.payments?.discount || 0);
    const newDiscount = round2(txs.reduce((s, t) => s + (t.discount || 0), 0));

    const total = round2(p.payments?.totalAmount || p.counselling?.finlpackage || 0);
    const received = round2(p.payments?.amountReceived || 0);
    const storedPending = round2(p.payments?.pendingAmount || 0);
    const newPending = Math.max(0, round2(total - received - newDiscount));

    const row = {
      patientId: String(p._id),
      name: p.personal?.name || "Unknown",
      total,
      received,
      storedDiscount,
      newDiscount,
      storedPending,
      newPending,
      hasReversal: txs.some((t) => t.isReversed || t.reversalOf),
    };

    // Reversal discount ko wapas nahi karta (reversal tx pe discount 0 hota hai),
    // toh reverse ho chuke payment ka discount dena galat hoga. Chhod do.
    const discountFromReversed = round2(
      txs.filter((t) => t.isReversed).reduce((s, t) => s + (t.discount || 0), 0),
    );
    if (discountFromReversed > EPSILON) {
      reversed.push(row);
      continue;
    }

    if (newDiscount - storedDiscount > EPSILON) fixable.push(row);
    else if (storedDiscount - newDiscount > EPSILON) manualDiscount.push(row);
    else alreadyOk++;
  }

  console.log(`  pehle se sahi        : ${alreadyOk}`);
  console.log(`  discount add hoga    : ${fixable.length}`);
  console.log(`  reversed payment     : ${reversed.length}  (skip)`);
  console.log(`  stored > hisaab      : ${manualDiscount.length}  (skip)\n`);

  if (fixable.length > 0) {
    console.log("FIX (discount transactions se, pending us hisaab se):");
    for (const r of fixable) {
      console.log(
        `  ${r.name} — discount ${rupee(r.storedDiscount)} → ${rupee(r.newDiscount)}, pending ${rupee(r.storedPending)} → ${rupee(r.newPending)}${r.hasReversal ? "  [reversal linked]" : ""}  ${r.patientId}`,
      );
    }
    const totalDiscount = fixable.reduce((s, r) => s + (r.newDiscount - r.storedDiscount), 0);
    console.log(`\n  Total discount jo record pe aayega: ${rupee(round2(totalDiscount))}\n`);
  }

  if (reversed.length > 0) {
    console.log("SKIP — discount reverse ho chuke payment ka hai, haath se dekho:");
    for (const r of reversed) {
      console.log(
        `  ${r.name} — transactions ${rupee(r.newDiscount)}, pending ${rupee(r.storedPending)}  ${r.patientId}`,
      );
    }
    console.log("");
  }

  if (manualDiscount.length > 0) {
    console.log("SKIP — stored discount hisaab se zyada hai (manual discount ho sakta hai):");
    for (const r of manualDiscount) {
      console.log(
        `  ${r.name} — stored ${rupee(r.storedDiscount)}, transactions ${rupee(r.newDiscount)}  ${r.patientId}`,
      );
    }
    console.log("");
  }

  if (!COMMIT) {
    console.log("DRY RUN — kuch nahi likha. Likhne ke liye --commit do.\n");
    return;
  }
  if (fixable.length === 0) {
    console.log("Fix karne ke liye kuch nahi hai.\n");
    return;
  }

  let written = 0;
  for (const r of fixable) {
    const res = await Patients.updateOne(
      { _id: new mongoose.Types.ObjectId(r.patientId), "payments.discount": r.storedDiscount },
      {
        $set: {
          "payments.discount": r.newDiscount,
          "payments.pendingAmount": r.newPending,
        },
      },
    );
    if (res.modifiedCount === 1) written++;
    else console.log(`  SKIP (beech mein badal gaya): ${r.patientId}`);
  }

  const dir = path.join("scripts", "reports");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `backfill-patient-discount-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify({ written, fixable, reversed, manualDiscount }, null, 2));

  console.log(`Likhe gaye patients: ${written}/${fixable.length}`);
  console.log(`Report: ${file}\n`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
