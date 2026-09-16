// Exports the caller-type Employees that scripts/sync-callby-links.mjs cannot
// link by code — either they have no Employee.employeeId at all, or that code
// matches no callby user. These are the gaps: someone needs to either fill in
// employeeId here, or find the person in callby and set their ryanEmployeeCode
// there, then re-run sync-callby-links.mjs.
//
// Same caller-role list as /owner/employees/links (src/lib/owner/callerRoles.js),
// so this script's count and that screen's count don't drift apart.
//
// Duplicate-code and bad-ObjectId cases are deliberately NOT in this file —
// those already have a code match in callby, just not a usable one, and
// sync-callby-links.mjs's own report already names them for a human to fix
// directly in callby. This file is only the "we don't know who this person is
// in callby yet" gap, which is why `phone` is always included: it's the column
// that makes them findable there.
//
// Writes nothing to either database — read-only.
//
// Usage:
//   node --env-file=.env scripts/export-unmatched-callers.mjs
//   node --env-file=.env scripts/export-unmatched-callers.mjs --out=./exports
//
// Requires in .env: MONGODB_URI, CALLBY_API_URL, CALLBY_SERVICE_TOKEN

import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { isCallerRole as isCallerRoleName } from "../src/lib/owner/callerRoles.js";

const MONGODB_URI = process.env.MONGODB_URI;
const CALLBY_API_URL = process.env.CALLBY_API_URL;
const CALLBY_SERVICE_TOKEN = process.env.CALLBY_SERVICE_TOKEN;

const missing = [
  !MONGODB_URI && "MONGODB_URI",
  !CALLBY_API_URL && "CALLBY_API_URL",
  !CALLBY_SERVICE_TOKEN && "CALLBY_SERVICE_TOKEN",
].filter(Boolean);
if (missing.length) {
  console.error(
    `Missing env: ${missing.join(", ")}\n` +
      "Run with: node --env-file=.env scripts/export-unmatched-callers.mjs [--out=<dir>]",
  );
  process.exit(1);
}

const OUT_DIR = process.argv.find((a) => a.startsWith("--out="))?.split("=")[1] || ".";
const isCallerRole = (e) => isCallerRoleName(e.role);

const normCode = (s) => String(s ?? "").trim().toLowerCase() || null;

async function fetchCallbyAgents() {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 20000);
  let res;
  try {
    res = await fetch(`${CALLBY_API_URL}/api/leads/workforce-summary`, {
      headers: { Authorization: `Bearer ${CALLBY_SERVICE_TOKEN}` },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(
      controller.signal.aborted
        ? "callby didn't respond in time (20s)"
        : `Could not reach callby: ${err?.message || "network error"}`,
    );
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const hint =
      res.status === 401 || res.status === 403
        ? " — CALLBY_SERVICE_TOKEN is almost certainly expired (it's a ~weekly JWT)."
        : "";
    throw new Error(`callby workforce-summary failed: HTTP ${res.status}${hint}\n${detail.slice(0, 300)}`);
  }
  const body = await res.json();
  const agents = body?.data?.agents || body?.agents || [];
  if (!Array.isArray(agents)) throw new Error("callby response had no agents[] array");
  return agents;
}

function toCsv(rows, columns) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => c.label).join(",");
  const lines = rows.map((r) => columns.map((c) => esc(c.value(r))).join(","));
  return [header, ...lines].join("\n") + "\n";
}

async function run() {
  await mongoose.connect(MONGODB_URI);
  const Employee = mongoose.connection.collection("employees");

  console.log("Fetching callby agent roster…");
  const agents = await fetchCallbyAgents();
  console.log(`callby returned ${agents.length} agent(s).`);

  const codesInCallby = new Set(agents.map((a) => normCode(a?.ryanEmployeeCode)).filter(Boolean));
  console.log(`  ${codesInCallby.size} distinct ryanEmployeeCode(s) present.`);

  const employees = await Employee.find(
    { isactive: { $ne: false }, mergedInto: null },
    { projection: { name: 1, phone: 1, employeeId: 1, role: 1, branch: 1, tlName: 1 } },
  ).toArray();

  const callers = employees.filter(isCallerRole);
  const unmatched = callers.filter((e) => {
    const code = normCode(e.employeeId);
    return !code || !codesInCallby.has(code);
  });

  const columns = [
    { label: "name", value: (r) => r.name },
    { label: "employeeId", value: (r) => r.employeeId || "" },
    { label: "role", value: (r) => r.role || "" },
    { label: "branch", value: (r) => r.branch || "" },
    { label: "phone", value: (r) => r.phone || "" },
    { label: "tlName", value: (r) => r.tlName || "" },
  ];

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, "unmatched-callers.csv");
  fs.writeFileSync(outPath, toCsv(unmatched, columns));

  console.log(`\nCaller-type employees: ${callers.length}`);
  console.log(`  no code match in callby: ${unmatched.length}  -> ${outPath}`);
  console.log(
    "\nFor each row: find that person in callby by name/phone, then set their\n" +
      "ryanEmployeeCode to the employeeId column here (filling in employeeId here\n" +
      "first if it's blank). Re-run scripts/sync-callby-links.mjs afterward.",
  );

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
