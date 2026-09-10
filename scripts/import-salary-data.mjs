// ---------------------------------------------------------------------------
// scripts/import-salary-data.mjs
//
// One-shot importer for `all_salary_data.xlsx` (286 rows, Aug salary run).
//
// What it does, in order:
//   PHASE 0  connect + preflight  — verifies every mapped ObjectId really exists,
//                                   flags employeeId collisions, validates branches
//   PHASE 1  create employees     — the 29 rows with no CRM ObjectId
//   PHASE 2  update employees     — employeeId, role (designation), isactive,
//                                   branch (only when missing, unless you flip a flag)
//   PHASE 3  create payables      — one SALARY payable per employee with amount > 0
//
// SAFETY
//   • Dry run by default. Nothing is written unless you pass --commit.
//   • Every document it creates is stamped with `importBatch: "<BATCH_ID>"`,
//     so `--revert` can undo the whole run.
//   • Idempotent: re-running skips employees that already exist and payables that
//     already exist for the same employee + period.
//   • Talks to raw collections (mongoose.connection.collection) so it does not need
//     the "@/..." path alias — same approach as scripts/export-employees-vendors.mjs.
//     That also means Mongoose schema validation is bypassed, so this script does the
//     enum checks itself in preflight.
//
// USAGE
//   node --env-file=.env.local scripts/import-salary-data.mjs            # dry run
//   node --env-file=.env.local scripts/import-salary-data.mjs --commit   # write
//   node --env-file=.env.local scripts/import-salary-data.mjs --revert=<BATCH_ID>
//
//   Extra flags:
//     --skip-payables       run phases 0–2 only
//     --only-payables       run phase 3 only (employees already imported)
//     --update-branch       also overwrite branch on employees that already have one
//     --allow-missing-ids   continue even if some mapped ObjectIds are not in the DB
// ---------------------------------------------------------------------------

import mongoose from "mongoose";
import fs from "node:fs";
import path from "node:path";

// ============================== CONFIG =====================================

// The salary month this file is for. CHECK THIS BEFORE RUNNING.
// The sheet header says "Emp ID (Salary Aug)" — month 8. Set the year yourself.
const PERIOD = { month: 8, year: 2026 };

// Due date stamped on every payable. Blank string = no due date.
const DUE_DATE = "2026-09-10";

// Who the audit trail attributes this to.
const ACTOR = {
  name: "System Import",
  email: "admin@ryanclinic.com",
  branch: "Delhi",
};

// The sheet's "Branch" column holds operating units, not the CRM's branch enum.
// Map each unit to a valid branch. Set a value to null to make the script refuse
// to run until you decide.
const UNIT_TO_BRANCH = {
  Backend: "Delhi",
  Vaishali: "Delhi",
  GD: "Delhi",
  CD: "Delhi",
  Noida: "Noida",
  Hyd: "Hyderabad",
  Collab: "Delhi", // ← no plain "Collab" branch exists in ALL_BRANCHES. Change if wrong.
};

// Keep the sheet's unit in the payable remarks so the Backend/GD/CD/Vaishali split
// is not lost when they all collapse to "Delhi".
const REMARK = (r) => `Salary ${monthName(PERIOD.month)} ${PERIOD.year} — ${r.unit} unit — imported from all_salary_data.xlsx`;

// Mirrors src/lib/branches.js — kept inline because this script does not use the alias.
const ALL_BRANCHES = [
  "Delhi", "Mumbai", "Hyderabad", "Noida",
  "Patna", "Gujarat", "Kolkata", "Ahmedabad", "Jaipur", "Bengaluru", "Pune",
  "Lucknow", "Chennai", "Jammu", "Kashmir", "Ranchi", "Prayagraj", "Chandigarh",
  "Jalandhar",
];

// ============================== DATA =======================================
// Straight from the spreadsheet. `objectId` empty = "New - not in CRM".
// `isActive:false` = the sheet name carried an "(Inactive)" suffix.
// `altName` = the sheet's separate "Name" column (a CRM-side alias), kept for
// matching only — it is never written to the DB.

const ROWS = [
  {"row": 2, "employeeId": "1", "name": "pradeep kumar", "sheetName": "pradeep kumar", "altName": "", "unit": "Backend", "designation": "accountant", "amount": 37419.35, "objectId": "6a8973aab669227e5fa5675d", "phone": "9311904205", "isActive": true},
  {"row": 3, "employeeId": "RM-0021", "name": "PRATEEK", "sheetName": "PRATEEK", "altName": "", "unit": "Backend", "designation": "MEDICAL", "amount": 17000.0, "objectId": "6a8842154f9e38445447996b", "phone": "7011630210", "isActive": true},
  {"row": 4, "employeeId": "31", "name": "RAHUL", "sheetName": "RAHUL", "altName": "", "unit": "Backend", "designation": "PATIENT CALLING", "amount": 14500.0, "objectId": "6944f9059bf2fb764f00e4fc", "phone": "1111111111", "isActive": true},
  {"row": 5, "employeeId": "RM-0150", "name": "SUNITA", "sheetName": "SUNITA", "altName": "Sunita Maid", "unit": "Backend", "designation": "MAID", "amount": 17032.26, "objectId": "6a8c16aa1f4f40287ae6764c", "phone": "8506945662", "isActive": true},
  {"row": 6, "employeeId": "RM-0226", "name": "POOJA", "sheetName": "POOJA", "altName": "", "unit": "Backend", "designation": "OT STAFF", "amount": 14516.13, "objectId": "691e9d24164751f6ae6a30f9", "phone": "9205091244", "isActive": true},
  {"row": 7, "employeeId": "RM-0033", "name": "Shaheen", "sheetName": "Shaheen", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 14516.13, "objectId": "691e9d24164751f6ae6a30c4", "phone": "7247868055", "isActive": true},
  {"row": 8, "employeeId": "RM-0035", "name": "Aisha Khan", "sheetName": "Aisha Khan", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 20000.0, "objectId": "691e9d24164751f6ae6a30de", "phone": "7428922270", "isActive": true},
  {"row": 9, "employeeId": "RM-0037", "name": "Harshita Rai", "sheetName": "Harshita Rai", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 15000.0, "objectId": "691e9d24164751f6ae6a30b7", "phone": "7827516971", "isActive": true},
  {"row": 10, "employeeId": "RM-0044", "name": "Sunita", "sheetName": "Sunita", "altName": "Sunita", "unit": "Backend", "designation": "TELECALLER", "amount": 14516.13, "objectId": "691e9d24164751f6ae6a30da", "phone": "8920693496", "isActive": true},
  {"row": 11, "employeeId": "RM-0045", "name": "Tanu Thakur", "sheetName": "Tanu Thakur", "altName": "Tanu", "unit": "Backend", "designation": "TELECALLER", "amount": 16400.0, "objectId": "691e9d24164751f6ae6a30b3", "phone": "9355170574", "isActive": true},
  {"row": 12, "employeeId": "RM-0076", "name": "Anjali Kumari Gudiya", "sheetName": "Anjali Kumari Gudiya", "altName": "(Gudiya)Anjali", "unit": "Backend", "designation": "TELECALLER", "amount": 17700.0, "objectId": "691e9d24164751f6ae6a30a7", "phone": "9310767886", "isActive": true},
  {"row": 13, "employeeId": "RM-0098", "name": "Aachal Chaturvedi", "sheetName": "Aachal Chaturvedi", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 15000.0, "objectId": "691e9d24164751f6ae6a30b6", "phone": "8448306374", "isActive": true},
  {"row": 14, "employeeId": "RM-0099", "name": "ANAM", "sheetName": "ANAM", "altName": "", "unit": "Backend", "designation": "TEAM LEADER", "amount": 20000.0, "objectId": "691e9d24164751f6ae6a30b5", "phone": "7042124866", "isActive": true},
  {"row": 15, "employeeId": "RM-0119", "name": "Nikita Nikki", "sheetName": "Nikita Nikki", "altName": "", "unit": "Backend", "designation": "TEAM LEADER", "amount": 17977.42, "objectId": "691e9d24164751f6ae6a30c5", "phone": "8750887588", "isActive": true},
  {"row": 16, "employeeId": "RM-0120", "name": "Nikita Yadav", "sheetName": "Nikita Yadav", "altName": "", "unit": "Backend", "designation": "TEAM LEADER", "amount": 20000.0, "objectId": "691e9d24164751f6ae6a30b8", "phone": "9821574518", "isActive": true},
  {"row": 17, "employeeId": "RM-0122", "name": "KHUSHI", "sheetName": "KHUSHI", "altName": "Khushi Afterservice", "unit": "Backend", "designation": "CUSTOMER SUPPORT", "amount": 20000.0, "objectId": "691e9d24164751f6ae6a30cc", "phone": "9643230280", "isActive": true},
  {"row": 18, "employeeId": "RM-0126", "name": "Sushma", "sheetName": "Sushma", "altName": "", "unit": "Backend", "designation": "AFTER SERVICE", "amount": 15000.0, "objectId": "696e2320087dc6cc2d103f17", "phone": "9971381020", "isActive": true},
  {"row": 19, "employeeId": "RM-0134", "name": "Himanshi", "sheetName": "Himanshi", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 14758.06, "objectId": "6a8973aab669227e5fa56760", "phone": "9718299194", "isActive": true},
  {"row": 20, "employeeId": "RM-0138", "name": "Anjali singh", "sheetName": "Anjali singh", "altName": "", "unit": "Backend", "designation": "TEAM LEADER", "amount": 20000.0, "objectId": "691e9d24164751f6ae6a30c2", "phone": "7303878190", "isActive": true},
  {"row": 21, "employeeId": "RM-0141", "name": "Tulsi", "sheetName": "Tulsi", "altName": "", "unit": "Backend", "designation": "HR RECRUITER", "amount": 13735.6, "objectId": "6a8973aab669227e5fa56761", "phone": "9217188694", "isActive": true},
  {"row": 22, "employeeId": "RM-0144", "name": "Vipin Singh", "sheetName": "Vipin Singh", "altName": "", "unit": "Backend", "designation": "DIGITAL MARKETER", "amount": 28500.0, "objectId": "6a8973aab669227e5fa56762", "phone": "7042919593", "isActive": true},
  {"row": 23, "employeeId": "RM-0145", "name": "Shubham Chitransh", "sheetName": "Shubham Chitransh", "altName": "", "unit": "Backend", "designation": "HR GENERALIST", "amount": 35000.0, "objectId": "6a8842144f9e384454479956", "phone": "7766839176", "isActive": true},
  {"row": 24, "employeeId": "270", "name": "KIRAN", "sheetName": "KIRAN", "altName": "Kiran Sharma", "unit": "Backend", "designation": "NURSHING", "amount": 14709.68, "objectId": "691e9d24164751f6ae6a3126", "phone": "8750116723", "isActive": true},
  {"row": 25, "employeeId": "275", "name": "LUCKY", "sheetName": "LUCKY", "altName": "Lucky Tanwar", "unit": "Backend", "designation": "TELECALLER", "amount": 14416.13, "objectId": "691e9d24164751f6ae6a30c9", "phone": "7217767823", "isActive": true},
  {"row": 26, "employeeId": "290", "name": "BEAUTY CHAUDHARY", "sheetName": "BEAUTY CHAUDHARY", "altName": "Beauty Chodhery", "unit": "Backend", "designation": "TELECALLER", "amount": 15000.0, "objectId": "691e9d24164751f6ae6a30a6", "phone": "9717674612", "isActive": true},
  {"row": 27, "employeeId": "305", "name": "SACHIN KUMAR", "sheetName": "SACHIN KUMAR", "altName": "", "unit": "Backend", "designation": "FULL STACK DEVELOPER", "amount": 40000.0, "objectId": "6a8973aab669227e5fa56764", "phone": "8287037611", "isActive": true},
  {"row": 28, "employeeId": "345", "name": "RAHUL VASHISHTA", "sheetName": "RAHUL VASHISHTA", "altName": "", "unit": "Backend", "designation": "CEO", "amount": 85000.0, "objectId": "6a8973abb669227e5fa56765", "phone": "8766334717", "isActive": true},
  {"row": 29, "employeeId": "364", "name": "JANVI GUPTA", "sheetName": "JANVI GUPTA", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 16000.0, "objectId": "691e9d24164751f6ae6a30dd", "phone": "9958530105", "isActive": true},
  {"row": 30, "employeeId": "373", "name": "ANJALI MATHUR", "sheetName": "ANJALI MATHUR", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 12900.0, "objectId": "691e9d24164751f6ae6a30c6", "phone": "", "isActive": true},
  {"row": 31, "employeeId": "426", "name": "ANISH CHAUHAN", "sheetName": "ANISH CHAUHAN", "altName": "", "unit": "Backend", "designation": "OFFICE BOY", "amount": 14258.07, "objectId": "6a8842154f9e38445447997b", "phone": "8851050270", "isActive": true},
  {"row": 32, "employeeId": "432", "name": "RINKI YADAV", "sheetName": "RINKI YADAV", "altName": "Rinky", "unit": "Backend", "designation": "TELECALLER", "amount": 16000.0, "objectId": "691e9d24164751f6ae6a30aa", "phone": "9335355889", "isActive": true},
  {"row": 33, "employeeId": "477", "name": "MANISHA KUMARI", "sheetName": "MANISHA KUMARI", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 12580.65, "objectId": "696e22b0087dc6cc2d103f10", "phone": "8287178328", "isActive": true},
  {"row": 34, "employeeId": "512", "name": "Sheetal Rathour", "sheetName": "Sheetal Rathour", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 13000.0, "objectId": "691e9d24164751f6ae6a30cf", "phone": "9354232491", "isActive": true},
  {"row": 35, "employeeId": "515", "name": "Sant Vijiy", "sheetName": "Sant Vijiy", "altName": "", "unit": "Backend", "designation": "MEDICINE", "amount": 4064.52, "objectId": "6a8842154f9e384454479970", "phone": "9990622469", "isActive": true},
  {"row": 36, "employeeId": "541", "name": "Shaifali", "sheetName": "Shaifali", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 13000.0, "objectId": "691e9d24164751f6ae6a30ac", "phone": "9205049061", "isActive": true},
  {"row": 37, "employeeId": "543", "name": "Anjali Sharma", "sheetName": "Anjali Sharma", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 12580.65, "objectId": "691e9d24164751f6ae6a30d1", "phone": "9354003546", "isActive": true},
  {"row": 38, "employeeId": "547", "name": "Farheen Ansari", "sheetName": "Farheen Ansari", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 16351.61, "objectId": "691e9d24164751f6ae6a30d2", "phone": "7056457004", "isActive": true},
  {"row": 39, "employeeId": "550", "name": "Jassica", "sheetName": "Jassica", "altName": "", "unit": "Backend", "designation": "RECEPTIONIST", "amount": 12645.08, "objectId": "6a8842144f9e384454479964", "phone": "8860257729", "isActive": true},
  {"row": 40, "employeeId": "552", "name": "Nitika", "sheetName": "Nitika", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 14567.74, "objectId": "691e9d24164751f6ae6a30bc", "phone": "7827900974", "isActive": true},
  {"row": 41, "employeeId": "559", "name": "Muskan Sharma", "sheetName": "Muskan Sharma", "altName": "Mushkan Sharma - External", "unit": "Backend", "designation": "TEAM LEADER", "amount": 19700.0, "objectId": "691e9d24164751f6ae6a30d3", "phone": "8527541877", "isActive": true},
  {"row": 42, "employeeId": "576", "name": "Himanshu Verma", "sheetName": "Himanshu Verma", "altName": "", "unit": "Backend", "designation": "TEAM LEADER", "amount": 19458.03, "objectId": "691e9d24164751f6ae6a30ae", "phone": "9212131233", "isActive": true},
  {"row": 43, "employeeId": "579", "name": "Khushbu Mathur", "sheetName": "Khushbu Mathur", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 12600.0, "objectId": "691e9d24164751f6ae6a30be", "phone": "9318481377", "isActive": true},
  {"row": 44, "employeeId": "583", "name": "Palak Singh", "sheetName": "Palak Singh", "altName": "", "unit": "Backend", "designation": "RECEPTIONIST", "amount": 13000.0, "objectId": "6a8973abb669227e5fa56766", "phone": "9643694314", "isActive": true},
  {"row": 45, "employeeId": "584", "name": "Shama Nilofar", "sheetName": "Shama Nilofar", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 14900.0, "objectId": "6a8973abb669227e5fa56767", "phone": "9310954658", "isActive": true},
  {"row": 46, "employeeId": "615", "name": "Sufiyan", "sheetName": "Sufiyan", "altName": "", "unit": "Backend", "designation": "BDE", "amount": 24596.77, "objectId": "6a8842164f9e3844544799a3", "phone": "7037170762", "isActive": true},
  {"row": 47, "employeeId": "621", "name": "Himanshi Kaushik", "sheetName": "Himanshi Kaushik", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 14000.0, "objectId": "691e9d24164751f6ae6a30e6", "phone": "8882750475", "isActive": true},
  {"row": 48, "employeeId": "628", "name": "Rajesh Sahu", "sheetName": "Rajesh Sahu", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 12700.0, "objectId": "691e9d24164751f6ae6a30e8", "phone": "8743833878", "isActive": true},
  {"row": 49, "employeeId": "637", "name": "Annu Kumari", "sheetName": "Annu Kumari", "altName": "", "unit": "Backend", "designation": "HOUSE KEEPING", "amount": 10451.61, "objectId": "6a8973abb669227e5fa56768", "phone": "9310019584", "isActive": true},
  {"row": 50, "employeeId": "650", "name": "Himanshi Chouhan", "sheetName": "Himanshi Chouhan", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 15000.0, "objectId": "6a8973abb669227e5fa56769", "phone": "9310517194", "isActive": true},
  {"row": 51, "employeeId": "659", "name": "Muskan Sayed", "sheetName": "Muskan Sayed", "altName": "Hr Muskan", "unit": "Backend", "designation": "HR RECRUITER", "amount": 4216.13, "objectId": "69bd264a9777c5b4424121d9", "phone": "9667970342", "isActive": true},
  {"row": 52, "employeeId": "671", "name": "Ankit Gaur", "sheetName": "Ankit Gaur", "altName": "", "unit": "Backend", "designation": "Trainer", "amount": 14416.1, "objectId": "696e24cb0112a894890ae020", "phone": "7827241534", "isActive": true},
  {"row": 53, "employeeId": "672", "name": "Mansi Gupta", "sheetName": "Mansi Gupta", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 12900.0, "objectId": "696e24e70112a894890ae024", "phone": "9899910359", "isActive": true},
  {"row": 54, "employeeId": "679", "name": "Ayushi", "sheetName": "Ayushi", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 12000.0, "objectId": "697f4098bf69b1889ad77a5e", "phone": "9217453055", "isActive": true},
  {"row": 55, "employeeId": "690", "name": "Priyam Bhuteja", "sheetName": "Priyam Bhuteja", "altName": "", "unit": "Backend", "designation": "DOCTOR", "amount": 7806.45, "objectId": "6944f9f29bf2fb764f00e50c", "phone": "8076676431", "isActive": true},
  {"row": 56, "employeeId": "696", "name": "Lavanya Thapa", "sheetName": "Lavanya Thapa (Inactive)", "altName": "Lavanya Thapa", "unit": "Backend", "designation": "TELECALLER", "amount": 4158.06, "objectId": "6a8973abb669227e5fa5676b", "phone": "9266865966", "isActive": false},
  {"row": 57, "employeeId": "699", "name": "Arman Malik", "sheetName": "Arman Malik", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 13700.0, "objectId": "696e25fa0112a894890ae034", "phone": "7982653957", "isActive": true},
  {"row": 58, "employeeId": "700", "name": "Ayush Srivavastav", "sheetName": "Ayush Srivavastav", "altName": "Ayush srivastav", "unit": "Backend", "designation": "TELECALLER", "amount": 13000.0, "objectId": "696e26560112a894890ae03b", "phone": "8595382355", "isActive": true},
  {"row": 59, "employeeId": "702", "name": "Simranjeet Kaur", "sheetName": "Simranjeet Kaur", "altName": "Simran Kaur", "unit": "Backend", "designation": "TELECALLER", "amount": 14451.61, "objectId": "6a8973abb669227e5fa5676f", "phone": "9818967992", "isActive": true},
  {"row": 60, "employeeId": "703", "name": "Manmeet Singh", "sheetName": "Manmeet Singh", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 14032.26, "objectId": "6a8973abb669227e5fa5676c", "phone": "7827692262", "isActive": true},
  {"row": 61, "employeeId": "732", "name": "Ashu", "sheetName": "Ashu", "altName": "", "unit": "Backend", "designation": "TEAM LEADER", "amount": 30000.0, "objectId": "691e9d24164751f6ae6a30b9", "phone": "7838699102", "isActive": true},
  {"row": 62, "employeeId": "740", "name": "Harsh Kumar", "sheetName": "Harsh Kumar", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 13000.0, "objectId": "6a8973abb669227e5fa5676e", "phone": "9990647635", "isActive": true},
  {"row": 63, "employeeId": "809", "name": "Simran Kaur", "sheetName": "Simran Kaur", "altName": "", "unit": "Backend", "designation": "HR RECRUITER", "amount": 14274.19, "objectId": "69bd25df9777c5b4424121c1", "phone": "9818967992", "isActive": true},
  {"row": 64, "employeeId": "814", "name": "Meenu", "sheetName": "Meenu", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 14400.0, "objectId": "69d4999b09c2c5ec77bca413", "phone": "9667901689", "isActive": true},
  {"row": 65, "employeeId": "830", "name": "Harshita Sharma", "sheetName": "Harshita Sharma", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 13000.0, "objectId": "6a8973abb669227e5fa56773", "phone": "8287282774", "isActive": true},
  {"row": 66, "employeeId": "831", "name": "Kiran Sharma", "sheetName": "Kiran Sharma", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 11161.29, "objectId": "6a8973abb669227e5fa56774", "phone": "8750116723", "isActive": true},
  {"row": 67, "employeeId": "842", "name": "Jyoti Kumari", "sheetName": "Jyoti Kumari", "altName": "Jyoti Kumari Telecaller", "unit": "Backend", "designation": "TELECALLER", "amount": 11895.16, "objectId": "6a8c181bee9e5d234c0282a7", "phone": "4561237890", "isActive": true},
  {"row": 68, "employeeId": "843", "name": "Bindu Kumari", "sheetName": "Bindu Kumari", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 12300.0, "objectId": "6a8973abb669227e5fa56775", "phone": "8287116552", "isActive": true},
  {"row": 69, "employeeId": "844", "name": "Leeza", "sheetName": "Leeza (Inactive)", "altName": "Leeza", "unit": "Backend", "designation": "TELECALLER", "amount": 2516.13, "objectId": "6a8842164f9e384454479999", "phone": "8178091651", "isActive": false},
  {"row": 70, "employeeId": "845", "name": "Sudhanshu Sharma", "sheetName": "Sudhanshu Sharma", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 15000.0, "objectId": "6a8973abb669227e5fa56776", "phone": "9558054826", "isActive": true},
  {"row": 71, "employeeId": "850", "name": "Harsha", "sheetName": "Harsha", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 12380.65, "objectId": "6a8842164f9e384454479991", "phone": "7982325787", "isActive": true},
  {"row": 72, "employeeId": "863", "name": "Bhoomika Mehta", "sheetName": "Bhoomika Mehta", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 12193.55, "objectId": "6a8842164f9e38445447998e", "phone": "9717067547", "isActive": true},
  {"row": 73, "employeeId": "864", "name": "Nandni", "sheetName": "Nandni", "altName": "", "unit": "Backend", "designation": "SEO Executive", "amount": 10613.0, "objectId": "6a8842144f9e384454479952", "phone": "8882861940", "isActive": true},
  {"row": 74, "employeeId": "872", "name": "Babita Negi", "sheetName": "Babita Negi", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 13000.0, "objectId": "6a8973abb669227e5fa56777", "phone": "9999224629", "isActive": true},
  {"row": 75, "employeeId": "876", "name": "Sneha Yadav", "sheetName": "Sneha Yadav (Inactive)", "altName": "Sneha", "unit": "Backend", "designation": "TELECALLER", "amount": 1258.06, "objectId": "691ea6bc164751f6ae6a318b", "phone": "9873024842", "isActive": false},
  {"row": 76, "employeeId": "878", "name": "Chandani", "sheetName": "Chandani", "altName": "", "unit": "Backend", "designation": "AFTER SERVICE", "amount": 12580.5, "objectId": "6a8842164f9e38445447998f", "phone": "8882871446", "isActive": true},
  {"row": 77, "employeeId": "886", "name": "Vidit", "sheetName": "Vidit (Inactive)", "altName": "Vidit", "unit": "Backend", "designation": "TELECALLER", "amount": 9958.06, "objectId": "6a8842164f9e3844544799a8", "phone": "9999154046", "isActive": false},
  {"row": 78, "employeeId": "889", "name": "Praveen", "sheetName": "Praveen", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 13148.39, "objectId": "6a8842164f9e38445447999e", "phone": "9958331811", "isActive": true},
  {"row": 79, "employeeId": "895", "name": "Gautam Pawar", "sheetName": "Gautam Pawar", "altName": "", "unit": "Backend", "designation": "STORE MANAGER", "amount": 3548.39, "objectId": "6a8973abb669227e5fa5677b", "phone": "9097461326", "isActive": true},
  {"row": 80, "employeeId": "897", "name": "Prabhjot", "sheetName": "Prabhjot", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 13800.0, "objectId": "6a8842164f9e38445447999d", "phone": "7835904952", "isActive": true},
  {"row": 81, "employeeId": "916", "name": "Lalbabu Kumar", "sheetName": "Lalbabu Kumar", "altName": "", "unit": "Backend", "designation": "MIS", "amount": 15000.0, "objectId": "6a8973abb669227e5fa5677f", "phone": "9667281607", "isActive": true},
  {"row": 82, "employeeId": "921", "name": "Lovely", "sheetName": "Lovely", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 13322.58, "objectId": "6a8842164f9e38445447999a", "phone": "8766268660", "isActive": true},
  {"row": 83, "employeeId": "922", "name": "Nancy Pateriaya", "sheetName": "Nancy Pateriaya", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 13900.0, "objectId": "6a8842164f9e38445447999c", "phone": "7580992054", "isActive": true},
  {"row": 84, "employeeId": "926", "name": "Priya Kumari", "sheetName": "Priya Kumari", "altName": "", "unit": "Backend", "designation": "HR RECRUITER", "amount": 15000.0, "objectId": "6a8973abb669227e5fa56780", "phone": "7678530427", "isActive": true},
  {"row": 85, "employeeId": "928", "name": "Hasad", "sheetName": "Hasad (Inactive)", "altName": "Hasad", "unit": "Backend", "designation": "TELECALLER", "amount": 2096.77, "objectId": "6a8973abb669227e5fa56781", "phone": "7982854287", "isActive": false},
  {"row": 86, "employeeId": "929", "name": "Jyoti", "sheetName": "Jyoti", "altName": "Jyoti", "unit": "Backend", "designation": "HOUSE KEEPING", "amount": 12000.0, "objectId": "6a8973aeb669227e5fa567b9", "phone": "8572025304", "isActive": true},
  {"row": 87, "employeeId": "933", "name": "Nitish Yadav", "sheetName": "Nitish Yadav (Inactive)", "altName": "Nitish Yadav", "unit": "Backend", "designation": "TELECALLER", "amount": 6532.26, "objectId": "6a8973abb669227e5fa56782", "phone": "8882534458", "isActive": false},
  {"row": 88, "employeeId": "934", "name": "Vansh Kumar", "sheetName": "Vansh Kumar", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 10438.71, "objectId": "6a8973abb669227e5fa56783", "phone": "9718688350", "isActive": true},
  {"row": 89, "employeeId": "935", "name": "Nisha Rajput", "sheetName": "Nisha Rajput", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 13432.26, "objectId": "6a8973acb669227e5fa56784", "phone": "8287377747", "isActive": true},
  {"row": 90, "employeeId": "949", "name": "Khushboo", "sheetName": "Khushboo", "altName": "Khushboo Telecaller", "unit": "Backend", "designation": "TELECALLER", "amount": 11600.0, "objectId": "6a8c19efee9e5d234c0282aa", "phone": "9874563210", "isActive": true},
  {"row": 91, "employeeId": "954", "name": "Ashu Kumar", "sheetName": "Ashu Kumar", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 13500.0, "objectId": "6a8973acb669227e5fa5678a", "phone": "7703900134", "isActive": true},
  {"row": 92, "employeeId": "957", "name": "Shubhangi", "sheetName": "Shubhangi (Inactive)", "altName": "Shubhangi", "unit": "Backend", "designation": "TELECALLER", "amount": 5848.39, "objectId": "6a8973acb669227e5fa5678b", "phone": "8076577693", "isActive": false},
  {"row": 93, "employeeId": "958", "name": "Sakshi Saroj", "sheetName": "Sakshi Saroj (Inactive)", "altName": "Sakshi Saroj", "unit": "Backend", "designation": "TELECALLER", "amount": 4258.06, "objectId": "6a8973acb669227e5fa5678c", "phone": "9289121830", "isActive": false},
  {"row": 94, "employeeId": "961", "name": "Isha Chandel", "sheetName": "Isha Chandel", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 13674.19, "objectId": "6a8842164f9e384454479993", "phone": "9717892623", "isActive": true},
  {"row": 95, "employeeId": "962", "name": "Sandhya Maurya", "sheetName": "Sandhya Maurya", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 13022.58, "objectId": "6a8973acb669227e5fa5678f", "phone": "9076757393", "isActive": true},
  {"row": 96, "employeeId": "964", "name": "Bharat Goswami", "sheetName": "Bharat Goswami", "altName": "", "unit": "Backend", "designation": "Assistant general manager (Operation & Sales)", "amount": 90322.68, "objectId": "691e9d24164751f6ae6a30a9", "phone": "8527193995", "isActive": true},
  {"row": 97, "employeeId": "965", "name": "Sushant Choudhary", "sheetName": "Sushant Choudhary", "altName": "", "unit": "Backend", "designation": "Director", "amount": 130000.0, "objectId": "6a8842164f9e3844544799a4", "phone": "8287443498", "isActive": true},
  {"row": 98, "employeeId": "966", "name": "Md Ayan", "sheetName": "Md Ayan (Inactive)", "altName": "Md Ayan", "unit": "Backend", "designation": "TELECALLER", "amount": 771.48, "objectId": "6a8973acb669227e5fa56791", "phone": "8810517020", "isActive": false},
  {"row": 99, "employeeId": "968", "name": "Ankit Pratap", "sheetName": "Ankit Pratap (Inactive)", "altName": "Ankit Pratap", "unit": "Backend", "designation": "TELECALLER", "amount": 0.0, "objectId": "6a8973acb669227e5fa56793", "phone": "8376020072", "isActive": false},
  {"row": 100, "employeeId": "969", "name": "Deepak", "sheetName": "Deepak", "altName": "", "unit": "Backend", "designation": "MIS Executive", "amount": 18500.0, "objectId": "6a8973acb669227e5fa56794", "phone": "9818810898", "isActive": true},
  {"row": 101, "employeeId": "976", "name": "Devraj", "sheetName": "Devraj (Inactive)", "altName": "Devraj", "unit": "Backend", "designation": "TELECALLER", "amount": 5890.32, "objectId": "691e9d24164751f6ae6a30e4", "phone": "9953365762", "isActive": false},
  {"row": 102, "employeeId": "979", "name": "Dr Rithika Shaw", "sheetName": "Dr Rithika Shaw", "altName": "", "unit": "Backend", "designation": "BDS Doctor", "amount": 25000.0, "objectId": "6a8842144f9e384454479961", "phone": "8697444936", "isActive": true},
  {"row": 103, "employeeId": "983", "name": "Aman Patwal", "sheetName": "Aman Patwal", "altName": "", "unit": "Backend", "designation": "FULL STACK DEVELOPER", "amount": 23393.55, "objectId": "6a8842144f9e384454479951", "phone": "9711180932", "isActive": true},
  {"row": 104, "employeeId": "984", "name": "Anuruddh pratap patel", "sheetName": "Anuruddh pratap patel", "altName": "", "unit": "Backend", "designation": "Counsultant", "amount": 16500.0, "objectId": "6a8842144f9e38445447995b", "phone": "7489056299", "isActive": true},
  {"row": 105, "employeeId": "989", "name": "Santoshi Kumari", "sheetName": "Santoshi Kumari", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 11900.0, "objectId": "6a8973adb669227e5fa5679d", "phone": "9354973704", "isActive": true},
  {"row": 106, "employeeId": "997", "name": "Manisha", "sheetName": "Manisha", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 13400.0, "objectId": "6a8973adb669227e5fa5679e", "phone": "9811547639", "isActive": true},
  {"row": 107, "employeeId": "998", "name": "Anuj", "sheetName": "Anuj", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 13000.0, "objectId": "6a8973adb669227e5fa5679f", "phone": "7835851136", "isActive": true},
  {"row": 108, "employeeId": "999", "name": "Prachi", "sheetName": "Prachi", "altName": "Prachi", "unit": "Backend", "designation": "TELECALLER", "amount": 13400.0, "objectId": "6a8973adb669227e5fa567a0", "phone": "8595957402", "isActive": true},
  {"row": 109, "employeeId": "1006", "name": "Rashi", "sheetName": "Rashi", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 12900.0, "objectId": "6a8842164f9e3844544799a0", "phone": "8448747204", "isActive": true},
  {"row": 110, "employeeId": "1007", "name": "Lakshman", "sheetName": "Lakshman", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 15100.0, "objectId": "6a8842164f9e384454479998", "phone": "9311218921", "isActive": true},
  {"row": 111, "employeeId": "1008", "name": "Kirti", "sheetName": "Kirti (Inactive)", "altName": "Kirti", "unit": "Backend", "designation": "TELECALLER", "amount": 11290.32, "objectId": "6a8842164f9e384454479996", "phone": "8130953354", "isActive": false},
  {"row": 112, "employeeId": "1011", "name": "Nisha Koli", "sheetName": "Nisha Koli (Inactive)", "altName": "Nisha Koli", "unit": "Backend", "designation": "TELECALLER", "amount": 8903.23, "objectId": "6a8973adb669227e5fa567a3", "phone": "9354955331", "isActive": false},
  {"row": 113, "employeeId": "1013", "name": "Tannu", "sheetName": "Tannu (Inactive)", "altName": "Tannu", "unit": "Backend", "designation": "TELECALLER", "amount": 10393.55, "objectId": "6a8842164f9e3844544799a5", "phone": "9821920433", "isActive": false},
  {"row": 114, "employeeId": "1014", "name": "Abhishek", "sheetName": "Abhishek", "altName": "Abhishek", "unit": "Backend", "designation": "TELECALLER", "amount": 11641.94, "objectId": "6a8973adb669227e5fa567a4", "phone": "9634938655", "isActive": true},
  {"row": 115, "employeeId": "1015", "name": "Kashish Waris", "sheetName": "Kashish Waris", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 11222.58, "objectId": "6a8842164f9e384454479995", "phone": "8851498657", "isActive": true},
  {"row": 116, "employeeId": "1016", "name": "Manisha Negi", "sheetName": "Manisha Negi", "altName": "", "unit": "Backend", "designation": "SALES MANAGER", "amount": 36129.03, "objectId": "6a8973adb669227e5fa567a5", "phone": "9643296140", "isActive": true},
  {"row": 117, "employeeId": "1020", "name": "Poonam", "sheetName": "Poonam", "altName": "Poonam", "unit": "Backend", "designation": "TELECALLER", "amount": 14158.06, "objectId": "6944f03a71989d90c05707fb", "phone": "9311975648", "isActive": true},
  {"row": 118, "employeeId": "1021", "name": "Farha", "sheetName": "Farha", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 12480.65, "objectId": "6a8842164f9e384454479990", "phone": "9873533636", "isActive": true},
  {"row": 119, "employeeId": "1023", "name": "Mohd Kaif", "sheetName": "Mohd Kaif", "altName": "", "unit": "Backend", "designation": "AFTER SERVICE", "amount": 12280.65, "objectId": "6a8842164f9e38445447999b", "phone": "8700495134", "isActive": true},
  {"row": 120, "employeeId": "1026", "name": "Rukhsar", "sheetName": "Rukhsar", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 13000.0, "objectId": "6a8842164f9e3844544799a1", "phone": "8860733585", "isActive": true},
  {"row": 121, "employeeId": "1028", "name": "Tannushri", "sheetName": "Tannushri", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 12600.0, "objectId": "6a8842164f9e3844544799a6", "phone": "8285520882", "isActive": true},
  {"row": 122, "employeeId": "1035", "name": "Aadil", "sheetName": "Aadil", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 12445.16, "objectId": "6a8842164f9e38445447998d", "phone": "8700831937", "isActive": true},
  {"row": 123, "employeeId": "1036", "name": "Kartik Kaushal", "sheetName": "Kartik Kaushal", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 14900.0, "objectId": "6a8842164f9e384454479994", "phone": "9311079177", "isActive": true},
  {"row": 124, "employeeId": "1037", "name": "Krishna", "sheetName": "Krishna", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 12764.52, "objectId": "6a8842164f9e384454479997", "phone": "9718327207", "isActive": true},
  {"row": 125, "employeeId": "1041", "name": "Sakshi Bhardwaj", "sheetName": "Sakshi Bhardwaj", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 9864.52, "objectId": "6a8842164f9e3844544799a2", "phone": "8796651068", "isActive": true},
  {"row": 126, "employeeId": "1042", "name": "Kunal Sharma", "sheetName": "Kunal Sharma", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 10603.23, "objectId": "", "phone": "", "isActive": true},
  {"row": 127, "employeeId": "1043", "name": "Yashika", "sheetName": "Yashika", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 10174.19, "objectId": "", "phone": "", "isActive": true},
  {"row": 128, "employeeId": "1044", "name": "Shivani Mishra", "sheetName": "Shivani Mishra (Inactive)", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 9190.32, "objectId": "", "phone": "", "isActive": false},
  {"row": 129, "employeeId": "1045", "name": "Aditya", "sheetName": "Aditya", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 10293.55, "objectId": "", "phone": "", "isActive": true},
  {"row": 130, "employeeId": "1048", "name": "Anjali Sahu", "sheetName": "Anjali Sahu (Inactive)", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 2096.77, "objectId": "", "phone": "", "isActive": false},
  {"row": 131, "employeeId": "1050", "name": "Priyanka", "sheetName": "Priyanka (Inactive)", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 2096.77, "objectId": "", "phone": "", "isActive": false},
  {"row": 132, "employeeId": "1051", "name": "Jyoti", "sheetName": "Jyoti", "altName": "Jyoti Kumari Telecaller", "unit": "Backend", "designation": "TELECALLER", "amount": 8387.1, "objectId": "691e9d24164751f6ae6a30c0", "phone": "4561237890", "isActive": true},
  {"row": 133, "employeeId": "1052", "name": "Hemant", "sheetName": "Hemant", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 9480.65, "objectId": "6a8842164f9e384454479992", "phone": "7011838711", "isActive": true},
  {"row": 134, "employeeId": "1053", "name": "Prachi Kumari", "sheetName": "Prachi Kumari", "altName": "Prachi", "unit": "Backend", "designation": "TELECALLER", "amount": 7338.71, "objectId": "6944f4d26351226e5001ad4e", "phone": "8595957402", "isActive": true},
  {"row": 135, "employeeId": "1054", "name": "Naziya", "sheetName": "Naziya", "altName": "", "unit": "Backend", "designation": "HR RECRUITER", "amount": 9225.7, "objectId": "6a8842144f9e384454479955", "phone": "6397841469", "isActive": true},
  {"row": 136, "employeeId": "1055", "name": "Farhin Gul", "sheetName": "Farhin Gul", "altName": "", "unit": "Backend", "designation": "HR RECRUITER", "amount": 9225.7, "objectId": "6a8842144f9e384454479954", "phone": "8920218078", "isActive": true},
  {"row": 137, "employeeId": "1059", "name": "Subhan Ali", "sheetName": "Subhan Ali (Inactive)", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 1806.45, "objectId": "", "phone": "", "isActive": false},
  {"row": 138, "employeeId": "1060", "name": "Rishab", "sheetName": "Rishab", "altName": "Rishabh Sonker", "unit": "Backend", "designation": "TELECALLER", "amount": 1806.45, "objectId": "6a589e385b712bcdd080d964", "phone": "7054049997", "isActive": true},
  {"row": 139, "employeeId": "1061", "name": "Shalu Rathore", "sheetName": "Shalu Rathore", "altName": "", "unit": "Backend", "designation": "accountant", "amount": 4903.23, "objectId": "", "phone": "", "isActive": true},
  {"row": 140, "employeeId": "1063", "name": "Shivam", "sheetName": "Shivam", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 6532.26, "objectId": "691ea954164751f6ae6a31bf", "phone": "9990143183", "isActive": true},
  {"row": 141, "employeeId": "1064", "name": "Veenit Kumar", "sheetName": "Veenit Kumar", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 6290.32, "objectId": "", "phone": "", "isActive": true},
  {"row": 142, "employeeId": "1065", "name": "Prachi", "sheetName": "Prachi", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 1209.68, "objectId": "", "phone": "", "isActive": true},
  {"row": 143, "employeeId": "1066", "name": "Tannnu Nirwan", "sheetName": "Tannnu Nirwan", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 1258.06, "objectId": "", "phone": "", "isActive": true},
  {"row": 144, "employeeId": "1067", "name": "Shashank Chauhan", "sheetName": "Shashank Chauhan", "altName": "", "unit": "Backend", "designation": "TELECALLER", "amount": 419.35, "objectId": "", "phone": "", "isActive": true},
  {"row": 145, "employeeId": "1070", "name": "Kannu", "sheetName": "Kannu", "altName": "", "unit": "Backend", "designation": "HR RECRUITER", "amount": 774.19, "objectId": "", "phone": "", "isActive": true},
  {"row": 146, "employeeId": "1071", "name": "Chirag Suri", "sheetName": "Chirag Suri", "altName": "", "unit": "Backend", "designation": "SALES MANAGER", "amount": 8064.52, "objectId": "", "phone": "", "isActive": true},
  {"row": 147, "employeeId": "1079", "name": "Sunil Kumar", "sheetName": "Sunil Kumar", "altName": "", "unit": "Backend", "designation": "OFFICE BOY", "amount": 1806.45, "objectId": "", "phone": "", "isActive": true},
  {"row": 148, "employeeId": "RM-0003", "name": "ABDUL", "sheetName": "ABDUL", "altName": "", "unit": "Vaishali", "designation": "PRP", "amount": 18000.0, "objectId": "6a8842154f9e384454479985", "phone": "7235029269", "isActive": true},
  {"row": 149, "employeeId": "RM-0151", "name": "SHIVAM RAI", "sheetName": "SHIVAM RAI", "altName": "", "unit": "Vaishali", "designation": "OT STAFF", "amount": 11129.03, "objectId": "691e9d24164751f6ae6a3121", "phone": "7838826632", "isActive": true},
  {"row": 150, "employeeId": "RM-0154", "name": "DURGESH GUPTA", "sheetName": "DURGESH GUPTA", "altName": "", "unit": "Vaishali", "designation": "OT STAFF", "amount": 15000.0, "objectId": "691e9d24164751f6ae6a310d", "phone": "9289147963", "isActive": true},
  {"row": 151, "employeeId": "RM-0155", "name": "VAASHU", "sheetName": "VAASHU", "altName": "", "unit": "Vaishali", "designation": "IMPLANTER", "amount": 35000.0, "objectId": "691e9d24164751f6ae6a310e", "phone": "9999216811", "isActive": true},
  {"row": 152, "employeeId": "RM-0156", "name": "AMIT KUMAR", "sheetName": "AMIT KUMAR", "altName": "", "unit": "Vaishali", "designation": "IMPLANTER", "amount": 29032.26, "objectId": "691e9d24164751f6ae6a310f", "phone": "6283884492", "isActive": true},
  {"row": 153, "employeeId": "RM-0157", "name": "ARCHANA", "sheetName": "ARCHANA", "altName": "", "unit": "Vaishali", "designation": "IMPLANTER", "amount": 16258.06, "objectId": "691e9d24164751f6ae6a3110", "phone": "8076350538", "isActive": true},
  {"row": 154, "employeeId": "RM-0158", "name": "GUNJAN RAO", "sheetName": "GUNJAN RAO", "altName": "GUNJAN", "unit": "Vaishali", "designation": "IMPLANTER", "amount": 18000.0, "objectId": "691e9d24164751f6ae6a30ff", "phone": "9818697541", "isActive": true},
  {"row": 155, "employeeId": "RM-0159", "name": "RITIKA", "sheetName": "RITIKA", "altName": "", "unit": "Vaishali", "designation": "IMPLANTER", "amount": 16838.71, "objectId": "691e9d24164751f6ae6a3123", "phone": "8744080827", "isActive": true},
  {"row": 156, "employeeId": "RM-0165", "name": "NISHANT KUSHWAHA", "sheetName": "NISHANT KUSHWAHA", "altName": "", "unit": "Vaishali", "designation": "TECH", "amount": 67741.94, "objectId": "691e9d24164751f6ae6a30ea", "phone": "8171385980", "isActive": true},
  {"row": 157, "employeeId": "RM-0166", "name": "CHANDAN KUMAR", "sheetName": "CHANDAN KUMAR", "altName": "", "unit": "Vaishali", "designation": "IMPLANTER", "amount": 22580.65, "objectId": "691e9d24164751f6ae6a3100", "phone": "9334059199", "isActive": true},
  {"row": 158, "employeeId": "RM-0167", "name": "JATIN", "sheetName": "JATIN", "altName": "JATIN", "unit": "Vaishali", "designation": "IMPLANTER", "amount": 2903.23, "objectId": "691e9d24164751f6ae6a30eb", "phone": "8700130897", "isActive": true},
  {"row": 159, "employeeId": "RM-0173", "name": "SANJAY Kumar(old)", "sheetName": "SANJAY Kumar(old)", "altName": "", "unit": "Vaishali", "designation": "TECH", "amount": 70000.0, "objectId": "6a8973adb669227e5fa567a7", "phone": "7838010543", "isActive": true},
  {"row": 160, "employeeId": "RM-0175", "name": "PRITAM", "sheetName": "PRITAM", "altName": "", "unit": "Vaishali", "designation": "IMPLANTER", "amount": 19354.84, "objectId": "691e9d24164751f6ae6a30ed", "phone": "8824185718", "isActive": true},
  {"row": 161, "employeeId": "RM-0182", "name": "KHUSHBOO", "sheetName": "KHUSHBOO", "altName": "", "unit": "Vaishali", "designation": "OT STAFF", "amount": 13000.0, "objectId": "", "phone": "", "isActive": true},
  {"row": 162, "employeeId": "RM-0188", "name": "JYOTI kumari", "sheetName": "JYOTI kumari", "altName": "JYOTI Kumari", "unit": "Vaishali", "designation": "OT STAFF", "amount": 7451.61, "objectId": "691e9d24164751f6ae6a3103", "phone": "9355658634", "isActive": true},
  {"row": 163, "employeeId": "RM-0191", "name": "SANDHYA YADAV", "sheetName": "SANDHYA YADAV", "altName": "SANDHYA", "unit": "Vaishali", "designation": "OT STAFF", "amount": 12161.29, "objectId": "691e9d24164751f6ae6a3104", "phone": "9354051129", "isActive": true},
  {"row": 164, "employeeId": "RM-0194", "name": "DR Panav Talreja", "sheetName": "DR Panav Talreja", "altName": "", "unit": "Vaishali", "designation": "DOCTOR", "amount": 50806.45, "objectId": "6a990e6733e2fa93370da70d", "phone": "7896541593", "isActive": true},
  {"row": 165, "employeeId": "RM-0196", "name": "Yogesh Gupta", "sheetName": "Yogesh Gupta", "altName": "", "unit": "Vaishali", "designation": "OT STAFF", "amount": 11225.81, "objectId": "691e9d24164751f6ae6a3105", "phone": "9667499969", "isActive": true},
  {"row": 166, "employeeId": "RM-0209", "name": "PRAKASH KUMAR", "sheetName": "PRAKASH KUMAR (Inactive)", "altName": "PRAKASH KUMAR", "unit": "Vaishali", "designation": "TECH", "amount": 24516.13, "objectId": "691e9d24164751f6ae6a3116", "phone": "9958741076", "isActive": false},
  {"row": 167, "employeeId": "RM-0212", "name": "PANKAJ", "sheetName": "PANKAJ", "altName": "", "unit": "Vaishali", "designation": "TECH", "amount": 87096.77, "objectId": "691e9d24164751f6ae6a3107", "phone": "8958449464", "isActive": true},
  {"row": 168, "employeeId": "RM-0221", "name": "REETU", "sheetName": "REETU", "altName": "", "unit": "Vaishali", "designation": "OT STAFF", "amount": 15000.0, "objectId": "691e9d24164751f6ae6a3137", "phone": "9310157897", "isActive": true},
  {"row": 169, "employeeId": "RM-0235", "name": "SATYAM RAI", "sheetName": "SATYAM RAI", "altName": "", "unit": "Vaishali", "designation": "IMPLANTER", "amount": 20000.0, "objectId": "691e9d24164751f6ae6a3138", "phone": "9220129430", "isActive": true},
  {"row": 170, "employeeId": "RM-0248", "name": "VIKAS BAIRWA", "sheetName": "VIKAS BAIRWA", "altName": "", "unit": "Vaishali", "designation": "OT STAFF", "amount": 10161.29, "objectId": "691e9d24164751f6ae6a3133", "phone": "8058193092", "isActive": true},
  {"row": 171, "employeeId": "269", "name": "ANJALI CHOUDHARY", "sheetName": "ANJALI CHOUDHARY", "altName": "", "unit": "Vaishali", "designation": "OT STAFF", "amount": 14516.13, "objectId": "6a8c2e1e82a692f08a5cb6e1", "phone": "7456987426", "isActive": true},
  {"row": 172, "employeeId": "321", "name": "KAVITA BORA", "sheetName": "KAVITA BORA", "altName": "", "unit": "Vaishali", "designation": "CLINIC MANAGER", "amount": 20000.0, "objectId": "6a8842144f9e384454479950", "phone": "9582812921", "isActive": true},
  {"row": 173, "employeeId": "396", "name": "YASHVINDER SINGH", "sheetName": "YASHVINDER SINGH", "altName": "", "unit": "Vaishali", "designation": "OT STAFF", "amount": 12000.0, "objectId": "691e9d24164751f6ae6a3125", "phone": "8447001548", "isActive": true},
  {"row": 174, "employeeId": "444", "name": "UTKARSH", "sheetName": "UTKARSH", "altName": "", "unit": "Vaishali", "designation": "OT STAFF", "amount": 9354.84, "objectId": "691e9d24164751f6ae6a3112", "phone": "9319432592", "isActive": true},
  {"row": 175, "employeeId": "445", "name": "NITESH NIKKI", "sheetName": "NITESH NIKKI", "altName": "NITESH ( NIKKI)", "unit": "Vaishali", "designation": "TECHNICIAN", "amount": 7161.29, "objectId": "691e9d24164751f6ae6a3128", "phone": "9205069771", "isActive": true},
  {"row": 176, "employeeId": "598", "name": "Md Sarfaraz", "sheetName": "Md Sarfaraz", "altName": "", "unit": "Vaishali", "designation": "OT STAFF", "amount": 10000.0, "objectId": "691e9d24164751f6ae6a30f5", "phone": "9625670667", "isActive": true},
  {"row": 177, "employeeId": "605", "name": "Amaan Mirza", "sheetName": "Amaan Mirza", "altName": "", "unit": "Vaishali", "designation": "IMPLANTER", "amount": 35000.0, "objectId": "691e9d24164751f6ae6a3113", "phone": "9810334104", "isActive": true},
  {"row": 178, "employeeId": "610", "name": "Kamal Bairwa", "sheetName": "Kamal Bairwa", "altName": "", "unit": "Vaishali", "designation": "OT STAFF", "amount": 2258.06, "objectId": "691e9d24164751f6ae6a30f6", "phone": "8058892785", "isActive": true},
  {"row": 179, "employeeId": "661", "name": "Aachal Kanaujiya", "sheetName": "Aachal Kanaujiya", "altName": "", "unit": "Vaishali", "designation": "OT STAFF", "amount": 10467.78, "objectId": "6944f8dd9bf2fb764f00e4f4", "phone": "8423674383", "isActive": true},
  {"row": 180, "employeeId": "675", "name": "Suhail", "sheetName": "Suhail", "altName": "", "unit": "Vaishali", "designation": "OT STAFF", "amount": 645.16, "objectId": "6944f12671989d90c057080b", "phone": "9897854791", "isActive": true},
  {"row": 181, "employeeId": "705", "name": "Pushkar Chaudhary", "sheetName": "Pushkar Chaudhary", "altName": "", "unit": "Vaishali", "designation": "IMPLANTER", "amount": 16838.71, "objectId": "6a8973adb669227e5fa567a8", "phone": "9870581915", "isActive": true},
  {"row": 182, "employeeId": "714", "name": "NITIN", "sheetName": "NITIN", "altName": "", "unit": "Vaishali", "designation": "OT STAFF", "amount": 7862.9, "objectId": "6a8842154f9e38445447996a", "phone": "9958488965", "isActive": true},
  {"row": 183, "employeeId": "716", "name": "Mukesh Kushwaha", "sheetName": "Mukesh Kushwaha", "altName": "", "unit": "Vaishali", "designation": "OT STAFF", "amount": 8516.13, "objectId": "6a8973aeb669227e5fa567af", "phone": "7409698060", "isActive": true},
  {"row": 184, "employeeId": "734", "name": "Mansi Rai", "sheetName": "Mansi Rai", "altName": "", "unit": "Vaishali", "designation": "RECEPTIONIST", "amount": 14193.55, "objectId": "6a8973adb669227e5fa567a9", "phone": "8826310277", "isActive": true},
  {"row": 185, "employeeId": "766", "name": "Khushman Kumar", "sheetName": "Khushman Kumar", "altName": "", "unit": "Vaishali", "designation": "OT STAFF", "amount": 10000.0, "objectId": "6a8973adb669227e5fa567aa", "phone": "9988309081", "isActive": true},
  {"row": 186, "employeeId": "883", "name": "Samad Saifi", "sheetName": "Samad Saifi", "altName": "", "unit": "Vaishali", "designation": "IMPLANTER", "amount": 18000.0, "objectId": "6a8973aeb669227e5fa567ac", "phone": "7457880023", "isActive": true},
  {"row": 187, "employeeId": "991", "name": "Mohammad Nadeem", "sheetName": "Mohammad Nadeem", "altName": "", "unit": "Vaishali", "designation": "OT STAFF", "amount": 12000.0, "objectId": "6a8842154f9e384454479969", "phone": "8318789737", "isActive": true},
  {"row": 188, "employeeId": "992", "name": "Sayed Noman", "sheetName": "Sayed Noman", "altName": "", "unit": "Vaishali", "designation": "OT STAFF", "amount": 14032.26, "objectId": "6a8842154f9e384454479971", "phone": "9599259259", "isActive": true},
  {"row": 189, "employeeId": "993", "name": "Aman Kumar", "sheetName": "Aman Kumar", "altName": "AMAN OT", "unit": "Vaishali", "designation": "OT STAFF", "amount": 8322.58, "objectId": "6a9559e28785ee691591893c", "phone": "9517536859", "isActive": true},
  {"row": 190, "employeeId": "994", "name": "Sonali Kumari", "sheetName": "Sonali Kumari", "altName": "", "unit": "Vaishali", "designation": "OT STAFF", "amount": 11000.0, "objectId": "6a8973aeb669227e5fa567b1", "phone": "9304113956", "isActive": true},
  {"row": 191, "employeeId": "1025", "name": "Dr Sumedha Sagar", "sheetName": "Dr Sumedha Sagar", "altName": "", "unit": "Vaishali", "designation": "BDS Doctor", "amount": 29032.26, "objectId": "6a8973aeb669227e5fa567ad", "phone": "9818970672", "isActive": true},
  {"row": 192, "employeeId": "1062", "name": "Rahmatullah Nikbeen", "sheetName": "Rahmatullah Nikbeen", "altName": "", "unit": "Vaishali", "designation": "OT STAFF", "amount": 14225.82, "objectId": "", "phone": "", "isActive": true},
  {"row": 193, "employeeId": "RM-0022", "name": "SOYAL", "sheetName": "SOYAL", "altName": "", "unit": "Vaishali", "designation": "OT STAFF", "amount": 16000.0, "objectId": "6a8842144f9e384454479957", "phone": "9650233754", "isActive": true},
  {"row": 194, "employeeId": "1077", "name": "Urmila", "sheetName": "Urmila", "altName": "", "unit": "Vaishali", "designation": "Housekeeping", "amount": 11612.9, "objectId": "", "phone": "", "isActive": true},
  {"row": 195, "employeeId": "RM-0164", "name": "Sheetal Bhatiya", "sheetName": "Sheetal Bhatiya", "altName": "Sheetal", "unit": "GD", "designation": "IMPLANTER", "amount": 35000.0, "objectId": "691e9d24164751f6ae6a30e9", "phone": "7988415814", "isActive": true},
  {"row": 196, "employeeId": "RM-0185", "name": "GOURI SAGAR", "sheetName": "GOURI SAGAR", "altName": "", "unit": "GD", "designation": "IMPLANTER", "amount": 18000.0, "objectId": "691e9d24164751f6ae6a3101", "phone": "9266571543", "isActive": true},
  {"row": 197, "employeeId": "RM-0186", "name": "SIMRAN", "sheetName": "SIMRAN", "altName": "", "unit": "GD", "designation": "IMPLANTER", "amount": 17709.68, "objectId": "691e9d24164751f6ae6a3102", "phone": "9718493850", "isActive": true},
  {"row": 198, "employeeId": "RM-0222", "name": "MOHIT SHAH", "sheetName": "MOHIT SHAH", "altName": "", "unit": "GD", "designation": "OT STAFF", "amount": 14838.71, "objectId": "691e9d24164751f6ae6a312f", "phone": "9958741089", "isActive": true},
  {"row": 199, "employeeId": "RM-0223", "name": "YASHIKA", "sheetName": "YASHIKA", "altName": "YASHIKA", "unit": "GD", "designation": "OT STAFF", "amount": 14032.26, "objectId": "691e9d24164751f6ae6a3118", "phone": "9667932450", "isActive": true},
  {"row": 200, "employeeId": "RM-0236", "name": "MUMTAJ", "sheetName": "MUMTAJ", "altName": "", "unit": "GD", "designation": "OT STAFF", "amount": 15000.0, "objectId": "691e9d24164751f6ae6a3132", "phone": "9667436799", "isActive": true},
  {"row": 201, "employeeId": "263", "name": "BABITA", "sheetName": "BABITA", "altName": "", "unit": "GD", "designation": "OT STAFF", "amount": 15000.0, "objectId": "691e9d24164751f6ae6a311a", "phone": "8933064653", "isActive": true},
  {"row": 202, "employeeId": "264", "name": "RAVI KUSHWAHA", "sheetName": "RAVI KUSHWAHA", "altName": "", "unit": "GD", "designation": "OT STAFF", "amount": 15000.0, "objectId": "691e9d24164751f6ae6a311b", "phone": "7037595070", "isActive": true},
  {"row": 203, "employeeId": "308", "name": "POONAM", "sheetName": "POONAM", "altName": "Poonam Maid", "unit": "GD", "designation": "MAID", "amount": 13000.0, "objectId": "6a8c173aee9e5d234c0282a6", "phone": "1234567840", "isActive": true},
  {"row": 204, "employeeId": "485", "name": "Dr Mansi", "sheetName": "Dr Mansi", "altName": "Dr.Mansi Bajpai", "unit": "GD", "designation": "DOCTOR", "amount": 13709.68, "objectId": "691e9d24164751f6ae6a3109", "phone": "8755211994", "isActive": true},
  {"row": 205, "employeeId": "497", "name": "dinesh", "sheetName": "dinesh", "altName": "", "unit": "GD", "designation": "OT STAFF", "amount": 13064.52, "objectId": "6a8973aeb669227e5fa567ae", "phone": "9821756097", "isActive": true},
  {"row": 206, "employeeId": "498", "name": "Sourabh Kumar", "sheetName": "Sourabh Kumar", "altName": "", "unit": "GD", "designation": "OT STAFF", "amount": 14032.26, "objectId": "691e9d24164751f6ae6a310b", "phone": "9956130556", "isActive": true},
  {"row": 207, "employeeId": "503", "name": "AYDEN CARL", "sheetName": "AYDEN CARL", "altName": "", "unit": "GD", "designation": "DOCTOR", "amount": 0.0, "objectId": "6a8842144f9e384454479959", "phone": "8956254785", "isActive": true},
  {"row": 208, "employeeId": "504", "name": "KURSAT", "sheetName": "KURSAT", "altName": "", "unit": "GD", "designation": "DOCTOR", "amount": 0.0, "objectId": "6a8842144f9e384454479965", "phone": "8447971104", "isActive": true},
  {"row": 209, "employeeId": "571", "name": "Priyanka Shaw", "sheetName": "Priyanka Shaw", "altName": "", "unit": "GD", "designation": "OT STAFF", "amount": 12580.65, "objectId": "6a8842154f9e38445447996d", "phone": "9565794503", "isActive": true},
  {"row": 210, "employeeId": "882", "name": "Sharifa Haqbin", "sheetName": "Sharifa Haqbin", "altName": "", "unit": "GD", "designation": "Executive Consultant", "amount": 15000.0, "objectId": "6a8842154f9e384454479973", "phone": "8287753169", "isActive": true},
  {"row": 211, "employeeId": "611", "name": "Manmohan Bairwa", "sheetName": "Manmohan Bairwa", "altName": "", "unit": "GD", "designation": "OT STAFF", "amount": 10000.0, "objectId": "691e9d24164751f6ae6a30f7", "phone": "7877279502", "isActive": true},
  {"row": 212, "employeeId": "623", "name": "Yogesh Kumar Insha", "sheetName": "Yogesh Kumar Insha", "altName": "", "unit": "GD", "designation": "TECH", "amount": 22580.65, "objectId": "691e9d24164751f6ae6a312b", "phone": "8306206226", "isActive": true},
  {"row": 213, "employeeId": "625", "name": "Deepak Kushwaha", "sheetName": "Deepak Kushwaha (Inactive)", "altName": "DEEPAK KUSHWAHA", "unit": "GD", "designation": "TECHNICIAN", "amount": 32258.06, "objectId": "691e9d24164751f6ae6a30f8", "phone": "9958741077", "isActive": false},
  {"row": 214, "employeeId": "664", "name": "Abhijeet Kumar Mandal", "sheetName": "Abhijeet Kumar Mandal", "altName": "", "unit": "GD", "designation": "OT STAFF", "amount": 12000.0, "objectId": "6944f0db71989d90c0570803", "phone": "8527691963", "isActive": true},
  {"row": 215, "employeeId": "692", "name": "Dr Ashalata Roy", "sheetName": "Dr Ashalata Roy", "altName": "Dr, Ashalata Roy", "unit": "GD", "designation": "MDS", "amount": 57096.77, "objectId": "693fe75982eaa1deb8bda397", "phone": "9971125678", "isActive": true},
  {"row": 216, "employeeId": "726", "name": "Marzia Halim", "sheetName": "Marzia Halim", "altName": "", "unit": "GD", "designation": "Executive Consultant", "amount": 33306.45, "objectId": "6a8842144f9e384454479968", "phone": "9625521850", "isActive": true},
  {"row": 217, "employeeId": "728", "name": "Zohra Halim", "sheetName": "Zohra Halim", "altName": "", "unit": "GD", "designation": "Executive Consultant", "amount": 22177.42, "objectId": "6a8842154f9e384454479977", "phone": "9899815339", "isActive": true},
  {"row": 218, "employeeId": "746", "name": "Salman Toto", "sheetName": "Salman Toto", "altName": "", "unit": "GD", "designation": "OT STAFF", "amount": 13548.39, "objectId": "6a8973aeb669227e5fa567b0", "phone": "9315173962", "isActive": true},
  {"row": 219, "employeeId": "761", "name": "Pramod", "sheetName": "Pramod", "altName": "", "unit": "GD", "designation": "OT STAFF", "amount": 10000.0, "objectId": "6a8842154f9e38445447996c", "phone": "7409469982", "isActive": true},
  {"row": 220, "employeeId": "765", "name": "Rashida Langary", "sheetName": "Rashida Langary", "altName": "", "unit": "GD", "designation": "IMPLANTER", "amount": 23000.0, "objectId": "6a8842154f9e38445447996e", "phone": "8373986054", "isActive": true},
  {"row": 221, "employeeId": "774", "name": "Hangama Sayedy", "sheetName": "Hangama Sayedy", "altName": "", "unit": "GD", "designation": "COUNSELLOR", "amount": 22000.0, "objectId": "6a8842144f9e384454479962", "phone": "9821017296", "isActive": true},
  {"row": 222, "employeeId": "803", "name": "Yalda Yousoufi", "sheetName": "Yalda Yousoufi", "altName": "", "unit": "GD", "designation": "Executive Consultant", "amount": 11612.9, "objectId": "6a8842154f9e384454479976", "phone": "9911484498", "isActive": true},
  {"row": 223, "employeeId": "892", "name": "Bhumi Shresth", "sheetName": "Bhumi Shresth", "altName": "", "unit": "GD", "designation": "RECEPTIONIST", "amount": 14000.0, "objectId": "6a8842144f9e38445447995c", "phone": "8920560350", "isActive": true},
  {"row": 224, "employeeId": "990", "name": "Khuwish", "sheetName": "Khuwish", "altName": "", "unit": "GD", "designation": "OT STAFF", "amount": 8709.68, "objectId": "6a8842144f9e384454479966", "phone": "9891176694", "isActive": true},
  {"row": 225, "employeeId": "995", "name": "Mukund Kumar", "sheetName": "Mukund Kumar", "altName": "", "unit": "GD", "designation": "Clinic Process", "amount": 18000.0, "objectId": "6a8973aeb669227e5fa567b2", "phone": "9264273988", "isActive": true},
  {"row": 226, "employeeId": "1029", "name": "Yogesh Desorey", "sheetName": "Yogesh Desorey", "altName": "Yogesh", "unit": "GD", "designation": "OT STAFF", "amount": 11419.35, "objectId": "6a8973aeb669227e5fa567b3", "phone": "9716112267", "isActive": true},
  {"row": 227, "employeeId": "1056", "name": "Shubham Kumar", "sheetName": "Shubham Kumar", "altName": "", "unit": "GD", "designation": "OT STAFF", "amount": 9677.42, "objectId": "", "phone": "", "isActive": true},
  {"row": 228, "employeeId": "1068", "name": "Qudratullah Nezami", "sheetName": "Qudratullah Nezami", "altName": "", "unit": "GD", "designation": "OT STAFF", "amount": 4387.12, "objectId": "", "phone": "", "isActive": true},
  {"row": 229, "employeeId": "1069", "name": "Shahalam", "sheetName": "Shahalam", "altName": "", "unit": "GD", "designation": "OT STAFF", "amount": 2322.6, "objectId": "", "phone": "", "isActive": true},
  {"row": 230, "employeeId": "1080", "name": "Meena Barekzai", "sheetName": "Meena Barekzai", "altName": "", "unit": "GD", "designation": "OT STAFF", "amount": 14838.03, "objectId": "", "phone": "", "isActive": true},
  {"row": 231, "employeeId": "RM-0012", "name": "ABHISHEK", "sheetName": "ABHISHEK", "altName": "ABHISHEAK CAMERAMAN", "unit": "CD", "designation": "CAMERAMAN", "amount": 0.0, "objectId": "6a8c12a83ccf59b3da87606c", "phone": "9634938655", "isActive": true},
  {"row": 232, "employeeId": "RM-0168", "name": "RAMSHA", "sheetName": "RAMSHA", "altName": "Ramsha Khan", "unit": "CD", "designation": "COUNSELLOR", "amount": 14516.13, "objectId": "691e9d24164751f6ae6a3120", "phone": "8595907221", "isActive": true},
  {"row": 233, "employeeId": "268", "name": "RAJIV SINGH", "sheetName": "RAJIV SINGH", "altName": "RAJIV SINGH MANAGER", "unit": "CD", "designation": "manager", "amount": 12580.65, "objectId": "6a8c2f2382a692f08a5cb6e2", "phone": "4569875216", "isActive": true},
  {"row": 234, "employeeId": "342", "name": "PAWAN SHARMA", "sheetName": "PAWAN SHARMA", "altName": "", "unit": "CD", "designation": "SR LAB TECHNICIAN", "amount": 34500.0, "objectId": "6a8973aeb669227e5fa567b4", "phone": "7390975405", "isActive": true},
  {"row": 235, "employeeId": "409", "name": "RAJIV KUMAR SINGH", "sheetName": "RAJIV KUMAR SINGH", "altName": "Rajiv singh", "unit": "CD", "designation": "COUNSELLOR", "amount": 13548.39, "objectId": "6a9a5209db733610d55c0b97", "phone": "9369343001", "isActive": true},
  {"row": 236, "employeeId": "484", "name": "Adarsh Mathur", "sheetName": "Adarsh Mathur", "altName": "", "unit": "CD", "designation": "OFFICE BOY", "amount": 15000.0, "objectId": "6a8973aeb669227e5fa567b5", "phone": "7557291195", "isActive": true},
  {"row": 237, "employeeId": "509", "name": "Dr Pranendra Singh", "sheetName": "Dr Pranendra Singh", "altName": "Dr. Pranendra Singh", "unit": "CD", "designation": "DOCTOR", "amount": 130000.0, "objectId": "691e9d24164751f6ae6a313c", "phone": "8923964333", "isActive": true},
  {"row": 238, "employeeId": "592", "name": "Yakshi", "sheetName": "Yakshi", "altName": "", "unit": "CD", "designation": "OT STAFF", "amount": 10483.87, "objectId": "6944f9b69bf2fb764f00e504", "phone": "1111111111", "isActive": true},
  {"row": 239, "employeeId": "596", "name": "Jasleen Kaur", "sheetName": "Jasleen Kaur", "altName": "", "unit": "CD", "designation": "RECEPTIONIST", "amount": 8225.81, "objectId": "6a8973aeb669227e5fa567b6", "phone": "8076099390", "isActive": true},
  {"row": 240, "employeeId": "597", "name": "Khushi Jindhad", "sheetName": "Khushi Jindhad", "altName": "", "unit": "CD", "designation": "RECEPTIONIST", "amount": 14451.61, "objectId": "6a8973aab669227e5fa5675f", "phone": "9319348554", "isActive": true},
  {"row": 241, "employeeId": "599", "name": "Purnima Singh", "sheetName": "Purnima Singh", "altName": "", "unit": "CD", "designation": "RECEPTIONIST", "amount": 14451.61, "objectId": "6a8973aeb669227e5fa567b7", "phone": "8700103928", "isActive": true},
  {"row": 242, "employeeId": "601", "name": "Ravina Adhikari", "sheetName": "Ravina Adhikari", "altName": "", "unit": "CD", "designation": "COUNSELLOR", "amount": 9870.97, "objectId": "691e9d24164751f6ae6a310c", "phone": "9319781023", "isActive": true},
  {"row": 243, "employeeId": "727", "name": "Manmeet Kaur", "sheetName": "Manmeet Kaur", "altName": "", "unit": "CD", "designation": "IMPLANTER", "amount": 16838.71, "objectId": "6a8973aeb669227e5fa567b8", "phone": "8076668999", "isActive": true},
  {"row": 244, "employeeId": "745", "name": "Pardis Nazari", "sheetName": "Pardis Nazari", "altName": "Pardis", "unit": "CD", "designation": "COUNSELLOR", "amount": 16177.42, "objectId": "69a67e8b60410e95d3d7eef8", "phone": "8586043260", "isActive": true},
  {"row": 245, "employeeId": "802", "name": "Aditya Maurya", "sheetName": "Aditya Maurya", "altName": "", "unit": "CD", "designation": "COUNSELLOR", "amount": 25000.0, "objectId": "691e9d24164751f6ae6a313a", "phone": "9711581421", "isActive": true},
  {"row": 246, "employeeId": "874", "name": "Dr Ashi Gautam", "sheetName": "Dr Ashi Gautam", "altName": "", "unit": "CD", "designation": "BDS Doctor", "amount": 14806.45, "objectId": "6a8973adb669227e5fa567ab", "phone": "7985464228", "isActive": true},
  {"row": 247, "employeeId": "910", "name": "Arjun", "sheetName": "Arjun", "altName": "", "unit": "CD", "designation": "FIELD BOY", "amount": 13000.0, "objectId": "6a8842144f9e384454479953", "phone": "9311636824", "isActive": true},
  {"row": 248, "employeeId": "996", "name": "Dr Raunak Prasonna", "sheetName": "Dr Raunak Prasonna", "altName": "", "unit": "CD", "designation": "BDS Doctor", "amount": 8064.52, "objectId": "6a8842144f9e384454479960", "phone": "6206144557", "isActive": true},
  {"row": 249, "employeeId": "1019", "name": "Vineeta", "sheetName": "Vineeta", "altName": "", "unit": "CD", "designation": "RECEPTIONIST", "amount": 11540.32, "objectId": "6a8842154f9e384454479974", "phone": "7011313765", "isActive": true},
  {"row": 250, "employeeId": "1027", "name": "Balaji Kumar", "sheetName": "Balaji Kumar (Inactive)", "altName": "Balaji Kumar", "unit": "CD", "designation": "accountant", "amount": 3483.87, "objectId": "6a8973aeb669227e5fa567bb", "phone": "9650084920", "isActive": false},
  {"row": 251, "employeeId": "1030", "name": "Arslan Khan", "sheetName": "Arslan Khan", "altName": "", "unit": "CD", "designation": "Junior Lab Technician", "amount": 0.0, "objectId": "", "phone": "", "isActive": true},
  {"row": 252, "employeeId": "1057", "name": "Monika Verma", "sheetName": "Monika Verma", "altName": "Monika", "unit": "CD", "designation": "Medical Director", "amount": 30000.0, "objectId": "6a8973afb669227e5fa567c6", "phone": "8700475374", "isActive": true},
  {"row": 253, "employeeId": "RM-0006", "name": "GUDIYA", "sheetName": "GUDIYA", "altName": "", "unit": "CD", "designation": "NURSHING", "amount": 17000.0, "objectId": "6944f6ba6351226e5001ad95", "phone": "9582273771", "isActive": true},
  {"row": 254, "employeeId": "1078", "name": "Radha", "sheetName": "Radha", "altName": "", "unit": "CD", "designation": "HOUSE KEEPING", "amount": 8516.13, "objectId": "", "phone": "", "isActive": true},
  {"row": 255, "employeeId": "1001", "name": "Anjali", "sheetName": "Anjali", "altName": "", "unit": "Noida", "designation": "OT STAFF", "amount": 13548.39, "objectId": "691e9d24164751f6ae6a3127", "phone": "9821737758", "isActive": true},
  {"row": 256, "employeeId": "1002", "name": "Shagufi", "sheetName": "Shagufi", "altName": "", "unit": "Noida", "designation": "RECEPTIONIST", "amount": 20000.0, "objectId": "6a8842154f9e384454479972", "phone": "7827448876", "isActive": true},
  {"row": 257, "employeeId": "1017", "name": "Vaishnavi Yadav", "sheetName": "Vaishnavi Yadav", "altName": "", "unit": "Noida", "designation": "OT STAFF", "amount": 10903.23, "objectId": "6a8973afb669227e5fa567bc", "phone": "7037219200", "isActive": true},
  {"row": 258, "employeeId": "1038", "name": "Rishabh Sonker", "sheetName": "Rishabh Sonker", "altName": "", "unit": "Noida", "designation": "OT STAFF", "amount": 15000.0, "objectId": "6a8973afb669227e5fa567bd", "phone": "7054049997", "isActive": true},
  {"row": 259, "employeeId": "1039", "name": "Dr ishika jain", "sheetName": "Dr ishika jain", "altName": "", "unit": "Noida", "designation": "BDS Doctor", "amount": 25000.0, "objectId": "6a8973afb669227e5fa567be", "phone": "9953625180", "isActive": true},
  {"row": 260, "employeeId": "1075", "name": "Yuvraj", "sheetName": "Yuvraj", "altName": "", "unit": "Noida", "designation": "Clinic Manager", "amount": 32000.0, "objectId": "6a589df55b712bcdd080d963", "phone": "8989898989", "isActive": true},
  {"row": 261, "employeeId": "1076", "name": "Vikas", "sheetName": "Vikas", "altName": "", "unit": "Noida", "designation": "OFFICE BOY", "amount": 12161.29, "objectId": "", "phone": "", "isActive": true},
  {"row": 262, "employeeId": "951", "name": "Komal Lodhi", "sheetName": "Komal Lodhi", "altName": "", "unit": "Collab", "designation": "COUNSELLOR", "amount": 12580.65, "objectId": "6a8973acb669227e5fa56788", "phone": "6391263383", "isActive": true},
  {"row": 263, "employeeId": "952", "name": "Bhoomi Kumari Chaurasia", "sheetName": "Bhoomi Kumari Chaurasia", "altName": "", "unit": "Collab", "designation": "COUNSELLOR", "amount": 9354.84, "objectId": "6a8973acb669227e5fa56789", "phone": "8777385568", "isActive": true},
  {"row": 264, "employeeId": "985", "name": "Vishal Kumar", "sheetName": "Vishal Kumar", "altName": "", "unit": "Collab", "designation": "COUNSELLOR", "amount": 15000.0, "objectId": "6a8973adb669227e5fa56799", "phone": "7632977168", "isActive": true},
  {"row": 265, "employeeId": "1024", "name": "Dhruv Nirmal", "sheetName": "Dhruv Nirmal", "altName": "", "unit": "Collab", "designation": "COUNSELLOR", "amount": 11806.45, "objectId": "6a8842144f9e38445447995e", "phone": "6230331340", "isActive": true},
  {"row": 266, "employeeId": "1049", "name": "ASFIYA TAJANNUM", "sheetName": "ASFIYA TAJANNUM", "altName": "", "unit": "Collab", "designation": "RECEPTIONIST", "amount": 10161.29, "objectId": "6a8842144f9e384454479958", "phone": "9535083320", "isActive": true},
  {"row": 267, "employeeId": "1058", "name": "Nishu kumari", "sheetName": "Nishu kumari", "altName": "", "unit": "Collab", "designation": "COUNSELLOR", "amount": 5870.97, "objectId": "", "phone": "", "isActive": true},
  {"row": 268, "employeeId": "RM-0161", "name": "SUNIL BAIRWA", "sheetName": "SUNIL BAIRWA", "altName": "", "unit": "Hyd", "designation": "COUNSELLOR", "amount": 19354.84, "objectId": "", "phone": "", "isActive": true},
  {"row": 269, "employeeId": "RM-0177", "name": "NARENDER", "sheetName": "NARENDER", "altName": "NARENDRA", "unit": "Hyd", "designation": "TECH", "amount": 32903.23, "objectId": "691e9d24164751f6ae6a30f3", "phone": "8851212224", "isActive": true},
  {"row": 270, "employeeId": "260", "name": "SYED SAJID", "sheetName": "SYED SAJID", "altName": "", "unit": "Hyd", "designation": "TECHNICIAN", "amount": 80000.0, "objectId": "6a8842164f9e3844544799aa", "phone": "9851472586", "isActive": true},
  {"row": 271, "employeeId": "394", "name": "ROHIT VERMA", "sheetName": "ROHIT VERMA", "altName": "ROHIT", "unit": "Hyd", "designation": "IMPLANTER", "amount": 18000.0, "objectId": "691e9d24164751f6ae6a30fa", "phone": "8764763600", "isActive": true},
  {"row": 272, "employeeId": "442", "name": "RAVI KUMAR", "sheetName": "RAVI KUMAR", "altName": "", "unit": "Hyd", "designation": "IMPLANTER", "amount": 13709.68, "objectId": "691e9d24164751f6ae6a30f1", "phone": "7579782314", "isActive": true},
  {"row": 273, "employeeId": "618", "name": "pushpa", "sheetName": "pushpa", "altName": "", "unit": "Hyd", "designation": "OT STAFF", "amount": 20000.0, "objectId": "6a8842154f9e384454479984", "phone": "6303130904", "isActive": true},
  {"row": 274, "employeeId": "619", "name": "Sneha", "sheetName": "Sneha", "altName": "", "unit": "Hyd", "designation": "OT STAFF", "amount": 18064.52, "objectId": "6a8973abb669227e5fa56778", "phone": "9873024842", "isActive": true},
  {"row": 275, "employeeId": "713", "name": "Mamatha Chawan", "sheetName": "Mamatha Chawan (Inactive)", "altName": "Mamatha Chawan", "unit": "Hyd", "designation": "RECEPTIONIST", "amount": 2129.03, "objectId": "6a8842154f9e384454479989", "phone": "9989497410", "isActive": false},
  {"row": 276, "employeeId": "718", "name": "Rajina Tamang", "sheetName": "Rajina Tamang", "altName": "", "unit": "Hyd", "designation": "OT STAFF", "amount": 15500.0, "objectId": "6a8842154f9e384454479982", "phone": "9593892598", "isActive": true},
  {"row": 277, "employeeId": "797", "name": "Preeti gyadi", "sheetName": "Preeti gyadi", "altName": "", "unit": "Hyd", "designation": "NURSHING", "amount": 15000.0, "objectId": "6a8973afb669227e5fa567bf", "phone": "8787832352", "isActive": true},
  {"row": 278, "employeeId": "821", "name": "KISHMI", "sheetName": "KISHMI", "altName": "", "unit": "Hyd", "designation": "OT STAFF", "amount": 15000.0, "objectId": "6a8842154f9e38445447997f", "phone": "8730812312", "isActive": true},
  {"row": 279, "employeeId": "848", "name": "AJAY BHATIYA", "sheetName": "AJAY BHATIYA", "altName": "", "unit": "Hyd", "designation": "OT STAFF", "amount": 10451.61, "objectId": "6a8973afb669227e5fa567c0", "phone": "9211913109", "isActive": true},
  {"row": 280, "employeeId": "953", "name": "Ravi", "sheetName": "Ravi", "altName": "", "unit": "Hyd", "designation": "OT STAFF", "amount": 0.0, "objectId": "69d4993c09c2c5ec77bca3fc", "phone": "9211247764", "isActive": true},
  {"row": 281, "employeeId": "973", "name": "Preeti Ajney", "sheetName": "Preeti Ajney", "altName": "", "unit": "Hyd", "designation": "RECEPTIONIST", "amount": 18000.0, "objectId": "6a8973afb669227e5fa567c1", "phone": "7780498940", "isActive": true},
  {"row": 282, "employeeId": "1031", "name": "Dayashankar", "sheetName": "Dayashankar", "altName": "", "unit": "Hyd", "designation": "OT STAFF", "amount": 15000.0, "objectId": "6a8842144f9e38445447995d", "phone": "6395614128", "isActive": true},
  {"row": 283, "employeeId": "1032", "name": "Madan", "sheetName": "Madan", "altName": "", "unit": "Hyd", "designation": "OT STAFF", "amount": 12000.0, "objectId": "6a8842144f9e384454479967", "phone": "9588835502", "isActive": true},
  {"row": 284, "employeeId": "1033", "name": "Dr Ede Akhila", "sheetName": "Dr Ede Akhila", "altName": "", "unit": "Hyd", "designation": "MDS", "amount": 81290.32, "objectId": "6a8842144f9e38445447995f", "phone": "8121835968", "isActive": true},
  {"row": 285, "employeeId": "1034", "name": "Dr Yashu Singh", "sheetName": "Dr Yashu Singh", "altName": "", "unit": "Hyd", "designation": "Centre Head", "amount": 67096.77, "objectId": "", "phone": "", "isActive": true},
  {"row": 286, "employeeId": "1040", "name": "Vipul Rao", "sheetName": "Vipul Rao", "altName": "", "unit": "Hyd", "designation": "IMPLANTER", "amount": 27871.02, "objectId": "6a8842154f9e384454479975", "phone": "8059944730", "isActive": true},
  {"row": 287, "employeeId": "1074", "name": "Adibh Ramteke", "sheetName": "Adibh Ramteke", "altName": "", "unit": "Hyd", "designation": "Technician", "amount": 61290.32, "objectId": "", "phone": "", "isActive": true}
];

// ============================== ARGS =======================================

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const COMMIT = has("--commit");
const SKIP_PAYABLES = has("--skip-payables");
const ONLY_PAYABLES = has("--only-payables");
const UPDATE_BRANCH = has("--update-branch");
const ALLOW_MISSING_IDS = has("--allow-missing-ids");
const REVERT_ID = (argv.find((a) => a.startsWith("--revert=")) || "").split("=")[1] || null;

const BATCH_ID = REVERT_ID || `SAL-${PERIOD.year}-${String(PERIOD.month).padStart(2, "0")}-${Date.now()}`;

const MONGODB_URI = 'mongodb://sachindashzer:user8520@ac-pu86ixj-shard-00-00.hwjor1r.mongodb.net:27017,ac-pu86ixj-shard-00-01.hwjor1r.mongodb.net:27017,ac-pu86ixj-shard-00-02.hwjor1r.mongodb.net:27017/?ssl=true&replicaSet=atlas-ool7b4-shard-0&authSource=admin&appName=crm';
if (!MONGODB_URI) {
  console.error("MONGODB_URI is not set. Run with: node --env-file=.env.local scripts/import-salary-data.mjs");
  process.exit(1);
} 

// ============================== HELPERS ====================================

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function monthName(m) { return MONTHS[m - 1] || String(m); }

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const norm = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

function isObjectId(v) { return typeof v === "string" && /^[a-f0-9]{24}$/i.test(v); }
function oid(v) { return new mongoose.Types.ObjectId(v); }

const log = {
  head: (t) => console.log(`\n${"═".repeat(74)}\n  ${t}\n${"═".repeat(74)}`),
  step: (t) => console.log(`\n── ${t} ${"─".repeat(Math.max(0, 68 - t.length))}`),
  ok:   (t) => console.log(`   ✓ ${t}`),
  warn: (t) => console.log(`   ⚠ ${t}`),
  err:  (t) => console.log(`   ✗ ${t}`),
  info: (t) => console.log(`     ${t}`),
};

const report = {
  batchId: BATCH_ID,
  mode: REVERT_ID ? "revert" : COMMIT ? "commit" : "dry-run",
  period: PERIOD,
  startedAt: new Date().toISOString(),
  preflight: { missingObjectIds: [], employeeIdCollisions: [], badBranches: [], zeroAmount: [], noPhone: [] },
  employeesCreated: [],
  employeesUpdated: [],
  employeesUnchanged: [],
  employeesSkipped: [],
  payablesCreated: [],
  payablesSkipped: [],
  payablesFailed: [],
  reverted: { employees: 0, payables: 0 },
};

function writeReport() {
  const dir = path.join(process.cwd(), "scripts", "reports");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `salary-import-${BATCH_ID}.json`);
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  log.ok(`Report written to ${path.relative(process.cwd(), file)}`);
}

// ============================== PHASES =====================================

async function preflight(Employees) {
  log.step("PHASE 0 — Preflight");

  // Branch mapping must be complete
  const unmapped = [...new Set(ROWS.map((r) => r.unit))].filter(
    (u) => !UNIT_TO_BRANCH[u] || !ALL_BRANCHES.includes(UNIT_TO_BRANCH[u]),
  );
  if (unmapped.length) {
    log.err(`These sheet units have no valid branch in UNIT_TO_BRANCH: ${unmapped.join(", ")}`);
    log.info(`Valid branches: ${ALL_BRANCHES.join(", ")}`);
    throw new Error("Fix UNIT_TO_BRANCH at the top of this script and re-run.");
  }
  log.ok(`Branch mapping OK — ${Object.entries(UNIT_TO_BRANCH).map(([u, b]) => `${u}→${b}`).join(", ")}`);

  // Every mapped ObjectId must exist
  const mapped = ROWS.filter((r) => r.objectId);
  const ids = mapped.map((r) => oid(r.objectId));
  const found = await Employees.find({ _id: { $in: ids } }).project({ name: 1, role: 1, branch: 1, employeeId: 1, isactive: 1, phone: 1 }).toArray();
  const byId = new Map(found.map((e) => [String(e._id), e]));

  for (const r of mapped) {
    if (!byId.has(r.objectId)) {
      report.preflight.missingObjectIds.push({ row: r.row, name: r.name, objectId: r.objectId });
    }
  }
  if (report.preflight.missingObjectIds.length) {
    log.err(`${report.preflight.missingObjectIds.length} row(s) point at an ObjectId that is NOT in the employees collection:`);
    report.preflight.missingObjectIds.slice(0, 10).forEach((m) => log.info(`row ${m.row}  ${m.name}  ${m.objectId}`));
    if (report.preflight.missingObjectIds.length > 10) log.info(`… and ${report.preflight.missingObjectIds.length - 10} more (see the report file)`);
    if (!ALLOW_MISSING_IDS) throw new Error("Stale ObjectIds in the sheet. Fix them, or re-run with --allow-missing-ids to skip those rows.");
    log.warn("--allow-missing-ids set — those rows will be skipped entirely.");
  } else {
    log.ok(`All ${mapped.length} mapped ObjectIds resolve to real employees`);
  }

  // employeeId collisions against employees NOT in this sheet
  const sheetIds = ROWS.map((r) => r.employeeId).filter(Boolean);
  const clash = await Employees.find({ employeeId: { $in: sheetIds } }).project({ name: 1, employeeId: 1 }).toArray();
  for (const e of clash) {
    const row = ROWS.find((r) => r.employeeId === e.employeeId);
    if (row && row.objectId !== String(e._id)) {
      report.preflight.employeeIdCollisions.push({
        employeeId: e.employeeId, sheetRow: row.row, sheetName: row.name,
        dbName: e.name, dbId: String(e._id),
      });
    }
  }
  if (report.preflight.employeeIdCollisions.length) {
    log.warn(`${report.preflight.employeeIdCollisions.length} employeeId already used by a DIFFERENT employee — those rows will be skipped:`);
    report.preflight.employeeIdCollisions.forEach((c) =>
      log.info(`"${c.employeeId}" — sheet row ${c.sheetRow} (${c.sheetName}) vs DB ${c.dbName} (${c.dbId})`));
  } else {
    log.ok("No employeeId collisions");
  }

  // Informational
  report.preflight.zeroAmount = ROWS.filter((r) => !(r.amount > 0)).map((r) => ({ row: r.row, name: r.name, amount: r.amount }));
  report.preflight.noPhone = ROWS.filter((r) => !r.phone).map((r) => ({ row: r.row, name: r.name }));
  log.ok(`${report.preflight.zeroAmount.length} row(s) with amount ≤ 0 — no payable will be created for them`);
  log.ok(`${report.preflight.noPhone.length} row(s) with no phone — employee will be created/updated without one`);

  return byId;
}

async function createEmployees(Employees) {
  log.step("PHASE 1 — Create employees missing from the CRM");

  const newRows = ROWS.filter((r) => !r.objectId);
  const collidingIds = new Set(report.preflight.employeeIdCollisions.map((c) => c.employeeId));
  log.info(`${newRows.length} row(s) marked "New - not in CRM"`);

  // Existing docs that might already be these people (previous run, or a name match)
  const names = newRows.map((r) => r.name);
  const existing = await Employees.find({
    $or: [
      { employeeId: { $in: newRows.map((r) => r.employeeId) } },
      { name: { $in: names } },
    ],
  }).project({ name: 1, employeeId: 1, branch: 1 }).toArray();
  const byEmployeeId = new Map(existing.filter((e) => e.employeeId).map((e) => [e.employeeId, e]));
  const byName = new Map();
  for (const e of existing) {
    const k = norm(e.name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(e);
  }

  const docs = [];
  for (const r of newRows) {
    if (collidingIds.has(r.employeeId)) {
      report.employeesSkipped.push({ row: r.row, name: r.name, reason: "employeeId collision" });
      continue;
    }
    const already = byEmployeeId.get(r.employeeId);
    if (already) {
      r._resolvedId = String(already._id);
      report.employeesSkipped.push({ row: r.row, name: r.name, reason: `already exists with employeeId "${r.employeeId}" (${already._id})` });
      continue;
    }
    const nameMatches = byName.get(norm(r.name)) || [];
    if (nameMatches.length === 1) {
      r._resolvedId = String(nameMatches[0]._id);
      report.employeesSkipped.push({ row: r.row, name: r.name, reason: `name already exists in CRM (${nameMatches[0]._id}) — linked instead of creating a duplicate` });
      continue;
    }
    if (nameMatches.length > 1) {
      report.employeesSkipped.push({ row: r.row, name: r.name, reason: `${nameMatches.length} employees already share this name — resolve manually`, candidates: nameMatches.map((e) => String(e._id)) });
      continue;
    }

    const now = new Date();
    docs.push({
      _row: r.row,
      doc: {
        _id: new mongoose.Types.ObjectId(),
        name: r.name,
        phone: r.phone || "",
        email: "",
        employeeId: r.employeeId,
        role: r.designation,
        isactive: r.isActive,
        branch: UNIT_TO_BRANCH[r.unit],
        patient: [],
        salaryStructure: { baseSalary: 0, salaryType: "Monthly", effectiveFrom: now },
        incentiveRate: 0,
        importBatch: BATCH_ID,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  log.info(`${docs.length} to create, ${report.employeesSkipped.length} skipped`);
  docs.slice(0, 8).forEach((d) => log.info(`  + ${d.doc.name} — ${d.doc.role} — ${d.doc.branch} — ${d.doc.employeeId}`));
  if (docs.length > 8) log.info(`  … and ${docs.length - 8} more`);

  if (docs.length && COMMIT) {
    await Employees.insertMany(docs.map((d) => d.doc), { ordered: false });
    log.ok(`Inserted ${docs.length} employees`);
  } else if (docs.length) {
    log.warn("DRY RUN — nothing inserted");
  }

  for (const d of docs) {
    const row = ROWS.find((r) => r.row === d._row);
    row._resolvedId = String(d.doc._id);
    report.employeesCreated.push({ row: d._row, name: d.doc.name, _id: String(d.doc._id), employeeId: d.doc.employeeId, role: d.doc.role, branch: d.doc.branch });
  }
}

async function updateEmployees(Employees, byId) {
  log.step("PHASE 2 — Update employeeId / role / status on existing employees");

  const collidingIds = new Set(report.preflight.employeeIdCollisions.map((c) => c.employeeId));
  const ops = [];

  for (const r of ROWS) {
    const id = r.objectId || r._resolvedId;
    if (!id) continue;
    if (r.objectId && !byId.has(r.objectId)) continue;        // stale id, already reported
    if (report.employeesCreated.some((e) => e._id === id)) continue; // just created, already correct

    const current = byId.get(id) || (await Employees.findOne({ _id: oid(id) }, { projection: { name: 1, role: 1, branch: 1, employeeId: 1, isactive: 1, phone: 1 } }));
    if (!current) continue;

    const set = {};
    if (!collidingIds.has(r.employeeId) && current.employeeId !== r.employeeId) set.employeeId = r.employeeId;
    if (r.designation && current.role !== r.designation) set.role = r.designation;
    if (current.isactive !== r.isActive) set.isactive = r.isActive;
    if (r.phone && !current.phone) set.phone = r.phone;

    const targetBranch = UNIT_TO_BRANCH[r.unit];
    if (!current.branch) set.branch = targetBranch;
    else if (current.branch !== targetBranch) {
      if (UPDATE_BRANCH) set.branch = targetBranch;
      else report.employeesUnchanged.push({ row: r.row, name: r.name, note: `branch left as "${current.branch}" (sheet unit "${r.unit}" maps to "${targetBranch}") — pass --update-branch to overwrite` });
    }

    if (!Object.keys(set).length) continue;
    set.updatedAt = new Date();
    ops.push({ updateOne: { filter: { _id: oid(id) }, update: { $set: set } } });
    report.employeesUpdated.push({ row: r.row, name: r.name, _id: id, changes: set });
  }

  log.info(`${ops.length} employee(s) will change`);
  report.employeesUpdated.slice(0, 8).forEach((u) =>
    log.info(`  ~ ${u.name} — ${Object.keys(u.changes).filter((k) => k !== "updatedAt").map((k) => `${k}="${u.changes[k]}"`).join(", ")}`));
  if (report.employeesUpdated.length > 8) log.info(`  … and ${report.employeesUpdated.length - 8} more`);
  if (report.employeesUnchanged.length) log.warn(`${report.employeesUnchanged.length} branch mismatch(es) left untouched — see the report file`);

  if (ops.length && COMMIT) {
    const res = await Employees.bulkWrite(ops, { ordered: false });
    log.ok(`Modified ${res.modifiedCount} employees`);
  } else if (ops.length) {
    log.warn("DRY RUN — nothing updated");
  }
}

async function createPayables(Employees, Payables) {
  log.step("PHASE 3 — Create SALARY payables");
  log.info(`Period: ${monthName(PERIOD.month)} ${PERIOD.year}`);

  const candidates = [];
  for (const r of ROWS) {
    const id = r.objectId || r._resolvedId;
    if (!id) { report.payablesSkipped.push({ row: r.row, name: r.name, reason: "no employee id (creation skipped)" }); continue; }
    if (r.objectId && report.preflight.missingObjectIds.some((m) => m.objectId === r.objectId)) {
      report.payablesSkipped.push({ row: r.row, name: r.name, reason: "employee ObjectId not found in DB" }); continue;
    }
    if (!(r.amount > 0)) { report.payablesSkipped.push({ row: r.row, name: r.name, reason: `amount is ${r.amount}` }); continue; }
    candidates.push({ ...r, _id: id });
  }

  // Skip anyone who already has a SALARY payable for this period — mirrors the
  // partial unique index on Payable (payee + purpose + period).
  const existing = await Payables.find({
    purpose: "SALARY",
    "period.month": PERIOD.month,
    "period.year": PERIOD.year,
    "payee.refId": { $in: candidates.map((c) => oid(c._id)) },
  }).project({ "payee.refId": 1, "payee.label": 1, totalAmount: 1, isCancelled: 1 }).toArray();
  const already = new Map(existing.map((p) => [String(p.payee?.refId), p]));

  const now = new Date();
  const due = DUE_DATE ? new Date(DUE_DATE) : undefined;
  const docs = [];

  for (const c of candidates) {
    const dup = already.get(c._id);
    if (dup) {
      report.payablesSkipped.push({ row: c.row, name: c.name, reason: `SALARY payable already exists for this period (${dup._id}, ${inr(dup.totalAmount)}${dup.isCancelled ? ", cancelled" : ""})` });
      continue;
    }
    const amount = round2(c.amount);
    docs.push({
      _id: new mongoose.Types.ObjectId(),
      payee: { kind: "EMPLOYEE", refId: oid(c._id), label: c.name },
      purpose: "SALARY",
      expenseCategory: "Salary",
      expenseSubType: "Salary",
      period: { month: PERIOD.month, year: PERIOD.year },
      totalAmount: amount,
      ...(due ? { dueDate: due } : {}),
      branch: UNIT_TO_BRANCH[c.unit],
      remarks: REMARK(c),
      isCancelled: false,
      receipts: [],
      costAlreadyRecognised: false,
      excludeFromPnl: false,
      tdsLink: { role: null, linkedId: null },
      log: [{
        action: "Created",
        newValue: String(amount),
        note: `Bulk salary import — batch ${BATCH_ID}`,
        performedBy: { name: ACTOR.name, email: ACTOR.email },
        performedAt: now,
      }],
      createdBy: { ...ACTOR, date: now },
      importBatch: BATCH_ID,
      createdAt: now,
      updatedAt: now,
    });
  }

  const total = docs.reduce((s, d) => s + d.totalAmount, 0);
  log.info(`${docs.length} payable(s) to create — total ${inr(total)}`);
  log.info(`${report.payablesSkipped.length} skipped`);
  docs.slice(0, 8).forEach((d) => log.info(`  + ${d.payee.label} — ${inr(d.totalAmount)} — ${d.branch}`));
  if (docs.length > 8) log.info(`  … and ${docs.length - 8} more`);

  if (docs.length && COMMIT) {
    try {
      await Payables.insertMany(docs, { ordered: false });
      log.ok(`Inserted ${docs.length} payables totalling ${inr(total)}`);
    } catch (err) {
      const written = err?.result?.nInserted ?? err?.insertedCount ?? 0;
      log.warn(`Inserted ${written}; ${(err.writeErrors || []).length} failed`);
      for (const we of err.writeErrors || []) {
        const d = docs[we.index] || {};
        report.payablesFailed.push({
          name: d?.payee?.label, amount: d?.totalAmount,
          error: we.code === 11000 ? "duplicate — a payable for this employee/period already exists" : we.errmsg,
        });
      }
    }
  } else if (docs.length) {
    log.warn("DRY RUN — nothing inserted");
  }

  report.payablesCreated = docs.map((d) => ({ _id: String(d._id), name: d.payee.label, amount: d.totalAmount, branch: d.branch }));
  report.totals = { payableCount: docs.length, payableAmount: round2(total) };
}

async function revert(Employees, Payables) {
  log.step(`REVERT — batch ${REVERT_ID}`);
  const emp = await Employees.countDocuments({ importBatch: REVERT_ID });
  const pay = await Payables.countDocuments({ importBatch: REVERT_ID });
  log.info(`${emp} employee(s) and ${pay} payable(s) carry this batch id`);
  log.info("Payables will be CANCELLED (isCancelled: true), not deleted — the rest of the app assumes soft-cancel.");
  log.info("Employees created by the batch will be deleted only if they have no payables outside this batch.");

  if (!COMMIT) { log.warn("DRY RUN — pass --commit to actually revert"); return; }

  const r1 = await Payables.updateMany(
    { importBatch: REVERT_ID, isCancelled: { $ne: true } },
    {
      $set: { isCancelled: true, updatedAt: new Date() },
      $push: { log: { action: "Cancelled", note: `Import batch ${REVERT_ID} reverted`, performedBy: { name: ACTOR.name, email: ACTOR.email }, performedAt: new Date() } },
    },
  );
  log.ok(`Cancelled ${r1.modifiedCount} payables`);

  const created = await Employees.find({ importBatch: REVERT_ID }).project({ _id: 1, name: 1 }).toArray();
  let deleted = 0;
  for (const e of created) {
    const other = await Payables.countDocuments({ "payee.refId": e._id, importBatch: { $ne: REVERT_ID } });
    if (other > 0) { log.warn(`Kept ${e.name} — has ${other} payable(s) from outside this batch`); continue; }
    await Employees.deleteOne({ _id: e._id });
    deleted++;
  }
  log.ok(`Deleted ${deleted} employees`);
  report.reverted = { employees: deleted, payables: r1.modifiedCount };
}

// ============================== MAIN =======================================

async function main() {
  log.head(`Salary import — ${monthName(PERIOD.month)} ${PERIOD.year} — batch ${BATCH_ID}`);
  console.log(`  Mode: ${report.mode.toUpperCase()}${COMMIT ? "" : "   (add --commit to write)"}`);
  console.log(`  Rows in file: ${ROWS.length}`);

  await mongoose.connect(MONGODB_URI);
  const Employees = mongoose.connection.collection("employees");
  const Payables = mongoose.connection.collection("payables");

  try {
    if (REVERT_ID) {
      await revert(Employees, Payables);
    } else {
      const byId = await preflight(Employees);
      if (!ONLY_PAYABLES) {
        await createEmployees(Employees);
        await updateEmployees(Employees, byId);
      } else {
        // still need _resolvedId for previously-created employees
        for (const r of ROWS.filter((x) => !x.objectId)) {
          const e = await Employees.findOne({ employeeId: r.employeeId }, { projection: { _id: 1 } })
            || await Employees.findOne({ name: r.name }, { projection: { _id: 1 } });
          if (e) r._resolvedId = String(e._id);
        }
      }
      if (!SKIP_PAYABLES) await createPayables(Employees, Payables);
    }

    log.head("Summary");
    console.log(`  Employees created : ${report.employeesCreated.length}`);
    console.log(`  Employees updated : ${report.employeesUpdated.length}`);
    console.log(`  Employees skipped : ${report.employeesSkipped.length}`);
    console.log(`  Payables created  : ${report.payablesCreated.length}`);
    console.log(`  Payables skipped  : ${report.payablesSkipped.length}`);
    console.log(`  Payables failed   : ${report.payablesFailed.length}`);
    if (report.totals) console.log(`  Total amount      : ${inr(report.totals.payableAmount)}`);
    console.log(`  Batch id          : ${BATCH_ID}`);
    if (COMMIT && !REVERT_ID) console.log(`\n  Undo with: node --env-file=.env.local scripts/import-salary-data.mjs --revert=${BATCH_ID} --commit`);
    writeReport();
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  log.err(err.message);
  try { writeReport(); } catch {}
  process.exit(1);
});
