// ---------------------------------------------------------------------------
// scripts/backfill-clinic-collected-credit.mjs
//
// Jab patient ne paisa PARTNER CLINIC ko diya, purana code patient ke record pe
// kuch likhta hi nahi tha:
//     payments.amountReceived  mein woh paisa add nahi hua
//     payments.transactions    mein woh transaction link nahi hua
//     payments.pendingAmount   isliye poora package due dikhata raha
// Patient ne full payment kar diya hai, phir bhi uske naam pe dues khade hain.
//
// App ka apna rule (entryCore/createRevenue.js — paid_to_external ka canonical
// handling): patient ka pending CLEAR hota hai, aur paisa wapas lane ke liye us
// party ke naam RECEIVABLE khada rehta hai. Collab clinic ka receivable pehle se
// banta hai (collabDerivation → growClinicReceivable), sirf patient ki side
// chhoot gayi thi. Code mein fix ho chuka hai (createCollectionTransaction ab
// dono taraf patient ko credit karta hai); yeh script purane patients ko wahi
// shape deti hai.
//
// FORMULA (app se hi liya, taaki agli collection pe value wapas na palte):
//     transactions += jo collab Revenue tx link nahi the
//     amountReceived += un tx ka net amount (reversal rows ka minus bhi)
//     discount = linked Revenue tx ke discount ka sum
//     pending  = max(0, total − amountReceived − discount)
//
// SAFETY
//   • Default DRY RUN. --commit ke bina DB mein kuch nahi likhta.
//   • Sirf collab case waale patients, aur sirf un tx ko jodta hai jo already
//     linked nahi hain -> dobara chalane pe kuch nahi badlega (idempotent).
//   • Cancelled cases ko chhod deta hai.
//   • amountReceived kabhi negative nahi hota.
//   • Guarded update: amountReceived wahi hona chahiye jo padha tha.
//   • --commit pe JSON report scripts/reports/ mein (purani value ke saath).
//
// DHYAN DO: raw driver se likhta hai, toh Patient ka pre-save hook nahi chalta —
// jinka pending 0 ho jayega unka ops.status agli save pe set hoga. Hook jaan ke
// nahi chalaya: woh payments.totalAmount ko counselling.finlpackage se overwrite
// kar deta hai aur revised package waale patients kharab ho jate.
//
// USAGE (project root se)
//   node --env-file=.env scripts/backfill-clinic-collected-credit.mjs            # dry run
//   node --env-file=.env scripts/backfill-clinic-collected-credit.mjs --commit   # likho
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
      "MONGODB_URI set nahi hai. Aise chalao:\n  node --env-file=.env scripts/backfill-clinic-collected-credit.mjs",
    );
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection;
  const Cases = db.collection("collabcases");
  const Patients = db.collection("patients");
  const Transactions = db.collection("transactions");

  const patientIds = await Cases.distinct("patient", { status: { $ne: "CANCELLED" } });
  console.log(`\nCollab case waale patients: ${patientIds.length}`);

  const fixable = [];
  let alreadyOk = 0;

  for (const pid of patientIds) {
    const p = await Patients.findOne(
      { _id: pid },
      { projection: { "personal.name": 1, "counselling.finlpackage": 1, payments: 1 } },
    );
    if (!p) continue;

    const linked = (p.payments?.transactions || []).map(String);
    const caseIds = await Cases.distinct("_id", { patient: pid, status: { $ne: "CANCELLED" } });

    // Case ka balance isi set pe banta hai (collabDerivation → computeCaseBalance),
    // toh patient ki side bhi isi set se milni chahiye.
    const txs = await Transactions.find(
      {
        "collabRef.caseId": { $in: caseIds },
        costType: "Revenue",
        receivableId: null,
        approvalStatus: { $nin: ["PENDING", "REJECTED"] },
      },
      { projection: { amount: 1, discount: 1, method: 1 } },
    ).toArray();

    const missing = txs.filter((t) => !linked.includes(String(t._id)));
    if (missing.length === 0) {
      alreadyOk++;
      continue;
    }

    const received = round2(p.payments?.amountReceived || 0);
    const addedMoney = round2(missing.reduce((s, t) => s + (t.amount || 0), 0));
    const newReceived = Math.max(0, round2(received + addedMoney));

    const newLinked = [...linked, ...missing.map((t) => String(t._id))];
    const allRevenue = await Transactions.find(
      { _id: { $in: newLinked.map((id) => new mongoose.Types.ObjectId(id)) }, costType: "Revenue" },
      { projection: { discount: 1 } },
    ).toArray();
    const newDiscount = round2(allRevenue.reduce((s, t) => s + (t.discount || 0), 0));

    const total = round2(p.payments?.totalAmount || p.counselling?.finlpackage || 0);
    const storedPending = round2(p.payments?.pendingAmount || 0);
    const newPending = Math.max(0, round2(total - newReceived - newDiscount));

    fixable.push({
      patientId: String(p._id),
      name: p.personal?.name || "Unknown",
      total,
      received,
      newReceived,
      storedDiscount: round2(p.payments?.discount || 0),
      newDiscount,
      storedPending,
      newPending,
      addedMoney,
      linkedTxIds: missing.map((t) => String(t._id)),
    });
  }

  console.log(`  pehle se sahi        : ${alreadyOk}`);
  console.log(`  link + credit honge  : ${fixable.length}\n`);

  if (fixable.length > 0) {
    console.log("FIX (clinic ko diya paisa patient ke record pe aayega):");
    for (const r of fixable) {
      const disc =
        Math.abs(r.newDiscount - r.storedDiscount) > EPSILON
          ? `, discount ${rupee(r.storedDiscount)} → ${rupee(r.newDiscount)}`
          : "";
      console.log(
        `  ${r.name} — received ${rupee(r.received)} → ${rupee(r.newReceived)}, pending ${rupee(r.storedPending)} → ${rupee(r.newPending)}${disc}  (${r.linkedTxIds.length} tx)  ${r.patientId}`,
      );
    }
    const clearedDues = fixable.reduce((s, r) => s + (r.storedPending - r.newPending), 0);
    console.log(`\n  Jhoothe dues jo hatenge: ${rupee(round2(clearedDues))}\n`);
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
      { _id: new mongoose.Types.ObjectId(r.patientId), "payments.amountReceived": r.received },
      {
        $set: {
          "payments.amountReceived": r.newReceived,
          "payments.discount": r.newDiscount,
          "payments.pendingAmount": r.newPending,
        },
        $push: {
          "payments.transactions": {
            $each: r.linkedTxIds.map((id) => new mongoose.Types.ObjectId(id)),
          },
        },
      },
    );
    if (res.modifiedCount === 1) written++;
    else console.log(`  SKIP (beech mein badal gaya): ${r.patientId}`);
  }

  const dir = path.join("scripts", "reports");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `backfill-clinic-collected-credit-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify({ written, fixable }, null, 2));

  console.log(`Likhe gaye patients: ${written}/${fixable.length}`);
  console.log(`Report: ${file}\n`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
