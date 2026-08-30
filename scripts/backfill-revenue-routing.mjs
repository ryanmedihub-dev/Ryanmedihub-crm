
import mongoose from "mongoose";
import fs from "fs";

for (const f of [".env.local", ".env"]) {
  if (fs.existsSync(f)) {
    try {
      process.loadEnvFile(f);
    } catch {
    }
  }
}
const MONGODB_URI = process.env.MONGODB_URI;

const ACCOUNTS = [
  "Cash Book", "HDFC Skin", "HDFC Medihub", "ICICI Medihub", "Mumbai Receipts",
  "Cash ( backend )", "Paytm ( Delhi T44P )", "Paytm ( Noida CK5Y )",
  "Bajaj Loan", "Fibe Loan", "Pine Lab",
];
const NON_CASH_METHODS = ["offset_settlement", "including-package", "paid_to_external", "paid_by_other"];
const COLLAB_BRANCHES = [
  "Patna", "Kolkata", "Ahmedabad", "Jaipur", "Bengaluru", "Pune", "Lucknow",
  "Chennai", "Jammu", "Kashmir", "Ranchi", "Prayagraj", "Chandigarh", "Jalandhar",
];

const D_CARD = { receiptMode: "Paytm Delhi", furtherMode: "Paytm ( Delhi T44P )" };
const N_CARD = { receiptMode: "Paytm Noida", furtherMode: "Paytm ( Noida CK5Y )" };
const CASH = { receiptMode: "In Cash", furtherMode: "Cash Book" };
const BAJAJ = { receiptMode: "Bajaj Statement", furtherMode: "Bajaj Loan" };
const FIBE = { receiptMode: "Fibe Statement", furtherMode: "Fibe Loan" };
const PINE = { receiptMode: "Pine Lab", furtherMode: "Pine Lab" };
const ICICI = { receiptMode: "ICICI Medihub", furtherMode: "ICICI Medihub" };
const MUM = { receiptMode: "Mumbai Receipts", furtherMode: "Mumbai Receipts" };

const BANK_ROUTING_MAP = {
  Delhi: {
    TRANSPLANT: { cash: CASH, card: D_CARD, upi: D_CARD, bajaj_loan: BAJAJ, fibe_loan: FIBE },
    SERVICE:    { cash: CASH, card: D_CARD, upi: D_CARD, bajaj_loan: BAJAJ, fibe_loan: FIBE },
    MEDICINE:   { cash: CASH, card: D_CARD, upi: ICICI,  bajaj_loan: BAJAJ, fibe_loan: FIBE },
  },
  Hyderabad: {
    TRANSPLANT: { cash: CASH, card: PINE, upi: ICICI, bajaj_loan: BAJAJ, fibe_loan: FIBE },
    SERVICE:    { cash: CASH, card: PINE, upi: ICICI, bajaj_loan: BAJAJ, fibe_loan: FIBE },
    MEDICINE:   { cash: CASH, card: PINE, upi: ICICI, bajaj_loan: BAJAJ, fibe_loan: FIBE },
  },
  Noida: {
    TRANSPLANT: { cash: CASH, card: N_CARD, upi: N_CARD, bajaj_loan: BAJAJ, fibe_loan: FIBE },
    SERVICE:    { cash: CASH, card: N_CARD, upi: N_CARD, bajaj_loan: BAJAJ, fibe_loan: FIBE },
    MEDICINE:   { cash: CASH, card: N_CARD, upi: N_CARD, bajaj_loan: BAJAJ, fibe_loan: FIBE },
  },
  Mumbai: {
    TRANSPLANT: { cash: MUM, card: MUM, upi: MUM, bajaj_loan: { receiptMode: "Mumbai Receipts", furtherMode: "Bajaj Loan" }, fibe_loan: FIBE },
    SERVICE:    { cash: MUM, card: MUM, upi: MUM, bajaj_loan: { receiptMode: "Mumbai Receipts", furtherMode: "Bajaj Loan" }, fibe_loan: { receiptMode: "", furtherMode: "Fibe Loan" } },
    MEDICINE:   { cash: MUM, card: MUM, upi: MUM, bajaj_loan: { receiptMode: "Mumbai Receipts", furtherMode: "Bajaj Loan" }, fibe_loan: { receiptMode: "", furtherMode: "Fibe Loan" } },
  },
};

function getRouting(branch, category, method) {
  return BANK_ROUTING_MAP?.[branch]?.[category]?.[method] || null;
}

const args = process.argv.slice(2);
const arg = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const APPLY = args.includes("--apply");
const INCLUDE_RECEIPT_MODE = args.includes("--include-receipt-mode");
const OVERWRITE_MISMATCHED = args.includes("--overwrite-mismatched");
const CLEAR_NON_CASH = args.includes("--clear-non-cash");
const ALL_DATES = args.includes("--all-dates");
const TO = arg("to") || null;
const BRANCH = arg("branch") || null;

const DEFAULT_FROM = "2026-08-27";
const FROM = ALL_DATES ? null : arg("from") || DEFAULT_FROM;

if (ALL_DATES && arg("from")) {
  console.error("Pass either --from=<date> or --all-dates, not both.");
  process.exit(1);
}
if (FROM && isNaN(new Date(FROM).getTime())) {
  console.error(`Bad --from date: "${FROM}" (expected YYYY-MM-DD)`);
  process.exit(1);
}
if (TO && isNaN(new Date(TO).getTime())) {
  console.error(`Bad --to date: "${TO}" (expected YYYY-MM-DD)`);
  process.exit(1);
}
if (FROM && TO && new Date(FROM) > new Date(TO)) {
  console.error(`--from (${FROM}) is after --to (${TO}).`);
  process.exit(1);
}

const inr = (n) => "Rs " + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const blank = (v) => v === undefined || v === null || String(v).trim() === "";

if (!MONGODB_URI) {
  console.error("MONGODB_URI missing — checked .env.local and .env.");
  process.exit(1);
}

async function run() {
  console.log("=".repeat(94));
  console.log(APPLY ? "MODE: APPLY  <- will write to the database" : "MODE: DRY RUN  <- nothing will be written");
  console.log(`Fields        : furtherMode${INCLUDE_RECEIPT_MODE ? " + receiptMode" : " only (pass --include-receipt-mode to also fix receiptMode)"}`);
  console.log(`Blank fills   : yes (always)`);
  console.log(`Mismatches    : ${OVERWRITE_MISMATCHED ? "WILL BE OVERWRITTEN" : "reported only (pass --overwrite-mismatched to rewrite)"}`);
  console.log(`Non-cash rows : ${CLEAR_NON_CASH ? "stray furtherMode WILL BE CLEARED" : "reported only (pass --clear-non-cash to blank them)"}`);
  if (ALL_DATES) {
    console.log(`Date range    : *** ALL DATES — every revenue transaction ever *** (--all-dates)`);
  } else {
    console.log(`Date range    : ${FROM} -> ${TO || "now"}${arg("from") ? "" : `   (default; --from= to change, --all-dates to remove)`}`);
  }
  console.log(`Branch        : ${BRANCH || "all"}`);
  console.log("=".repeat(94) + "\n");

  if (ALL_DATES && APPLY) {
    console.log("!".repeat(94));
    console.log("--all-dates WITH --apply: this will rewrite routing on revenue transactions of every");
    console.log(`age, not just the ${DEFAULT_FROM}-onward window this backfill was written for. Older rows`);
    console.log("were routed under earlier rules and by hand. Make sure that is what you want.");
    console.log("!".repeat(94) + "\n");
  }

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  const AccountPeriod = mongoose.models.AccountPeriod || mongoose.model("AccountPeriod", new mongoose.Schema({}, { strict: false, collection: "accountperiods" }));
  const Transactions = mongoose.models.Transactions || mongoose.model("Transactions", new mongoose.Schema({}, { strict: false, collection: "transactions" }));

  const isOpeningSeed = (p) => new Date(p.periodStart).getTime() === new Date(p.periodEnd).getTime();
  async function closedPeriodsCovering(account, date) {
    const rows = await AccountPeriod.find({
      account, branch: null, isClosed: true,
      periodStart: { $lte: new Date(date) }, periodEnd: { $gte: new Date(date) },
    }).lean();
    return rows.filter((p) => !isOpeningSeed(p));
  }
  async function lockReason(account, date) {
    if (account && ACCOUNTS.includes(account)) {
      const [c] = await closedPeriodsCovering(account, date);
      return c ? `${account} closed for that period` : null;
    }
    const per = await Promise.all(ACCOUNTS.map(async (a) => (await closedPeriodsCovering(a, date))[0]));
    return per.every(Boolean) ? "books closed across all accounts for that period" : null;
  }

  const query = { costType: "Revenue" };
  if (BRANCH) query.branch = BRANCH;
  if (FROM || TO) {
    query.date = {};
    if (FROM) query.date.$gte = new Date(`${FROM}T00:00:00.000Z`);
    if (TO) query.date.$lte = new Date(`${TO}T23:59:59.999Z`);
  }

  const all = await Transactions.find(query).sort({ date: 1 }).lean();
  console.log(`Scanned ${all.length} revenue transaction(s).\n`);

  const toFill = [];
  const mismatched = [];
  const nonCashStray = [];
  const noRule = {};
  const collabSkipped = [];
  const alreadyCorrect = [];
  const skippedReversal = [];
  const locked = [];

  for (const tx of all) {
    if (tx.reversalOf || tx.isReversed) { skippedReversal.push(tx); continue; }

    if (NON_CASH_METHODS.includes(tx.method)) {
      if (!blank(tx.furtherMode)) nonCashStray.push(tx);
      continue;
    }

    if (COLLAB_BRANCHES.includes(tx.branch)) { collabSkipped.push(tx); continue; }

    const rule = getRouting(tx.branch, tx.transactionCategory, tx.method);
    if (!rule) {
      const k = `${tx.branch} | ${tx.transactionCategory} | ${tx.method}`;
      noRule[k] = (noRule[k] || 0) + 1;
      continue;
    }

    const wantFM = rule.furtherMode;
    const wantRM = rule.receiptMode;
    const fmBlank = blank(tx.furtherMode);
    const fmMismatch = !fmBlank && tx.furtherMode !== wantFM;
    const rmBlank = blank(tx.receiptMode);
    const rmMismatch = !rmBlank && tx.receiptMode !== wantRM;

    const changes = {};
    if (fmBlank && !blank(wantFM)) changes.furtherMode = wantFM;
    else if (fmMismatch && OVERWRITE_MISMATCHED) changes.furtherMode = wantFM;

    if (INCLUDE_RECEIPT_MODE) {
      if (rmBlank && !blank(wantRM)) changes.receiptMode = wantRM;
      else if (rmMismatch && OVERWRITE_MISMATCHED) changes.receiptMode = wantRM;
    }

    if (fmMismatch && !OVERWRITE_MISMATCHED) mismatched.push({ tx, want: wantFM, field: "furtherMode" });
    if (INCLUDE_RECEIPT_MODE && rmMismatch && !OVERWRITE_MISMATCHED) mismatched.push({ tx, want: wantRM, field: "receiptMode" });

    if (!Object.keys(changes).length) { alreadyCorrect.push(tx); continue; }

    const target = changes.furtherMode || tx.furtherMode;
    const lock = await lockReason(target, tx.date);
    if (lock) { locked.push({ tx, reason: lock }); continue; }

    toFill.push({ tx, changes });
  }

  console.log(`  Will update            : ${toFill.length}`);
  console.log(`  Already correct        : ${alreadyCorrect.length}`);
  console.log(`  Mismatched (not fixed) : ${mismatched.length}${OVERWRITE_MISMATCHED ? "  (overwrite ON — folded into 'will update')" : ""}`);
  console.log(`  Non-cash w/ stray acct : ${nonCashStray.length}`);
  console.log(`  Collab branch (skipped): ${collabSkipped.length}`);
  console.log(`  Reversal rows (skipped): ${skippedReversal.length}`);
  console.log(`  Period locked          : ${locked.length}`);
  console.log(`  No rule exists         : ${Object.values(noRule).reduce((a, b) => a + b, 0)}`);

  if (Object.keys(noRule).length) {
    console.log("\n--- NO ROUTING RULE FOR THESE COMBINATIONS (skipped, nothing guessed) ---");
    Object.entries(noRule).sort().forEach(([k, c]) => console.log(`  ${k.padEnd(52)} ${String(c).padStart(5)} rows`));
    console.log("  Add these to BANK_ROUTING_MAP in the app (and here) if they should route somewhere.");
  }

  if (toFill.length) {
    const byTarget = {};
    toFill.forEach(({ changes }) => {
      const t = changes.furtherMode || "(receiptMode only)";
      byTarget[t] = (byTarget[t] || 0) + 1;
    });
    console.log("\n--- WILL SET furtherMode TO ---");
    Object.entries(byTarget).sort().forEach(([t, c]) => console.log(`  ${t.padEnd(26)} ${String(c).padStart(5)} rows`));

    console.log("\n--- SAMPLE (first 25) ---");
    toFill.slice(0, 25).forEach(({ tx, changes }) =>
      console.log(`  ${iso(tx.date)}  ${String(tx._id)}  ${(tx.branch || "").padEnd(11)} ${(tx.transactionCategory || "").padEnd(11)} ${(tx.method || "").padEnd(12)} ${inr(tx.amount).padStart(13)}  ->  ${JSON.stringify(changes)}`),
    );
    if (toFill.length > 25) console.log(`  ... and ${toFill.length - 25} more (full list is in the backup file)`);
  }

  if (mismatched.length) {
    console.log(`\n--- MISMATCHED (left alone — a deliberate override looks identical to an error) ---`);
    mismatched.slice(0, 30).forEach(({ tx, want, field }) =>
      console.log(`  ${iso(tx.date)}  ${String(tx._id)}  ${(tx.branch || "").padEnd(11)} ${field}: "${tx[field]}"  rule says "${want}"`),
    );
    if (mismatched.length > 30) console.log(`  ... and ${mismatched.length - 30} more`);
    console.log("  Review these by hand. --overwrite-mismatched rewrites them all to the rule.");
  }

  if (nonCashStray.length) {
    console.log(`\n--- NON-CASH ROWS CARRYING AN ACCOUNT (these inflate that account's balance) ---`);
    nonCashStray.slice(0, 30).forEach((tx) =>
      console.log(`  ${iso(tx.date)}  ${String(tx._id)}  ${(tx.method || "").padEnd(18)} furtherMode="${tx.furtherMode}"  ${inr(tx.amount)}`),
    );
    if (nonCashStray.length > 30) console.log(`  ... and ${nonCashStray.length - 30} more`);
    console.log("  --clear-non-cash blanks these. No cash moved on a non-cash method, so an account here is wrong.");
  }

  if (locked.length) {
    console.log(`\n--- PERIOD LOCKED (skipped) ---`);
    locked.slice(0, 20).forEach(({ tx, reason }) => console.log(`  ${iso(tx.date)}  ${String(tx._id)}  — ${reason}`));
    if (locked.length > 20) console.log(`  ... and ${locked.length - 20} more`);
  }

  const clearing = CLEAR_NON_CASH ? nonCashStray : [];
  if (!toFill.length && !clearing.length) {
    console.log("\nNothing to change.");
    await mongoose.disconnect();
    return;
  }

  const backupPath = `backfill-revenue-routing-backup-${Date.now()}.json`;
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      {
        fills: toFill.map(({ tx, changes }) => ({
          _id: String(tx._id), date: iso(tx.date), branch: tx.branch,
          category: tx.transactionCategory, method: tx.method, amount: tx.amount,
          before: { furtherMode: tx.furtherMode ?? null, receiptMode: tx.receiptMode ?? null },
          after: changes,
        })),
        nonCashCleared: clearing.map((tx) => ({
          _id: String(tx._id), date: iso(tx.date), method: tx.method,
          before: { furtherMode: tx.furtherMode },
        })),
      },
      null,
      2,
    ),
  );
  console.log(`\nBackup of every row about to change written to ${backupPath} BEFORE any update.`);

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Review the lists above, then re-run with --apply.");
    await mongoose.disconnect();
    return;
  }

  console.log(`\nUpdating ${toFill.length} row(s)${clearing.length ? ` and clearing ${clearing.length} non-cash row(s)` : ""}...`);
  let updated = 0, cleared = 0;
  const failed = [];

  for (const { tx, changes } of toFill) {
    try {
      await Transactions.updateOne({ _id: tx._id }, { $set: changes });
      updated++;
    } catch (err) {
      failed.push({ id: String(tx._id), reason: err?.message || String(err) });
    }
  }
  for (const tx of clearing) {
    try {
      const lock = await lockReason(tx.furtherMode, tx.date);
      if (lock) { failed.push({ id: String(tx._id), reason: `period locked — ${lock}` }); continue; }
      await Transactions.updateOne({ _id: tx._id }, { $set: { furtherMode: "" } });
      cleared++;
    } catch (err) {
      failed.push({ id: String(tx._id), reason: err?.message || String(err) });
    }
  }

  console.log(`\nUpdated ${updated}, cleared ${cleared}, failed ${failed.length}.`);
  if (failed.length) failed.slice(0, 20).forEach((f) => console.log(`  ${f.id}: ${f.reason}`));

  console.log(`\nBackup: ${backupPath} — keep it. Re-run this script to confirm it now reports zero to change.`);
  console.log("Then check /admin/assets: the accounts above should have moved by the newly-attributed");
  console.log("amounts, and the unattributed-routing warning should have dropped.");

  await mongoose.disconnect();
  console.log("Done.");
}

run().catch(async (err) => {
  console.error("\nFATAL:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
