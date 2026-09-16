// scripts/import-employees-sep2026.mjs
//
// Creates or updates 40 employees from the September 2026 staff list — matched by phone,
// following the same safe-identity conventions as scripts/employees-bulk-update.mjs (this
// database has real duplicate/collision history: "Muskan Sharma" vs "Muskan Sayed" vs
// "Hr Muskan" were all different people, "Sheetal"/"Sheetal Bhatiya" and "MOHIT SHAH" were
// literal duplicate records — phone alone is not identity, and Employee has no unique index on
// it, so two real people CAN share one).
//
// ─── SCHEMA CHANGE THIS SCRIPT ASSUMES ──────────────────────────────────────────────────────
//
// `Employee.role` is now a free-form required String (no fixed enum) and `Employee.employeeId`
// exists (String, trim, default ""). This list's designations — "CAMERAMAN", "OT STAFF",
// "OFFICE BOY", "NURSHING", "RECEPTIONIST", "Pharmacist", "Stock & Medicine", "Receptionist Cum
// Sales" — could not have been stored under the old 7-value enum at all, which is exactly why
// the free-form change was made. If this script is run against a database that still has the
// old enum, every create/update below will fail validation with a clear Mongoose error; that is
// the schema not having caught up, not a bug in this script.
//
// ─── COLUMN 4 vs COLUMN 5, AND WHY ONLY COLUMN 4 IS WRITTEN ─────────────────────────────────
//
// The source list carries TWO role-like columns per person: a specific designation ("CAMERAMAN",
// "OT STAFF", "TECHNICIAN") and a broader legacy bucket ("Others", "Technician") — the bucket is
// what the OLD fixed enum forced everyone into. `Employee.role` is written from the SPECIFIC
// designation (column 4), per the schema comment's own intent ("designations now come from the
// business's own list") — the bucket is kept only as `legacyCategory` in this script's own
// output/report, for reference, and is never written anywhere.
//
// THIS HAS A REAL CONSEQUENCE, FLAGGED RATHER THAN SILENTLY FIXED: three rows carry a
// designation that differs from the historical bucket only in CASE —
//     Akshay (row 2) and Manoj (row 23): "TECHNICIAN" vs the old bucket "Technician"
//     Sahil Jatav (row 6):               "IMPLANTER"  vs the old bucket "Implanter"
// If any dashboard or report still does a case-sensitive `Employee.find({ role: "Technician" })`
// (the sales/staff-360 queries this schema's own index comment mentions do exactly this), those
// three will NOT match it once `role` is set to the all-caps designation. This script writes the
// designation EXACTLY AS GIVEN by default — it does not silently retitle your data — and prints
// this exact warning every run. Pass --normalize-role-case to title-case just these three
// historical-bucket names (and nothing else) if you'd rather avoid the mismatch.
//
// ─── NO BRANCH COLUMN IN THIS LIST ───────────────────────────────────────────────────────────
//
// The sheet gives no per-employee branch signal at all. For a NEW employee this leaves
// `branch` to the schema's own default ("Delhi") unless you pass `--branch=<X>` to apply one
// branch to every new hire in this run. For an EXISTING employee (matched by phone), branch is
// never touched — there is no signal here to justify overwriting whatever is already on file.
//
// ─── MATCHING AND SAFETY ─────────────────────────────────────────────────────────────────────
//
//   0 employees share this phone  -> CREATE (employeeId, name, role, phone, isactive, branch
//                                    per above, salaryStructure, incentiveRate 0)
//   1 employee shares this phone  -> UPDATE, but only after the same name-similarity check
//                                    employees-bulk-update.mjs uses (title-stripped first-word
//                                    match, or ≥75% word overlap, and a bare single-word name
//                                    NEVER auto-matches on its own) — a phone match against a
//                                    dissimilar stored name is held for --confirm-name-mismatch
//   >1 employee shares this phone -> AMBIGUOUS, never auto-resolved, listed for manual review
//
// Updatable fields on a safe match: name (formatting refresh only), employeeId, role, isactive,
// salaryStructure.baseSalary/salaryType/effectiveFrom. incentiveRate is never touched by this
// script — it isn't in the source list.
//
// Zero-salary rows (MOHD FAIZAN, row 20) are still created/updated — a zero base salary is an
// attribute, not a reason to skip the employee record — but flagged as a warning.
//
// Usage:
//   node scripts/import-employees-sep2026.mjs                                # dry run
//   node scripts/import-employees-sep2026.mjs --dump-json                     # rows out, no DB
//   node scripts/import-employees-sep2026.mjs --apply                       # create + safe updates
//   node scripts/import-employees-sep2026.mjs --apply --confirm-name-mismatch
//   node scripts/import-employees-sep2026.mjs --apply --branch=Delhi         # new hires only
//   node scripts/import-employees-sep2026.mjs --apply --normalize-role-case

import mongoose from "mongoose";
import fs from "fs";

for (const f of [".env.local", ".env"]) {
  if (fs.existsSync(f)) {
    try { process.loadEnvFile(f); } catch {}
  }
}
const MONGODB_URI = process.env.MONGODB_URI;

// ═══════════════════════════════════════════════════════════════════════════════
// THE DATA — parsed directly from the pasted staff list, not re-typed. `legacyCategory` is kept
// for reference only and is never written to the database.
// ═══════════════════════════════════════════════════════════════════════════════
const ROWS = [
  {
    "rowNum": 1,
    "employeeId": "RM-0012",
    "name": "ABHISHEK",
    "role": "CAMERAMAN",
    "legacyCategory": "Others",
    "phone": "9634938655",
    "isactive": true,
    "baseSalary": 35000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2024-01-10"
  },
  {
    "rowNum": 2,
    "employeeId": "465",
    "name": "Akshay",
    "role": "TECHNICIAN",
    "legacyCategory": "Technician",
    "phone": "7620872364",
    "isactive": true,
    "baseSalary": 10000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2025-06-09"
  },
  {
    "rowNum": 3,
    "employeeId": "592",
    "name": "Yakshi",
    "role": "OT STAFF",
    "legacyCategory": "Others",
    "phone": "7065776394",
    "isactive": true,
    "baseSalary": 12500.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2025-10-14"
  },
  {
    "rowNum": 4,
    "employeeId": "632",
    "name": "AKSHAY KUMAR",
    "role": "OT STAFF",
    "legacyCategory": "Others",
    "phone": "9571122663",
    "isactive": true,
    "baseSalary": 10000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2025-11-01"
  },
  {
    "rowNum": 5,
    "employeeId": "634",
    "name": "VAISHNAVI JAISWAL",
    "role": "OT STAFF",
    "legacyCategory": "Others",
    "phone": "9930568483",
    "isactive": true,
    "baseSalary": 14000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2025-11-01"
  },
  {
    "rowNum": 6,
    "employeeId": "706",
    "name": "Sahil Jatav",
    "role": "IMPLANTER",
    "legacyCategory": "Implanter",
    "phone": "9315814985",
    "isactive": true,
    "baseSalary": 26000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2025-12-05"
  },
  {
    "rowNum": 7,
    "employeeId": "723",
    "name": "Anamta Sayyed",
    "role": "RECEPTIONIST",
    "legacyCategory": "Others",
    "phone": "9217870380",
    "isactive": true,
    "baseSalary": 15000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2025-12-02"
  },
  {
    "rowNum": 8,
    "employeeId": "784",
    "name": "Aashtha",
    "role": "NURSHING",
    "legacyCategory": "Others",
    "phone": "8976026105",
    "isactive": true,
    "baseSalary": 15000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-02-01"
  },
  {
    "rowNum": 9,
    "employeeId": "796",
    "name": "MD Shajad",
    "role": "OFFICE BOY",
    "legacyCategory": "Others",
    "phone": "7093779384",
    "isactive": true,
    "baseSalary": 17000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2025-12-29"
  },
  {
    "rowNum": 10,
    "employeeId": "804",
    "name": "khushi diwakar",
    "role": "NURSHING",
    "legacyCategory": "Others",
    "phone": "8874585193",
    "isactive": true,
    "baseSalary": 15000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-01-07"
  },
  {
    "rowNum": 11,
    "employeeId": "865",
    "name": "Pankaj Jarwal",
    "role": "OT STAFF",
    "legacyCategory": "Others",
    "phone": "9694011978",
    "isactive": true,
    "baseSalary": 10000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-09-01"
  },
  {
    "rowNum": 12,
    "employeeId": "930",
    "name": "VIJAY KISHAN NAWDE",
    "role": "OFFICE BOY",
    "legacyCategory": "Others",
    "phone": "8169353441",
    "isactive": true,
    "baseSalary": 18000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-04-18"
  },
  {
    "rowNum": 13,
    "employeeId": "931",
    "name": "NASHRA SHAIKH",
    "role": "NURSHING",
    "legacyCategory": "Others",
    "phone": "9137085071",
    "isactive": true,
    "baseSalary": 15000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-04-10"
  },
  {
    "rowNum": 14,
    "employeeId": "932",
    "name": "VIKRAM KUMAR",
    "role": "OT STAFF",
    "legacyCategory": "Others",
    "phone": "6351231413",
    "isactive": true,
    "baseSalary": 14000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-05-26"
  },
  {
    "rowNum": 15,
    "employeeId": "936",
    "name": "misbah shaikh",
    "role": "NURSHING",
    "legacyCategory": "Others",
    "phone": "9029780869",
    "isactive": true,
    "baseSalary": 15000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-04-10"
  },
  {
    "rowNum": 16,
    "employeeId": "944",
    "name": "Aliya shaikh",
    "role": "OT STAFF",
    "legacyCategory": "Others",
    "phone": "9167225573",
    "isactive": true,
    "baseSalary": 15000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-06-01"
  },
  {
    "rowNum": 17,
    "employeeId": "955",
    "name": "sania shaikh",
    "role": "RECEPTIONIST",
    "legacyCategory": "Others",
    "phone": "9137084832",
    "isactive": true,
    "baseSalary": 18000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-06-11"
  },
  {
    "rowNum": 18,
    "employeeId": "956",
    "name": "ALVIRA SHAIKH",
    "role": "RECEPTIONIST",
    "legacyCategory": "Others",
    "phone": "9136140356",
    "isactive": true,
    "baseSalary": 16000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-06-12"
  },
  {
    "rowNum": 19,
    "employeeId": "1003",
    "name": "Simran Kumari",
    "role": "OT STAFF",
    "legacyCategory": "Others",
    "phone": "8340354676",
    "isactive": true,
    "baseSalary": 12000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-06-29"
  },
  {
    "rowNum": 20,
    "employeeId": "1005",
    "name": "MOHD  FAIZAN",
    "role": "OT STAFF",
    "legacyCategory": "Others",
    "phone": "9076266381",
    "isactive": true,
    "baseSalary": 0.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-06-29"
  },
  {
    "rowNum": 21,
    "employeeId": "1072",
    "name": "Aarti",
    "role": "Agent",
    "legacyCategory": "Agent",
    "phone": "8076360317",
    "isactive": true,
    "baseSalary": 13000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-09-02"
  },
  {
    "rowNum": 22,
    "employeeId": "1073",
    "name": "Tsegay Menberu Araya",
    "role": "OT STAFF",
    "legacyCategory": "Others",
    "phone": "9990899028",
    "isactive": true,
    "baseSalary": 12000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-09-02"
  },
  {
    "rowNum": 23,
    "employeeId": "1092",
    "name": "Manoj",
    "role": "TECHNICIAN",
    "legacyCategory": "Technician",
    "phone": "6397511894",
    "isactive": true,
    "baseSalary": 70000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-09-08"
  },
  {
    "rowNum": 24,
    "employeeId": "1094",
    "name": "Anubhav",
    "role": "Agent",
    "legacyCategory": "Agent",
    "phone": "8448905018",
    "isactive": true,
    "baseSalary": 13000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-09-09"
  },
  {
    "rowNum": 25,
    "employeeId": "1103",
    "name": "Nihita Kain",
    "role": "Agent",
    "legacyCategory": "Agent",
    "phone": "8700928305",
    "isactive": true,
    "baseSalary": 13500.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-09-09"
  },
  {
    "rowNum": 26,
    "employeeId": "1104",
    "name": "Saniya",
    "role": "Agent",
    "legacyCategory": "Agent",
    "phone": "9873740194",
    "isactive": true,
    "baseSalary": 13000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-09-09"
  },
  {
    "rowNum": 27,
    "employeeId": "1106",
    "name": "Sneha",
    "role": "RECEPTIONIST",
    "legacyCategory": "Others",
    "phone": "7065663558",
    "isactive": true,
    "baseSalary": 13000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-09-07"
  },
  {
    "rowNum": 28,
    "employeeId": "1107",
    "name": "Prashant Saini",
    "role": "OT STAFF",
    "legacyCategory": "Others",
    "phone": "9519964860",
    "isactive": true,
    "baseSalary": 16000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-09-04"
  },
  {
    "rowNum": 29,
    "employeeId": "1108",
    "name": "saima",
    "role": "Receptionist Cum Sales",
    "legacyCategory": "Others",
    "phone": "9664044414",
    "isactive": true,
    "baseSalary": 14000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-09-06"
  },
  {
    "rowNum": 30,
    "employeeId": "1112",
    "name": "Rahul Soni",
    "role": "Pharmacist",
    "legacyCategory": "Others",
    "phone": "9519831209",
    "isactive": true,
    "baseSalary": 18500.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-09-09"
  },
  {
    "rowNum": 31,
    "employeeId": "1113",
    "name": "Kajal",
    "role": "OT STAFF",
    "legacyCategory": "Others",
    "phone": "8800467838",
    "isactive": true,
    "baseSalary": 13000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-09-11"
  },
  {
    "rowNum": 32,
    "employeeId": "1114",
    "name": "Harkesh Prajapati",
    "role": "OFFICE BOY",
    "legacyCategory": "Others",
    "phone": "8448366516",
    "isactive": true,
    "baseSalary": 8000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-08-01"
  },
  {
    "rowNum": 33,
    "employeeId": "1115",
    "name": "Vivek",
    "role": "Stock & Medicine",
    "legacyCategory": "Others",
    "phone": "8076006527",
    "isactive": true,
    "baseSalary": 16000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-09-08"
  },
  {
    "rowNum": 34,
    "employeeId": "1116",
    "name": "Neetu",
    "role": "Agent",
    "legacyCategory": "Agent",
    "phone": "7303329220",
    "isactive": true,
    "baseSalary": 11000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-09-14"
  },
  {
    "rowNum": 35,
    "employeeId": "1117",
    "name": "Ajay",
    "role": "Agent",
    "legacyCategory": "Agent",
    "phone": "9267996590",
    "isactive": true,
    "baseSalary": 13000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-09-15"
  },
  {
    "rowNum": 36,
    "employeeId": "1118",
    "name": "Jaishri",
    "role": "Agent",
    "legacyCategory": "Agent",
    "phone": "9485611455",
    "isactive": true,
    "baseSalary": 13000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-09-14"
  },
  {
    "rowNum": 37,
    "employeeId": "1119",
    "name": "Muskaan",
    "role": "Agent",
    "legacyCategory": "Agent",
    "phone": "7292054272",
    "isactive": true,
    "baseSalary": 13000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-09-14"
  },
  {
    "rowNum": 38,
    "employeeId": "1120",
    "name": "Rakhi",
    "role": "Agent",
    "legacyCategory": "Agent",
    "phone": "9315756522",
    "isactive": true,
    "baseSalary": 13000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-09-14"
  },
  {
    "rowNum": 39,
    "employeeId": "1121",
    "name": "Vanshika Singh",
    "role": "Agent",
    "legacyCategory": "Agent",
    "phone": "7678518921",
    "isactive": true,
    "baseSalary": 13000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-09-14"
  },
  {
    "rowNum": 40,
    "employeeId": "1122",
    "name": "Sakshi",
    "role": "Agent",
    "legacyCategory": "Agent",
    "phone": "8368252097",
    "isactive": true,
    "baseSalary": 12000.0,
    "salaryType": "Monthly",
    "effectiveFrom": "2026-09-14"
  }
];

// --- args ------------------------------------------------------------------
const args = process.argv.slice(2);
const arg = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const APPLY = args.includes("--apply");
const DUMP_JSON = args.includes("--dump-json");
const CONFIRM_NAME_MISMATCH = args.includes("--confirm-name-mismatch");
const NORMALIZE_ROLE_CASE = args.includes("--normalize-role-case");
const NEW_HIRE_BRANCH = arg("branch") || null;

const IMPORT_IDENTITY = { name: "Bulk Import", email: "import@system", branch: "" };
const inr = (n) => "Rs " + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const norm = (s) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

// Historical bucket names the old fixed enum used to force everyone into — only these three
// case-insensitive collisions exist in this list (see header note).
const HISTORICAL_BUCKETS = ["Agent", "Counsellor", "Doctor", "Technician", "Implanter", "Others", "Hr"];
function resolveRole(rawRole) {
  if (!NORMALIZE_ROLE_CASE) return rawRole;
  const hit = HISTORICAL_BUCKETS.find((b) => norm(b) === norm(rawRole));
  return hit && hit !== rawRole ? hit : rawRole;
}

if (DUMP_JSON) {
  fs.writeFileSync("employees-sep2026-payload.json", JSON.stringify(ROWS, null, 2));
  console.log(`Wrote employees-sep2026-payload.json — ${ROWS.length} row(s).`);
  process.exit(0);
}

if (!MONGODB_URI) {
  console.error("MONGODB_URI missing — checked .env.local and .env.");
  process.exit(1);
}
if (NEW_HIRE_BRANCH) {
  // ALL_BRANCHES duplicated here rather than imported — a script can't pull in the @/-aliased
  // module.
  const ALL_BRANCHES = [
    "Delhi", "Mumbai", "Hyderabad", "Noida",
    "Patna", "Kolkata", "Ahmedabad", "Jaipur", "Bengaluru", "Pune", "Lucknow",
    "Chennai", "Jammu", "Kashmir", "Ranchi", "Prayagraj", "Chandigarh", "Jalandhar",
  ];
  if (!ALL_BRANCHES.includes(NEW_HIRE_BRANCH)) {
    console.error(`--branch="${NEW_HIRE_BRANCH}" is not a valid branch.`);
    process.exit(1);
  }
}

// Same rule employees-bulk-update.mjs settled on: a shared title ("Dr"/"Hr") isn't identity, and
// neither is a bare single word on its own — this database has proved both wrong more than once.
const TITLES = new Set(["DR", "MR", "MRS", "MS", "MD", "HR"]);
function words(name) {
  const w = (name || "").toUpperCase().replace(/[^A-Z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  let i = 0; while (i < w.length && TITLES.has(w[i])) i++;
  return w.slice(i);
}
function isSafeNameMatch(a, b) {
  const wa = words(a), wb = words(b);
  if (wa.length < 2 || wb.length < 2) return norm(a) === norm(b);
  if (wa[0] === wb[0]) return true;
  const sa = new Set(wa), sb = new Set(wb);
  let shared = 0; for (const w of sa) if (sb.has(w)) shared++;
  return shared / Math.min(sa.size, sb.size) >= 0.75;
}

function validate() {
  const errors = [];
  for (const r of ROWS) {
    const where = `row ${r.rowNum} (${r.name})`;
    if (!r.name) errors.push(`${where}: name is required`);
    if (!r.role) errors.push(`${where}: role is required`);
    if (!r.phone) errors.push(`${where}: phone is required`);
    if (!(r.baseSalary >= 0)) errors.push(`${where}: baseSalary must be >= 0`);
    if (!["Monthly", "Daily", "Hourly"].includes(r.salaryType)) errors.push(`${where}: invalid salaryType "${r.salaryType}"`);
    if (isNaN(new Date(r.effectiveFrom).getTime())) errors.push(`${where}: bad effectiveFrom "${r.effectiveFrom}"`);
  }
  return errors;
}

async function run() {
  console.log("=".repeat(92));
  console.log(APPLY ? "MODE: APPLY  <- will write to the database" : "MODE: DRY RUN  <- nothing will be written");
  console.log(`Rows: ${ROWS.length}`);
  if (NEW_HIRE_BRANCH) console.log(`New-hire branch override: ${NEW_HIRE_BRANCH}`);
  console.log(`Role casing: ${NORMALIZE_ROLE_CASE ? "historical-bucket names title-cased" : "written exactly as given (pass --normalize-role-case to change this)"}`);
  console.log("=".repeat(92) + "\n");

  const errors = validate();
  if (errors.length) {
    console.error(`VALIDATION FAILED — ${errors.length} problem(s). Nothing imported.\n`);
    errors.forEach((e) => console.error("  " + e));
    process.exit(1);
  }
  console.log("Validation passed.\n");

  const caseCollisions = ROWS.filter((r) => HISTORICAL_BUCKETS.some((b) => norm(b) === norm(r.role) && b !== r.role));
  if (caseCollisions.length) {
    console.log("!".repeat(92));
    console.log(`CASE COLLISION WARNING — ${caseCollisions.length} row(s) have a designation that differs from a`);
    console.log("historical role-bucket name ONLY in case. A case-sensitive dashboard query on the old bucket");
    console.log("name (e.g. role: \"Technician\") will NOT match these unless you pass --normalize-role-case.");
    console.log("!".repeat(92));
    caseCollisions.forEach((r) => console.log(`  row ${r.rowNum}  ${r.name.padEnd(20)} designation "${r.role}"  vs historical "${HISTORICAL_BUCKETS.find((b) => norm(b) === norm(r.role))}"`));
    console.log("");
  }

  const zeroSalary = ROWS.filter((r) => r.baseSalary === 0);
  if (zeroSalary.length) {
    console.log(`NOTE — ${zeroSalary.length} row(s) have a zero base salary (created/updated anyway, just flagged):`);
    zeroSalary.forEach((r) => console.log(`  row ${r.rowNum}  ${r.name}  (${r.phone})`));
    console.log("");
  }

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  const Employee = mongoose.models.Employee || mongoose.model("Employee", new mongoose.Schema({}, { strict: false, collection: "employees" }));

  console.log("Resolving each row against existing employees by phone...\n");
  const toCreate = [];
  const toUpdate = [];
  const needsConfirm = [];
  const ambiguous = [];
  const upToDate = [];

  for (const r of ROWS) {
    const matches = await Employee.find({ phone: r.phone }).select("_id name role isactive employeeId salaryStructure").lean();

    if (!matches.length) { toCreate.push(r); continue; }
    if (matches.length > 1) { ambiguous.push({ r, matches }); continue; }

    const emp = matches[0];
    if (!isSafeNameMatch(r.name, emp.name) && !CONFIRM_NAME_MISMATCH) {
      needsConfirm.push({ r, emp });
      continue;
    }

    const role = resolveRole(r.role);
    const changes = [];
    if ((emp.employeeId || "") !== r.employeeId) changes.push({ field: "employeeId", from: emp.employeeId || "", to: r.employeeId });
    if (norm(emp.name) !== norm(r.name)) changes.push({ field: "name", from: emp.name, to: r.name });
    if (emp.role !== role) changes.push({ field: "role", from: emp.role, to: role });
    if (Boolean(emp.isactive) !== r.isactive) changes.push({ field: "isactive", from: emp.isactive, to: r.isactive });
    if (Number(emp.salaryStructure?.baseSalary || 0) !== r.baseSalary)
      changes.push({ field: "salaryStructure.baseSalary", from: emp.salaryStructure?.baseSalary ?? 0, to: r.baseSalary });
    if ((emp.salaryStructure?.salaryType || "Monthly") !== r.salaryType)
      changes.push({ field: "salaryStructure.salaryType", from: emp.salaryStructure?.salaryType, to: r.salaryType });
    const oldEff = emp.salaryStructure?.effectiveFrom ? new Date(emp.salaryStructure.effectiveFrom).toISOString().slice(0, 10) : null;
    if (oldEff !== r.effectiveFrom)
      changes.push({ field: "salaryStructure.effectiveFrom", from: oldEff, to: r.effectiveFrom });

    if (!changes.length) { upToDate.push({ r, emp }); continue; }
    toUpdate.push({ r, emp, changes });
  }

  console.log(`  New employees to create : ${toCreate.length}`);
  console.log(`  Existing, will update   : ${toUpdate.length}`);
  console.log(`  Already up to date      : ${upToDate.length}`);
  console.log(`  Name mismatch (held)    : ${needsConfirm.length}  (needs --confirm-name-mismatch)`);
  console.log(`  Ambiguous (never auto)  : ${ambiguous.length}`);

  if (toCreate.length) {
    console.log("\n--- WILL CREATE ---");
    toCreate.forEach((r) =>
      console.log(`  row ${String(r.rowNum).padStart(3)}  ${r.employeeId.padEnd(9)} ${r.name.padEnd(22)} ${r.role.padEnd(22)} ${r.phone}  ${inr(r.baseSalary)}`),
    );
  }

  if (toUpdate.length) {
    console.log("\n--- WILL UPDATE ---");
    toUpdate.forEach(({ r, emp, changes }) => {
      console.log(`  row ${r.rowNum}  "${r.name}" (${r.phone})  ->  ${emp._id}`);
      changes.forEach((c) => console.log(`      ${c.field}: ${JSON.stringify(c.from)}  ->  ${JSON.stringify(c.to)}`));
    });
  }

  if (needsConfirm.length) {
    console.log("\n" + "!".repeat(92));
    console.log("NAME MISMATCH — phone matches an existing employee whose stored name looks different.");
    console.log("Not updated unless you pass --confirm-name-mismatch. Review carefully:");
    console.log("!".repeat(92));
    needsConfirm.forEach(({ r, emp }) => console.log(`  row ${r.rowNum}  sheet: "${r.name}" (${r.phone})  ->  existing: "${emp.name}" (${emp._id})`));
  }

  if (ambiguous.length) {
    console.log("\n--- AMBIGUOUS (more than one employee shares this phone — never auto-resolved) ---");
    ambiguous.forEach(({ r, matches }) => {
      console.log(`  row ${r.rowNum}  "${r.name}" (${r.phone})`);
      matches.forEach((m) => console.log(`      ${m._id}  "${m.name}"  role=${m.role}`));
    });
  }

  if (!toCreate.length && !toUpdate.length) {
    console.log("\nNothing to create or update.");
    await mongoose.disconnect();
    return;
  }

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply once the lists above look right.");
    await mongoose.disconnect();
    return;
  }

  console.log(`\nCreating ${toCreate.length} employee(s)...`);
  const created = [];
  const failed = [];

  for (const r of toCreate) {
    try {
      const doc = await Employee.create({
        employeeId: r.employeeId,
        name: r.name,
        role: resolveRole(r.role),
        phone: r.phone,
        isactive: r.isactive,
        ...(NEW_HIRE_BRANCH ? { branch: NEW_HIRE_BRANCH } : {}),
        salaryStructure: {
          baseSalary: r.baseSalary,
          salaryType: r.salaryType,
          effectiveFrom: new Date(r.effectiveFrom),
        },
        incentiveRate: 0,
      });
      created.push({ rowNum: r.rowNum, name: r.name, id: String(doc._id) });
      console.log(`  row ${String(r.rowNum).padStart(3)}  ${r.name.padEnd(22)}  CREATED -> ${doc._id}`);
    } catch (err) {
      failed.push({ rowNum: r.rowNum, name: r.name, reason: err?.message || String(err) });
      console.log(`  row ${String(r.rowNum).padStart(3)}  ${r.name.padEnd(22)}  FAILED: ${err?.message || err}`);
    }
  }

  console.log(`\nUpdating ${toUpdate.length} employee(s)...`);
  const updated = [];

  for (const { r, emp, changes } of toUpdate) {
    try {
      const setFields = {};
      changes.forEach((c) => {
        if (c.field.startsWith("salaryStructure.")) {
          const sub = c.field.split(".")[1];
          setFields[`salaryStructure.${sub}`] = sub === "effectiveFrom" ? new Date(c.to) : c.to;
        } else {
          setFields[c.field] = c.field === "isactive" ? Boolean(c.to) : c.to;
        }
      });
      await Employee.updateOne({ _id: emp._id }, { $set: setFields });
      updated.push({ rowNum: r.rowNum, name: r.name, id: String(emp._id), changes });
      console.log(`  row ${String(r.rowNum).padStart(3)}  ${r.name.padEnd(22)}  UPDATED (${emp._id}) — ${changes.length} field(s)`);
    } catch (err) {
      failed.push({ rowNum: r.rowNum, name: r.name, reason: err?.message || String(err) });
      console.log(`  row ${String(r.rowNum).padStart(3)}  ${r.name.padEnd(22)}  FAILED: ${err?.message || err}`);
    }
  }

  console.log(`\nCreated ${created.length}, updated ${updated.length}, failed ${failed.length}.`);

  const reportPath = `employees-sep2026-report-${Date.now()}.json`;
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        created, updated, failed,
        skippedNameMismatch: CONFIRM_NAME_MISMATCH ? [] : needsConfirm.map(({ r, emp }) => ({ rowNum: r.rowNum, sheetName: r.name, existingId: String(emp._id), existingName: emp.name })),
        skippedAmbiguous: ambiguous.map(({ r, matches }) => ({ rowNum: r.rowNum, name: r.name, candidateIds: matches.map((m) => String(m._id)) })),
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
