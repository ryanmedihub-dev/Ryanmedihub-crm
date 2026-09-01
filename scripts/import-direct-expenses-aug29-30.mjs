

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
// THE DATA — parsed directly from EXP_29-30_AUG.xlsx, not hand-transcribed.
// `isDirect` marks the 44 direct-payment rows; the sheet's Branch column is populated
// directly this time, so branchDerived is false throughout (no Place->Branch guessing needed).
//
// Payment Method column only said "Cash" (not "Cash-book" / "Cash ( backend )" as before), so
// furtherMode was inferred from Place: Delhi Center -> Cash Book, Delhi Backend -> Cash ( backend ).
// Hyderabad Clinic is a new Place with no dedicated account in ACCOUNTS below — its 14 cash rows
// (Rs 3,182) were routed to Cash Book per explicit confirmation; revisit if Hyderabad gets its own
// account later.
//
// New expense heads not seen in the previous batch, resolved per explicit confirmation:
//   Salary::Salary and Commision::Commission-others -> isDirect true (import normally)
//   Patient Related Expenses::Patient Refunds -> isDirect false (payable-backed, skipped)
// Best-guess (not separately confirmed, consistent with existing precedent — verify before --apply):
//   Electricity Bill::Electricity Exp-Noida Clinic -> true (utility bill, same pattern as other direct heads)
//   Medical Consumables::Medical Consumables-OT -> false (same head as Medical Consumables-Others, already payable-backed)
// ═══════════════════════════════════════════════════════════════════════════════
const ENTRIES = [
  {
    "rowNum": 2,
    "place": "Delhi Center",
    "date": "2026-08-29",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 1500.0,
    "remarks": "EMRE FOOD MONEY BY MEDICINE",
    "expense": "Welfare Expenses",
    "expenseType": "Staff Welfare",
    "isDirect": true
  },
  {
    "rowNum": 3,
    "place": "Delhi Center",
    "date": "2026-08-29",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 225.0,
    "remarks": "CD PRP WIRE",
    "expense": "Office Exp.",
    "expenseType": "office Repairs and Maintainence",
    "isDirect": true
  },
  {
    "rowNum": 4,
    "place": "Delhi Center",
    "date": "2026-08-29",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 372.0,
    "remarks": "CD PT MEDICINE IV SET",
    "expense": "Medical Consumables",
    "expenseType": "Medical Consumables-OT",
    "isDirect": false
  },
  {
    "rowNum": 5,
    "place": "Delhi Center",
    "date": "2026-08-29",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 900.0,
    "remarks": "CELL BRUSH FOR 4TH FLOOR ND ROLLER ALLOUT RET KILLERE",
    "expense": "Office Exp.",
    "expenseType": "office Repairs and Maintainence",
    "isDirect": true
  },
  {
    "rowNum": 6,
    "place": "Delhi Center",
    "date": "2026-08-29",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 1000.0,
    "remarks": "JASSICA INCENTIVE BY MEDICINE",
    "expense": "Incentive",
    "expenseType": "Sales Incentive-- Medicine",
    "isDirect": false
  },
  {
    "rowNum": 7,
    "place": "Delhi Center",
    "date": "2026-08-29",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 1500.0,
    "remarks": "GUDIYA INCENTIVE BY MEDICINE",
    "expense": "Incentive",
    "expenseType": "Sales Incentive-- Medicine",
    "isDirect": false
  },
  {
    "rowNum": 8,
    "place": "Delhi Center",
    "date": "2026-08-30",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 250.0,
    "remarks": "BIKE PETROL",
    "expense": "Office Exp.",
    "expenseType": "Vehicle Maintainance",
    "isDirect": true
  },
  {
    "rowNum": 9,
    "place": "Delhi Center",
    "date": "2026-08-30",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 490.0,
    "remarks": "PT MEDICINE M.M",
    "expense": "Medical Consumables",
    "expenseType": "Medical Consumables-Others",
    "isDirect": false
  },
  {
    "rowNum": 10,
    "place": "Delhi Center",
    "date": "2026-08-30",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 200.0,
    "remarks": "ROOM FRESHNER",
    "expense": "Welfare Expenses",
    "expenseType": "Pantry Expenses",
    "isDirect": true
  },
  {
    "rowNum": 11,
    "place": "Delhi Center",
    "date": "2026-08-30",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 3500.0,
    "remarks": "EMRE FOOD PENDING AMOUNT CLEAR",
    "expense": "Welfare Expenses",
    "expenseType": "Staff Welfare",
    "isDirect": true
  },
  {
    "rowNum": 12,
    "place": "Delhi Center",
    "date": "2026-08-30",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 100.0,
    "remarks": "PRADEEP PT LUNCH",
    "expense": "Patient Related Expenses",
    "expenseType": "Patient Meals",
    "isDirect": true
  },
  {
    "rowNum": 13,
    "place": "Delhi Center",
    "date": "2026-08-30",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 100.0,
    "remarks": "DISWASHER SOAP FOR ALL CLINIC",
    "expense": "Welfare Expenses",
    "expenseType": "Pantry Expenses",
    "isDirect": true
  },
  {
    "rowNum": 14,
    "place": "Delhi Center",
    "date": "2026-08-30",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 3500.0,
    "remarks": "RAVINA 18/8/26/ TO 19/8/26  CLEAR",
    "expense": "Incentive",
    "expenseType": "Sales Incentive--Counsellor",
    "isDirect": false
  },
  {
    "rowNum": 15,
    "place": "Delhi Center",
    "date": "2026-08-30",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 2500.0,
    "remarks": "19/8/26 PENDING incentive CLEAR",
    "expense": "Incentive",
    "expenseType": "Sales Incentive--Counsellor",
    "isDirect": false
  },
  {
    "rowNum": 16,
    "place": "Delhi Center",
    "date": "2026-08-30",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 5000.0,
    "remarks": "PAINTER PAYMENT FOR 4TH FLOOR  BY MEDICINE",
    "expense": "Office Exp.",
    "expenseType": "office Repairs and Maintainence",
    "isDirect": true
  },
  {
    "rowNum": 17,
    "place": "Delhi Center",
    "date": "2026-08-29",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 1630.0,
    "remarks": "HANDOVER TO MONIKA DI",
    "expense": "Drawings",
    "expenseType": "Handover to Family",
    "isDirect": true
  },
  {
    "rowNum": 18,
    "place": "Delhi Center",
    "date": "2026-08-30",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 60.0,
    "remarks": "HANDOVER TO MONIKA DI",
    "expense": "Drawings",
    "expenseType": "Handover to Family",
    "isDirect": true
  },
  {
    "rowNum": 19,
    "place": "Delhi Center",
    "date": "2026-08-30",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 6220.0,
    "remarks": "HANDOVER TO AUNTY JI",
    "expense": "Drawings",
    "expenseType": "Handover to Family",
    "isDirect": true
  },
  {
    "rowNum": 20,
    "place": "Delhi Backend",
    "date": "2026-08-29",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash ( backend )",
    "amount": 1400.0,
    "remarks": "porter payment & ot stock",
    "expense": "Office Exp.",
    "expenseType": "Conveyance/Freight",
    "isDirect": true
  },
  {
    "rowNum": 21,
    "place": "Delhi Backend",
    "date": "2026-08-29",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash ( backend )",
    "amount": 1300.0,
    "remarks": "Arjun unloading charges",
    "expense": "Office Exp.",
    "expenseType": "Conveyance/Freight",
    "isDirect": true
  },
  {
    "rowNum": 22,
    "place": "Delhi Backend",
    "date": "2026-08-29",
    "branch": "Delhi",
    "branchDerived": false,
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
    "rowNum": 23,
    "place": "Delhi Backend",
    "date": "2026-08-29",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 749.0,
    "remarks": "i cloud space",
    "expense": "Software Rental Expenses",
    "expenseType": "Software Rental Expenses",
    "isDirect": false
  },
  {
    "rowNum": 24,
    "place": "Delhi Backend",
    "date": "2026-08-29",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 40000.0,
    "remarks": "Mishra surgicals prp wiles",
    "expense": "Office Exp.",
    "expenseType": "office Repairs and Maintainence",
    "isDirect": true
  },
  {
    "rowNum": 25,
    "place": "Delhi Backend",
    "date": "2026-08-29",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 40000.0,
    "remarks": "google ads",
    "expense": "Software Rental Expenses",
    "expenseType": "Software Rental Expenses",
    "isDirect": false
  },
  {
    "rowNum": 26,
    "place": "Delhi Backend",
    "date": "2026-08-29",
    "branch": "Delhi",
    "branchDerived": false,
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
    "rowNum": 27,
    "place": "Delhi Backend",
    "date": "2026-08-29",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 18098.0,
    "remarks": "Noida clinic maintainance & electricity",
    "expense": "Electricity Bill",
    "expenseType": "Electricity Exp-Noida Clinic",
    "isDirect": true
  },
  {
    "rowNum": 28,
    "place": "Delhi Backend",
    "date": "2026-08-29",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 5100.0,
    "remarks": "hasad telecaller fnf incentive clear",
    "expense": "Incentive",
    "expenseType": "Sales Incentive-Agents",
    "isDirect": false
  },
  {
    "rowNum": 29,
    "place": "Delhi Backend",
    "date": "2026-08-29",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 16.95,
    "remarks": "bank charges",
    "expense": "Bank Charges",
    "expenseType": "Bank Charges",
    "isDirect": true
  },
  {
    "rowNum": 30,
    "place": "Delhi Backend",
    "date": "2026-08-29",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 5000.0,
    "remarks": "DEEPAK  REF NISHA 9555125545 ET  BY PRADEEP SIR",
    "expense": "Patient Related Expenses",
    "expenseType": "Patient Refunds",
    "isDirect": false
  },
  {
    "rowNum": 31,
    "place": "Delhi Backend",
    "date": "2026-08-29",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 190.0,
    "remarks": "personal payment",
    "expense": "Drawings",
    "expenseType": "Personal Payments",
    "isDirect": true
  },
  {
    "rowNum": 32,
    "place": "Delhi Backend",
    "date": "2026-08-29",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 7042.0,
    "remarks": "turky tech. ticket",
    "expense": "Office Exp.",
    "expenseType": "Vehicle Maintainance",
    "isDirect": true
  },
  {
    "rowNum": 33,
    "place": "Delhi Backend",
    "date": "2026-08-29",
    "branch": "Delhi",
    "branchDerived": false,
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
    "rowNum": 34,
    "place": "Delhi Backend",
    "date": "2026-08-29",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 40000.0,
    "remarks": "google ads",
    "expense": "Software Rental Expenses",
    "expenseType": "Software Rental Expenses",
    "isDirect": false
  },
  {
    "rowNum": 35,
    "place": "Delhi Backend",
    "date": "2026-08-29",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 649.0,
    "remarks": "personal payments",
    "expense": "Drawings",
    "expenseType": "Personal Payments",
    "isDirect": true
  },
  {
    "rowNum": 36,
    "place": "Delhi Backend",
    "date": "2026-08-29",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Icici Medihub 292",
    "method": "icici_medihub_bank_transfer",
    "furtherMode": "ICICI Medihub",
    "amount": 133.4,
    "remarks": "bank charges",
    "expense": "Bank Charges",
    "expenseType": "Bank Charges",
    "isDirect": true
  },
  {
    "rowNum": 37,
    "place": "Delhi Backend",
    "date": "2026-08-30",
    "branch": "Delhi",
    "branchDerived": false,
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
    "rowNum": 38,
    "place": "Delhi Backend",
    "date": "2026-08-30",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 30000.0,
    "remarks": "meta ads",
    "expense": "Software Rental Expenses",
    "expenseType": "Software Rental Expenses",
    "isDirect": false
  },
  {
    "rowNum": 39,
    "place": "Delhi Backend",
    "date": "2026-08-30",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 6000.0,
    "remarks": "staff salary",
    "expense": "Salary",
    "expenseType": "Salary",
    "isDirect": true
  },
  {
    "rowNum": 40,
    "place": "Delhi Backend",
    "date": "2026-08-30",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 30000.0,
    "remarks": "meta ads",
    "expense": "Software Rental Expenses",
    "expenseType": "Software Rental Expenses",
    "isDirect": false
  },
  {
    "rowNum": 41,
    "place": "Delhi Backend",
    "date": "2026-08-30",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 2000.0,
    "remarks": "telecaller recharge",
    "expense": "Telephone Expenses",
    "expenseType": "Staff Recharge",
    "isDirect": true
  },
  {
    "rowNum": 42,
    "place": "Delhi Backend",
    "date": "2026-08-30",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 2000.0,
    "remarks": "telecaller recharge",
    "expense": "Telephone Expenses",
    "expenseType": "Staff Recharge",
    "isDirect": true
  },
  {
    "rowNum": 43,
    "place": "Delhi Backend",
    "date": "2026-08-30",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 236.92,
    "remarks": "personal payment",
    "expense": "Drawings",
    "expenseType": "Personal Payments",
    "isDirect": true
  },
  {
    "rowNum": 44,
    "place": "Delhi Backend",
    "date": "2026-08-30",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 35400.0,
    "remarks": "rajat enterprises laptop repair",
    "expense": "Office Exp.",
    "expenseType": "office Repairs and Maintainence",
    "isDirect": true
  },
  {
    "rowNum": 45,
    "place": "Delhi Backend",
    "date": "2026-08-30",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 30000.0,
    "remarks": "meta ads",
    "expense": "Software Rental Expenses",
    "expenseType": "Software Rental Expenses",
    "isDirect": false
  },
  {
    "rowNum": 46,
    "place": "Delhi Backend",
    "date": "2026-08-30",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 20000.0,
    "remarks": "Srpp hair & medi spa collab",
    "expense": "Commision",
    "expenseType": "Commission-others",
    "isDirect": true
  },
  {
    "rowNum": 47,
    "place": "Delhi Backend",
    "date": "2026-08-30",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 5722.0,
    "remarks": "Anjali singh core team july incentive clear",
    "expense": "Incentive",
    "expenseType": "Sales Incentive-Agents",
    "isDirect": false
  },
  {
    "rowNum": 48,
    "place": "Delhi Backend",
    "date": "2026-08-30",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 40000.0,
    "remarks": "google ads",
    "expense": "Software Rental Expenses",
    "expenseType": "Software Rental Expenses",
    "isDirect": false
  },
  {
    "rowNum": 49,
    "place": "Delhi Backend",
    "date": "2026-08-30",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 1200.0,
    "remarks": "vishal verma",
    "expense": "Drawings",
    "expenseType": "Personal Payments",
    "isDirect": true
  },
  {
    "rowNum": 50,
    "place": "Delhi Backend",
    "date": "2026-08-30",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Hdfc Skin 739",
    "method": "hdfc_skin_bank_transfer",
    "furtherMode": "HDFC Skin",
    "amount": 280.0,
    "remarks": "personal payment",
    "expense": "Drawings",
    "expenseType": "Personal Payments",
    "isDirect": true
  },
  {
    "rowNum": 51,
    "place": "Delhi Backend",
    "date": "2026-08-30",
    "branch": "Delhi",
    "branchDerived": false,
    "paymentMethodRaw": "Icici Medihub 292",
    "method": "icici_medihub_bank_transfer",
    "furtherMode": "ICICI Medihub",
    "amount": 161.87,
    "remarks": "bank charges",
    "expense": "Bank Charges",
    "expenseType": "Bank Charges",
    "isDirect": true
  },
  {
    "rowNum": 52,
    "place": "Hyderabad Clinic",
    "date": "2026-08-29",
    "branch": "Hyderabad",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 150.0,
    "remarks": "DUSBIN COVER",
    "expense": "Welfare Expenses",
    "expenseType": "Pantry Expenses",
    "isDirect": true
  },
  {
    "rowNum": 53,
    "place": "Hyderabad Clinic",
    "date": "2026-08-29",
    "branch": "Hyderabad",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 100.0,
    "remarks": "CARRY BAG",
    "expense": "Welfare Expenses",
    "expenseType": "Pantry Expenses",
    "isDirect": true
  },
  {
    "rowNum": 54,
    "place": "Hyderabad Clinic",
    "date": "2026-08-29",
    "branch": "Hyderabad",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 218.0,
    "remarks": "ROOM FRESHNER",
    "expense": "Welfare Expenses",
    "expenseType": "Pantry Expenses",
    "isDirect": true
  },
  {
    "rowNum": 55,
    "place": "Hyderabad Clinic",
    "date": "2026-08-29",
    "branch": "Hyderabad",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 180.0,
    "remarks": "COLIN",
    "expense": "Welfare Expenses",
    "expenseType": "Pantry Expenses",
    "isDirect": true
  },
  {
    "rowNum": 56,
    "place": "Hyderabad Clinic",
    "date": "2026-08-29",
    "branch": "Hyderabad",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 250.0,
    "remarks": "A4 SIZE PAPER",
    "expense": "Office Exp.",
    "expenseType": "Printing & stationery",
    "isDirect": true
  },
  {
    "rowNum": 57,
    "place": "Hyderabad Clinic",
    "date": "2026-08-29",
    "branch": "Hyderabad",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 255.0,
    "remarks": "GRBS NEEDLE",
    "expense": "Medical Consumables",
    "expenseType": "Medical Consumables-Others",
    "isDirect": false
  },
  {
    "rowNum": 58,
    "place": "Hyderabad Clinic",
    "date": "2026-08-29",
    "branch": "Hyderabad",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 750.0,
    "remarks": "GRBS STRIPES",
    "expense": "Medical Consumables",
    "expenseType": "Medical Consumables-Others",
    "isDirect": false
  },
  {
    "rowNum": 59,
    "place": "Hyderabad Clinic",
    "date": "2026-08-29",
    "branch": "Hyderabad",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 600.0,
    "remarks": "HOUSE KEEPING",
    "expense": "Office Exp.",
    "expenseType": "office Repairs and Maintainence",
    "isDirect": true
  },
  {
    "rowNum": 60,
    "place": "Hyderabad Clinic",
    "date": "2026-08-29",
    "branch": "Hyderabad",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 400.0,
    "remarks": "STAFF NIGHT FOOD",
    "expense": "Welfare Expenses",
    "expenseType": "Staff Welfare",
    "isDirect": true
  },
  {
    "rowNum": 61,
    "place": "Hyderabad Clinic",
    "date": "2026-08-29",
    "branch": "Hyderabad",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 70.0,
    "remarks": "PT LUNCH",
    "expense": "Patient Related Expenses",
    "expenseType": "Patient Meals",
    "isDirect": true
  },
  {
    "rowNum": 62,
    "place": "Hyderabad Clinic",
    "date": "2026-08-29",
    "branch": "Hyderabad",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 10.0,
    "remarks": "STEEL SCRUB",
    "expense": "Welfare Expenses",
    "expenseType": "Pantry Expenses",
    "isDirect": true
  },
  {
    "rowNum": 63,
    "place": "Hyderabad Clinic",
    "date": "2026-08-29",
    "branch": "Hyderabad",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 20.0,
    "remarks": "SOAP",
    "expense": "Welfare Expenses",
    "expenseType": "Pantry Expenses",
    "isDirect": true
  },
  {
    "rowNum": 64,
    "place": "Hyderabad Clinic",
    "date": "2026-08-30",
    "branch": "Hyderabad",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 140.0,
    "remarks": "PT LUNCH",
    "expense": "Patient Related Expenses",
    "expenseType": "Patient Meals",
    "isDirect": true
  },
  {
    "rowNum": 65,
    "place": "Hyderabad Clinic",
    "date": "2026-08-30",
    "branch": "Hyderabad",
    "branchDerived": false,
    "paymentMethodRaw": "Cash",
    "method": "cash",
    "furtherMode": "Cash Book",
    "amount": 39.0,
    "remarks": "GULKONDI",
    "expense": "Patient Related Expenses",
    "expenseType": "Patient Meals",
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
  const out = "expenses-aug29-30-payload.json";
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
  console.log(`Source rows in file : ${ENTRIES.length}   (29-30 Aug 2026)`);
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
    console.log("Check /admin/transactions for 29-30 Aug before using --include-payable-categories.");
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
    const paymentId = `BULK-EXP-A2930-${e.rowNum}`;
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
      paymentId: { $not: /^BULK-EXP-A2930-/ },
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

  const reportPath = `expenses-aug29-30-import-report-${Date.now()}.json`;
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        source: "EXP_29-30_AUG.xlsx (29-30 Aug 2026)",
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
