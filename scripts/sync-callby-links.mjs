// Sync ryan-crm Employees to callby users by CODE ONLY.
//
//     Employee.employeeId  ==  callby user's ryanEmployeeCode
//
// That's the whole rule. No name matching, no fuzzy matching, no guessing.
// A code match is authoritative: if an Employee is already linked to a
// DIFFERENT callby user (e.g. by an older name-based run, which is where wrong
// data comes from), the code wins and the link is corrected.
//
// Writes exactly one field: Employee.callbyUserId = <callby User._id>.
// Never touches isactive, salary, or anything else.
//
// Dry run (writes nothing, prints everything):
//     node --env-file=.env scripts/sync-callby-links.mjs
// Apply:
//     node --env-file=.env scripts/sync-callby-links.mjs --apply
//
// Requires in .env: MONGODB_URI, CALLBY_API_URL, CALLBY_SERVICE_TOKEN

import mongoose from "mongoose";

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
      "Run with: node --env-file=.env scripts/sync-callby-links.mjs [--apply]",
  );
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");

// code comparison: trim + lowercase. "RM-0120" == "rm-0120 " == " RM-0120".
const normCode = (s) => String(s ?? "").trim().toLowerCase() || null;
const isObjectId = (s) => /^[0-9a-fA-F]{24}$/.test(String(s ?? "").trim());

async function fetchCallbyUsers() {
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
    const body = await res.text().catch(() => "");
    const hint =
      res.status === 401 || res.status === 403
        ? " — CALLBY_SERVICE_TOKEN is almost certainly expired (it's a ~weekly JWT). Mint a fresh one and retry."
        : "";
    throw new Error(`callby workforce-summary failed: HTTP ${res.status}${hint}\n${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const agents = json?.data?.agents || json?.agents || [];
  if (!Array.isArray(agents)) throw new Error("callby response had no agents[] array");
  return agents;
}

const pad = (s, n) => String(s ?? "-").padEnd(n).slice(0, n);
function section(title) {
  console.log(`\n${"-".repeat(90)}\n${title}\n${"-".repeat(90)}`);
}

async function run() {
  console.log(`Mode: ${APPLY ? "APPLY (will write)" : "DRY RUN (writes nothing)"}\n`);

  const agents = await fetchCallbyUsers();
  console.log(`callby returned ${agents.length} user(s).`);

  // --- index callby by code -----------------------------------------------------
  const byCode = new Map(); // code -> [agent, ...]
  let agentsWithCode = 0;
  for (const a of agents) {
    const code = normCode(a?.ryanEmployeeCode);
    if (!code) continue;
    agentsWithCode += 1;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(a);
  }
  console.log(`  ${agentsWithCode} carry a ryanEmployeeCode; ${byCode.size} distinct code(s).`);

  if (agentsWithCode === 0) {
    console.error(
      "\nNo callby user has a ryanEmployeeCode set. Nothing can match by code.\n" +
        "Fill ryanEmployeeCode on the callby side first, then re-run.",
    );
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  const Employee = mongoose.connection.collection("employees");

  const employees = await Employee.find(
    { mergedInto: null },
    { projection: { name: 1, employeeId: 1, role: 1, branch: 1, phone: 1, isactive: 1, callbyUserId: 1 } },
  ).toArray();
  console.log(`ryan-crm has ${employees.length} employee(s) (excluding merged).`);

  // --- classify -----------------------------------------------------------------
  const toLink = [];        // no link yet, code matched
  const toCorrect = [];     // already linked to a DIFFERENT user; code wins
  const alreadyCorrect = []; // link already equals the code match
  const dupCode = [];       // same code on >1 callby user — never auto-linked
  const badId = [];         // code matched but callby's id isn't a valid ObjectId
  const noCodeInCallby = []; // employee has a code, callby has nobody with it
  const noCodeOnEmployee = []; // employee has no employeeId at all

  for (const e of employees) {
    const code = normCode(e.employeeId);
    if (!code) {
      noCodeOnEmployee.push(e);
      continue;
    }

    const hits = byCode.get(code);
    if (!hits || hits.length === 0) {
      noCodeInCallby.push(e);
      continue;
    }
    if (hits.length > 1) {
      dupCode.push({ employee: e, hits });
      continue;
    }

    const callbyId = String(hits[0]?.employeeId ?? "").trim();
    if (!isObjectId(callbyId)) {
      badId.push({ employee: e, agent: hits[0] });
      continue;
    }

    const current = String(e.callbyUserId ?? "").trim();
    if (current === callbyId) alreadyCorrect.push({ employee: e, agent: hits[0] });
    else if (current) toCorrect.push({ employee: e, agent: hits[0], from: current, to: callbyId });
    else toLink.push({ employee: e, agent: hits[0], to: callbyId });
  }

  // callby users whose code matches no employee
  const empCodes = new Set(employees.map((e) => normCode(e.employeeId)).filter(Boolean));
  const callbyCodeNoEmployee = [...byCode.entries()]
    .filter(([code]) => !empCodes.has(code))
    .flatMap(([code, list]) => list.map((a) => ({ code, agent: a })));

  // --- report -------------------------------------------------------------------
  section(`WILL LINK (${toLink.length}) — no link before, code matched`);
  for (const r of toLink) {
    console.log(`  ${pad(r.employee.name, 28)} ${pad(r.employee.employeeId, 10)} -> ${r.to}  ${r.agent.name || ""}`);
  }

  section(`WILL CORRECT (${toCorrect.length}) — linked to the WRONG callby user; code wins`);
  if (toCorrect.length) {
    console.log("  These are the ones most likely to have been showing bad data to the owner.\n");
    for (const r of toCorrect) {
      console.log(
        `  ${pad(r.employee.name, 28)} ${pad(r.employee.employeeId, 10)}\n` +
          `      was: ${r.from}\n      now: ${r.to}  ${r.agent.name || ""}`,
      );
    }
  }

  section(`DUPLICATE CODE IN CALLBY (${dupCode.length}) — NOT linked, fix callby first`);
  for (const r of dupCode) {
    const who = r.hits.map((h) => `${h.employeeId}${h.isActive === false ? " (inactive)" : ""} ${h.name || ""}`).join(" | ");
    console.log(`  code ${pad(r.employee.employeeId, 10)} ${pad(r.employee.name, 24)} -> ${r.hits.length} callby users: ${who}`);
  }

  if (badId.length) {
    section(`BAD CALLBY ID (${badId.length}) — code matched but callby's employeeId isn't an ObjectId`);
    for (const r of badId) console.log(`  ${pad(r.employee.name, 28)} ${pad(r.employee.employeeId, 10)} got "${r.agent?.employeeId}"`);
  }

  section(`NO CALLBY USER WITH THIS CODE (${noCodeInCallby.filter((e) => e.isactive !== false).length} active shown)`);
  console.log("  Set ryanEmployeeCode on the callby side for these, then re-run.\n");
  for (const e of noCodeInCallby.filter((x) => x.isactive !== false)) {
    console.log(`  ${pad(e.name, 28)} ${pad(e.employeeId, 10)} ${pad(e.role, 18)} ${pad(e.branch, 10)} ${e.phone || ""}`);
  }

  section(`CALLBY USERS WHOSE CODE MATCHES NO EMPLOYEE (${callbyCodeNoEmployee.length})`);
  console.log("  Either the code is a typo on the callby side, or this person has no Employee record.\n");
  for (const r of callbyCodeNoEmployee) {
    console.log(`  code ${pad(r.code, 10)} ${pad(r.agent.name, 28)} ${r.agent.employeeId}${r.agent.isActive === false ? " (inactive)" : ""}`);
  }

  section("SUMMARY");
  console.log(`  already correct:                 ${alreadyCorrect.length}`);
  console.log(`  will link (new):                 ${toLink.length}`);
  console.log(`  will correct (was wrong):        ${toCorrect.length}`);
  console.log(`  duplicate code in callby:        ${dupCode.length}   (needs a human)`);
  console.log(`  bad callby id:                   ${badId.length}`);
  console.log(`  employee code not in callby:     ${noCodeInCallby.length}`);
  console.log(`  employee has no employeeId:      ${noCodeOnEmployee.length}`);
  console.log(`  callby code with no employee:    ${callbyCodeNoEmployee.length}`);
  const linkedAfter = alreadyCorrect.length + toLink.length + toCorrect.length;
  console.log(`\n  => linked after this run: ${linkedAfter} of ${employees.length} employee(s)`);

  // --- write --------------------------------------------------------------------
  if (!APPLY) {
    console.log(`\nDRY RUN — nothing written. Re-run with --apply to write ${toLink.length + toCorrect.length} link(s).`);
    await mongoose.disconnect();
    return;
  }

  const writes = [...toLink, ...toCorrect].map((r) => ({
    updateOne: { filter: { _id: r.employee._id }, update: { $set: { callbyUserId: r.to } } },
  }));
  if (writes.length) {
    const res = await Employee.bulkWrite(writes, { ordered: false });
    console.log(`\nWrote ${res.modifiedCount} link(s).`);
  } else {
    console.log("\nNothing to write — every code match is already correct.");
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(`\n${err.message || err}`);
  process.exit(1);
});
