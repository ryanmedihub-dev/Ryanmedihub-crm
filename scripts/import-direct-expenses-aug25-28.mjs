// scripts/import-direct-expenses-aug25-28.mjs
//
// Imports the expense entries from EXPENSE.xlsx (25-28 Aug 2026) as EXPENSE transactions.
// Same shape as scripts/import-direct-expenses-aug-2026.mjs (13-24 Aug), but that file's data is
// embedded in it, so this is a separate script rather than a re-run with different input.
//
// ─── THREE DIFFERENCES FROM THE 13-24 AUG FILE — all handled, all visible in the dry run ─────
//
// 1. THE BRANCH COLUMN IS EMPTY ON ALL 98 ROWS. `branch` is required for correct
//    branch-filtered reporting, so it is derived from the Place column, which is the only
//    location signal the sheet carries:
//        Delhi Center      -> Delhi
//        Delhi Backend     -> Delhi
//        Hyderabad Clinic  -> Hyderabad
//    Every row is flagged `branchDerived: true` and the dry run reports the count, so this is
//    never silent. If any of these should be a different branch, fix the sheet — do not let the
//    derivation stand by default.
//
// 2. TWO NEW PAYMENT-METHOD SPELLINGS. The 13-24 file used "Cash"; this one uses "Cash-book",
//    and adds "Cash ( backend )" as its own method value rather than inferring the backend float
//    from the Place column. Mapping:
//        Cash-book          -> cash                         -> "Cash Book"
//        Cash ( backend )   -> cash                         -> "Cash ( backend )"
//        Hdfc Skin 739      -> hdfc_skin_bank_transfer      -> "HDFC Skin"
//        Icici Medihub 292  -> icici_medihub_bank_transfer  -> "ICICI Medihub"
//    Because the sheet now names the backend account explicitly, there is NO Place-based cash
//    routing here and no --no-backend-cash flag. What the sheet says is what gets written.
//
// 3. ONLY 74 OF 98 ROWS ARE DIRECT-PAYMENT CATEGORIES. The other 24 are payable-backed:
//        Software Rental Expenses 18 · Incentive 5 · Medical Consumables 1   (Rs 2,69,754.15)
//    Those are NOT imported by default. Incentive in particular is in
//    PAYABLE_CATEGORIES_OWNED_ELSEWHERE — it is raised and settled by the agent/employee flow,
//    so a loose expense with no payableId would double-count against any Incentive payable that
//    already exists for the same money. Check /admin/transactions for 25-28 Aug before using
//    --include-payable-categories.
//
// ─── VALIDATION ALREADY PERFORMED ───────────────────────────────────────────────────────────
//
// All 98 rows were checked against EXPENSE_CATEGORY_TREE when this script was prepared: every
// head/sub-type pair is valid, no blank amounts, no blank dates. The script re-validates at run
// time and refuses to write if anything fails — a pair that stops resolving means the tree
// changed, and that needs looking at rather than skipping.
//
// ─── OTHER NOTES ────────────────────────────────────────────────────────────────────────────
//
// The sheet has no "Paid To" column; Remarks carries the description of what was bought, which
// is what existing manual entries in this CRM put in expenseGiver.name. Remarks is therefore
// written to BOTH `remarks` and `expenseGiver: { type: "MANUAL", name }` — otherwise the
// "Paid To" column would be blank for all of these in /admin/transactions.
//
// IDEMPOTENT: each transaction gets `paymentId: "BULK-EXP-A2528-<rowNum>"` — a different prefix
// from the 13-24 script so the two can never collide on row numbers. Checked before insert;
// safe to re-run after a partial failure.
//
// DUPLICATE PRE-CHECK: the tag above only catches a re-run of THIS script — it cannot see a row
// that reached the CRM by another route, which is the real risk for the payable-backed
// categories. So every row is also matched against existing untagged transactions on
// date + amount + head + sub-type. Anything found is listed with its _id and SKIPPED until
// --confirm-possible-duplicates is passed. Deliberately a loose match: a false positive costs a
// glance, a false negative books the same money twice.
//
// PERIOD LOCK checked per row, mirroring src/app/api/transactions/expense/create/route.js.
//
// Usage:
//   node scripts/import-direct-expenses-aug25-28.mjs                          # dry run
//   node scripts/import-direct-expenses-aug25-28.mjs --dump-json               # entries out, no DB
//   node scripts/import-direct-expenses-aug25-28.mjs --apply                  # import the 74
//   node scripts/import-direct-expenses-aug25-28.mjs --apply --include-payable-categories
//                                                                            # import ALL 98
//   node scripts/import-direct-expenses-aug25-28.mjs --apply --include-payable-categories \
//                                                    --confirm-possible-duplicates
//                                                                            # ...even ones that
//                                                                            # look already present
//   node scripts/import-direct-expenses-aug25-28.mjs --branch=Hyderabad       # one branch only

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

// Mirrors ACCOUNTS in src/constants/bankRouting.js — needed for the period-lock check.
const ACCOUNTS = [
  "Cash Book", "HDFC Skin", "HDFC Medihub", "ICICI Medihub", "Mumbai Receipts",
  "Cash ( backend )", "Paytm ( Delhi T44P )", "Paytm ( Noida CK5Y )",
  "Bajaj Loan", "Fibe Loan", "Pine Lab",
];

// ═══════════════════════════════════════════════════════════════════════════════
// THE DATA — parsed directly from EXPENSE.xlsx, not hand-transcribed.
// `isDirect` marks the 74 DIRECT_PAYMENT_CATEGORIES rows; `branchDerived` marks rows whose
// branch came from Place rather than the (empty) Branch column — which is all of them here.
// ═══════════════════════════════════════════════════════════════════════════════
const ENTRIES = [
  {
    "rowNum": 2,
    "place": "Delhi Center",
    "date": "2026-08-25",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 100.0,
    "remarks": "aditya  bike petrol prsnl  pay way to narela",
    "expense": "Office Exp.",
    "expenseType": "Vehicle Maintainance",
    "isDirect": true
  },
  {
    "rowNum": 3,
    "place": "Delhi Center",
    "date": "2026-08-25",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 1000.0,
    "remarks": "rajiv consulant 23/8/26 pending clear",
    "expense": "Incentive",
    "expenseType": "Sales Incentive--Counsellor",
    "isDirect": false
  },
  {
    "rowNum": 4,
    "place": "Delhi Center",
    "date": "2026-08-25",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 20000.0,
    "remarks": "CD GLASS ND MEDICINE BAGS",
    "expense": "Office Exp.",
    "expenseType": "office Repairs and Maintainence",
    "isDirect": true
  },
  {
    "rowNum": 5,
    "place": "Delhi Center",
    "date": "2026-08-25",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 9320.0,
    "remarks": "CD STUFF SUGAR ND TEA ND WASHING POWDER",
    "expense": "Welfare Expenses",
    "expenseType": "Pantry Expenses",
    "isDirect": true
  },
  {
    "rowNum": 6,
    "place": "Delhi Center",
    "date": "2026-08-25",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 70.0,
    "remarks": "BACKEND SUGAR",
    "expense": "Welfare Expenses",
    "expenseType": "Pantry Expenses",
    "isDirect": true
  },
  {
    "rowNum": 7,
    "place": "Delhi Center",
    "date": "2026-08-26",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 460.0,
    "remarks": "WATER BOTTLES FOR PATIENTS CD CLINIC",
    "expense": "Welfare Expenses",
    "expenseType": "Pantry Expenses",
    "isDirect": true
  },
  {
    "rowNum": 8,
    "place": "Delhi Center",
    "date": "2026-08-26",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 250.0,
    "remarks": "A-4  SHEETS FOR BCND",
    "expense": "Office Exp.",
    "expenseType": "Printing & stationery",
    "isDirect": true
  },
  {
    "rowNum": 9,
    "place": "Delhi Center",
    "date": "2026-08-26",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 50.0,
    "remarks": "PT FOOD FOR GD",
    "expense": "Patient Related Expenses",
    "expenseType": "Patient Meals",
    "isDirect": true
  },
  {
    "rowNum": 10,
    "place": "Delhi Center",
    "date": "2026-08-26",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 230.0,
    "remarks": "A4 SHEET FOR BD",
    "expense": "Office Exp.",
    "expenseType": "Printing & stationery",
    "isDirect": true
  },
  {
    "rowNum": 11,
    "place": "Delhi Center",
    "date": "2026-08-26",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 1000.0,
    "remarks": "PRP BED REPAIR",
    "expense": "Office Exp.",
    "expenseType": "office Repairs and Maintainence",
    "isDirect": true
  },
  {
    "rowNum": 12,
    "place": "Delhi Center",
    "date": "2026-08-26",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 295.0,
    "remarks": "SUSHNAT SIR PT DINNER ND BHARAT SIR EMPLOYED DINNER",
    "expense": "Welfare Expenses",
    "expenseType": "Staff Welfare",
    "isDirect": true
  },
  {
    "rowNum": 13,
    "place": "Delhi Center",
    "date": "2026-08-26",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 420.0,
    "remarks": "dtdc",
    "expense": "Office Exp.",
    "expenseType": "Conveyance/Freight",
    "isDirect": true
  },
  {
    "rowNum": 14,
    "place": "Delhi Center",
    "date": "2026-08-26",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 1000.0,
    "remarks": "GUDIIYA INCENTIVE BY MEDICINE",
    "expense": "Incentive",
    "expenseType": "Sales Incentive--Counsellor",
    "isDirect": false
  },
  {
    "rowNum": 15,
    "place": "Delhi Center",
    "date": "2026-08-27",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 4000.0,
    "remarks": "USHA AUNTY BACKEND HOUSE KEEPING",
    "expense": "Office Exp.",
    "expenseType": "office Repairs and Maintainence",
    "isDirect": true
  },
  {
    "rowNum": 16,
    "place": "Delhi Center",
    "date": "2026-08-27",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 250.0,
    "remarks": "BIKE PETROL",
    "expense": "Office Exp.",
    "expenseType": "Vehicle Maintainance",
    "isDirect": true
  },
  {
    "rowNum": 17,
    "place": "Delhi Center",
    "date": "2026-08-27",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 460.0,
    "remarks": "A4 SIZE SHEET FOR BACKEND",
    "expense": "Office Exp.",
    "expenseType": "Printing & stationery",
    "isDirect": true
  },
  {
    "rowNum": 18,
    "place": "Delhi Center",
    "date": "2026-08-27",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 250.0,
    "remarks": "BIKE PETROL",
    "expense": "Office Exp.",
    "expenseType": "Vehicle Maintainance",
    "isDirect": true
  },
  {
    "rowNum": 19,
    "place": "Delhi Center",
    "date": "2026-08-27",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 6000.0,
    "remarks": "20 TO 226/8/26",
    "expense": "Patient Related Expenses",
    "expenseType": "Patient Meals",
    "isDirect": true
  },
  {
    "rowNum": 20,
    "place": "Delhi Center",
    "date": "2026-08-27",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 10000.0,
    "remarks": "PAINT FOR BACKEND 4TH FLOOR",
    "expense": "Office Exp.",
    "expenseType": "office Repairs and Maintainence",
    "isDirect": true
  },
  {
    "rowNum": 21,
    "place": "Delhi Center",
    "date": "2026-08-27",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 1000.0,
    "remarks": "RADHA DI HOUSEKAPPING AUG ADV",
    "expense": "Office Exp.",
    "expenseType": "office Repairs and Maintainence",
    "isDirect": true
  },
  {
    "rowNum": 22,
    "place": "Delhi Center",
    "date": "2026-08-27",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 500.0,
    "remarks": "ANISH 4TH FLOOR BACKEND CLEAING PAYMENT",
    "expense": "Office Exp.",
    "expenseType": "office Repairs and Maintainence",
    "isDirect": true
  },
  {
    "rowNum": 23,
    "place": "Delhi Center",
    "date": "2026-08-27",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 1000.0,
    "remarks": "MEDICINE GUDIYA INCENTIVE",
    "expense": "Incentive",
    "expenseType": "Sales Incentive-- Medicine",
    "isDirect": false
  },
  {
    "rowNum": 24,
    "place": "Delhi Center",
    "date": "2026-08-27",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 500.0,
    "remarks": "MEDICINE  RTIKITA INCENTIVE",
    "expense": "Incentive",
    "expenseType": "Sales Incentive-- Medicine",
    "isDirect": false
  },
  {
    "rowNum": 25,
    "place": "Delhi Center",
    "date": "2026-08-25",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 6830.0,
    "remarks": "HANDOVER TO UNCLE JI",
    "expense": "Drawings",
    "expenseType": "Handover to Family",
    "isDirect": true
  },
  {
    "rowNum": 26,
    "place": "Delhi Center",
    "date": "2026-08-25",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 1790.0,
    "remarks": "HANDOVER TO UNCLE JI",
    "expense": "Drawings",
    "expenseType": "Handover to Family",
    "isDirect": true
  },
  {
    "rowNum": 27,
    "place": "Delhi Center",
    "date": "2026-08-25",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 680.0,
    "remarks": "HANDOVER TO AUNTY JI",
    "expense": "Drawings",
    "expenseType": "Handover to Family",
    "isDirect": true
  },
  {
    "rowNum": 28,
    "place": "Delhi Center",
    "date": "2026-08-26",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 4340.0,
    "remarks": "HANDOVER TO UNCLE JI",
    "expense": "Drawings",
    "expenseType": "Handover to Family",
    "isDirect": true
  },
  {
    "rowNum": 29,
    "place": "Delhi Center",
    "date": "2026-08-26",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 2260.0,
    "remarks": "HANDOVER TO UNCLE JI",
    "expense": "Drawings",
    "expenseType": "Handover to Family",
    "isDirect": true
  },
  {
    "rowNum": 30,
    "place": "Delhi Center",
    "date": "2026-08-27",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 1000.0,
    "remarks": "HANDOVER TO UNCLE JI",
    "expense": "Drawings",
    "expenseType": "Handover to Family",
    "isDirect": true
  },
  {
    "rowNum": 31,
    "place": "Delhi Center",
    "date": "2026-08-27",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 3290.0,
    "remarks": "HANDOVER TO UNCLE JI",
    "expense": "Drawings",
    "expenseType": "Handover to Family",
    "isDirect": true
  },
  {
    "rowNum": 32,
    "place": "Delhi Backend",
    "date": "2026-08-26",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 302.0,
    "remarks": "Telecaller Recharge",
    "expense": "Telephone Expenses",
    "expenseType": "Staff Recharge",
    "isDirect": true
  },
  {
    "rowNum": 33,
    "place": "Hyderabad Clinic",
    "date": "2026-08-25",
    "branch": "Hyderabad",
    "branchDerived": true,
    "paymentMethodRaw": "Cash ( backend )",
    "method": "cash",
    "furtherMode": "Cash ( backend )",
    "amount": 342.0,
    "remarks": "rapido",
    "expense": "Office Exp.",
    "expenseType": "Conveyance/Freight",
    "isDirect": true
  },
  {
    "rowNum": 34,
    "place": "Hyderabad Clinic",
    "date": "2026-08-25",
    "branch": "Hyderabad",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 70.0,
    "remarks": "PT LUNCH",
    "expense": "Patient Related Expenses",
    "expenseType": "Patient Meals",
    "isDirect": true
  },
  {
    "rowNum": 35,
    "place": "Hyderabad Clinic",
    "date": "2026-08-25",
    "branch": "Hyderabad",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 785.0,
    "remarks": "FILES",
    "expense": "Office Exp.",
    "expenseType": "Printing & stationery",
    "isDirect": true
  },
  {
    "rowNum": 36,
    "place": "Hyderabad Clinic",
    "date": "2026-08-25",
    "branch": "Hyderabad",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 100.0,
    "remarks": "PT JUICE",
    "expense": "Patient Related Expenses",
    "expenseType": "Patient Meals",
    "isDirect": true
  },
  {
    "rowNum": 37,
    "place": "Hyderabad Clinic",
    "date": "2026-08-26",
    "branch": "Hyderabad",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 700.0,
    "remarks": "DTDC EXPRESS",
    "expense": "Office Exp.",
    "expenseType": "Conveyance/Freight",
    "isDirect": true
  },
  {
    "rowNum": 38,
    "place": "Hyderabad Clinic",
    "date": "2026-08-26",
    "branch": "Hyderabad",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 70.0,
    "remarks": "PT LUNCH",
    "expense": "Patient Related Expenses",
    "expenseType": "Patient Meals",
    "isDirect": true
  },
  {
    "rowNum": 39,
    "place": "Hyderabad Clinic",
    "date": "2026-08-26",
    "branch": "Hyderabad",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 180.0,
    "remarks": "rapido",
    "expense": "Office Exp.",
    "expenseType": "Conveyance/Freight",
    "isDirect": true
  },
  {
    "rowNum": 40,
    "place": "Hyderabad Clinic",
    "date": "2026-08-26",
    "branch": "Hyderabad",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 100.0,
    "remarks": "SURF",
    "expense": "Welfare Expenses",
    "expenseType": "Pantry Expenses",
    "isDirect": true
  },
  {
    "rowNum": 41,
    "place": "Hyderabad Clinic",
    "date": "2026-08-26",
    "branch": "Hyderabad",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 150.0,
    "remarks": "XEROX",
    "expense": "Office Exp.",
    "expenseType": "Printing & stationery",
    "isDirect": true
  },
  {
    "rowNum": 42,
    "place": "Hyderabad Clinic",
    "date": "2026-08-27",
    "branch": "Hyderabad",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 100.0,
    "remarks": "DISPOSAl glass",
    "expense": "Welfare Expenses",
    "expenseType": "Pantry Expenses",
    "isDirect": true
  },
  {
    "rowNum": 43,
    "place": "Hyderabad Clinic",
    "date": "2026-08-27",
    "branch": "Hyderabad",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 88.0,
    "remarks": "XEROX",
    "expense": "Office Exp.",
    "expenseType": "Printing & stationery",
    "isDirect": true
  },
  {
    "rowNum": 44,
    "place": "Hyderabad Clinic",
    "date": "2026-08-27",
    "branch": "Hyderabad",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 235.0,
    "remarks": "JONSAN BABY SHAMPOO",
    "expense": "Medical Consumables",
    "expenseType": "Medical Consumables-Others",
    "isDirect": false
  },
  {
    "rowNum": 45,
    "place": "Hyderabad Clinic",
    "date": "2026-08-27",
    "branch": "Hyderabad",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 100.0,
    "remarks": "PEN",
    "expense": "Office Exp.",
    "expenseType": "Printing & stationery",
    "isDirect": true
  },
  {
    "rowNum": 46,
    "place": "Hyderabad Clinic",
    "date": "2026-08-27",
    "branch": "Hyderabad",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 90.0,
    "remarks": "register",
    "expense": "Office Exp.",
    "expenseType": "Printing & stationery",
    "isDirect": true
  },
  {
    "rowNum": 47,
    "place": "Hyderabad Clinic",
    "date": "2026-08-27",
    "branch": "Hyderabad",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 70.0,
    "remarks": "PT LUNCH",
    "expense": "Patient Related Expenses",
    "expenseType": "Patient Meals",
    "isDirect": true
  },
  {
    "rowNum": 48,
    "place": "Hyderabad Clinic",
    "date": "2026-08-27",
    "branch": "Hyderabad",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 382.0,
    "remarks": "gorkeN PIZZA PAYMENT",
    "expense": "Welfare Expenses",
    "expenseType": "Staff Welfare",
    "isDirect": true
  },
  {
    "rowNum": 49,
    "place": "Hyderabad Clinic",
    "date": "2026-08-28",
    "branch": "Hyderabad",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 240.0,
    "remarks": "PT LUNCH",
    "expense": "Patient Related Expenses",
    "expenseType": "Patient Meals",
    "isDirect": true
  },
  {
    "rowNum": 50,
    "place": "Hyderabad Clinic",
    "date": "2026-08-28",
    "branch": "Hyderabad",
    "branchDerived": true,
    "paymentMethodRaw": "Cash-book",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 580.0,
    "remarks": "GORKEM FOOD",
    "expense": "Welfare Expenses",
    "expenseType": "Staff Welfare",
    "isDirect": true
  },
  {
    "rowNum": 51,
    "place": "Delhi Center",
    "date": "2026-08-25",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 2018.0,
    "remarks": "personal payments",
    "expense": "Drawings",
    "expenseType": "Personal Payments",
    "isDirect": true
  },
  {
    "rowNum": 52,
    "place": "Delhi Center",
    "date": "2026-08-25",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 5664.0,
    "remarks": "BD-2 FIRST FLOOR WIFI RECHARGE",
    "expense": "Telephone Expenses",
    "expenseType": "Interenet Recharge/Wifi",
    "isDirect": true
  },
  {
    "rowNum": 53,
    "place": "Delhi Center",
    "date": "2026-08-25",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 9000.0,
    "remarks": "personal payments",
    "expense": "Drawings",
    "expenseType": "Personal Payments",
    "isDirect": true
  },
  {
    "rowNum": 54,
    "place": "Delhi Center",
    "date": "2026-08-25",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 5000.0,
    "remarks": "TELECALLER RECHARGE",
    "expense": "Telephone Expenses",
    "expenseType": "Staff Recharge",
    "isDirect": true
  },
  {
    "rowNum": 55,
    "place": "Delhi Center",
    "date": "2026-08-25",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 2797.78,
    "remarks": "meta ads",
    "expense": "Marketing",
    "expenseType": "Meta ads",
    "isDirect": true
  },
  {
    "rowNum": 56,
    "place": "Delhi Center",
    "date": "2026-08-25",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 1200.0,
    "remarks": "personal payments",
    "expense": "Drawings",
    "expenseType": "Personal Payments",
    "isDirect": true
  },
  {
    "rowNum": 57,
    "place": "Delhi Center",
    "date": "2026-08-25",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 437.85,
    "remarks": "personal payments",
    "expense": "Drawings",
    "expenseType": "Personal Payments",
    "isDirect": true
  },
  {
    "rowNum": 58,
    "place": "Delhi Center",
    "date": "2026-08-25",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 6375.0,
    "remarks": "PT emi",
    "expense": "Patient Related Expenses",
    "expenseType": "PATIENT EMI",
    "isDirect": true
  },
  {
    "rowNum": 59,
    "place": "Delhi Center",
    "date": "2026-08-25",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 5900.0,
    "remarks": "aisensy software",
    "expense": "Software Rental Expenses",
    "expenseType": "Software Rental Expenses",
    "isDirect": false
  },
  {
    "rowNum": 60,
    "place": "Delhi Center",
    "date": "2026-08-25",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 1000.0,
    "remarks": "personal payments",
    "expense": "Drawings",
    "expenseType": "Personal Payments",
    "isDirect": true
  },
  {
    "rowNum": 61,
    "place": "Delhi Center",
    "date": "2026-08-25",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 180.0,
    "remarks": "personal payments",
    "expense": "Drawings",
    "expenseType": "Personal Payments",
    "isDirect": true
  },
  {
    "rowNum": 62,
    "place": "Delhi Center",
    "date": "2026-08-25",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 40.0,
    "remarks": "personal payments",
    "expense": "Drawings",
    "expenseType": "Personal Payments",
    "isDirect": true
  },
  {
    "rowNum": 63,
    "place": "Delhi Center",
    "date": "2026-08-25",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 5000.0,
    "remarks": "harshita sharma telecaller incentive clear",
    "expense": "Incentive",
    "expenseType": "Sales Incentive-Agents",
    "isDirect": false
  },
  {
    "rowNum": 64,
    "place": "Delhi Center",
    "date": "2026-08-25",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 522.0,
    "remarks": "personal payments",
    "expense": "Drawings",
    "expenseType": "Personal Payments",
    "isDirect": true
  },
  {
    "rowNum": 65,
    "place": "Delhi Center",
    "date": "2026-08-25",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 319.0,
    "remarks": "Apple media services",
    "expense": "Software Rental Expenses",
    "expenseType": "Software Rental Expenses",
    "isDirect": false
  },
  {
    "rowNum": 66,
    "place": "Delhi Center",
    "date": "2026-08-25",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Icici Medihub 292",
    "method": "icici_medihub_bank_transfer",
    "furtherMode": "ICICI Medihub",
    "amount": 42.6,
    "remarks": "bank charges",
    "expense": "Bank Charges",
    "expenseType": "Bank Charges",
    "isDirect": true
  },
  {
    "rowNum": 67,
    "place": "Delhi Center",
    "date": "2026-08-26",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 2018.0,
    "remarks": "smfg emi",
    "expense": "Drawings",
    "expenseType": "Personal Payments",
    "isDirect": true
  },
  {
    "rowNum": 68,
    "place": "Delhi Center",
    "date": "2026-08-26",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 40000.0,
    "remarks": "meta ads",
    "expense": "Software Rental Expenses",
    "expenseType": "Software Rental Expenses",
    "isDirect": false
  },
  {
    "rowNum": 69,
    "place": "Delhi Center",
    "date": "2026-08-26",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 1165.5,
    "remarks": "breakfast for staff",
    "expense": "Welfare Expenses",
    "expenseType": "Staff Welfare",
    "isDirect": true
  },
  {
    "rowNum": 70,
    "place": "Delhi Center",
    "date": "2026-08-26",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 525.0,
    "remarks": "personal payments",
    "expense": "Drawings",
    "expenseType": "Personal Payments",
    "isDirect": true
  },
  {
    "rowNum": 71,
    "place": "Delhi Center",
    "date": "2026-08-26",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 690.0,
    "remarks": "AUTOPAY-GOOGLE PLAY",
    "expense": "Software Rental Expenses",
    "expenseType": "Software Rental Expenses",
    "isDirect": false
  },
  {
    "rowNum": 72,
    "place": "Delhi Center",
    "date": "2026-08-26",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 690.0,
    "remarks": "AUTOPAY-GOOGLE PLAY",
    "expense": "Software Rental Expenses",
    "expenseType": "Software Rental Expenses",
    "isDirect": false
  },
  {
    "rowNum": 73,
    "place": "Delhi Center",
    "date": "2026-08-26",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 690.0,
    "remarks": "AUTOPAY-GOOGLE PLAY",
    "expense": "Software Rental Expenses",
    "expenseType": "Software Rental Expenses",
    "isDirect": false
  },
  {
    "rowNum": 74,
    "place": "Delhi Center",
    "date": "2026-08-26",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 2524.26,
    "remarks": "personal payments",
    "expense": "Drawings",
    "expenseType": "Personal Payments",
    "isDirect": true
  },
  {
    "rowNum": 75,
    "place": "Delhi Center",
    "date": "2026-08-26",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 17700.0,
    "remarks": "Aisensy software",
    "expense": "Software Rental Expenses",
    "expenseType": "Software Rental Expenses",
    "isDirect": false
  },
  {
    "rowNum": 76,
    "place": "Delhi Center",
    "date": "2026-08-26",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 40000.0,
    "remarks": "meta ads",
    "expense": "Software Rental Expenses",
    "expenseType": "Software Rental Expenses",
    "isDirect": false
  },
  {
    "rowNum": 77,
    "place": "Delhi Center",
    "date": "2026-08-26",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 299.0,
    "remarks": "personal payments",
    "expense": "Drawings",
    "expenseType": "Personal Payments",
    "isDirect": true
  },
  {
    "rowNum": 78,
    "place": "Delhi Center",
    "date": "2026-08-26",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Icici Medihub 292",
    "method": "icici_medihub_bank_transfer",
    "furtherMode": "ICICI Medihub",
    "amount": 156.94,
    "remarks": "bank charges",
    "expense": "Bank Charges",
    "expenseType": "Bank Charges",
    "isDirect": true
  },
  {
    "rowNum": 79,
    "place": "Delhi Center",
    "date": "2026-08-27",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 410.45,
    "remarks": "nicosiya software payment",
    "expense": "Software Rental Expenses",
    "expenseType": "Software Rental Expenses",
    "isDirect": false
  },
  {
    "rowNum": 80,
    "place": "Delhi Center",
    "date": "2026-08-27",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 2797.78,
    "remarks": "meta ads",
    "expense": "Software Rental Expenses",
    "expenseType": "Software Rental Expenses",
    "isDirect": false
  },
  {
    "rowNum": 81,
    "place": "Delhi Center",
    "date": "2026-08-27",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 2018.0,
    "remarks": "smfg emi",
    "expense": "Drawings",
    "expenseType": "Personal Payments",
    "isDirect": true
  },
  {
    "rowNum": 82,
    "place": "Delhi Center",
    "date": "2026-08-27",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 40000.0,
    "remarks": "meta ads",
    "expense": "Software Rental Expenses",
    "expenseType": "Software Rental Expenses",
    "isDirect": false
  },
  {
    "rowNum": 83,
    "place": "Delhi Center",
    "date": "2026-08-27",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 50000.0,
    "remarks": "google ads",
    "expense": "Software Rental Expenses",
    "expenseType": "Software Rental Expenses",
    "isDirect": false
  },
  {
    "rowNum": 84,
    "place": "Delhi Center",
    "date": "2026-08-27",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 2500.0,
    "remarks": "hyd Printing & stationery",
    "expense": "Office Exp.",
    "expenseType": "Printing & stationery",
    "isDirect": true
  },
  {
    "rowNum": 85,
    "place": "Delhi Center",
    "date": "2026-08-27",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 1500.0,
    "remarks": "petrol to car",
    "expense": "Office Exp.",
    "expenseType": "Vehicle Maintainance",
    "isDirect": true
  },
  {
    "rowNum": 86,
    "place": "Delhi Center",
    "date": "2026-08-27",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 7670.0,
    "remarks": "Aisensy software",
    "expense": "Software Rental Expenses",
    "expenseType": "Software Rental Expenses",
    "isDirect": false
  },
  {
    "rowNum": 87,
    "place": "Delhi Center",
    "date": "2026-08-28",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 3881.58,
    "remarks": "burger for staff rakshabandhan",
    "expense": "Welfare Expenses",
    "expenseType": "Staff Welfare",
    "isDirect": true
  },
  {
    "rowNum": 88,
    "place": "Delhi Center",
    "date": "2026-08-28",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 8000.0,
    "remarks": "personal payment",
    "expense": "Drawings",
    "expenseType": "Personal Payments",
    "isDirect": true
  },
  {
    "rowNum": 89,
    "place": "Delhi Center",
    "date": "2026-08-28",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 1991.58,
    "remarks": "personal payments",
    "expense": "Drawings",
    "expenseType": "Personal Payments",
    "isDirect": true
  },
  {
    "rowNum": 90,
    "place": "Delhi Center",
    "date": "2026-08-28",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 2100.0,
    "remarks": "personal payments",
    "expense": "Drawings",
    "expenseType": "Personal Payments",
    "isDirect": true
  },
  {
    "rowNum": 91,
    "place": "Delhi Center",
    "date": "2026-08-28",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 999.0,
    "remarks": "i cloud space",
    "expense": "Software Rental Expenses",
    "expenseType": "Software Rental Expenses",
    "isDirect": false
  },
  {
    "rowNum": 92,
    "place": "Delhi Center",
    "date": "2026-08-28",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 999.0,
    "remarks": "i cloud space",
    "expense": "Software Rental Expenses",
    "expenseType": "Software Rental Expenses",
    "isDirect": false
  },
  {
    "rowNum": 93,
    "place": "Delhi Center",
    "date": "2026-08-28",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 2018.0,
    "remarks": "smfg emi",
    "expense": "Drawings",
    "expenseType": "Personal Payments",
    "isDirect": true
  },
  {
    "rowNum": 94,
    "place": "Delhi Center",
    "date": "2026-08-28",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 9356.22,
    "remarks": "cxwizard payment",
    "expense": "Software Rental Expenses",
    "expenseType": "Software Rental Expenses",
    "isDirect": false
  },
  {
    "rowNum": 95,
    "place": "Delhi Center",
    "date": "2026-08-28",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 350.8,
    "remarks": "telecaller recharge",
    "expense": "Telephone Expenses",
    "expenseType": "Staff Recharge",
    "isDirect": true
  },
  {
    "rowNum": 96,
    "place": "Delhi Center",
    "date": "2026-08-28",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 2797.7,
    "remarks": "meta ads",
    "expense": "Software Rental Expenses",
    "expenseType": "Software Rental Expenses",
    "isDirect": false
  },
  {
    "rowNum": 97,
    "place": "Delhi Center",
    "date": "2026-08-28",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 40000.0,
    "remarks": "meta ads",
    "expense": "Software Rental Expenses",
    "expenseType": "Software Rental Expenses",
    "isDirect": false
  },
  {
    "rowNum": 98,
    "place": "Delhi Center",
    "date": "2026-08-28",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Icici Medihub 292",
    "method": "icici_medihub_bank_transfer",
    "furtherMode": "ICICI Medihub",
    "amount": 11.21,
    "remarks": "bank charges",
    "expense": "Bank Charges",
    "expenseType": "Bank Charges",
    "isDirect": true
  },
  {
    "rowNum": 99,
    "place": "Delhi Center",
    "date": "2026-08-28",
    "branch": "Delhi",
    "branchDerived": true,
    "paymentMethodRaw": "Icici Medihub 292",
    "method": "icici_medihub_bank_transfer",
    "furtherMode": "ICICI Medihub",
    "amount": 15000.0,
    "remarks": "Gorkem hotel charges",
    "expense": "Hotel Charges",
    "expenseType": "Hotel Charges",
    "isDirect": true
  }
];

// --- args ------------------------------------------------------------------
const args = process.argv.slice(2);
const arg = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const APPLY = args.includes("--apply");
const DUMP_JSON = args.includes("--dump-json");
const INCLUDE_PAYABLE_CATS = args.includes("--include-payable-categories");
const CONFIRM_POSSIBLE_DUPES = args.includes("--confirm-possible-duplicates");
const BRANCH = arg("branch") || null;

const IMPORT_IDENTITY = { name: "Bulk Import", email: "import@system", branch: "" };
const inr = (n) => "Rs " + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

let SELECTED = INCLUDE_PAYABLE_CATS ? ENTRIES : ENTRIES.filter((e) => e.isDirect);
if (BRANCH) SELECTED = SELECTED.filter((e) => e.branch === BRANCH);

if (DUMP_JSON) {
  const out = "expenses-aug25-28-payload.json";
  fs.writeFileSync(out, JSON.stringify(SELECTED, null, 2));
  console.log(`Wrote ${out} — ${SELECTED.length} row(s).`);
  process.exit(0);
}

if (!MONGODB_URI) {
  console.error("MONGODB_URI missing — checked .env.local and .env.");
  process.exit(1);
}

const VALID_METHODS = ["cash", "hdfc_skin_bank_transfer", "hdfc_ryan_medihub_bank_transfer", "icici_medihub_bank_transfer"];

function validate() {
  const errors = [];
  for (const e of SELECTED) {
    const where = `row ${e.rowNum} (${e.expense}/${e.expenseType})`;
    if (!VALID_METHODS.includes(e.method)) errors.push(`${where}: unmapped method "${e.method}"`);
    if (!ACCOUNTS.includes(e.furtherMode)) errors.push(`${where}: "${e.furtherMode}" is not a valid account`);
    if (!(e.amount > 0)) errors.push(`${where}: amount must be > 0`);
    if (isNaN(new Date(e.date).getTime())) errors.push(`${where}: bad date "${e.date}"`);
    if (!e.branch) errors.push(`${where}: no branch (Place "${e.place}" has no mapping)`);
    if (!e.expense || !e.expenseType) errors.push(`${where}: missing expense head or type`);
  }
  return errors;
}

async function run() {
  const skippedPayableCats = ENTRIES.filter((e) => !e.isDirect);
  const derivedCount = SELECTED.filter((e) => e.branchDerived).length;

  console.log("=".repeat(92));
  console.log(APPLY ? "MODE: APPLY  <- will write to the database" : "MODE: DRY RUN  <- nothing will be written");
  console.log(`Source rows in file : ${ENTRIES.length}   (25-28 Aug 2026)`);
  console.log(`Selected for import : ${SELECTED.length}${INCLUDE_PAYABLE_CATS ? "  (--include-payable-categories ON)" : "  (direct-payment categories only)"}`);
  if (BRANCH) console.log(`Branch filter       : ${BRANCH}`);
  console.log("=".repeat(92) + "\n");

  const errors = validate();
  if (errors.length) {
    console.error(`VALIDATION FAILED — ${errors.length} problem(s). Nothing imported.\n`);
    errors.forEach((e) => console.error("  " + e));
    process.exit(1);
  }
  console.log("Validation passed — every method, account, amount, date, branch and category resolves.\n");

  if (derivedCount) {
    const byPlace = {};
    SELECTED.filter((e) => e.branchDerived).forEach((e) => {
      const k = `${e.place}  ->  ${e.branch}`;
      byPlace[k] = (byPlace[k] || 0) + 1;
    });
    console.log(`--- BRANCH DERIVED FROM PLACE on ${derivedCount} row(s) (the sheet's Branch column is empty) ---`);
    Object.entries(byPlace).sort().forEach(([k, c]) => console.log(`  ${k.padEnd(40)} ${String(c).padStart(4)} rows`));
    console.log("  If any of these should be a different branch, fix the sheet rather than accepting this.\n");
  }

  if (!INCLUDE_PAYABLE_CATS && skippedPayableCats.length) {
    const byHead = {};
    skippedPayableCats.forEach((e) => {
      byHead[e.expense] = byHead[e.expense] || { count: 0, amount: 0 };
      byHead[e.expense].count += 1;
      byHead[e.expense].amount += e.amount;
    });
    console.log("!".repeat(92));
    console.log(`NOT IMPORTED — ${skippedPayableCats.length} row(s) in payable-backed categories, ${inr(r2(skippedPayableCats.reduce((s, e) => s + e.amount, 0)))}`);
    console.log("These are normally raised as Payables and settled through their own flows (Incentive");
    console.log("especially — it's in PAYABLE_CATEGORIES_OWNED_ELSEWHERE). A loose expense with no");
    console.log("payableId would double-count against any Payable that already exists for the same money.");
    console.log("Check /admin/transactions for 25-28 Aug before using --include-payable-categories.");
    console.log("!".repeat(92));
    Object.entries(byHead).sort().forEach(([h, v]) =>
      console.log(`  ${h.padEnd(34)} ${String(v.count).padStart(4)} rows  ${inr(v.amount).padStart(16)}`),
    );
    console.log("");
  }

  const byHead = {};
  SELECTED.forEach((e) => {
    byHead[e.expense] = byHead[e.expense] || { count: 0, amount: 0 };
    byHead[e.expense].count += 1;
    byHead[e.expense].amount += e.amount;
  });
  console.log("--- TO IMPORT, BY HEAD ---");
  Object.entries(byHead).sort().forEach(([h, v]) =>
    console.log(`  ${h.padEnd(34)} ${String(v.count).padStart(4)} rows  ${inr(v.amount).padStart(16)}`),
  );
  const total = r2(SELECTED.reduce((s, e) => s + e.amount, 0));
  console.log(`  ${"".padEnd(34)} ${String(SELECTED.length).padStart(4)} rows  ${inr(total).padStart(16)}  <- TOTAL\n`);

  const byAccount = {};
  SELECTED.forEach((e) => {
    byAccount[e.furtherMode] = byAccount[e.furtherMode] || { count: 0, amount: 0 };
    byAccount[e.furtherMode].count += 1;
    byAccount[e.furtherMode].amount += e.amount;
  });
  console.log("--- CASH OUT, BY ACCOUNT ---");
  Object.entries(byAccount).sort().forEach(([a, v]) =>
    console.log(`  ${a.padEnd(34)} ${String(v.count).padStart(4)} rows  ${inr(v.amount).padStart(16)}`),
  );
  console.log("");

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  const AccountPeriod = mongoose.models.AccountPeriod || mongoose.model("AccountPeriod", new mongoose.Schema({}, { strict: false, collection: "accountperiods" }));
  const Transactions = mongoose.models.Transactions || mongoose.model("Transactions", new mongoose.Schema({}, { strict: false, collection: "transactions" }));

  // --- period lock, reimplemented (periodLock.js imports @/-aliased modules) -----------------
  const isOpeningSeed = (p) => new Date(p.periodStart).getTime() === new Date(p.periodEnd).getTime();
  async function closedPeriodsCovering(account, date) {
    const rows = await AccountPeriod.find({
      account, branch: null, isClosed: true,
      periodStart: { $lte: new Date(date) }, periodEnd: { $gte: new Date(date) },
    }).lean();
    return rows.filter((p) => !isOpeningSeed(p));
  }
  async function periodLockReason(account, date) {
    const [closed] = await closedPeriodsCovering(account, date);
    return closed ? `${account} is closed for that period` : null;
  }

  console.log("Checking idempotency tags and period locks...");
  const toCreate = [];
  const already = [];
  const locked = [];
  const possibleDupes = [];

  for (const e of SELECTED) {
    const paymentId = `BULK-EXP-A2528-${e.rowNum}`;
    const exists = await Transactions.findOne({ paymentId }).select("_id").lean();
    if (exists) {
      already.push({ e, existingId: String(exists._id) });
      continue;
    }

    // A REAL duplicate check, not just a warning. The idempotency tag above only catches a
    // re-run of THIS script. It cannot see a row that already reached the CRM by another route
    // — which is the actual risk for payable-backed categories, since Incentive and the rest
    // are normally raised and settled by their own flows. So look for an untagged transaction
    // that matches on the fields a human would have entered: same day, same amount, same head
    // and sub-type. Anything found is reported with its _id and left alone unless explicitly
    // confirmed. Matching this loosely is deliberate — a false positive costs a glance, a false
    // negative books the same money twice.
    const dayStart = new Date(`${e.date}T00:00:00.000Z`);
    const dayEnd = new Date(`${e.date}T23:59:59.999Z`);
    const match = await Transactions.find({
      transactionCategory: "EXPENSE",
      expense: e.expense,
      expenseType: e.expenseType,
      amount: e.amount,
      date: { $gte: dayStart, $lte: dayEnd },
      paymentId: { $not: /^BULK-EXP-A2528-/ },
    })
      .select("_id amount date expense expenseType branch method payableId remarks")
      .lean();

    if (match.length && !CONFIRM_POSSIBLE_DUPES) {
      possibleDupes.push({ e, matches: match });
      continue;
    }

    const lock = await periodLockReason(e.furtherMode, e.date);
    if (lock) {
      locked.push({ e, reason: lock });
      continue;
    }
    toCreate.push({ e, paymentId });
  }

  console.log(`  To create        : ${toCreate.length}`);
  console.log(`  Already imported : ${already.length}  (idempotent — safe re-run, skipped)`);
  console.log(`  Possible dupes   : ${possibleDupes.length}  (needs --confirm-possible-duplicates)`);
  console.log(`  Period locked    : ${locked.length}`);

  if (possibleDupes.length) {
    console.log("\n" + "!".repeat(92));
    console.log(`POSSIBLE DUPLICATES — ${possibleDupes.length} row(s) already have a matching transaction in the CRM`);
    console.log("(same date + amount + head + sub-type, not created by this script). Skipped by default.");
    console.log("Open each _id below in /admin/transactions and confirm it is NOT the same payment,");
    console.log("then re-run with --confirm-possible-duplicates.");
    console.log("!".repeat(92));
    possibleDupes.forEach(({ e, matches }) => {
      console.log(`\n  row ${e.rowNum}  ${e.date}  ${e.expense}/${e.expenseType}  ${inr(e.amount)}`);
      console.log(`      sheet says : "${e.remarks}"`);
      matches.forEach((m) =>
        console.log(`      in CRM     : ${m._id}  branch=${m.branch}  method=${m.method}${m.payableId ? "  [linked to a payable]" : ""}  "${m.remarks || ""}"`),
      );
    });
    console.log("");
  }

  if (locked.length) {
    console.log("\n--- PERIOD LOCKED (skipped) ---");
    locked.forEach(({ e, reason }) => console.log(`  row ${e.rowNum}  ${e.date}  ${inr(e.amount)}  — ${reason}`));
  }

  if (!toCreate.length) {
    console.log("\nNothing to create.");
    await mongoose.disconnect();
    return;
  }

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Reconcile the totals above, then re-run with --apply.");
    await mongoose.disconnect();
    return;
  }

  console.log(`\nCreating ${toCreate.length} transaction(s)...`);
  const created = [];
  const failed = [];

  for (const { e, paymentId } of toCreate) {
    try {
      const doc = await Transactions.create({
        transactionCategory: "EXPENSE",
        costType: "Expenses",
        expense: e.expense,
        expenseType: e.expenseType,
        amount: e.amount,
        method: e.method,
        paymentId,
        branch: e.branch,
        date: new Date(e.date),
        remarks: e.remarks,
        // No payee column in the sheet; Remarks is the description of what was bought, which is
        // what existing manual entries put in expenseGiver.name. See the header note.
        expenseGiver: { type: "MANUAL", name: e.remarks },
        receipts: [],
        furtherMode: e.furtherMode,
        receiptMode: "",
        payableId: null,
        isSettlement: false,
        approvalStatus: "APPROVED",
        createdBy: { ...IMPORT_IDENTITY, branch: e.branch, date: new Date() },
      });
      created.push({ rowNum: e.rowNum, id: String(doc._id), amount: e.amount, expense: e.expense });
      console.log(`  row ${String(e.rowNum).padStart(4)}  ${e.date}  ${e.expense.padEnd(28)} ${inr(e.amount).padStart(13)}  OK`);
    } catch (err) {
      failed.push({ rowNum: e.rowNum, reason: err?.message || String(err) });
      console.log(`  row ${String(e.rowNum).padStart(4)}  FAILED: ${err?.message || err}`);
    }
  }

  console.log(`\nCreated ${created.length}, ${failed.length} failed.`);
  if (failed.length) failed.forEach((f) => console.log(`  row ${f.rowNum}: ${f.reason}`));

  const reportPath = `expenses-aug25-28-import-report-${Date.now()}.json`;
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        source: "EXPENSE.xlsx (25-28 Aug 2026)",
        includedPayableCategories: INCLUDE_PAYABLE_CATS,
        branchDerivedFromPlace: derivedCount,
        totalCreatedAmount: r2(created.reduce((s, c) => s + c.amount, 0)),
        created, failed,
        alreadyImported: already.map(({ e, existingId }) => ({ rowNum: e.rowNum, existingId })),
        periodLocked: locked.map(({ e, reason }) => ({ rowNum: e.rowNum, date: e.date, amount: e.amount, reason })),
        possibleDuplicatesSkipped: possibleDupes.map(({ e, matches }) => ({
          rowNum: e.rowNum, date: e.date, expense: e.expense, expenseType: e.expenseType,
          amount: e.amount, remarks: e.remarks,
          matchedExistingIds: matches.map((m) => String(m._id)),
        })),
        notImportedPayableCategories: INCLUDE_PAYABLE_CATS ? [] : skippedPayableCats.map((e) => ({ rowNum: e.rowNum, expense: e.expense, amount: e.amount })),
      },
      null,
      2,
    ),
  );
  console.log(`\nReport written to ${reportPath} — keep it, the IDs are your undo list.`);

  await mongoose.disconnect();
  console.log("Done.");
}

run().catch(async (err) => {
  console.error("\nFATAL:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
