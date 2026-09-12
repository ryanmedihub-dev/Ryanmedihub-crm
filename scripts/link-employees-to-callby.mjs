// One-time reconciliation: link each ryan-crm Employee to their callby user.
//
// ryan-crm and callby are two separate databases with NO foreign key between
// them. This script fetches callby's agent roster and writes
// Employee.callbyUserId (+ Employee.tlName when empty) for every match it is
// CONFIDENT about. It never guesses: anything ambiguous is reported, not linked.
//
// Match tiers, highest confidence first:
//   1. CODE  — Employee.employeeId == callby agent.ryanEmployeeCode
//              (trimmed, case-insensitive, unique on BOTH sides). Authoritative:
//              a code match is taken even when the two names differ — those
//              cases are listed separately so a human can fix the name (or the
//              mis-assigned code) rather than the link being silently skipped.
//   2. NAME  — exact normalized name, unique on both sides, only among records
//              the code tier left open.
// callby exposes no phone on workforce-summary, so there is no phone tier.
//
// Two identifiers on every callby agent — do NOT confuse them:
//   agent.employeeId        callby's own User._id (ObjectId string). This is
//                           what goes into Employee.callbyUserId — it's the key
//                           /api/owner/agent-detail/:id and every callby query
//                           expect. Guarded: anything that isn't a valid
//                           ObjectId is rejected, never written.
//   agent.ryanEmployeeCode  ryan-crm's Employee.employeeId code ("RC-014",
//                           "290"). Used ONLY for tier-1 matching.
//
// Duplicate ryanEmployeeCode on the callby side (callby has known duplicate
// user rows) is never auto-linked — it's listed for a human.
//
// Dry run:  node --env-file=.env scripts/link-employees-to-callby.mjs
// Apply:    node --env-file=.env scripts/link-employees-to-callby.mjs --apply
// Emit the reverse-link mapping for callby's addEmployeeIdField.js:
//           node --env-file=.env scripts/link-employees-to-callby.mjs --emit-map=./callby-code-map.json
//   (writes { callbyUserId, employeeId } for every confident link — including
//    already-linked employees — so callby can stamp ryanEmployeeCode on its
//    users and the NEXT run of this script matches them by code, not name.)
//
// Requires in .env:  MONGODB_URI, CALLBY_API_URL, CALLBY_SERVICE_TOKEN

import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { CALLER_ROLES, isCallerRole as isCallerRoleName } from "../src/lib/owner/callerRoles.js";

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
      "Run with: node --env-file=.env scripts/link-employees-to-callby.mjs [--apply] [--emit-map=<file>]",
  );
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const EMIT_MAP = process.argv.find((a) => a.startsWith("--emit-map="))?.split("=")[1] || null;

// Caller-type roles (the match-rate denominator) live in src/lib/owner/callerRoles.js
// so this script and /owner/employees/links judge coverage by the same list.
const isCallerRole = (e) => isCallerRoleName(e.role);

// --- callby fetch (inlined — the script can't import @/lib/callby) ------------
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
    const detail = await res.text().catch(() => ""); // drain the body so the socket closes cleanly
    const hint =
      res.status === 401 || res.status === 403
        ? " — the CALLBY_SERVICE_TOKEN is almost certainly expired (it's a ~weekly JWT). " +
          "Pass a fresh one: CALLBY_SERVICE_TOKEN=<token> node scripts/link-employees-to-callby.mjs"
        : "";
    throw new Error(`callby workforce-summary failed: HTTP ${res.status}${hint}\n${detail.slice(0, 300)}`);
  }
  const body = await res.json();
  const agents = body?.data?.agents || body?.agents || [];
  if (!Array.isArray(agents)) throw new Error("callby response had no agents[] array");
  return agents;
}

// --- identifiers ---------------------------------------------------------------
// callby's user id for Employee.callbyUserId. Reads `employeeId` ONLY — that is
// callby's User._id (see the header). `ryanEmployeeCode` is deliberately not a
// fallback here: it's ryan-crm's own code and would silently corrupt the link.
// Returns null for anything that isn't a valid ObjectId so a malformed id can
// never be written.
function pickCallbyId(a) {
  const raw = a?.employeeId;
  if (raw == null) return null;
  const s = String(raw).trim();
  return mongoose.Types.ObjectId.isValid(s) && /^[0-9a-fA-F]{24}$/.test(s) ? s : null;
}
const pickCallbyCode = (a) => normCode(a?.ryanEmployeeCode);

function lc(s) {
  return String(s ?? "").trim().toLowerCase();
}
// Codes: trim + case-fold. "rc-014" and "RC-014 " are the same code.
function normCode(s) {
  return lc(s) || null;
}
// Names: case-fold, collapse whitespace. Deliberately NOT fuzzy — "Sheetal
// Rathour" vs "Sheetal Rathor" stays unmatched and is a human's call.
function normName(s) {
  return lc(s).replace(/\s+/g, " ") || null;
}

// group an array into Map<key, item[]> dropping falsy keys
function indexBy(arr, keyFn) {
  const m = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(item);
  }
  return m;
}

const pad = (s, n) => String(s ?? "").padEnd(n);
const line = "-".repeat(78);
const section = (title) => console.log(`\n${line}\n${title}\n${line}`);

async function main() {
  const rawAgents = await fetchCallbyAgents();

  // Reject any agent whose id isn't an ObjectId up front — they can't be linked.
  const badIdAgents = rawAgents.filter((a) => !pickCallbyId(a));
  const agents = rawAgents.filter((a) => pickCallbyId(a));

  // If NO agent carries the ryanEmployeeCode key, the deployed callby predates
  // the field and the code tier can't do anything — say so instead of quietly
  // reporting "0 by code".
  const codeFieldPresent = rawAgents.some((a) => Object.prototype.hasOwnProperty.call(a, "ryanEmployeeCode"));
  const agentsWithCode = agents.filter((a) => pickCallbyCode(a));

  console.log(`\ncallby returned ${rawAgents.length} agent(s); ${agents.length} with a valid ObjectId employeeId.`);
  console.log(`ryanEmployeeCode field present in payload: ${codeFieldPresent ? "yes" : "NO"}; ` +
    `agents carrying a code: ${agentsWithCode.length}`);
  if (!codeFieldPresent) {
    console.log(
      "  !! The deployed callby does not expose ryanEmployeeCode yet — the CODE tier is inactive this run.\n" +
        "     Deploy callby's workforceSummary.js change and stamp codes (backend/scripts/addEmployeeIdField.js).",
    );
  }
  if (badIdAgents.length) {
    console.log(`  !! ${badIdAgents.length} agent(s) skipped: employeeId is not a valid ObjectId:`);
    for (const a of badIdAgents) console.log(`     ${JSON.stringify(a?.employeeId)}  ${a?.name || "?"}`);
  }
  console.log("\nSample raw record:");
  console.log(JSON.stringify({ ...agents[0], calls: undefined, leads: undefined }, null, 2));

  await mongoose.connect(MONGODB_URI);
  const coll = mongoose.connection.collection("employees");

  const employees = await coll
    .find(
      { isactive: { $ne: false }, mergedInto: null },
      { projection: { name: 1, phone: 1, employeeId: 1, role: 1, branch: 1, callbyUserId: 1, tlName: 1 } },
    )
    .toArray();

  // Existing links that are not valid ObjectIds are corrupt — surface them, and
  // treat the employee as open so a fresh link can replace the bad value.
  const corruptLinks = employees.filter(
    (e) => e.callbyUserId && !/^[0-9a-fA-F]{24}$/.test(String(e.callbyUserId).trim()),
  );
  const alreadyLinked = employees.filter((e) => e.callbyUserId && !corruptLinks.includes(e));
  const openEmployees = employees.filter((e) => !alreadyLinked.includes(e));
  const linkedCallbyIds = new Set(alreadyLinked.map((e) => String(e.callbyUserId).trim()));
  const openAgents = agents.filter((a) => !linkedCallbyIds.has(pickCallbyId(a)));

  const linked = []; // { employee, agent, method, nameDiffers }
  const ambiguous = []; // { tier, reason, detail }
  const duplicateCodes = []; // { code, agents[] }
  const usedEmpIds = new Set();
  const usedAgentIds = new Set();

  const take = (emp, agent, method) => {
    const eid = String(emp._id);
    const aid = pickCallbyId(agent);
    if (usedEmpIds.has(eid) || usedAgentIds.has(aid)) return false;
    usedEmpIds.add(eid);
    usedAgentIds.add(aid);
    linked.push({
      employee: emp,
      agent,
      method,
      nameDiffers: normName(emp.name) !== normName(agent.name),
    });
    return true;
  };

  // --- Tier 1: CODE -----------------------------------------------------------
  // Duplicate codes on the callby side are computed over ALL agents (not just
  // open ones): a code shared by an already-linked user and an open user is
  // still a data problem worth listing.
  const allAgentsByCode = indexBy(agents, pickCallbyCode);
  for (const [code, ags] of allAgentsByCode) {
    if (ags.length > 1) duplicateCodes.push({ code, agents: ags });
  }
  const dupCodeSet = new Set(duplicateCodes.map((d) => d.code));

  const empByCode = indexBy(openEmployees, (e) => normCode(e.employeeId));
  const agentByCode = indexBy(openAgents, pickCallbyCode);

  for (const [code, emps] of empByCode) {
    const ags = agentByCode.get(code) || [];
    if (!ags.length) continue;
    if (dupCodeSet.has(code)) {
      ambiguous.push({
        tier: "code",
        reason: "code on multiple callby users",
        detail: `"${code}": ${emps.map((e) => e.name).join(", ")} ↔ ${ags.map((a) => `${a.name} (${pickCallbyId(a)})`).join(" | ")}`,
      });
      continue;
    }
    if (emps.length > 1) {
      ambiguous.push({
        tier: "code",
        reason: "code on multiple ryan-crm employees",
        detail: `"${code}": ${emps.map((e) => `${e.name} [${e.role}]`).join(", ")} ↔ callby ${ags[0].name}`,
      });
      continue;
    }
    take(emps[0], ags[0], "code");
  }

  // --- Tier 2: NAME -----------------------------------------------------------
  // Only records the code tier left open. An employee WITH a code that didn't
  // code-match is still eligible here (callby may simply not carry the code yet).
  const freeEmps = openEmployees.filter((e) => !usedEmpIds.has(String(e._id)));
  const freeAgents = openAgents.filter((a) => !usedAgentIds.has(pickCallbyId(a)));
  const empByName = indexBy(freeEmps, (e) => normName(e.name));
  const agentByName = indexBy(freeAgents, (a) => normName(a.name));

  for (const [name, emps] of empByName) {
    const ags = agentByName.get(name) || [];
    if (!ags.length) continue;
    if (emps.length === 1 && ags.length === 1) {
      take(emps[0], ags[0], "name");
    } else {
      ambiguous.push({
        tier: "name",
        reason: "name collision",
        detail:
          `"${name}": ${emps.length} employee(s) [${emps.map((e) => e.employeeId || "no code").join(", ")}] / ` +
          `${ags.length} callby user(s) [${ags.map((a) => `${pickCallbyId(a)}${a.isActive === false ? " inactive" : ""}`).join(", ")}]`,
      });
    }
  }

  const unmatchedEmployees = openEmployees.filter((e) => !usedEmpIds.has(String(e._id)));
  const unmatchedAgents = openAgents.filter((a) => !usedAgentIds.has(pickCallbyId(a)));

  // --- report -------------------------------------------------------------------
  const byCode = linked.filter((l) => l.method === "code");
  const byName = linked.filter((l) => l.method === "name");
  const codeNameDiffers = byCode.filter((l) => l.nameDiffers);

  section(`LINKED THIS RUN (${linked.length})   [code ${byCode.length} · name ${byName.length}]   ${alreadyLinked.length} already linked before`);
  for (const { employee, agent, method, nameDiffers } of linked) {
    console.log(
      `  [${pad(method, 4)}] ${pad(employee.name, 26)} ${pad(employee.employeeId || "-", 10)} ` +
        `-> ${pickCallbyId(agent)}  ${pad(agent.name || "?", 24)}${nameDiffers && method === "code" ? "  ⚠ name differs" : ""}`,
    );
  }

  section(`CODE MATCHED BUT NAME DIFFERS (${codeNameDiffers.length}) — linked; fix the name or the code by hand`);
  for (const { employee, agent } of codeNameDiffers) {
    console.log(`  code ${pad(employee.employeeId, 10)} ryan-crm "${employee.name}"  ↔  callby "${agent.name}" (${pickCallbyId(agent)})`);
  }

  section(`DUPLICATE ryanEmployeeCode IN CALLBY (${duplicateCodes.length}) — NOT linked, needs a human`);
  for (const { code, agents: ags } of duplicateCodes) {
    console.log(`  "${code}":`);
    for (const a of ags) {
      console.log(`      ${pickCallbyId(a)}  ${pad(a.name, 24)} TL: ${pad(a.tlName || "-", 12)} ${a.isActive === false ? "inactive" : "active"}`);
    }
  }

  section(`AMBIGUOUS — skipped, needs manual linking (${ambiguous.length})`);
  for (const x of ambiguous) console.log(`  [${x.tier}] ${x.reason}: ${x.detail}`);

  const unmatchedCallers = unmatchedEmployees.filter(isCallerRole);
  const unmatchedNonCallers = unmatchedEmployees.filter((e) => !isCallerRole(e));

  section(`UNMATCHED CALLER-TYPE EMPLOYEES (${unmatchedCallers.length}) — real gaps, pair at /owner/employees/links`);
  for (const e of unmatchedCallers) {
    console.log(
      `  ${pad(e.name, 26)} ${pad(e.employeeId || "-", 10)} ${pad(e.role || "-", 16)} ${pad(e.branch || "-", 10)} ${e.phone || ""}`,
    );
  }
  console.log(`\n  (+ ${unmatchedNonCallers.length} non-caller employees not in callby by design — not counted as misses)`);

  section(`UNMATCHED CALLBY USERS (${unmatchedAgents.length}) — no ryan-crm Employee`);
  const byTl = indexBy(unmatchedAgents, (a) => a.tlName || "Unassigned");
  for (const [tl, ags] of [...byTl].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  TL: ${tl} (${ags.length})`);
    for (const a of ags) {
      console.log(`      ${pickCallbyId(a)}  ${pad(a.name || "?", 24)} ${a.isActive === false ? "inactive" : ""}${pickCallbyCode(a) ? `  code ${pickCallbyCode(a)}` : ""}`);
    }
  }

  if (corruptLinks.length) {
    section(`CORRUPT EXISTING callbyUserId (${corruptLinks.length}) — not a valid ObjectId; treated as unlinked`);
    for (const e of corruptLinks) console.log(`  ${pad(e.name, 26)} callbyUserId=${JSON.stringify(e.callbyUserId)}`);
  }

  // --- match rate: caller-type denominator ---------------------------------------
  const callers = employees.filter(isCallerRole);
  const callersLinked = callers.filter((e) => usedEmpIds.has(String(e._id)) || alreadyLinked.includes(e));
  const callersByCode = callers.filter((e) => byCode.some((l) => l.employee === e)).length;
  const callersByName = callers.filter((e) => byName.some((l) => l.employee === e)).length;
  const callersPrior = callers.filter((e) => alreadyLinked.includes(e)).length;
  const callerRate = callers.length ? Math.round((callersLinked.length / callers.length) * 100) : 0;
  const allLinked = linked.length + alreadyLinked.length;
  const allRate = employees.length ? Math.round((allLinked / employees.length) * 100) : 0;

  section("MATCH RATE");
  console.log(`  Caller-type roles counted: ${CALLER_ROLES.join(", ")}`);
  console.log(`  Caller-type employees: ${callers.length}`);
  console.log(`    linked by code (this run):   ${callersByCode}`);
  console.log(`    linked by name (this run):   ${callersByName}`);
  console.log(`    already linked before:       ${callersPrior}`);
  console.log(`    ambiguous (skipped):         ${ambiguous.length}`);
  console.log(`    unmatched:                   ${unmatchedCallers.length}`);
  console.log(`  => CALLER MATCH RATE: ${callerRate}%  (${callersLinked.length}/${callers.length})`);
  console.log(`  (all active employees, for reference only: ${allRate}% = ${allLinked}/${employees.length})`);
  console.log(`  callby users without an Employee: ${unmatchedAgents.length} of ${agents.length}`);
  console.log(line);

  // --- emit reverse-link mapping for callby ---------------------------------------
  if (EMIT_MAP) {
    const entries = [];
    for (const { employee, agent } of linked) {
      if (employee.employeeId) entries.push({ callbyUserId: pickCallbyId(agent), employeeId: String(employee.employeeId).trim(), name: employee.name });
    }
    for (const e of alreadyLinked) {
      if (e.employeeId) entries.push({ callbyUserId: String(e.callbyUserId).trim(), employeeId: String(e.employeeId).trim(), name: e.name });
    }
    const out = path.resolve(process.cwd(), EMIT_MAP);
    fs.writeFileSync(out, JSON.stringify(entries, null, 2));
    console.log(`\nWrote ${entries.length} reverse-link entries to ${out}`);
    console.log("  Apply in callby: node backend/scripts/addEmployeeIdField.js --map=<that file> [--confirm]");
    const noCode = linked.filter((l) => !l.employee.employeeId).length + alreadyLinked.filter((e) => !e.employeeId).length;
    if (noCode) console.log(`  (${noCode} linked employee(s) have no Employee.employeeId code — give them one in /admin/employees first)`);
  }

  // --- apply --------------------------------------------------------------------
  if (APPLY && linked.length) {
    const ops = linked.map(({ employee, agent }) => {
      const set = { callbyUserId: pickCallbyId(agent) };
      // seed tlName only when the Employee doesn't already have one
      if (!employee.tlName && agent.tlName) set.tlName = String(agent.tlName).trim();
      return { updateOne: { filter: { _id: employee._id }, update: { $set: set } } };
    });
    const res = await coll.bulkWrite(ops);
    console.log(`\nApplied. Modified ${res.modifiedCount} employee document(s).`);
  } else if (linked.length) {
    console.log(`\nDry run only. Re-run with --apply to write ${linked.length} link(s).`);
  } else {
    console.log("\nNo new confident matches to write.");
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(`\n${err.message || err}`);
  // Close Mongo if it got connected, then let the loop drain on its own —
  // process.exit() here races the still-closing TLS socket and trips a libuv
  // assertion on Windows.
  try {
    await mongoose.disconnect();
  } catch {
    /* not connected */
  }
  process.exitCode = 1;
});
