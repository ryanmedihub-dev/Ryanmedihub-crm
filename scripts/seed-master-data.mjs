// Seeds the MasterData and BankRoutingRule collections from the current hard-coded constants,
// using the EXACT same `value` strings the app already stores on documents. This is step 1 of
// the migration: nothing switches over to reading the DB until scripts/verify-master-data-parity.mjs
// prints PARITY OK.
//
// Idempotent / re-runnable: upserts on (kind, parent, value) — re-running restores every
// seeded row's constant-derived fields (label, flags, sortOrder). Run it only during the
// migration; once admins start editing master data, a re-run would reset their changes.
//
//   node scripts/seed-master-data.mjs            # dry run — prints what it would write
//   node scripts/seed-master-data.mjs --apply    # writes
//
// Imports the real constants modules (via the "@/..." alias loader, same trick as
// profile-finance-pages.mjs) so the seed has a single source of truth — no hand-copied lists.

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

const APPLY = process.argv.slice(2).includes("--apply");

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

const { METHOD_LABELS, EXPENSE_METHODS, REVENUE_METHODS } = await import("@/constants/paymentMethods");
const { PAYABLE_CATEGORY_PURPOSE } = await import("@/lib/entryForm/getPayableContext");

// ---------------------------------------------------------------------------------------------
// Field derivations — every one traceable to a current constant.
// ---------------------------------------------------------------------------------------------

// EXPENSE_CATEGORY.payablePurpose. PAYABLE_CATEGORY_PURPOSE (getPayableContext.js) covers the
// generic-payable heads; the three "owned elsewhere" heads and Collab Clinic Payment raise
// payables through their own flows with their own purposes.
const CATEGORY_PURPOSE = {
  ...PAYABLE_CATEGORY_PURPOSE,
  Salary: "SALARY",
  Incentive: "INCENTIVE",
  Commision: "PATIENT_COMMISSION",
  "Collab Clinic Payment": "COLLAB_CLINIC",
};

// Heads that are payable-backed but have no purpose mapping anywhere in the app today.
const KNOWN_NULL_SETTLEMENT = new Set(["Collab Clinic Payment", "Borrowings"]);

// PAYMENT_METHOD.appliesTo for methods that aren't in the EXPENSE_METHODS / REVENUE_METHODS
// base lists — getMethodOptions() adds these explicitly.
const METHOD_APPLIES_OVERRIDE = {
  offset_settlement: "BOTH",
  paid_to_external: "REVENUE",
  paid_by_other: "EXPENSE",
  "including-package": "REVENUE",
  other: "BOTH",
};

// §0.2 — depended on by name in externalPartyDerivation.js / collabDerivation.js.
const SYSTEM_METHODS = new Set(["paid_to_external", "paid_by_other", "offset_settlement"]);

function methodAppliesTo(m) {
  if (METHOD_APPLIES_OVERRIDE[m]) return METHOD_APPLIES_OVERRIDE[m];
  const inExpense = EXPENSE_METHODS.some((o) => o.value === m);
  const inRevenue = REVENUE_METHODS.some((o) => o.value === m);
  if (inExpense && inRevenue) return "BOTH";
  if (inExpense) return "EXPENSE";
  if (inRevenue) return "REVENUE";
  return "BOTH";
}

function categorySettlementType(cat) {
  const direct = DIRECT_PAYMENT_CATEGORIES.includes(cat);
  const payable = PAYABLE_EXPENSE_CATEGORIES.includes(cat);
  if (direct && payable) {
    warnings.push(`Category "${cat}" is in BOTH DIRECT and PAYABLE lists — seeded as PAYABLE.`);
    return "PAYABLE";
  }
  if (direct) return "DIRECT";
  if (payable) return "PAYABLE";
  if (!KNOWN_NULL_SETTLEMENT.has(cat)) {
    warnings.push(`Category "${cat}" is in neither DIRECT nor PAYABLE list — seeded with settlementType=null.`);
  }
  return null;
}

const warnings = [];

// ---------------------------------------------------------------------------------------------
// Build the desired rows.
// ---------------------------------------------------------------------------------------------

const masterRows = [];

// EXPENSE_CATEGORY — tree order is the canonical sortOrder and drives EXPENSE_CATEGORIES.
EXPENSE_CATEGORIES.forEach((cat, i) => {
  const isPayable = PAYABLE_EXPENSE_CATEGORIES.includes(cat);
  const ownedElsewhere =
    isPayable && !PAYABLE_EXPENSE_DROPDOWN_CATEGORIES.includes(cat); // Salary / Incentive / Commision
  const settlementType = categorySettlementType(cat);
  const payablePurpose = isPayable ? CATEGORY_PURPOSE[cat] || null : null;
  if (isPayable && !payablePurpose && !KNOWN_NULL_SETTLEMENT.has(cat)) {
    warnings.push(`Payable head "${cat}" has no purpose mapping — seeded with payablePurpose=null.`);
  }
  masterRows.push({
    kind: "EXPENSE_CATEGORY",
    value: cat,
    label: cat,
    parent: null,
    settlementType,
    ownedElsewhere,
    payablePurpose,
    isSystem: false,
    sortOrder: i * 10,
  });

  // EXPENSE_SUBTYPE — array order per category.
  (EXPENSE_CATEGORY_TREE[cat] || []).forEach((sub, j) => {
    masterRows.push({
      kind: "EXPENSE_SUBTYPE",
      value: sub,
      label: sub,
      parent: cat,
      isSystem: false,
      sortOrder: j * 10,
    });
  });
});

// PAYMENT_METHOD — METHOD_LABELS key order.
Object.keys(METHOD_LABELS).forEach((m, i) => {
  masterRows.push({
    kind: "PAYMENT_METHOD",
    value: m,
    label: METHOD_LABELS[m],
    parent: null,
    isNonCash: NON_CASH_METHODS.includes(m),
    isUnsettled: UNSETTLED_METHODS.includes(m),
    appliesTo: methodAppliesTo(m),
    isSystem: SYSTEM_METHODS.has(m),
    sortOrder: i * 10,
  });
});

// RECEIPT_MODE.
RECEIPT_MODES.forEach((r, i) => {
  masterRows.push({
    kind: "RECEIPT_MODE",
    value: r,
    label: r,
    parent: null,
    isSystem: false,
    sortOrder: i * 10,
  });
});

// ACCOUNT.
ACCOUNTS.forEach((a, i) => {
  masterRows.push({
    kind: "ACCOUNT",
    value: a,
    label: a,
    parent: null,
    isSystem: false,
    sortOrder: i * 10,
  });
});

// BankRoutingRule — every cell of BANK_ROUTING_MAP.
const routingRows = [];
for (const [branch, byCategory] of Object.entries(BANK_ROUTING_MAP)) {
  for (const [transactionCategory, byMethod] of Object.entries(byCategory)) {
    for (const [method, entry] of Object.entries(byMethod)) {
      routingRows.push({
        branch,
        transactionCategory,
        method,
        receiptMode: entry.receiptMode ?? "",
        furtherMode: entry.furtherMode ?? "",
      });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Report + write.
// ---------------------------------------------------------------------------------------------

const byKind = masterRows.reduce((acc, r) => {
  acc[r.kind] = (acc[r.kind] || 0) + 1;
  return acc;
}, {});

console.log("=".repeat(80));
console.log(APPLY ? "MODE: APPLY — writing to the database" : "MODE: DRY RUN — nothing will be written");
console.log("=".repeat(80));
console.log("\nMasterData rows to upsert:");
for (const [k, n] of Object.entries(byKind)) console.log(`  ${k.padEnd(18)} ${n}`);
console.log(`  ${"TOTAL".padEnd(18)} ${masterRows.length}`);
console.log(`\nBankRoutingRule rows to upsert: ${routingRows.length}  (expected 60)`);

if (warnings.length) {
  console.log("\n--- WARNINGS (review, not necessarily errors) ---");
  [...new Set(warnings)].forEach((w) => console.log(`  ! ${w}`));
}

if (!APPLY) {
  console.log("\nDRY RUN — re-run with --apply to write. Then run verify-master-data-parity.mjs.");
  process.exit(0);
}

await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });

const seededBy = { name: "seed-master-data.mjs", email: "system" };
let inserted = 0;
let updated = 0;

for (const row of masterRows) {
  const { kind, parent = null, value, ...rest } = row;
  const res = await MasterData.updateOne(
    { kind, parent, value },
    {
      $set: rest,
      $setOnInsert: {
        kind,
        parent,
        value,
        isActive: true,
        createdBy: { ...seededBy, date: new Date() },
        log: [
          {
            action: "Created",
            newValue: value,
            note: "Seeded from the hard-coded constants during the master-data migration",
            performedBy: seededBy,
            performedAt: new Date(),
          },
        ],
      },
    },
    { upsert: true },
  );
  if (res.upsertedCount) inserted++;
  else if (res.modifiedCount) updated++;
}

let rInserted = 0;
let rUpdated = 0;
for (const row of routingRows) {
  const { branch, transactionCategory, method, receiptMode, furtherMode } = row;
  const res = await BankRoutingRule.updateOne(
    { branch, transactionCategory, method },
    {
      $set: { receiptMode, furtherMode },
      $setOnInsert: {
        branch,
        transactionCategory,
        method,
        isActive: true,
        createdBy: { ...seededBy, date: new Date() },
        log: [
          {
            action: "Created",
            newValue: `${receiptMode || "-"} / ${furtherMode || "-"}`,
            note: "Seeded from BANK_ROUTING_MAP during the master-data migration",
            performedBy: seededBy,
            performedAt: new Date(),
          },
        ],
      },
    },
    { upsert: true },
  );
  if (res.upsertedCount) rInserted++;
  else if (res.modifiedCount) rUpdated++;
}

console.log(
  `\nMasterData:      ${inserted} inserted, ${updated} updated, ${masterRows.length - inserted - updated} unchanged.`,
);
console.log(
  `BankRoutingRule: ${rInserted} inserted, ${rUpdated} updated, ${routingRows.length - rInserted - rUpdated} unchanged.`,
);
console.log("\nDone. Now run:  node scripts/verify-master-data-parity.mjs");

await mongoose.disconnect();
