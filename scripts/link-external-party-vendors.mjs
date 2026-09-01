// scripts/link-external-party-vendors.mjs
//
// Links `paid_to_external` / `paid_by_other` transactions — and the Receivable/Payable each one
// created — to a real Vendor record, so those documents show up under the vendor instead of
// floating as free-text names.
//
// Today `externalParty.partyKind` is "MANUAL" and `partyRefId` is null on these rows: the party
// exists only as typed text in `externalParty.name`, and the linked Receivable/Payable carries
// `payer.kind` / `payee.kind` of "OTHER" with no `refId`. Nothing joins them to the Vendor
// collection, which is why they can't be seen from a vendor's page.
//
// This script sets, for each matched row:
//     transaction.externalParty.partyKind  = "VENDOR"
//     transaction.externalParty.partyRefId = <vendor _id>
//     receivable.payer  = { kind: "VENDOR", refId: <vendor _id>, label: <vendor name> }
//     payable.payee     = { kind: "VENDOR", refId: <vendor _id>, label: <vendor name> }
//
// Amounts are never touched. This is purely an identity link.
//
// ─── THE MATCHING PROBLEM, AND WHY THIS SCRIPT IS CAUTIOUS ──────────────────────────────────
//
// Two of the four vendors are BARE SINGLE NAMES — "Shivam" and "Muskan". Matching those by
// substring against free text is genuinely dangerous, and this database has already proved it:
// while linking employees earlier, "Muskan Sharma" and "Muskan Sayed" turned out to be two
// different people, and a separate employee record exists as "Hr Muskan". A rule of "contains
// Muskan" would have merged three unrelated parties.
//
// So every candidate match is graded, and only the safest tier is applied automatically:
//
//   EXACT      name matches the vendor exactly (case/space-insensitive)      -> auto-applied
//   PREFIX     name starts with the vendor name followed by a word boundary
//              ("Shivam Soni" for vendor "Shivam")                            -> needs --confirm-partial
//   CONTAINS   vendor name appears elsewhere in the string                    -> needs --confirm-partial
//   AMBIGUOUS  the same name plausibly matches MORE THAN ONE of the vendors   -> never applied
//
// A dry run prints every distinct external-party name found, its tier, its row count and value,
// so the decision is made against the real data rather than against a guess. Names matching no
// vendor are listed too — that list is how you find the vendors still worth creating.
//
// ─── SAFETY ─────────────────────────────────────────────────────────────────────────────────
//
// - Rows already linked to a vendor are left alone unless --relink is passed, and a row linked
//   to a DIFFERENT vendor is never silently reassigned — it is reported and skipped.
// - PERIOD LOCK is checked per transaction. Although this changes no amount, it edits a
//   financial document, and every write path in this app respects the lock.
// - A FULL BACKUP of every document about to change (with its current values) is written BEFORE
//   any update. That file is the undo list.
// - Idempotent: after a successful run there is nothing left to link, so a second run reports
//   zero changes.
//
// Usage:
//   node scripts/link-external-party-vendors.mjs                       # dry run, all tiers shown
//   node scripts/link-external-party-vendors.mjs --apply               # EXACT matches only
//   node scripts/link-external-party-vendors.mjs --apply --confirm-partial
//   node scripts/link-external-party-vendors.mjs --apply --relink      # also move wrongly-linked rows
//   node scripts/link-external-party-vendors.mjs --vendor=Shivam       # one vendor only

import mongoose from "mongoose";
import fs from "fs";

// --- env -----------------------------------------------------------------
for (const f of [".env.local", ".env"]) {
  if (fs.existsSync(f)) {
    try {
      process.loadEnvFile(f);
    } catch {
      /* already loaded / unsupported — falls through to the MONGODB_URI check below */
    }
  }
}
const MONGODB_URI = process.env.MONGODB_URI;

// Mirrors ACCOUNTS in src/constants/bankRouting.js — for the period-lock check.
const ACCOUNTS = [
  "Cash Book", "HDFC Skin", "HDFC Medihub", "ICICI Medihub", "Mumbai Receipts",
  "Cash ( backend )", "Paytm ( Delhi T44P )", "Paytm ( Noida CK5Y )",
  "Bajaj Loan", "Fibe Loan", "Pine Lab",
];
const UNSETTLED_METHODS = ["paid_to_external", "paid_by_other"];

// The four vendors to link. _ids supplied by Dashzer; names are what to match against
// externalParty.name. Add more here as vendors are created — the grading logic needs no change.
const VENDORS = [
  { id: "6a969b8bf3b5485830705acf", name: "Shivam" },
  { id: "6a969ca6f3b5485830705ad8", name: "Muskan" },
  { id: "6a969cc8f3b5485830705ad9", name: "La Dolce" },
  { id: "6a969cd8f3b5485830705ada", name: "Monika" },
];

// --- args ------------------------------------------------------------------
const args = process.argv.slice(2);
const arg = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const APPLY = args.includes("--apply");
const CONFIRM_PARTIAL = args.includes("--confirm-partial");
const RELINK = args.includes("--relink");
const VENDOR_FILTER = arg("vendor") || null;

const inr = (n) => "Rs " + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const norm = (s) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

if (!MONGODB_URI) {
  console.error("MONGODB_URI missing — checked .env.local and .env.");
  process.exit(1);
}

const TARGETS = VENDOR_FILTER
  ? VENDORS.filter((v) => norm(v.name) === norm(VENDOR_FILTER))
  : VENDORS;
if (!TARGETS.length) {
  console.error(`--vendor="${VENDOR_FILTER}" matched none of: ${VENDORS.map((v) => v.name).join(", ")}`);
  process.exit(1);
}

// Grade one free-text party name against one vendor. Returns null when there's no relationship.
function grade(partyName, vendorName) {
  const p = norm(partyName);
  const v = norm(vendorName);
  if (!p || !v) return null;
  if (p === v) return "EXACT";
  // Word-boundary prefix: "shivam soni" for "shivam", but NOT "shivamani".
  if (p.startsWith(v + " ")) return "PREFIX";
  // Word-boundary containment anywhere else in the string.
  if (new RegExp(`(^|\\s)${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(p)) return "CONTAINS";
  return null;
}

async function run() {
  console.log("=".repeat(94));
  console.log(APPLY ? "MODE: APPLY  <- will write to the database" : "MODE: DRY RUN  <- nothing will be written");
  console.log(`Vendors      : ${TARGETS.map((v) => v.name).join(", ")}`);
  console.log(`Tiers applied: EXACT${CONFIRM_PARTIAL ? " + PREFIX + CONTAINS (--confirm-partial)" : " only (pass --confirm-partial for the rest)"}`);
  console.log(`Re-link      : ${RELINK ? "YES — rows linked to another vendor WILL be moved" : "no (rows linked elsewhere are reported, not changed)"}`);
  console.log("=".repeat(94) + "\n");

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  const Vendor = mongoose.models.Vendor || mongoose.model("Vendor", new mongoose.Schema({}, { strict: false, collection: "vendors" }));
  const Payable = mongoose.models.Payable || mongoose.model("Payable", new mongoose.Schema({}, { strict: false, collection: "payables" }));
  const Receivable = mongoose.models.Receivable || mongoose.model("Receivable", new mongoose.Schema({}, { strict: false, collection: "receivables" }));
  const AccountPeriod = mongoose.models.AccountPeriod || mongoose.model("AccountPeriod", new mongoose.Schema({}, { strict: false, collection: "accountperiods" }));
  const Transactions = mongoose.models.Transactions || mongoose.model("Transactions", new mongoose.Schema({}, { strict: false, collection: "transactions" }));

  // Confirm every supplied vendor _id actually exists before touching anything — a typo in an
  // _id would otherwise link documents to a vendor that isn't there.
  const resolved = [];
  for (const v of TARGETS) {
    const doc = await Vendor.findById(new mongoose.Types.ObjectId(v.id)).select("_id name").lean();
    if (!doc) {
      console.error(`Vendor _id ${v.id} ("${v.name}") NOT FOUND in the vendors collection. Aborting.`);
      await mongoose.disconnect();
      process.exit(1);
    }
    resolved.push({ ...v, _id: doc._id, dbName: doc.name });
    if (norm(doc.name) !== norm(v.name)) {
      console.log(`  note: _id ${v.id} is stored as "${doc.name}"; matching against "${v.name}" as given.`);
    }
  }
  console.log(`All ${resolved.length} vendor _id(s) verified.\n`);

  // --- period lock, reimplemented (periodLock.js imports @/-aliased modules) -----------------
  const isOpeningSeed = (p) => new Date(p.periodStart).getTime() === new Date(p.periodEnd).getTime();
  async function lockReason(account, date) {
    if (!account || !ACCOUNTS.includes(account)) return null;
    const rows = await AccountPeriod.find({
      account, branch: null, isClosed: true,
      periodStart: { $lte: new Date(date) }, periodEnd: { $gte: new Date(date) },
    }).lean();
    const real = rows.filter((p) => !isOpeningSeed(p));
    return real.length ? `${account} is closed for that period` : null;
  }

  const all = await Transactions.find({ method: { $in: UNSETTLED_METHODS } })
    .select("_id date amount method costType branch externalParty remarks furtherMode")
    .sort({ date: 1 })
    .lean();
  console.log(`Found ${all.length} external-party transaction(s).\n`);

  // --- grade every distinct party name ------------------------------------------------------
  const nameStats = {};
  for (const tx of all) {
    const n = tx.externalParty?.name || "(blank)";
    nameStats[n] = nameStats[n] || { count: 0, amount: 0, rows: [] };
    nameStats[n].count += 1;
    nameStats[n].amount += tx.amount || 0;
    nameStats[n].rows.push(tx);
  }

  const decided = [];   // { tx, vendor, tier }
  const ambiguous = [];
  const unmatchedNames = {};

  for (const [name, stat] of Object.entries(nameStats)) {
    const hits = resolved
      .map((v) => ({ vendor: v, tier: grade(name, v.name) }))
      .filter((h) => h.tier);

    if (!hits.length) { unmatchedNames[name] = stat; continue; }

    // Prefer the strongest tier; if two vendors tie at that tier the name is genuinely
    // ambiguous and is never auto-resolved.
    const order = { EXACT: 3, PREFIX: 2, CONTAINS: 1 };
    const best = Math.max(...hits.map((h) => order[h.tier]));
    const top = hits.filter((h) => order[h.tier] === best);
    if (top.length > 1) {
      ambiguous.push({ name, stat, candidates: top });
      continue;
    }
    stat.rows.forEach((tx) => decided.push({ tx, vendor: top[0].vendor, tier: top[0].tier }));
  }

  // --- split by what can actually be written ------------------------------------------------
  const toApply = [];
  const needConfirm = [];
  const alreadyLinked = [];
  const linkedElsewhere = [];
  const locked = [];

  for (const d of decided) {
    const ep = d.tx.externalParty || {};
    if (ep.partyKind === "VENDOR" && ep.partyRefId) {
      if (String(ep.partyRefId) === String(d.vendor._id)) { alreadyLinked.push(d); continue; }
      if (!RELINK) { linkedElsewhere.push(d); continue; }
    }
    if (d.tier !== "EXACT" && !CONFIRM_PARTIAL) { needConfirm.push(d); continue; }
    const lock = await lockReason(d.tx.furtherMode, d.tx.date);
    if (lock) { locked.push({ ...d, reason: lock }); continue; }
    toApply.push(d);
  }

  // --- report -------------------------------------------------------------------------------
  console.log("--- DISTINCT EXTERNAL-PARTY NAMES, GRADED ---");
  for (const [name, stat] of Object.entries(nameStats).sort((a, b) => b[1].amount - a[1].amount)) {
    const d = decided.find((x) => (x.tx.externalParty?.name || "(blank)") === name);
    const amb = ambiguous.find((x) => x.name === name);
    const tag = amb ? "AMBIGUOUS" : d ? `${d.tier} -> ${d.vendor.name}` : "no vendor match";
    console.log(`  ${String(stat.count).padStart(4)} rows  ${inr(stat.amount).padStart(16)}   "${name}"   ${tag}`);
  }

  console.log(`\n  Will link            : ${toApply.length}`);
  console.log(`  Needs --confirm-partial: ${needConfirm.length}`);
  console.log(`  Already linked       : ${alreadyLinked.length}`);
  console.log(`  Linked to another vendor: ${linkedElsewhere.length}${RELINK ? "" : "  (pass --relink to move)"}`);
  console.log(`  Ambiguous (never auto): ${ambiguous.length} name(s)`);
  console.log(`  Period locked        : ${locked.length}`);

  if (ambiguous.length) {
    console.log("\n" + "!".repeat(94));
    console.log("AMBIGUOUS NAMES — matched more than one vendor at the same strength. Never auto-linked.");
    console.log("!".repeat(94));
    ambiguous.forEach(({ name, stat, candidates }) =>
      console.log(`  "${name}"  (${stat.count} rows, ${inr(stat.amount)})  ->  ${candidates.map((c) => `${c.vendor.name} [${c.tier}]`).join("  |  ")}`),
    );
    console.log("  Resolve by renaming the vendor or editing these transactions' party name.");
  }

  if (needConfirm.length) {
    const byName = {};
    needConfirm.forEach((d) => {
      const k = `"${d.tx.externalParty?.name}" -> ${d.vendor.name} [${d.tier}]`;
      byName[k] = (byName[k] || 0) + 1;
    });
    console.log("\n--- PARTIAL MATCHES (skipped; --confirm-partial applies them) ---");
    Object.entries(byName).sort().forEach(([k, c]) => console.log(`  ${String(c).padStart(4)} rows  ${k}`));
  }

  if (linkedElsewhere.length) {
    console.log("\n--- ALREADY LINKED TO A DIFFERENT VENDOR (skipped) ---");
    linkedElsewhere.slice(0, 20).forEach((d) =>
      console.log(`  ${iso(d.tx.date)}  ${String(d.tx._id)}  "${d.tx.externalParty?.name}"  currently -> ${d.tx.externalParty?.partyRefId}, would be ${d.vendor.name}`),
    );
  }

  if (Object.keys(unmatchedNames).length) {
    console.log("\n--- NAMES MATCHING NO VENDOR (nothing done — these are the vendors still worth creating) ---");
    Object.entries(unmatchedNames)
      .sort((a, b) => b[1].amount - a[1].amount)
      .slice(0, 40)
      .forEach(([n, s]) => console.log(`  ${String(s.count).padStart(4)} rows  ${inr(s.amount).padStart(16)}   "${n}"`));
  }

  if (!toApply.length) {
    console.log("\nNothing to link.");
    await mongoose.disconnect();
    return;
  }

  // Backup BEFORE any write.
  const backupPath = `link-external-party-vendors-backup-${Date.now()}.json`;
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      toApply.map(({ tx, vendor, tier }) => ({
        transactionId: String(tx._id), date: iso(tx.date), amount: tx.amount, tier,
        before: {
          partyKind: tx.externalParty?.partyKind ?? null,
          partyRefId: tx.externalParty?.partyRefId ? String(tx.externalParty.partyRefId) : null,
          linkedPayableId: tx.externalParty?.linkedPayableId ? String(tx.externalParty.linkedPayableId) : null,
          linkedReceivableId: tx.externalParty?.linkedReceivableId ? String(tx.externalParty.linkedReceivableId) : null,
        },
        after: { partyKind: "VENDOR", partyRefId: String(vendor._id), vendorName: vendor.name },
      })),
      null,
      2,
    ),
  );
  console.log(`\nBackup of every document about to change written to ${backupPath} BEFORE any update.`);

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Review the grading above, then re-run with --apply.");
    await mongoose.disconnect();
    return;
  }

  console.log(`\nLinking ${toApply.length} transaction(s) and their documents...`);
  let txUpdated = 0, recUpdated = 0, payUpdated = 0;
  const failed = [];

  for (const { tx, vendor } of toApply) {
    try {
      await Transactions.updateOne(
        { _id: tx._id },
        { $set: { "externalParty.partyKind": "VENDOR", "externalParty.partyRefId": vendor._id } },
      );
      txUpdated++;

      const logEntry = {
        action: "Updated",
        note: `Party linked to vendor "${vendor.name}" (${vendor._id}) by scripts/link-external-party-vendors.mjs`,
        performedBy: { name: "Bulk Link", email: "import@system", branch: "" },
        performedAt: new Date(),
      };

      const recId = tx.externalParty?.linkedReceivableId;
      if (recId) {
        await Receivable.updateOne(
          { _id: recId },
          {
            $set: { "payer.kind": "VENDOR", "payer.refId": vendor._id, "payer.label": vendor.name },
            $push: { log: logEntry },
          },
        );
        recUpdated++;
      }

      const payId = tx.externalParty?.linkedPayableId;
      if (payId) {
        await Payable.updateOne(
          { _id: payId },
          {
            $set: { "payee.kind": "VENDOR", "payee.refId": vendor._id, "payee.label": vendor.name },
            $push: { log: logEntry },
          },
        );
        payUpdated++;
      }

      console.log(`  ${iso(tx.date)}  ${String(tx._id)}  "${tx.externalParty?.name}"  ->  ${vendor.name}  ${inr(tx.amount)}`);
    } catch (err) {
      failed.push({ id: String(tx._id), reason: err?.message || String(err) });
      console.log(`  ${String(tx._id)}  FAILED: ${err?.message || err}`);
    }
  }

  console.log(`\nTransactions linked: ${txUpdated} · Receivables updated: ${recUpdated} · Payables updated: ${payUpdated} · Failed: ${failed.length}`);
  if (failed.length) failed.forEach((f) => console.log(`  ${f.id}: ${f.reason}`));

  const reportPath = `link-external-party-vendors-report-${Date.now()}.json`;
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        vendors: resolved.map((v) => ({ id: String(v._id), name: v.name, dbName: v.dbName })),
        txUpdated, recUpdated, payUpdated, failed,
        ambiguousNames: ambiguous.map(({ name, stat, candidates }) => ({ name, rows: stat.count, amount: stat.amount, candidates: candidates.map((c) => c.vendor.name) })),
        skippedNeedConfirm: needConfirm.map((d) => ({ id: String(d.tx._id), name: d.tx.externalParty?.name, vendor: d.vendor.name, tier: d.tier })),
        skippedLinkedElsewhere: linkedElsewhere.map((d) => ({ id: String(d.tx._id), name: d.tx.externalParty?.name })),
        unmatchedNames: Object.entries(unmatchedNames).map(([n, s]) => ({ name: n, rows: s.count, amount: s.amount })),
        backupFile: backupPath,
      },
      null,
      2,
    ),
  );
  console.log(`\nReport: ${reportPath}   Backup: ${backupPath}`);
  console.log("\nVerify on the vendor's page: their payables/receivables should now list these documents.");
  console.log("Amounts are unchanged everywhere — this was an identity link only, so P&L, Assets and");
  console.log("Liabilities totals must all read exactly the same as before.");

  await mongoose.disconnect();
  console.log("Done.");
}

run().catch(async (err) => {
  console.error("\nFATAL:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
