// ---------------------------------------------------------------------------
// scripts/import-salary-payables.mjs
//
// Bulk SALARY payables — matched by EMPLOYEE ID.
//
// SAARA DATA ISI FILE MEIN HAI (neeche `DATA` section — October 2026 sheet ke 397 rows).
// Excel file ki zarurat nahi. Agle mahine: DATA array replace karo + CONFIG mein month/year/due.
// (Optional: --file=<sheet.xlsx> do toh embedded data ki jagah Excel padhega — usme yeh columns chahiye:)
//     "Employee ID"   -> Employee.employeeId se match
//     "Employee Name" -> sirf safety check (DB name se compare) + payable label fallback
//     "To Pay"        -> Payable.totalAmount
//
// Har matched employee ke liye ek Payable banta hai:
//     payee   = { kind: "EMPLOYEE", refId: <employee _id>, label: <DB name> }
//     purpose = "SALARY", expenseCategory/SubType = "Salary"
//     period  = { month, year }   branch = employee ka DB branch (fallback "Delhi")
//
// Saare payables ek UploadBatch (kind PAYABLE) mein jaate hain, toh woh Admin -> Uploads
// page pe dikhte hain aur wahan se bhi revert ho sakte hain.
//
// SAFETY
//   • Default DRY RUN hai. --commit ke bina DB mein kuch nahi likhta.
//   • Same employee + same period ka SALARY payable pehle se hai -> skip (double nahi banega).
//     --update-existing do toh amount revise karega (log mein "Amount Revised").
//   • Employee ID DB mein na mile / 2 employees ka same ID ho -> skip + report.
//   • Sheet ka naam DB naam se match na kare -> skip (galat bande ko salary na chali jaye).
//     Dry run mein list dekh lo; sahi lage toh --allow-name-mismatch.
//   • To Pay <= 0 -> skip.
//   • Har run ka JSON + CSV report scripts/reports/ mein.
//
// USAGE (project root se)
//   node --env-file=.env.local scripts/import-salary-payables.mjs                      # dry run
//   node --env-file=.env.local scripts/import-salary-payables.mjs --commit             # likho
//   node --env-file=.env.local scripts/import-salary-payables.mjs --revert=<batchId> --commit
//
//   Flags:
//     --file=<path.xlsx>        optional — embedded DATA ki jagah Excel padho (xlsx package chahiye)
//     --month=10 --year=2026    salary period (default neeche CONFIG mein)
//     --due=2026-11-10          due date
//     --update-existing         existing payable ka amount sheet ke hisaab se revise karo
//     --allow-name-mismatch     naam mismatch wale rows bhi import karo
//     --skip-inactive           inactive employees ko skip karo (default: import + warning)
// ---------------------------------------------------------------------------

import mongoose from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// ============================== CONFIG =====================================

const DEFAULTS = {
  month: 10,
  year: 2026,
  due: "2026-11-11",
};

// Audit trail mein kiske naam se jayega
const ACTOR = { name: "System Import", email: "admin@ryanclinic.com", branch: "Delhi" };

const FALLBACK_BRANCH = "Delhi";

// Header names (case/space-insensitive). Sheet mein naam badle toh yahan add kar do.
const HEADERS = {
  id: ["employee id", "emp id", "employeeid"],
  name: ["employee name", "name"],
  amount: ["to pay", "topay", "net pay"],
};

// Mirrors src/lib/branches.js (script alias use nahi karta)
const ALL_BRANCHES = [
  "Delhi", "Mumbai", "Hyderabad", "Noida",
  "Patna", "Gujarat", "Kolkata", "Ahmedabad", "Jaipur", "Bengaluru", "Pune", "Lucknow",
  "Chennai", "Jammu", "Kashmir", "Ranchi", "Prayagraj", "Chandigarh", "Jalandhar",
  "Indore", "Bhopal", "Nagpur", "Dehradun",
];

// ============================== DATA =======================================
// Source: October_2026_Salaries.xlsx — "Payroll (01 Oct - 31 Oct)"
// Sirf 3 columns: Employee ID, Employee Name, To Pay.  row = Excel ki row number (reference ke liye)
// Total To Pay: ₹59,35,202.89 — 397 rows (42 rows ka To Pay 0 hai, woh skip honge → 355 payables)

const DATA_SOURCE = "October_2026_Salaries.xlsx (embedded)";

const DATA = [
  {"row": 2, "employeeId": "1", "name": "pradeep kumar", "toPay": 39999.92},
  {"row": 3, "employeeId": "RM-0006", "name": "GUDIYA", "toPay": 17000},
  {"row": 4, "employeeId": "RM-0021", "name": "PRATEEK", "toPay": 17000},
  {"row": 5, "employeeId": "RM-0022", "name": "SOYAL", "toPay": 11870.97},
  {"row": 6, "employeeId": "31", "name": "RAHUL", "toPay": 16438.71},
  {"row": 7, "employeeId": "RM-0150", "name": "SUNITA", "toPay": 11870.97},
  {"row": 8, "employeeId": "RM-0151", "name": "SHIVAM RAI", "toPay": 14258.06},
  {"row": 9, "employeeId": "RM-0154", "name": "DURGESH GUPTA", "toPay": 15000},
  {"row": 10, "employeeId": "RM-0155", "name": "VAASHU", "toPay": 35000},
  {"row": 11, "employeeId": "RM-0156", "name": "AMIT KUMAR", "toPay": 30967.74},
  {"row": 12, "employeeId": "RM-0158", "name": "GUNJAN RAO", "toPay": 18000},
  {"row": 13, "employeeId": "RM-0159", "name": "RITIKA", "toPay": 17419.35},
  {"row": 14, "employeeId": "RM-0161", "name": "SUNIL BAIRWA", "toPay": 56448},
  {"row": 15, "employeeId": "RM-0162", "name": "JATIN Jarwal", "toPay": 30000},
  {"row": 16, "employeeId": "RM-0164", "name": "Sheetal Bhatiya", "toPay": 35000},
  {"row": 17, "employeeId": "RM-0165", "name": "NISHANT KUSHWAHA", "toPay": 65483.87},
  {"row": 18, "employeeId": "RM-0166", "name": "CHANDAN KUMAR", "toPay": 24193.55},
  {"row": 19, "employeeId": "RM-0167", "name": "JATIN", "toPay": 17419.35},
  {"row": 20, "employeeId": "RM-0168", "name": "RAMSHA", "toPay": 14274.19},
  {"row": 21, "employeeId": "RM-0173", "name": "SANJAY Kumar(old)", "toPay": 70000},
  {"row": 22, "employeeId": "RM-0175", "name": "PRITAM", "toPay": 25000},
  {"row": 23, "employeeId": "RM-0182", "name": "KHUSHBOO", "toPay": 12580.65},
  {"row": 24, "employeeId": "RM-0185", "name": "GOURI SAGAR", "toPay": 11612.9},
  {"row": 25, "employeeId": "RM-0186", "name": "SIMRAN", "toPay": 18000},
  {"row": 26, "employeeId": "RM-0188", "name": "JYOTI kumari", "toPay": 10822.58},
  {"row": 27, "employeeId": "RM-0191", "name": "SANDHYA YADAV", "toPay": 13000},
  {"row": 28, "employeeId": "RM-0194", "name": "DR Panav Talreja", "toPay": 84193.55},
  {"row": 29, "employeeId": "RM-0196", "name": "Yogesh Gupta", "toPay": 11612.9},
  {"row": 30, "employeeId": "RM-00202", "name": "PRASHIK RAUT", "toPay": 14032.26},
  {"row": 31, "employeeId": "RM-0212", "name": "PANKAJ", "toPay": 87096.77},
  {"row": 32, "employeeId": "RM-0221", "name": "REETU", "toPay": 13548.39},
  {"row": 33, "employeeId": "RM-0222", "name": "MOHIT SHAH", "toPay": 29032.26},
  {"row": 34, "employeeId": "RM-0223", "name": "YASHIKA", "toPay": 22000},
  {"row": 35, "employeeId": "RM-0226", "name": "POOJA", "toPay": 15000},
  {"row": 36, "employeeId": "RM-0235", "name": "SATYAM RAI", "toPay": 1935.48},
  {"row": 37, "employeeId": "RM-0236", "name": "MUMTAJ", "toPay": 14274.19},
  {"row": 38, "employeeId": "RM-0248", "name": "VIKAS BAIRWA", "toPay": 14516.13},
  {"row": 39, "employeeId": "RM-0033", "name": "Shaheen", "toPay": 15000},
  {"row": 40, "employeeId": "RM-0035", "name": "Aisha Khan (Inactive)", "toPay": 645.16},
  {"row": 41, "employeeId": "RM-0037", "name": "Harshita Rai", "toPay": 15000},
  {"row": 42, "employeeId": "RM-0044", "name": "Sunita", "toPay": 15000},
  {"row": 43, "employeeId": "RM-0045", "name": "Tanu Thakur", "toPay": 16133.87},
  {"row": 44, "employeeId": "RM-0076", "name": "Anjali Kumari Gudiya", "toPay": 17700},
  {"row": 45, "employeeId": "RM-0098", "name": "Aachal Chaturvedi", "toPay": 15000},
  {"row": 46, "employeeId": "RM-0099", "name": "ANAM", "toPay": 20000},
  {"row": 47, "employeeId": "RM-0119", "name": "Nikita Nikki", "toPay": 20000},
  {"row": 48, "employeeId": "RM-0120", "name": "Nikita Yadav", "toPay": 20000},
  {"row": 49, "employeeId": "RM-0122", "name": "KHUSHI", "toPay": 20000},
  {"row": 50, "employeeId": "RM-0126", "name": "Sushma", "toPay": 15000},
  {"row": 51, "employeeId": "RM-0134", "name": "Himanshi", "toPay": 15000},
  {"row": 52, "employeeId": "RM-0138", "name": "Anjali singh", "toPay": 20000},
  {"row": 53, "employeeId": "RM-0141", "name": "Tulsi", "toPay": 15677.42},
  {"row": 54, "employeeId": "RM-0144", "name": "Vipin Singh", "toPay": 27580.65},
  {"row": 55, "employeeId": "RM-0145", "name": "Shubham Chitransh", "toPay": 33870.97},
  {"row": 56, "employeeId": "263", "name": "BABITA", "toPay": 15000},
  {"row": 57, "employeeId": "264", "name": "RAVI KUSHWAHA", "toPay": 15000},
  {"row": 58, "employeeId": "268", "name": "RAJIV SINGH", "toPay": 13790.32},
  {"row": 59, "employeeId": "269", "name": "ANJALI CHOUDHARY", "toPay": 15000},
  {"row": 60, "employeeId": "270", "name": "KIRAN", "toPay": 16000},
  {"row": 61, "employeeId": "275", "name": "LUCKY", "toPay": 14416.13},
  {"row": 62, "employeeId": "290", "name": "BEAUTY CHAUDHARY", "toPay": 15000},
  {"row": 63, "employeeId": "305", "name": "SACHIN KUMAR", "toPay": 20000},
  {"row": 64, "employeeId": "308", "name": "POONAM", "toPay": 13000},
  {"row": 65, "employeeId": "321", "name": "KAVITA BORA", "toPay": 20000},
  {"row": 66, "employeeId": "342", "name": "PAWAN SHARMA", "toPay": 34500},
  {"row": 67, "employeeId": "345", "name": "RAHUL VASHISHTA", "toPay": 85000},
  {"row": 68, "employeeId": "364", "name": "JANVI GUPTA", "toPay": 16000},
  {"row": 69, "employeeId": "373", "name": "ANJALI MATHUR", "toPay": 13000},
  {"row": 70, "employeeId": "396", "name": "YASHVINDER SINGH", "toPay": 10838.71},
  {"row": 71, "employeeId": "409", "name": "RAJIV KUMAR SINGH", "toPay": 18000},
  {"row": 72, "employeeId": "426", "name": "ANISH CHAUHAN", "toPay": 0},
  {"row": 73, "employeeId": "432", "name": "RINKI YADAV", "toPay": 16000},
  {"row": 74, "employeeId": "442", "name": "RAVI KUMAR", "toPay": 29935.48},
  {"row": 75, "employeeId": "444", "name": "UTKARSH", "toPay": 8709.68},
  {"row": 76, "employeeId": "477", "name": "MANISHA KUMARI", "toPay": 0},
  {"row": 77, "employeeId": "484", "name": "Adarsh Mathur", "toPay": 15000},
  {"row": 78, "employeeId": "485", "name": "Dr Mansi", "toPay": 23387.1},
  {"row": 79, "employeeId": "497", "name": "dinesh", "toPay": 2903.23},
  {"row": 80, "employeeId": "498", "name": "Sourabh Kumar", "toPay": 15000},
  {"row": 81, "employeeId": "503", "name": "AYDEN CARL", "toPay": 0},
  {"row": 82, "employeeId": "504", "name": "KURSAT", "toPay": 0},
  {"row": 83, "employeeId": "509", "name": "Dr Pranendra Singh", "toPay": 130000},
  {"row": 84, "employeeId": "512", "name": "Sheetal Rathour", "toPay": 13000},
  {"row": 85, "employeeId": "515", "name": "Sant Vijiy", "toPay": 21000},
  {"row": 86, "employeeId": "541", "name": "Shaifali", "toPay": 11322.58},
  {"row": 87, "employeeId": "543", "name": "Anjali Sharma (Inactive)", "toPay": 5241.94},
  {"row": 88, "employeeId": "547", "name": "Farheen Ansari", "toPay": 12338.71},
  {"row": 89, "employeeId": "550", "name": "Jassica", "toPay": 0},
  {"row": 90, "employeeId": "552", "name": "Nitika (Inactive)", "toPay": 0},
  {"row": 91, "employeeId": "559", "name": "Muskan", "toPay": 18954.84},
  {"row": 92, "employeeId": "571", "name": "Priyanka Shaw", "toPay": 15000},
  {"row": 93, "employeeId": "579", "name": "Khushbu Mathur (Inactive)", "toPay": 0},
  {"row": 94, "employeeId": "583", "name": "Palak Singh", "toPay": 12161.29},
  {"row": 95, "employeeId": "584", "name": "Shama Nilofar", "toPay": 16453.23},
  {"row": 96, "employeeId": "592", "name": "Yakshi", "toPay": 12500},
  {"row": 97, "employeeId": "596", "name": "Jasleen Kaur", "toPay": 0},
  {"row": 98, "employeeId": "597", "name": "Khushi Jindhad", "toPay": 14709.68},
  {"row": 99, "employeeId": "598", "name": "Md Sarfaraz", "toPay": 10000},
  {"row": 100, "employeeId": "599", "name": "Purnima Singh", "toPay": 14967.74},
  {"row": 101, "employeeId": "601", "name": "Ravina Adhikari", "toPay": 16451.61},
  {"row": 102, "employeeId": "605", "name": "Amaan Mirza", "toPay": 35000},
  {"row": 103, "employeeId": "610", "name": "Kamal Bairwa", "toPay": 9032.26},
  {"row": 104, "employeeId": "611", "name": "Manmohan Bairwa", "toPay": 8387.1},
  {"row": 105, "employeeId": "615", "name": "Sufiyan", "toPay": 25000},
  {"row": 106, "employeeId": "618", "name": "pushpa", "toPay": 20000},
  {"row": 107, "employeeId": "619", "name": "Sneha", "toPay": 20000},
  {"row": 108, "employeeId": "621", "name": "Himanshi Kaushik", "toPay": 15000},
  {"row": 109, "employeeId": "623", "name": "Yogesh Kumar Insha (Left)", "toPay": 0},
  {"row": 110, "employeeId": "628", "name": "Rajesh Sahu (Inactive)", "toPay": 0},
  {"row": 111, "employeeId": "637", "name": "Annu Kumari", "toPay": 0},
  {"row": 112, "employeeId": "650", "name": "Himanshi Chouhan", "toPay": 14032.26},
  {"row": 113, "employeeId": "659", "name": "Muskan Sayed", "toPay": 0},
  {"row": 114, "employeeId": "661", "name": "Aachal Kanaujiya", "toPay": 10467.74},
  {"row": 115, "employeeId": "664", "name": "Abhijeet Kumar Mandal", "toPay": 11612.9},
  {"row": 116, "employeeId": "671", "name": "Ankit Gaur", "toPay": 14609.68},
  {"row": 117, "employeeId": "672", "name": "Mansi Gupta", "toPay": 12822.58},
  {"row": 118, "employeeId": "675", "name": "Suhail", "toPay": 322.58},
  {"row": 119, "employeeId": "679", "name": "Ayushi", "toPay": 14032.26},
  {"row": 120, "employeeId": "683", "name": "Aisha", "toPay": 8225.81},
  {"row": 121, "employeeId": "692", "name": "Dr Ashalata Roy", "toPay": 60000},
  {"row": 122, "employeeId": "696", "name": "Lavanya Thapa", "toPay": 10838.71},
  {"row": 123, "employeeId": "699", "name": "Arman Malik", "toPay": 13474.19},
  {"row": 124, "employeeId": "701", "name": "Nikhil Arora", "toPay": 10932.26},
  {"row": 125, "employeeId": "702", "name": "Simranjeet Kaur", "toPay": 15741.94},
  {"row": 126, "employeeId": "703", "name": "Manmeet Singh", "toPay": 14516.13},
  {"row": 127, "employeeId": "705", "name": "Pushkar Chaudhary", "toPay": 16258.06},
  {"row": 128, "employeeId": "714", "name": "NITIN", "toPay": 10483.87},
  {"row": 129, "employeeId": "716", "name": "Mukesh Kushwaha", "toPay": 12000},
  {"row": 130, "employeeId": "718", "name": "Rajina Tamang", "toPay": 14500},
  {"row": 131, "employeeId": "726", "name": "Marzia Halim", "toPay": 32741.94},
  {"row": 132, "employeeId": "727", "name": "Manmeet Kaur", "toPay": 580.65},
  {"row": 133, "employeeId": "728", "name": "Zohra Halim", "toPay": 21774.19},
  {"row": 134, "employeeId": "732", "name": "Ashu", "toPay": 30000},
  {"row": 135, "employeeId": "734", "name": "Mansi Rai", "toPay": 13161.29},
  {"row": 136, "employeeId": "740", "name": "Harsh Kumar", "toPay": 13300},
  {"row": 137, "employeeId": "746", "name": "Salman Toto", "toPay": 13548.39},
  {"row": 138, "employeeId": "761", "name": "Pramod", "toPay": 9838.71},
  {"row": 139, "employeeId": "766", "name": "Khushman Kumar", "toPay": 0},
  {"row": 140, "employeeId": "772", "name": "Aafzal Ahmed", "toPay": 18000},
  {"row": 141, "employeeId": "774", "name": "Hangama Sayedy", "toPay": 22000},
  {"row": 142, "employeeId": "796", "name": "MD Shajad", "toPay": 16177.42},
  {"row": 143, "employeeId": "797", "name": "Preeti gyadi", "toPay": 0},
  {"row": 144, "employeeId": "802", "name": "Aditya Maurya", "toPay": 25000},
  {"row": 145, "employeeId": "809", "name": "Simran Kaur", "toPay": 14758.06},
  {"row": 146, "employeeId": "814", "name": "Meenu", "toPay": 14900},
  {"row": 147, "employeeId": "821", "name": "KISHMI", "toPay": 0},
  {"row": 148, "employeeId": "831", "name": "Kiran Sharma", "toPay": 9025.81},
  {"row": 149, "employeeId": "842", "name": "Jyoti Kumari", "toPay": 9980.65},
  {"row": 150, "employeeId": "843", "name": "Bindu Kumari", "toPay": 11290.32},
  {"row": 151, "employeeId": "844", "name": "Leeza", "toPay": 1048.39},
  {"row": 152, "employeeId": "845", "name": "Sudhanshu Sharma", "toPay": 13732.26},
  {"row": 153, "employeeId": "848", "name": "AJAY BHATIYA", "toPay": 2709.68},
  {"row": 154, "employeeId": "850", "name": "Harsha", "toPay": 10393.55},
  {"row": 155, "employeeId": "863", "name": "Bhoomika Mehta", "toPay": 13548.39},
  {"row": 156, "employeeId": "864", "name": "Nandni", "toPay": 10338.71},
  {"row": 157, "employeeId": "865", "name": "Pankaj Jarwal", "toPay": 9516.13},
  {"row": 158, "employeeId": "872", "name": "Babita Negi (Inactive)", "toPay": 0},
  {"row": 159, "employeeId": "874", "name": "Dr Ashi Gautam", "toPay": 15803.23},
  {"row": 160, "employeeId": "878", "name": "Chandani", "toPay": 10493.55},
  {"row": 161, "employeeId": "882", "name": "Sharifa Haqbin", "toPay": 15000},
  {"row": 162, "employeeId": "883", "name": "Samad Saifi", "toPay": 11612.9},
  {"row": 163, "employeeId": "889", "name": "Praveen (Inactive)", "toPay": 8480.65},
  {"row": 164, "employeeId": "892", "name": "Bhumi Shresth", "toPay": 14000},
  {"row": 165, "employeeId": "895", "name": "Gautam Pawar", "toPay": 0},
  {"row": 166, "employeeId": "897", "name": "Prabhjot (Inactive)", "toPay": 1580.65},
  {"row": 167, "employeeId": "905", "name": "Surbhi Joshi", "toPay": 13048.39},
  {"row": 168, "employeeId": "910", "name": "Arjun", "toPay": 13840},
  {"row": 169, "employeeId": "916", "name": "Lalbabu Kumar", "toPay": 14900},
  {"row": 170, "employeeId": "921", "name": "Lovely", "toPay": 14000},
  {"row": 171, "employeeId": "922", "name": "Nancy Pateriaya", "toPay": 13448.39},
  {"row": 172, "employeeId": "926", "name": "Priya Kumari", "toPay": 15000},
  {"row": 173, "employeeId": "929", "name": "Jyoti", "toPay": 12000},
  {"row": 174, "employeeId": "935", "name": "Nisha Rajput", "toPay": 14300},
  {"row": 175, "employeeId": "949", "name": "Khushboo", "toPay": 11212.9},
  {"row": 176, "employeeId": "951", "name": "Komal Lodhi", "toPay": 13000},
  {"row": 177, "employeeId": "952", "name": "Bhoomi Kumari Chaurasia", "toPay": 10000},
  {"row": 178, "employeeId": "953", "name": "Ravi", "toPay": 0},
  {"row": 179, "employeeId": "964", "name": "Bharat Goswami", "toPay": 100000},
  {"row": 180, "employeeId": "965", "name": "Sushant Choudhary", "toPay": 130000},
  {"row": 181, "employeeId": "969", "name": "Deepak", "toPay": 18500},
  {"row": 182, "employeeId": "973", "name": "Preeti Ajney", "toPay": 17419.35},
  {"row": 183, "employeeId": "982", "name": "Jayant Kumar", "toPay": 0},
  {"row": 184, "employeeId": "983", "name": "Aman Patwal", "toPay": 24400},
  {"row": 185, "employeeId": "984", "name": "Anuruddh pratap patel", "toPay": 16500},
  {"row": 186, "employeeId": "985", "name": "Vishal Kumar", "toPay": 15000},
  {"row": 187, "employeeId": "990", "name": "Khuwish", "toPay": 11612.9},
  {"row": 188, "employeeId": "991", "name": "Mohammad Nadeem", "toPay": 11612.9},
  {"row": 189, "employeeId": "992", "name": "Sayed Noman", "toPay": 7983.87},
  {"row": 190, "employeeId": "994", "name": "Sonali Kumari", "toPay": 11000},
  {"row": 191, "employeeId": "995", "name": "Mukund Kumar", "toPay": 18000},
  {"row": 192, "employeeId": "996", "name": "Dr Raunak Prasonna", "toPay": 15322.58},
  {"row": 193, "employeeId": "997", "name": "Manisha", "toPay": 12093.55},
  {"row": 194, "employeeId": "998", "name": "Anuj", "toPay": 13000},
  {"row": 195, "employeeId": "999", "name": "Prachi (Inactive)", "toPay": 435.48},
  {"row": 196, "employeeId": "1001", "name": "Anjali", "toPay": 0},
  {"row": 197, "employeeId": "1002", "name": "Shagufi", "toPay": 2580.65},
  {"row": 198, "employeeId": "1003", "name": "Simran Kumari", "toPay": 0},
  {"row": 199, "employeeId": "1006", "name": "Rashi", "toPay": 12900},
  {"row": 200, "employeeId": "1007", "name": "Lakshman (Inactive)", "toPay": 516.13},
  {"row": 201, "employeeId": "1012", "name": "Varsha (Inactive)", "toPay": 0},
  {"row": 202, "employeeId": "1014", "name": "Abhishek", "toPay": 11751.61},
  {"row": 203, "employeeId": "1015", "name": "Kashish Waris", "toPay": 12790.32},
  {"row": 204, "employeeId": "1016", "name": "Manisha Negi", "toPay": 30967.74},
  {"row": 205, "employeeId": "1020", "name": "Poonam", "toPay": 9677.42},
  {"row": 206, "employeeId": "1022", "name": "Nikita", "toPay": 0},
  {"row": 207, "employeeId": "1023", "name": "Mohd Kaif", "toPay": 12380.65},
  {"row": 208, "employeeId": "1024", "name": "Dhruv Nirmal", "toPay": 10838.71},
  {"row": 209, "employeeId": "1025", "name": "Dr Sumedha Sagar", "toPay": 18387.1},
  {"row": 210, "employeeId": "1028", "name": "Tannushri", "toPay": 13000},
  {"row": 211, "employeeId": "1029", "name": "Yogesh Desorey", "toPay": 11225.81},
  {"row": 212, "employeeId": "1030", "name": "Arslan Khan", "toPay": 16000},
  {"row": 213, "employeeId": "1031", "name": "Dayashankar", "toPay": 15000},
  {"row": 214, "employeeId": "1032", "name": "Madan", "toPay": 0},
  {"row": 215, "employeeId": "1033", "name": "Dr Ede Akhila", "toPay": 84193.55},
  {"row": 216, "employeeId": "1034", "name": "Dr Yashu Singh", "toPay": 77419.35},
  {"row": 217, "employeeId": "1035", "name": "Aadil", "toPay": 12922.58},
  {"row": 218, "employeeId": "1037", "name": "Krishna", "toPay": 13500},
  {"row": 219, "employeeId": "1038", "name": "Rishabh Sonker", "toPay": 14032.26},
  {"row": 220, "employeeId": "1040", "name": "Vipul Rao", "toPay": 36128},
  {"row": 221, "employeeId": "1041", "name": "Sakshi Bhardwaj (Inactive)", "toPay": 3870.97},
  {"row": 222, "employeeId": "1042", "name": "Kunal Sharma (Inactive)", "toPay": 4193.55},
  {"row": 223, "employeeId": "1045", "name": "Aditya (Inactive)", "toPay": 0},
  {"row": 224, "employeeId": "1049", "name": "ASFIYA TAJANNUM", "toPay": 15000},
  {"row": 225, "employeeId": "1051", "name": "Jyoti", "toPay": 12161.29},
  {"row": 226, "employeeId": "1052", "name": "Hemant", "toPay": 13182.26},
  {"row": 227, "employeeId": "1053", "name": "Prachi Kumari", "toPay": 11322.58},
  {"row": 228, "employeeId": "1054", "name": "Naziya", "toPay": 10483.87},
  {"row": 229, "employeeId": "1055", "name": "Farhin Gul", "toPay": 13000},
  {"row": 230, "employeeId": "1056", "name": "Shubham Kumar", "toPay": 12000},
  {"row": 231, "employeeId": "1057", "name": "Monika Verma", "toPay": 30000},
  {"row": 232, "employeeId": "1058", "name": "Nishu kumari", "toPay": 0},
  {"row": 233, "employeeId": "1060", "name": "Rishab", "toPay": 12193.55},
  {"row": 234, "employeeId": "1061", "name": "Shalu Rathore", "toPay": 36161.29},
  {"row": 235, "employeeId": "1062", "name": "Rahmatullah Nikbeen", "toPay": 19645.16},
  {"row": 236, "employeeId": "1063", "name": "Shivam", "toPay": 10887.1},
  {"row": 237, "employeeId": "1064", "name": "Veenit Kumar", "toPay": 13000},
  {"row": 238, "employeeId": "1065", "name": "Prachi (Inactive)", "toPay": 0},
  {"row": 239, "employeeId": "1066", "name": "Tannnu Nirwan", "toPay": 12380.65},
  {"row": 240, "employeeId": "1067", "name": "Shashank Chauhan (Inactive)", "toPay": 838.71},
  {"row": 241, "employeeId": "1069", "name": "Shahalam", "toPay": 12000},
  {"row": 242, "employeeId": "1070", "name": "Kannu", "toPay": 8000},
  {"row": 243, "employeeId": "1071", "name": "Chirag Suri", "toPay": 29838.71},
  {"row": 244, "employeeId": "1072", "name": "Aarti (Inactive)", "toPay": 0},
  {"row": 245, "employeeId": "1074", "name": "Adibh Ramteke", "toPay": 91935.48},
  {"row": 246, "employeeId": "1075", "name": "Yuvraj", "toPay": 8258.06},
  {"row": 247, "employeeId": "1076", "name": "Vikas", "toPay": 12580.65},
  {"row": 248, "employeeId": "1077", "name": "Urmila", "toPay": 12000},
  {"row": 249, "employeeId": "1078", "name": "Radha", "toPay": 12000},
  {"row": 250, "employeeId": "1079", "name": "Sunil Kumar", "toPay": 15353},
  {"row": 251, "employeeId": "1080", "name": "Meena Barekzai", "toPay": 17999.99},
  {"row": 252, "employeeId": "1085", "name": "Harshita Sharmaa (Inactive)", "toPay": 0},
  {"row": 253, "employeeId": "1086", "name": "Mamta", "toPay": 11322.58},
  {"row": 254, "employeeId": "1087", "name": "Mannat Bisht (Inactive)", "toPay": 0},
  {"row": 255, "employeeId": "1088", "name": "Sneha Negi (Inactive)", "toPay": 7838.71},
  {"row": 256, "employeeId": "1089", "name": "Bhavneet Kaur (Inactive)", "toPay": 7764.52},
  {"row": 257, "employeeId": "1090", "name": "Taniya Pawar", "toPay": 13700},
  {"row": 258, "employeeId": "1091", "name": "Preeti Singh", "toPay": 12580.65},
  {"row": 259, "employeeId": "1092", "name": "Manoj", "toPay": 0},
  {"row": 260, "employeeId": "1093", "name": "Rounak Singh", "toPay": 12480.65},
  {"row": 261, "employeeId": "1095", "name": "Chhavi (Inactive)", "toPay": 0},
  {"row": 262, "employeeId": "1096", "name": "Anu", "toPay": 13064.52},
  {"row": 263, "employeeId": "1097", "name": "Isha (Inactive)", "toPay": 3387.1},
  {"row": 264, "employeeId": "1099", "name": "Bhumika Yadav", "toPay": 11432.26},
  {"row": 265, "employeeId": "1100", "name": "Aniket Saket", "toPay": 13000},
  {"row": 266, "employeeId": "1101", "name": "Abhijeet Kumar Poddar", "toPay": 12900},
  {"row": 267, "employeeId": "1102", "name": "Ajay", "toPay": 12900},
  {"row": 268, "employeeId": "1105", "name": "Khushi Rajput", "toPay": 13250},
  {"row": 269, "employeeId": "1106", "name": "Sneha", "toPay": 13000},
  {"row": 270, "employeeId": "1107", "name": "Prashant Saini", "toPay": 16000},
  {"row": 271, "employeeId": "1108", "name": "saima", "toPay": 2935.48},
  {"row": 272, "employeeId": "1109", "name": "Kusum", "toPay": 10138.71},
  {"row": 273, "employeeId": "1110", "name": "Nikki Kumari", "toPay": 13000},
  {"row": 274, "employeeId": "1111", "name": "Sudha", "toPay": 13000},
  {"row": 275, "employeeId": "1112", "name": "Rahul Soni", "toPay": 16112.9},
  {"row": 276, "employeeId": "1115", "name": "Vivek", "toPay": 13419.35},
  {"row": 277, "employeeId": "1116", "name": "Neetu", "toPay": 11000},
  {"row": 278, "employeeId": "1117", "name": "Ajay", "toPay": 12790.32},
  {"row": 279, "employeeId": "1118", "name": "Jaishri (Inactive)", "toPay": 1677.42},
  {"row": 280, "employeeId": "1120", "name": "Rakhi (Inactive)", "toPay": 419.35},
  {"row": 281, "employeeId": "1121", "name": "Vanshika Singh", "toPay": 12480.65},
  {"row": 282, "employeeId": "1122", "name": "Sakshi (Inactive)", "toPay": 0},
  {"row": 283, "employeeId": "1123", "name": "Frozan Gul Mohammadi", "toPay": 12000},
  {"row": 284, "employeeId": "1124", "name": "Arif Waziri", "toPay": 9483.87},
  {"row": 285, "employeeId": "1125", "name": "Sashank", "toPay": 89900},
  {"row": 286, "employeeId": "1126", "name": "Rakhi", "toPay": 9677.42},
  {"row": 287, "employeeId": "1127", "name": "Laxmi Soni", "toPay": 8806.45},
  {"row": 288, "employeeId": "1128", "name": "Harsh Kumar Keshri", "toPay": 12480.65},
  {"row": 289, "employeeId": "1129", "name": "Vijay", "toPay": 9032.26},
  {"row": 290, "employeeId": "1130", "name": "Tanvi", "toPay": 13000},
  {"row": 291, "employeeId": "1131", "name": "Meenakshi Ahuja", "toPay": 19354.84},
  {"row": 292, "employeeId": "1132", "name": "Varsha Rani (Inactive)", "toPay": 8709.68},
  {"row": 293, "employeeId": "1133", "name": "Rakhi", "toPay": 14300},
  {"row": 294, "employeeId": "1134", "name": "Anamika Kumari", "toPay": 13800},
  {"row": 295, "employeeId": "1135", "name": "Kashish", "toPay": 11951.61},
  {"row": 296, "employeeId": "1136", "name": "Disha  Behrani", "toPay": 13200},
  {"row": 297, "employeeId": "1137", "name": "Mohd Aman saifi", "toPay": 12387.1},
  {"row": 298, "employeeId": "1138", "name": "Priyanshi", "toPay": 15000},
  {"row": 299, "employeeId": "1139", "name": "Manisha Yadav", "toPay": 15000},
  {"row": 300, "employeeId": "1140", "name": "Bipasha (Inactive)", "toPay": 0},
  {"row": 301, "employeeId": "1141", "name": "Tarun Tripathi (Inactive)", "toPay": 0},
  {"row": 302, "employeeId": "1142", "name": "Alankrita Singh", "toPay": 13774.19},
  {"row": 303, "employeeId": "1143", "name": "Anchal", "toPay": 12193.55},
  {"row": 304, "employeeId": "1144", "name": "Anjali", "toPay": 12270.97},
  {"row": 305, "employeeId": "1145", "name": "Muskan", "toPay": 10912.9},
  {"row": 306, "employeeId": "1146", "name": "Rakesh Kumar MIshra (Left)", "toPay": 0},
  {"row": 307, "employeeId": "1147", "name": "Parul Jain", "toPay": 12161.29},
  {"row": 308, "employeeId": "1148", "name": "Arsalaan Raza (Inactive)", "toPay": 3048.39},
  {"row": 309, "employeeId": "1149", "name": "Kiran", "toPay": 13000},
  {"row": 310, "employeeId": "1150", "name": "Rohit Kumar", "toPay": 13000},
  {"row": 311, "employeeId": "1151", "name": "Vimal Bisht (Inactive)", "toPay": 0},
  {"row": 312, "employeeId": "1152", "name": "Himanshu Saxena", "toPay": 14316.13},
  {"row": 313, "employeeId": "1153", "name": "Deepti Rawat (Inactive)", "toPay": 0},
  {"row": 314, "employeeId": "1154", "name": "Bhoomi Singh", "toPay": 12790.32},
  {"row": 315, "employeeId": "1155", "name": "shivendra singh", "toPay": 15000},
  {"row": 316, "employeeId": "1156", "name": "Pratiksha", "toPay": 12900},
  {"row": 317, "employeeId": "1157", "name": "Priti Raw", "toPay": 12996.77},
  {"row": 318, "employeeId": "1159", "name": "Nitin (Inactive)", "toPay": 3048.39},
  {"row": 319, "employeeId": "1161", "name": "Dr Bobby Garg", "toPay": 60000},
  {"row": 320, "employeeId": "1162", "name": "Anshika Singh (Inactive)", "toPay": 0},
  {"row": 321, "employeeId": "1163", "name": "Adnan khan", "toPay": 12580.65},
  {"row": 322, "employeeId": "1164", "name": "Sakshi", "toPay": 13000},
  {"row": 323, "employeeId": "1165", "name": "Rajni (Inactive)", "toPay": 677.42},
  {"row": 324, "employeeId": "1166", "name": "Akansha (Inactive)", "toPay": 241.94},
  {"row": 325, "employeeId": "1170", "name": "Aman Kumar", "toPay": 67741.94},
  {"row": 326, "employeeId": "1172", "name": "Rekha", "toPay": 14000},
  {"row": 327, "employeeId": "1173", "name": "Nitin", "toPay": 13548.39},
  {"row": 328, "employeeId": "1174", "name": "Ruchi mehra", "toPay": 15000},
  {"row": 329, "employeeId": "1175", "name": "Mursal", "toPay": 30000},
  {"row": 330, "employeeId": "1176", "name": "Bhawna", "toPay": 14000},
  {"row": 331, "employeeId": "1177", "name": "Ashish Ranjan Sharma", "toPay": 18000},
  {"row": 332, "employeeId": "1178", "name": "Rani Yadav", "toPay": 14516.13},
  {"row": 333, "employeeId": "1179", "name": "Annu", "toPay": 18000},
  {"row": 334, "employeeId": "1180", "name": "Vivek Kumar", "toPay": 18000},
  {"row": 335, "employeeId": "1181", "name": "Kajal", "toPay": 14416.13},
  {"row": 336, "employeeId": "1182", "name": "Sonu Kumar", "toPay": 10000},
  {"row": 337, "employeeId": "1183", "name": "Lavanya Narula", "toPay": 10903.23},
  {"row": 338, "employeeId": "1184", "name": "Anshika Maurya (Inactive)", "toPay": 9677.42},
  {"row": 339, "employeeId": "1185", "name": "Anshu Kumar", "toPay": 12822.58},
  {"row": 340, "employeeId": "1186", "name": "Simran", "toPay": 11322.58},
  {"row": 341, "employeeId": "1187", "name": "Rohit Gupta", "toPay": 32000},
  {"row": 342, "employeeId": "1188", "name": "Krishna Bairwa", "toPay": 15000},
  {"row": 343, "employeeId": "1189", "name": "Md Sameer", "toPay": 14000},
  {"row": 344, "employeeId": "1190", "name": "jiraak", "toPay": 15000},
  {"row": 345, "employeeId": "1191", "name": "Latha", "toPay": 15000},
  {"row": 346, "employeeId": "1192", "name": "Tannu", "toPay": 12480.65},
  {"row": 347, "employeeId": "1193", "name": "Varsha Kumari", "toPay": 10903.23},
  {"row": 348, "employeeId": "1195", "name": "Dr Nishu Arora", "toPay": 33870.97},
  {"row": 349, "employeeId": "1196", "name": "Dr Kanupriya Vashisth", "toPay": 0},
  {"row": 350, "employeeId": "1197", "name": "Dr Ajeet Kumar Gupta", "toPay": 0},
  {"row": 351, "employeeId": "1198", "name": "Dr Rahul Ranjan", "toPay": 26129.03},
  {"row": 352, "employeeId": "1199", "name": "Dr Tanmay Kaushik", "toPay": 46451.61},
  {"row": 353, "employeeId": "1200", "name": "Dr Safiya Naiyar", "toPay": 40645.16},
  {"row": 354, "employeeId": "1201", "name": "Dr Nupur", "toPay": 17741.94},
  {"row": 355, "employeeId": "1202", "name": "Md Ashif (Inactive)", "toPay": 629.03},
  {"row": 356, "employeeId": "1203", "name": "Amaan Nadeem", "toPay": 9045.16},
  {"row": 357, "employeeId": "1204", "name": "Jyoti Gupta", "toPay": 9225.81},
  {"row": 358, "employeeId": "1205", "name": "Muskan", "toPay": 9935.48},
  {"row": 359, "employeeId": "1206", "name": "Priya (Inactive)", "toPay": 967.74},
  {"row": 360, "employeeId": "1207", "name": "Sabiur Alam", "toPay": 9806.45},
  {"row": 361, "employeeId": "1208", "name": "Saniya Shaikh", "toPay": 13064.52},
  {"row": 362, "employeeId": "1209", "name": "Paras Chauhan", "toPay": 9225.81},
  {"row": 363, "employeeId": "1210", "name": "Aman Deep", "toPay": 1806.45},
  {"row": 364, "employeeId": "1211", "name": "Anmol", "toPay": 7548.39},
  {"row": 365, "employeeId": "1212", "name": "Sonam", "toPay": 9225.81},
  {"row": 366, "employeeId": "1213", "name": "Ashish", "toPay": 12000},
  {"row": 367, "employeeId": "1214", "name": "Priya", "toPay": 2516.13},
  {"row": 368, "employeeId": "1215", "name": "Samarjeet Singh", "toPay": 8177.42},
  {"row": 369, "employeeId": "1216", "name": "Deepanshu", "toPay": 209.68},
  {"row": 370, "employeeId": "1217", "name": "Khushi", "toPay": 4645.16},
  {"row": 371, "employeeId": "1218", "name": "Shital Bhardwaj", "toPay": 1258.06},
  {"row": 372, "employeeId": "1219", "name": "Nabiya", "toPay": 5661.29},
  {"row": 373, "employeeId": "1221", "name": "Anas", "toPay": 6709.68},
  {"row": 374, "employeeId": "1222", "name": "OM Sharma", "toPay": 6290.32},
  {"row": 375, "employeeId": "1223", "name": "Suruchi Kumari", "toPay": 6290.32},
  {"row": 376, "employeeId": "1224", "name": "Disha", "toPay": 5451.61},
  {"row": 377, "employeeId": "1225", "name": "Nikhil", "toPay": 5451.61},
  {"row": 378, "employeeId": "1226", "name": "Prakhar Tyagi", "toPay": 5351.61},
  {"row": 379, "employeeId": "1227", "name": "Mustafa Noureldin Mohamed", "toPay": 13064.52},
  {"row": 380, "employeeId": "1228", "name": "Divya", "toPay": 3774.19},
  {"row": 381, "employeeId": "1229", "name": "Riya", "toPay": 3327.42},
  {"row": 382, "employeeId": "1230", "name": "Nishikanta mandal", "toPay": 13064.52},
  {"row": 383, "employeeId": "1231", "name": "Neha", "toPay": 4193.55},
  {"row": 384, "employeeId": "1232", "name": "Sakshi Kumari", "toPay": 4193.55},
  {"row": 385, "employeeId": "1234", "name": "Noori", "toPay": 3564.52},
  {"row": 386, "employeeId": "1235", "name": "Gulistha Parveen", "toPay": 4416.13},
  {"row": 387, "employeeId": "1236", "name": "Ritu", "toPay": 0},
  {"row": 388, "employeeId": "1237", "name": "Mohd Faizal Zaidi", "toPay": 2709.68},
  {"row": 389, "employeeId": "1238", "name": "Aakash", "toPay": 6854.84},
  {"row": 390, "employeeId": "1239", "name": "Prachi Pandey", "toPay": 1677.42},
  {"row": 391, "employeeId": "1240", "name": "Kriti", "toPay": 1806.45},
  {"row": 392, "employeeId": "1241", "name": "DIPENDER KUMAR", "toPay": 10838.71},
  {"row": 393, "employeeId": "1242", "name": "Seema Kumari", "toPay": 2709.68},
  {"row": 394, "employeeId": "1243", "name": "Jatin", "toPay": 1741.94},
  {"row": 395, "employeeId": "1244", "name": "Anchal", "toPay": 3612.9},
  {"row": 396, "employeeId": "1245", "name": "vivek kumar", "toPay": 419.35},
  {"row": 397, "employeeId": "1246", "name": "Dr Subba Reddy", "toPay": 8225.81},
  {"row": 398, "employeeId": "1247", "name": "Yogesh Kumar Insha", "toPay": 32903.23},
];

// ============================== ARGS =======================================

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const arg = (k) => {
  const hit = argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : undefined;
};

const COMMIT = has("--commit");
const UPDATE_EXISTING = has("--update-existing");
const ALLOW_NAME_MISMATCH = has("--allow-name-mismatch");
const SKIP_INACTIVE = has("--skip-inactive");
const REVERT_ID = arg("revert") || null;

const FILE = arg("file") || null; // null = embedded DATA use hoga
const SOURCE_NAME = FILE ? path.basename(FILE) : DATA_SOURCE;
const PERIOD = { month: Number(arg("month") || DEFAULTS.month), year: Number(arg("year") || DEFAULTS.year) };
const DUE_DATE = arg("due") ?? DEFAULTS.due;

const MONGODB_URI = process.env.MONGODB_URI;

// ============================== HELPERS ====================================

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (m) => MONTHS[m - 1] || String(m);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const oid = (v) => new mongoose.Types.ObjectId(v);
const normHeader = (s) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

// "RM-0003" == "rm-3" == "RM 0003";  "031" == "31"
function normEmpId(v) {
  let s = String(v ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!s) return "";
  if (/^\d+(\.0+)?$/.test(s)) return String(parseInt(s, 10));
  const m = s.match(/^([A-Z]+)-?0*(\d+)$/);
  if (m) return `${m[1]}-${parseInt(m[2], 10)}`;
  return s;
}

const TITLES = new Set(["dr", "mr", "mrs", "ms", "miss", "hr", "md", "sh", "smt"]);
const nameTokens = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !TITLES.has(t));

// Sheet name vs DB name — loose check, sirf obvious galti pakadne ke liye
function namesMatch(a, b) {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  if (ta.join(" ") === tb.join(" ")) return true;
  if (ta[0] === tb[0]) return true;
  const [small, big] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const bigSet = new Set(big);
  if (small.every((t) => bigSet.has(t))) return true;
  const overlap = small.filter((t) => bigSet.has(t)).length;
  return overlap / small.length >= 0.75;
}

function parseAmount(v) {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[₹,\s]/g, "");
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const log = {
  head: (t) => console.log(`\n${"═".repeat(74)}\n  ${t}\n${"═".repeat(74)}`),
  step: (t) => console.log(`\n── ${t} ${"─".repeat(Math.max(0, 68 - t.length))}`),
  ok: (t) => console.log(`   ✓ ${t}`),
  warn: (t) => console.log(`   ⚠ ${t}`),
  err: (t) => console.log(`   ✗ ${t}`),
  info: (t) => console.log(`     ${t}`),
};

const RUN_TAG = `SAL-${PERIOD.year}-${String(PERIOD.month).padStart(2, "0")}-${Date.now()}`;

const report = {
  runTag: RUN_TAG,
  mode: REVERT_ID ? "revert" : COMMIT ? "commit" : "dry-run",
  file: FILE || "embedded",
  period: PERIOD,
  startedAt: new Date().toISOString(),
  uploadBatchId: null,
  toCreate: [],
  toUpdate: [],
  skipped: [],
  failed: [],
  warnings: [],
  totals: {},
};

function skip(r, reason, extra = {}) {
  report.skipped.push({ row: r.row, employeeId: r.employeeId, name: r.name, amount: r.amount, reason, ...extra });
}

function writeReport() {
  const dir = path.join(process.cwd(), "scripts", "reports");
  fs.mkdirSync(dir, { recursive: true });
  const base = path.join(dir, `salary-payables-${RUN_TAG}`);
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(`${base}.json`, JSON.stringify(report, null, 2));

  // Skipped rows ka CSV — Excel mein khol ke fix karna easy
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["Row", "Employee ID", "Name", "To Pay", "Reason"].map(esc).join(",")];
  for (const s of report.skipped) lines.push([s.row, s.employeeId, s.name, s.amount, s.reason].map(esc).join(","));
  fs.writeFileSync(`${base}-skipped.csv`, lines.join("\n"));

  log.ok(`Report: ${path.relative(process.cwd(), base)}.json`);
  log.ok(`Skipped list: ${path.relative(process.cwd(), base)}-skipped.csv`);
}

// ============================== READ EXCEL =================================

function readEmbedded() {
  log.step("STEP 1 — Embedded data (isi file se)");
  const rows = DATA.map((d) => ({
    row: d.row,
    employeeId: String(d.employeeId ?? "").trim(),
    name: String(d.name ?? "").trim(),
    amount: round2(parseAmount(d.toPay)),
    rawAmount: d.toPay,
  }));
  const total = rows.reduce((s, r) => s + (r.amount > 0 ? r.amount : 0), 0);
  log.ok(`${rows.length} rows — To Pay total ${inr(total)}`);
  report.totals.sheetRows = rows.length;
  report.totals.sheetAmount = round2(total);
  return rows;
}

function readSheet() {
  if (!FILE) return readEmbedded();
  log.step("STEP 1 — Excel padh rahe hain");
  let XLSX;
  try { XLSX = require("xlsx"); } catch { throw new Error("--file ke liye 'xlsx' package chahiye (npm i xlsx) — ya --file hata do, embedded data use hoga"); }
  const abs = path.resolve(FILE);
  if (!fs.existsSync(abs)) throw new Error(`File nahi mili: ${abs}  (--file=<path> do)`);

  const wb = XLSX.readFile(abs, { cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });

  // Header row dhoondho (pehli 10 rows mein)
  let headerIdx = -1;
  let col = {};
  for (let i = 0; i < Math.min(10, grid.length); i++) {
    const hdr = (grid[i] || []).map(normHeader);
    const find = (names) => hdr.findIndex((h) => names.includes(h));
    const c = { id: find(HEADERS.id), name: find(HEADERS.name), amount: find(HEADERS.amount) };
    if (c.id >= 0 && c.amount >= 0) { headerIdx = i; col = c; break; }
  }
  if (headerIdx < 0) throw new Error(`Header row nahi mila. Columns chahiye: "Employee ID", "Employee Name", "To Pay"`);

  log.ok(`Sheet "${wb.SheetNames[0]}" — header row ${headerIdx + 1}`);

  const rows = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const g = grid[i] || [];
    const rawId = g[col.id];
    const name = col.name >= 0 ? String(g[col.name] ?? "").trim() : "";
    const rawAmt = g[col.amount];
    if ((rawId === null || String(rawId).trim() === "") && !name && (rawAmt === null || rawAmt === "")) continue; // blank
    rows.push({
      row: i + 1,
      employeeId: rawId === null ? "" : String(rawId).trim(),
      name,
      amount: round2(parseAmount(rawAmt)),
      rawAmount: rawAmt,
    });
  }

  const total = rows.reduce((s, r) => s + (r.amount > 0 ? r.amount : 0), 0);
  log.ok(`${rows.length} rows mile — To Pay total ${inr(total)}`);
  report.totals.sheetRows = rows.length;
  report.totals.sheetAmount = round2(total);
  return rows;
}

// ============================== MATCH ======================================

async function matchEmployees(rows, Employees) {
  log.step("STEP 2 — Employee ID se employees match");

  const all = await Employees.find(
    { employeeId: { $nin: [null, ""] }, $or: [{ mergedInto: null }, { mergedInto: { $exists: false } }] },
    { projection: { name: 1, employeeId: 1, branch: 1, isactive: 1 } },
  ).toArray();

  const byExact = new Map();
  const byNorm = new Map();
  const push = (m, k, e) => { if (!m.has(k)) m.set(k, []); m.get(k).push(e); };
  for (const e of all) {
    push(byExact, String(e.employeeId).trim(), e);
    push(byNorm, normEmpId(e.employeeId), e);
  }
  log.info(`DB mein ${all.length} employees ke paas employeeId hai`);

  const seenSheetId = new Map();
  const seenEmployee = new Map();
  const matched = [];

  for (const r of rows) {
    if (!r.employeeId) { skip(r, "Employee ID blank"); continue; }
    if (!Number.isFinite(r.amount)) { skip(r, `To Pay number nahi hai ("${r.rawAmount}")`); continue; }
    if (!(r.amount > 0)) { skip(r, `To Pay ${r.amount} hai — payable nahi banega`); continue; }

    const nk = normEmpId(r.employeeId);
    if (seenSheetId.has(nk)) { skip(r, `Sheet mein same Employee ID pehle row ${seenSheetId.get(nk)} pe bhi hai`); continue; }
    seenSheetId.set(nk, r.row);

    let cands = byExact.get(r.employeeId) || byNorm.get(nk) || [];
    if (cands.length > 1) {
      const active = cands.filter((e) => e.isactive !== false);
      if (active.length === 1) cands = active;
    }
    if (cands.length > 1) {
      const nameHit = cands.filter((e) => namesMatch(r.name, e.name));
      if (nameHit.length === 1) cands = nameHit;
    }

    if (cands.length === 0) { skip(r, "Employee ID DB mein nahi mila"); continue; }
    if (cands.length > 1) {
      skip(r, `${cands.length} employees ka same Employee ID hai — manually theek karo`, {
        candidates: cands.map((e) => ({ _id: String(e._id), name: e.name, employeeId: e.employeeId })),
      });
      continue;
    }

    const emp = cands[0];
    const empKey = String(emp._id);
    if (seenEmployee.has(empKey)) { skip(r, `Yeh employee (${emp.name}) row ${seenEmployee.get(empKey)} se already match ho chuka`); continue; }

    if (r.name && !namesMatch(r.name, emp.name)) {
      if (!ALLOW_NAME_MISMATCH) {
        skip(r, `Naam match nahi: sheet "${r.name}" vs DB "${emp.name}" (${emp.employeeId}) — sahi ho toh --allow-name-mismatch`, { dbId: empKey, dbName: emp.name });
        continue;
      }
      report.warnings.push({ row: r.row, employeeId: r.employeeId, msg: `Name mismatch allowed: sheet "${r.name}" vs DB "${emp.name}"` });
    }

    if (emp.isactive === false) {
      if (SKIP_INACTIVE) { skip(r, `Employee inactive hai (${emp.name})`); continue; }
      report.warnings.push({ row: r.row, employeeId: r.employeeId, msg: `${emp.name} DB mein inactive hai — phir bhi payable ban raha hai` });
    }

    let branch = emp.branch;
    if (!ALL_BRANCHES.includes(branch)) {
      report.warnings.push({ row: r.row, employeeId: r.employeeId, msg: `${emp.name} ka branch "${branch ?? ""}" invalid/blank — ${FALLBACK_BRANCH} use hoga` });
      branch = FALLBACK_BRANCH;
    }

    seenEmployee.set(empKey, r.row);
    matched.push({ ...r, emp, branch });
  }

  log.ok(`${matched.length} rows match hue`);
  if (report.skipped.length) log.warn(`${report.skipped.length} rows skip (neeche list)`);
  if (report.warnings.length) log.warn(`${report.warnings.length} warnings (report file mein)`);
  return matched;
}

// ============================== PAID CHECK =================================

async function paidAgainst(ids) {
  if (!ids.length) return new Map();
  const db = mongoose.connection;
  const paid = new Map();
  const add = (rows) => rows.forEach((x) => paid.set(String(x._id), (paid.get(String(x._id)) || 0) + x.amt));
  add(await db.collection("transactions").aggregate([
    { $match: { payableId: { $in: ids }, approvalStatus: { $ne: "REJECTED" } } },
    { $group: { _id: "$payableId", amt: { $sum: "$amount" } } },
  ]).toArray());
  add(await db.collection("borrowings").aggregate([
    { $match: { payableId: { $in: ids }, direction: "OUT", isCancelled: { $ne: true } } },
    { $group: { _id: "$payableId", amt: { $sum: "$amount" } } },
  ]).toArray());
  return paid;
}

// ============================== BUILD ======================================

async function plan(matched, Payables) {
  log.step(`STEP 3 — SALARY payables plan (${monthName(PERIOD.month)} ${PERIOD.year})`);

  const existing = await Payables.find({
    purpose: "SALARY",
    "payee.kind": "EMPLOYEE",
    "period.month": PERIOD.month,
    "period.year": PERIOD.year,
    isCancelled: { $ne: true },
    "payee.refId": { $in: matched.map((m) => m.emp._id) },
  }).project({ "payee.refId": 1, totalAmount: 1, log: 1 }).toArray();

  const existingBy = new Map();
  for (const p of existing) {
    const k = String(p.payee.refId);
    if (!existingBy.has(k)) existingBy.set(k, []);
    existingBy.get(k).push(p);
  }
  const paidMap = UPDATE_EXISTING ? await paidAgainst(existing.map((p) => p._id)) : new Map();

  const now = new Date();
  const due = DUE_DATE ? new Date(DUE_DATE) : now;
  const remark = `Salary ${monthName(PERIOD.month)} ${PERIOD.year} — bulk import from ${SOURCE_NAME}`;

  for (const m of matched) {
    const key = String(m.emp._id);
    const ex = existingBy.get(key) || [];

    if (ex.length > 1) {
      skip(m, `${ex.length} SALARY payables already hain is period ke — manually check karo`, { existing: ex.map((p) => String(p._id)) });
      continue;
    }
    if (ex.length === 1) {
      const p = ex[0];
      if (round2(p.totalAmount) === m.amount) { skip(m, `Payable already hai same amount ${inr(p.totalAmount)} (${p._id})`); continue; }
      if (!UPDATE_EXISTING) {
        skip(m, `Payable already hai ${inr(p.totalAmount)} (${p._id}) — sheet ${inr(m.amount)}; revise karna ho toh --update-existing`);
        continue;
      }
      const paid = paidMap.get(String(p._id)) || 0;
      if (paid > m.amount) { skip(m, `Naya amount ${inr(m.amount)} already paid ${inr(paid)} se kam hai — manually dekho`); continue; }
      report.toUpdate.push({ row: m.row, employeeId: m.employeeId, name: m.emp.name, payableId: String(p._id), from: p.totalAmount, to: m.amount, paid });
      continue;
    }

    report.toCreate.push({
      row: m.row,
      employeeId: m.employeeId,
      sheetName: m.name,
      doc: {
        _id: new mongoose.Types.ObjectId(),
        payee: { kind: "EMPLOYEE", refId: m.emp._id, label: m.emp.name || m.name },
        purpose: "SALARY",
        expenseCategory: "Salary",
        expenseSubType: "Salary",
        period: { month: PERIOD.month, year: PERIOD.year },
        totalAmount: m.amount,
        dueDate: due,
        branch: m.branch,
        remarks: remark,
        isCancelled: false,
        receipts: [],
        costAlreadyRecognised: false,
        excludeFromPnl: false,
        tdsLink: { role: null, linkedId: null },
        uploadBatch: null, // commit pe set hoga
        importBatch: RUN_TAG,
        log: [{
          _id: new mongoose.Types.ObjectId(),
          action: "Created",
          newValue: String(m.amount),
          note: `Bulk salary import — ${RUN_TAG} — sheet row ${m.row}, Employee ID ${m.employeeId}`,
          performedBy: { name: ACTOR.name, email: ACTOR.email },
          performedAt: now,
        }],
        createdBy: { ...ACTOR, date: now },
        createdAt: now,
        updatedAt: now,
        __v: 0,
      },
    });
  }

  const createTotal = report.toCreate.reduce((s, c) => s + c.doc.totalAmount, 0);
  report.totals.createCount = report.toCreate.length;
  report.totals.createAmount = round2(createTotal);
  report.totals.updateCount = report.toUpdate.length;
  report.totals.skipCount = report.skipped.length;

  log.ok(`Naye payables: ${report.toCreate.length} — total ${inr(createTotal)}`);
  report.toCreate.slice(0, 10).forEach((c) => log.info(`  + ${c.employeeId.padEnd(9)} ${c.doc.payee.label.padEnd(24)} ${inr(c.doc.totalAmount).padStart(12)}  ${c.doc.branch}`));
  if (report.toCreate.length > 10) log.info(`  … aur ${report.toCreate.length - 10}`);

  if (report.toUpdate.length) {
    log.ok(`Revise honge: ${report.toUpdate.length}`);
    report.toUpdate.slice(0, 10).forEach((u) => log.info(`  ~ ${u.employeeId.padEnd(9)} ${u.name.padEnd(24)} ${inr(u.from)} → ${inr(u.to)}`));
  }

  if (report.skipped.length) {
    log.warn(`Skip: ${report.skipped.length}`);
    report.skipped.sort((a, b) => a.row - b.row);
    const done = report.skipped.filter((s) => s.reason.startsWith("Payable already hai same amount"));
    if (done.length) log.info(`  (${done.length} rows ka payable pehle se same amount ke saath hai — list report mein)`);
    report.skipped.filter((s) => !done.includes(s)).forEach((s) => log.info(`  - row ${String(s.row).padEnd(4)} ${String(s.employeeId).padEnd(9)} ${String(s.name).padEnd(22)} ${s.reason}`));
  }
}

// ============================== COMMIT =====================================

async function commit(Payables, Batches) {
  log.step("STEP 4 — DB mein likh rahe hain");

  if (!report.toCreate.length && !report.toUpdate.length) { log.warn("Kuch likhne ko nahi hai."); return; }

  let batch = null;
  if (report.toCreate.length) {
    const batchNo = (await Batches.countDocuments()) + 1;
    const now = new Date();
    batch = {
      _id: new mongoose.Types.ObjectId(),
      batchNo,
      kind: "PAYABLE",
      label: `Salary ${monthName(PERIOD.month)} ${PERIOD.year} (script)`,
      fileName: SOURCE_NAME,
      totalRows: report.totals.sheetRows,
      createdPayables: [],
      createdCampaignLeads: [],
      failedRows: [],
      rowHashes: [],
      status: "processing",
      createdBy: { ...ACTOR, date: now },
      createdAt: now,
      updatedAt: now,
      __v: 0,
    };
    await Batches.insertOne(batch);
    report.uploadBatchId = String(batch._id);

    const docs = report.toCreate.map((c) => ({ ...c.doc, uploadBatch: batch._id }));
    const inserted = new Set();
    try {
      await Payables.insertMany(docs, { ordered: false });
      docs.forEach((d) => inserted.add(String(d._id)));
    } catch (err) {
      const failedIdx = new Set((err.writeErrors || []).map((we) => we.index));
      docs.forEach((d, i) => { if (!failedIdx.has(i)) inserted.add(String(d._id)); });
      for (const we of err.writeErrors || []) {
        const c = report.toCreate[we.index];
        report.failed.push({
          row: c?.row, employeeId: c?.employeeId, name: c?.doc?.payee?.label,
          error: we.code === 11000 ? "duplicate — is employee/period ka payable already hai" : (we.errmsg || we.message),
        });
      }
      if (!err.writeErrors) throw err;
    }

    const created = docs.filter((d) => inserted.has(String(d._id)));
    const amt = created.reduce((s, d) => s + d.totalAmount, 0);
    await Batches.updateOne({ _id: batch._id }, {
      $set: {
        createdPayables: created.map((d) => d._id),
        failedRows: report.failed.map((f) => ({ _id: new mongoose.Types.ObjectId(), rowNumber: f.row, error: f.error })),
        status: created.length === 0 ? "failed" : report.failed.length ? "partial" : "completed",
        updatedAt: new Date(),
      },
    });
    report.totals.createdCount = created.length;
    report.totals.createdAmount = round2(amt);
    log.ok(`${created.length} payables bane — ${inr(amt)}  (Upload batch #${batch.batchNo})`);
    if (report.failed.length) log.err(`${report.failed.length} fail hue — report dekho`);
  }

  if (report.toUpdate.length) {
    const now = new Date();
    const ops = report.toUpdate.map((u) => ({
      updateOne: {
        filter: { _id: oid(u.payableId), isCancelled: { $ne: true } },
        update: {
          $set: { totalAmount: u.to, updatedAt: now },
          $push: {
            log: {
              _id: new mongoose.Types.ObjectId(),
              action: "Amount Revised",
              previousValue: String(u.from),
              newValue: String(u.to),
              note: `Bulk salary import — ${RUN_TAG} — sheet row ${u.row}`,
              performedBy: { name: ACTOR.name, email: ACTOR.email },
              performedAt: now,
            },
          },
        },
      },
    }));
    const res = await Payables.bulkWrite(ops, { ordered: false });
    log.ok(`${res.modifiedCount} payables revise hue`);
  }
}

// ============================== REVERT =====================================

async function revert(Payables, Batches) {
  log.step(`REVERT — upload batch ${REVERT_ID}`);
  if (!/^[a-f0-9]{24}$/i.test(REVERT_ID)) throw new Error("--revert=<uploadBatchId> (24-char id, report file mein 'uploadBatchId')");

  const batch = await Batches.findOne({ _id: oid(REVERT_ID) });
  if (!batch) throw new Error("Batch nahi mila");
  if (batch.status === "reverted") throw new Error("Yeh batch already reverted hai");

  const ids = (batch.createdPayables || []).map((x) => oid(String(x)));
  const paid = await paidAgainst(ids);
  const cancellable = ids.filter((id) => !(paid.get(String(id)) > 0));
  const blocked = ids.length - cancellable.length;

  log.info(`Batch #${batch.batchNo} "${batch.label}" — ${ids.length} payables`);
  log.info(`${cancellable.length} cancel honge (soft-cancel), ${blocked} pe payment ho chuka hai — woh rahenge`);
  if (!COMMIT) { log.warn("DRY RUN — --commit lagao revert ke liye"); return; }

  const now = new Date();
  const performedBy = { name: ACTOR.name, email: ACTOR.email };
  const r = await Payables.updateMany(
    { _id: { $in: cancellable }, isCancelled: { $ne: true } },
    {
      $set: { isCancelled: true, updatedAt: now },
      $push: { log: { _id: new mongoose.Types.ObjectId(), action: "Cancelled", previousValue: "false", newValue: "true", note: `Bulk upload batch #${batch.batchNo} reverted (script)`, performedBy, performedAt: now } },
    },
  );
  await Batches.updateOne({ _id: batch._id }, { $set: { status: "reverted", revertedAt: now, revertedBy: performedBy, updatedAt: now } });
  log.ok(`${r.modifiedCount} payables cancel hue`);
  report.reverted = { cancelled: r.modifiedCount, keptBecausePaid: blocked };
}

// ============================== MAIN =======================================

async function main() {
  if (!MONGODB_URI) {
    console.error("MONGODB_URI set nahi hai. Aise chalao:\n  node --env-file=.env.local scripts/import-salary-payables.mjs");
    process.exit(1);
  }
  if (!(PERIOD.month >= 1 && PERIOD.month <= 12) || !(PERIOD.year >= 2000)) throw new Error("--month / --year galat hai");
  if (DUE_DATE && Number.isNaN(new Date(DUE_DATE).getTime())) throw new Error("--due galat date hai (YYYY-MM-DD)");

  log.head(`Salary payables — ${monthName(PERIOD.month)} ${PERIOD.year}`);
  console.log(`  Mode : ${report.mode.toUpperCase()}${COMMIT ? "" : "   (likhne ke liye --commit lagao)"}`);
  console.log(`  Data : ${FILE || DATA_SOURCE}`);

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  const Employees = mongoose.connection.collection("employees");
  const Payables = mongoose.connection.collection("payables");
  const Batches = mongoose.connection.collection("uploadbatches");

  try {
    if (REVERT_ID) {
      await revert(Payables, Batches);
    } else {
      const rows = readSheet();
      const matched = await matchEmployees(rows, Employees);
      await plan(matched, Payables);
      if (COMMIT) await commit(Payables, Batches);
      else log.warn("DRY RUN — DB mein kuch nahi likha. Sab theek lage toh --commit ke saath dobara chalao.");
    }

    log.head("Summary");
    if (!REVERT_ID) {
      console.log(`  Sheet rows        : ${report.totals.sheetRows}   (To Pay ${inr(report.totals.sheetAmount)})`);
      console.log(`  Payables (new)    : ${report.totals.createCount}   (${inr(report.totals.createAmount)})`);
      console.log(`  Payables (revise) : ${report.totals.updateCount}`);
      console.log(`  Skipped           : ${report.totals.skipCount}`);
      if (COMMIT) console.log(`  Failed            : ${report.failed.length}`);
      if (report.uploadBatchId) {
        console.log(`  Upload batch id   : ${report.uploadBatchId}`);
        console.log(`\n  Undo: node --env-file=.env.local scripts/import-salary-payables.mjs --revert=${report.uploadBatchId} --commit`);
        console.log(`        (ya Admin → Uploads page se revert)`);
      }
    }
    writeReport();
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (err) => {
  log.err(err.message);
  try { writeReport(); } catch {}
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
