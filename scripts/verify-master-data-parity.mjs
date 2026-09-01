// Read-only. Asserts the seeded MasterData / BankRoutingRule collections reproduce the current
// hard-coded constants EXACTLY — same values, same order for the picker lists, same membership
// of every flag list, same 60 routing combinations. Must print PARITY OK before the app is
// switched over to reading the DB (migration step 3).
//
//   node scripts/verify-master-data-parity.mjs
//
// Exit code 0 = PARITY OK, 1 = PARITY FAILED. Ordering-only differences on the curated
// filtered lists (DIRECT / PAYABLE category lists, getMethodOptions base lists) are reported
// under "ORDERING NOTES" and do NOT fail the run — those literal orders are preserved by the
// constants shims in step 3/4, not by a single sortOrder field.

import { register } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import fs from "fs";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "..");

register(pathToFileURL(path.resolve(THIS_DIR, "lib", "alias-loader.mjs")).href, import.meta.url);

for (const f of [".env.local", ".env"]) {
  const p = path.resolve(REPO_ROOT, f);
  if (fs.existsSync(p)) {
    try {
      process.loadEnvFile(p);
    } catch {}
  }
}
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI missing — checked .env.local and .env.");
  process.exit(1);
}

const mongoose = (await import("mongoose")).default;
const { default: MasterData } = await import("@/models/MasterData");
const { default: BankRoutingRule } = await import("@/models/BankRoutingRule");

const {
  EXPENSE_CATEGORY_TREE,
  EXPENSE_CATEGORIES,
  PAYABLE_EXPENSE_CATEGORIES,
  PAYABLE_EXPENSE_DROPDOWN_CATEGORIES,
  DIRECT_PAYMENT_CATEGORIES,
} = await import("@/constants/expenseCategories");

const bankRouting = await import("@/constants/bankRouting");
const BANK_ROUTING_MAP = bankRouting.default;
const { ACCOUNTS, NON_CASH_METHODS, UNSETTLED_METHODS, RECEIPT_MODES } = bankRouting;
const { METHOD_LABELS } = await import("@/constants/paymentMethods");

const failures = [];
const orderingNotes = [];

const fail = (msg) => failures.push(msg);
const eqSet = (a, b) => {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size !== B.size) return false;
  for (const x of A) if (!B.has(x)) return false;
  return true;
};
const eqOrdered = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const diff = (label, got, want) => {
  const missing = want.filter((x) => !got.includes(x));
  const extra = got.filter((x) => !want.includes(x));
  const parts = [];
  if (missing.length) parts.push(`missing: ${JSON.stringify(missing)}`);
  if (extra.length) parts.push(`unexpected: ${JSON.stringify(extra)}`);
  if (!parts.length) parts.push(`order differs — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  return `${label}: ${parts.join("; ")}`;
};

await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });

const active = async (kind, extra = {}) =>
  MasterData.find({ kind, isActive: true, ...extra }).sort({ sortOrder: 1, _id: 1 }).lean();

// ---- EXPENSE_CATEGORY: exact order === EXPENSE_CATEGORIES -------------------------------------
const cats = await active("EXPENSE_CATEGORY");
const catValues = cats.map((c) => c.value);
if (!eqOrdered(catValues, EXPENSE_CATEGORIES)) fail(diff("EXPENSE_CATEGORY order/values", catValues, EXPENSE_CATEGORIES));
for (const c of cats) {
  if (c.label !== c.value) fail(`EXPENSE_CATEGORY "${c.value}" label is "${c.label}" (expected equal to value for parity)`);
}

// ---- EXPENSE_SUBTYPE: per category, exact order === EXPENSE_CATEGORY_TREE[cat] ----------------
for (const cat of EXPENSE_CATEGORIES) {
  const subs = (await active("EXPENSE_SUBTYPE", { parent: cat })).map((s) => s.value);
  const want = EXPENSE_CATEGORY_TREE[cat] || [];
  if (!eqOrdered(subs, want)) fail(diff(`EXPENSE_SUBTYPE order/values for "${cat}"`, subs, want));
}

// ---- settlementType: membership === DIRECT / PAYABLE lists -----------------------------------
const directCats = cats.filter((c) => c.settlementType === "DIRECT").map((c) => c.value);
const payableCats = cats.filter((c) => c.settlementType === "PAYABLE").map((c) => c.value);
if (!eqSet(directCats, DIRECT_PAYMENT_CATEGORIES)) fail(diff("settlementType=DIRECT membership", directCats, DIRECT_PAYMENT_CATEGORIES));
else if (!eqOrdered(directCats, DIRECT_PAYMENT_CATEGORIES))
  orderingNotes.push(`DIRECT_PAYMENT_CATEGORIES: seeded sortOrder order ${JSON.stringify(directCats)} differs from the literal-array order ${JSON.stringify(DIRECT_PAYMENT_CATEGORIES)}.`);
if (!eqSet(payableCats, PAYABLE_EXPENSE_CATEGORIES)) fail(diff("settlementType=PAYABLE membership", payableCats, PAYABLE_EXPENSE_CATEGORIES));
else if (!eqOrdered(payableCats, PAYABLE_EXPENSE_CATEGORIES))
  orderingNotes.push(`PAYABLE_EXPENSE_CATEGORIES: seeded sortOrder order ${JSON.stringify(payableCats)} differs from the literal-array order ${JSON.stringify(PAYABLE_EXPENSE_CATEGORIES)}.`);

// ---- ownedElsewhere: === PAYABLE minus PAYABLE_DROPDOWN --------------------------------------
const ownedElsewhere = cats.filter((c) => c.ownedElsewhere).map((c) => c.value);
const wantOwned = PAYABLE_EXPENSE_CATEGORIES.filter((c) => !PAYABLE_EXPENSE_DROPDOWN_CATEGORIES.includes(c));
if (!eqSet(ownedElsewhere, wantOwned)) fail(diff("ownedElsewhere membership", ownedElsewhere, wantOwned));

// ---- PAYMENT_METHOD: every METHOD_LABELS key present, labels match, flags match --------------
const methods = await active("PAYMENT_METHOD");
const methodValues = methods.map((m) => m.value);
if (!eqSet(methodValues, Object.keys(METHOD_LABELS))) fail(diff("PAYMENT_METHOD membership", methodValues, Object.keys(METHOD_LABELS)));
for (const m of methods) {
  if (METHOD_LABELS[m.value] && m.label !== METHOD_LABELS[m.value])
    fail(`PAYMENT_METHOD "${m.value}" label is "${m.label}" (expected "${METHOD_LABELS[m.value]}")`);
}
const nonCash = methods.filter((m) => m.isNonCash).map((m) => m.value);
const unsettled = methods.filter((m) => m.isUnsettled).map((m) => m.value);
if (!eqSet(nonCash, NON_CASH_METHODS)) fail(diff("isNonCash membership", nonCash, NON_CASH_METHODS));
if (!eqSet(unsettled, UNSETTLED_METHODS)) fail(diff("isUnsettled membership", unsettled, UNSETTLED_METHODS));
// System methods must stay unsettled/non-cash where they are today.
for (const sys of ["paid_to_external", "paid_by_other", "offset_settlement"]) {
  const row = methods.find((m) => m.value === sys);
  if (!row) fail(`system method "${sys}" not seeded`);
  else if (!row.isSystem) fail(`system method "${sys}" is not marked isSystem`);
}

// ---- RECEIPT_MODE / ACCOUNT: exact order ----------------------------------------------------
const receiptModes = (await active("RECEIPT_MODE")).map((r) => r.value);
if (!eqOrdered(receiptModes, RECEIPT_MODES)) fail(diff("RECEIPT_MODE order/values", receiptModes, RECEIPT_MODES));
const accounts = (await active("ACCOUNT")).map((a) => a.value);
if (!eqOrdered(accounts, ACCOUNTS)) fail(diff("ACCOUNT order/values", accounts, ACCOUNTS));

// ---- BankRoutingRule: the 60 cells of BANK_ROUTING_MAP, exact receiptMode + furtherMode -----
const rules = await BankRoutingRule.find({ isActive: true }).lean();
const ruleKey = (r) => `${r.branch} | ${r.transactionCategory} | ${r.method}`;
const ruleMap = new Map(rules.map((r) => [ruleKey(r), r]));
let cellCount = 0;
for (const [branch, byCat] of Object.entries(BANK_ROUTING_MAP)) {
  for (const [cat, byMethod] of Object.entries(byCat)) {
    for (const [method, entry] of Object.entries(byMethod)) {
      cellCount++;
      const key = `${branch} | ${cat} | ${method}`;
      const r = ruleMap.get(key);
      if (!r) {
        fail(`BankRoutingRule missing for ${key}`);
        continue;
      }
      const wantR = entry.receiptMode ?? "";
      const wantF = entry.furtherMode ?? "";
      if ((r.receiptMode ?? "") !== wantR || (r.furtherMode ?? "") !== wantF)
        fail(`BankRoutingRule ${key}: got {receiptMode:${JSON.stringify(r.receiptMode)}, furtherMode:${JSON.stringify(r.furtherMode)}} want {receiptMode:${JSON.stringify(wantR)}, furtherMode:${JSON.stringify(wantF)}}`);
      ruleMap.delete(key);
    }
  }
}
if (cellCount !== 60) orderingNotes.push(`BANK_ROUTING_MAP has ${cellCount} cells, not 60 — check the source map.`);
if (ruleMap.size) fail(`BankRoutingRule has ${ruleMap.size} extra active rule(s) with no matching cell: ${[...ruleMap.keys()].join(", ")}`);

// ---- Report -------------------------------------------------------------------------------
console.log("=".repeat(80));
if (orderingNotes.length) {
  console.log("ORDERING NOTES (not failures — the constants shims preserve these literal orders):");
  orderingNotes.forEach((n) => console.log(`  - ${n}`));
  console.log("");
}
if (failures.length) {
  console.log(`PARITY FAILED — ${failures.length} problem(s):`);
  failures.forEach((f) => console.log(`  x ${f}`));
  await mongoose.disconnect();
  process.exit(1);
}
console.log("PARITY OK");
console.log(`  ${await MasterData.countDocuments({ isActive: true })} active master rows, ${cellCount} routing cells verified.`);
await mongoose.disconnect();
process.exit(0);
