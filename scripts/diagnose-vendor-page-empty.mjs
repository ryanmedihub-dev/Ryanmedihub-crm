// scripts/diagnose-vendor-page-empty.mjs
//
// READ-ONLY — writes nothing. Answers one question: after running
// scripts/link-external-party-vendors.mjs, why does the vendor page still look empty?
//
// ─── THE LIKELY ANSWER, FOUND BY READING THE PAGE ───────────────────────────────────────────
//
// src/app/admin/vendors/page.jsx makes exactly two fetches:
//
//     /api/vendors/get
//     /api/payables/grouped?level=1&groupBy=vendor
//
// That is the whole data layer. It **never queries receivables** — the only mention of the word
// in the entire file is a comment on line 29. And `buildPayableGroupedStages` with
// `groupBy: "vendor"` matches `payee.kind: "VENDOR"` and groups by `payee.refId`, so it can only
// ever return PAYABLES.
//
// `paid_to_external` is the REVENUE side. It means someone collected money **on our behalf** —
// they owe *us* — so `externalPartyDerivation.js` creates a **Receivable** for it, not a
// Payable. (`paid_by_other` is the expense-side mirror and does create a Payable.)
//
// So if the transactions you linked were `paid_to_external`, the linking worked perfectly and
// the documents are correctly attached to the vendor — the vendor page simply has no section
// that displays receivables. No script can fix that; it needs a page change (see the end of
// this file's output for what to add).
//
// This script tells you which of those two situations you are actually in, per vendor, so you
// fix the right thing.
//
// Usage:
//   node scripts/diagnose-vendor-page-empty.mjs
//   node scripts/diagnose-vendor-page-empty.mjs --vendor=Shivam

import mongoose from "mongoose";
import fs from "fs";

for (const f of [".env.local", ".env"]) {
  if (fs.existsSync(f)) {
    try { process.loadEnvFile(f); } catch {}
  }
}
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI missing — checked .env.local and .env.");
  process.exit(1);
}

const VENDORS = [
  { id: "6a969b8bf3b5485830705acf", name: "Shivam" },
  { id: "6a969ca6f3b5485830705ad8", name: "Muskan" },
  { id: "6a969cc8f3b5485830705ad9", name: "La Dolce" },
  { id: "6a969cd8f3b5485830705ada", name: "Mona Di" },
];

const args = process.argv.slice(2);
const arg = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const FILTER = arg("vendor") || null;
const inr = (n) => "Rs " + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const norm = (s) => (s || "").trim().toLowerCase();

async function run() {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  const Vendor = mongoose.models.Vendor || mongoose.model("Vendor", new mongoose.Schema({}, { strict: false, collection: "vendors" }));
  const Payable = mongoose.models.Payable || mongoose.model("Payable", new mongoose.Schema({}, { strict: false, collection: "payables" }));
  const Receivable = mongoose.models.Receivable || mongoose.model("Receivable", new mongoose.Schema({}, { strict: false, collection: "receivables" }));
  const Transactions = mongoose.models.Transactions || mongoose.model("Transactions", new mongoose.Schema({}, { strict: false, collection: "transactions" }));

  const targets = FILTER ? VENDORS.filter((v) => norm(v.name) === norm(FILTER)) : VENDORS;

  console.log("=".repeat(94));
  console.log("VENDOR LINK DIAGNOSTIC — read-only, nothing is written");
  console.log("=".repeat(94));

  let totalPay = 0, totalRec = 0;

  for (const v of targets) {
    const _id = new mongoose.Types.ObjectId(v.id);
    const vendorDoc = await Vendor.findById(_id).select("_id name contact").lean();

    console.log(`\n${"-".repeat(94)}`);
    console.log(`${v.name}   (${v.id})`);
    console.log("-".repeat(94));

    if (!vendorDoc) {
      console.log("  VENDOR RECORD NOT FOUND — this _id does not exist. Nothing can link to it.");
      continue;
    }
    console.log(`  Vendor record exists, stored name: "${vendorDoc.name}"`);

    // 1. Transactions pointing at this vendor as an external party
    const txs = await Transactions.find({ "externalParty.partyRefId": _id })
      .select("_id date amount method costType externalParty")
      .lean();
    const txPTE = txs.filter((t) => t.method === "paid_to_external");
    const txPBO = txs.filter((t) => t.method === "paid_by_other");
    console.log(`\n  Transactions linked to this vendor : ${txs.length}`);
    console.log(`      paid_to_external (revenue side, creates RECEIVABLES) : ${txPTE.length}  ${inr(txPTE.reduce((s, t) => s + (t.amount || 0), 0))}`);
    console.log(`      paid_by_other   (expense side, creates PAYABLES)     : ${txPBO.length}  ${inr(txPBO.reduce((s, t) => s + (t.amount || 0), 0))}`);

    // 2. Payables — what the vendor page CAN show
    const pays = await Payable.find({ "payee.kind": "VENDOR", "payee.refId": _id, isCancelled: { $ne: true } })
      .select("_id totalAmount expenseCategory purpose branch")
      .lean();
    const paySum = pays.reduce((s, p) => s + (p.totalAmount || 0), 0);
    totalPay += pays.length;
    console.log(`\n  PAYABLES with payee.kind=VENDOR + refId : ${pays.length}  ${inr(paySum)}`);
    console.log(`      ^ this is the ONLY thing /admin/vendors displays`);
    if (pays.length) {
      const byCat = {};
      pays.forEach((p) => { byCat[p.expenseCategory || "(none)"] = (byCat[p.expenseCategory || "(none)"] || 0) + 1; });
      Object.entries(byCat).forEach(([c, n]) => console.log(`        ${c}: ${n}`));
    }

    // 3. Receivables — correctly linked, but invisible on that page
    const recs = await Receivable.find({ "payer.kind": "VENDOR", "payer.refId": _id, isCancelled: { $ne: true } })
      .select("_id totalAmount purpose revenueCategory branch")
      .lean();
    const recSum = recs.reduce((s, r) => s + (r.totalAmount || 0), 0);
    totalRec += recs.length;
    console.log(`\n  RECEIVABLES with payer.kind=VENDOR + refId : ${recs.length}  ${inr(recSum)}`);
    if (recs.length) {
      console.log(`      ^ these ARE linked correctly, but /admin/vendors never queries receivables,`);
      console.log(`        so they cannot appear there no matter what the data looks like.`);
    }

    // 4. Anything still unlinked but named like this vendor
    const looseRec = await Receivable.countDocuments({
      "payer.refId": null,
      "payer.label": new RegExp(`(^|\\s)${v.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "i"),
      isCancelled: { $ne: true },
    });
    const loosePay = await Payable.countDocuments({
      "payee.refId": null,
      "payee.label": new RegExp(`(^|\\s)${v.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "i"),
      isCancelled: { $ne: true },
    });
    if (looseRec || loosePay) {
      console.log(`\n  STILL UNLINKED but named like this vendor: ${loosePay} payable(s), ${looseRec} receivable(s)`);
      console.log(`      Re-run link-external-party-vendors.mjs with --confirm-partial to catch these.`);
    }
  }

  // --- verdict --------------------------------------------------------------------------------
  console.log(`\n${"=".repeat(94)}`);
  console.log("VERDICT");
  console.log("=".repeat(94));

  if (totalPay === 0 && totalRec === 0) {
    console.log("No payables OR receivables are linked to any of these vendors.");
    console.log("The linking script either matched nothing, or was run without --apply.");
    console.log("Next: run  node scripts/link-external-party-vendors.mjs  and read its grading table.");
  } else if (totalPay === 0 && totalRec > 0) {
    console.log(`${totalRec} receivable(s) ARE correctly linked — the data is fine.`);
    console.log("");
    console.log("The vendor page is empty because it only fetches:");
    console.log("    /api/payables/grouped?level=1&groupBy=vendor");
    console.log("and `paid_to_external` produces RECEIVABLES, not payables. There is no bug in the");
    console.log("data and no script can fix this. The page needs a receivables section:");
    console.log("");
    console.log("  1. /api/receivables/grouped already supports the same shape — verify it accepts");
    console.log("     groupBy=vendor (matching payer.kind/payer.refId) exactly as the payable one");
    console.log("     does; add it there if missing, mirroring buildPayableGroupedStages.");
    console.log("  2. In src/app/admin/vendors/page.jsx, add a second fetch alongside loadLedger()");
    console.log("     for receivables, and render 'They owe us' next to the existing 'We owe them'.");
    console.log("  3. Show a net position per vendor (payables - receivables) in the header.");
  } else {
    console.log(`${totalPay} payable(s) and ${totalRec} receivable(s) are linked.`);
    console.log("Payables should already be visible on /admin/vendors. If they are not, check the");
    console.log("page's date/branch filter — loadLedger() sends from/to/branch, and a scope that");
    console.log("excludes these documents' dates will show an empty ledger with no error.");
    if (totalRec > 0) {
      console.log("");
      console.log("The receivables will NOT be visible either way — see the note above; that part");
      console.log("needs the page change, not a script.");
    }
  }

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("FATAL:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
