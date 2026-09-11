// One-time reconciliation: link each ryan-crm Employee to their callby user.
//
// ryan-crm and callby are two separate databases with NO foreign key between
// them. This script fetches callby's agent roster and writes
// Employee.callbyUserId (+ Employee.tlName when empty) for every match it is
// CONFIDENT about. It never guesses: anything ambiguous is reported, not linked.
//
// Match order:
//   1. normalized phone, exact, unique on both sides
//   2. else exact lower-cased name, unique on both sides
//
// It always prints four lists so the gap is visible, not silent:
//   LINKED · UNMATCHED EMPLOYEES · UNMATCHED CALLBY USERS · AMBIGUOUS (skipped)
// plus a final match rate.
//
// Dry run:  node --env-file=.env scripts/link-employees-to-callby.mjs
// Apply:    node --env-file=.env scripts/link-employees-to-callby.mjs --apply
//
// Requires in .env:  MONGODB_URI, CALLBY_API_URL, CALLBY_SERVICE_TOKEN

import mongoose from "mongoose";
import { normalizePhone } from "../src/lib/phone.js";

// Env wins over the fallbacks below. The callby service token is a JWT that
// expires ~weekly, so pass a fresh one without editing this file:
//   CALLBY_SERVICE_TOKEN=<fresh token> node scripts/link-employees-to-callby.mjs
// Grab the current token from the deployed app's env (Vercel) — that's the one
// the live Owner panel uses.
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://sachindashzer:user8520@ac-pu86ixj-shard-00-00.hwjor1r.mongodb.net:27017,ac-pu86ixj-shard-00-01.hwjor1r.mongodb.net:27017,ac-pu86ixj-shard-00-02.hwjor1r.mongodb.net:27017/?ssl=true&replicaSet=atlas-ool7b4-shard-0&authSource=admin&appName=crm';
const CALLBY_API_URL = process.env.CALLBY_API_URL || 'https://api.learcrm.com';
const CALLBY_SERVICE_TOKEN = process.env.CALLBY_SERVICE_TOKEN || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjZhMmY4ZWE3N2FlNGUzYTdjNGQ2N2ZhMCIsImlhdCI6MTc4OTA1NzM2MCwiZXhwIjoxNzg5NjYyMTYwfQ.jF51W7vJzGFV-O7EFRGR8d1cWVZ11FR9054QsaJKX-0";


const missing = [
  !MONGODB_URI && "MONGODB_URI",
  !CALLBY_API_URL && "CALLBY_API_URL",
  !CALLBY_SERVICE_TOKEN && "CALLBY_SERVICE_TOKEN",
].filter(Boolean);
if (missing.length) {
  console.error(
    `Missing env: ${missing.join(", ")}\n` +
      "Run with: node --env-file=.env scripts/link-employees-to-callby.mjs [--apply]",
  );
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");

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

// callby's agent id — the value /owner/agent-360 passes to
// /api/owner/agent-detail/:employeeId. Field name confirmed from the samples the
// script prints; fall back through the likely candidates.
const callbyId = (a) =>
  String(a?.employeeId ?? a?.userId ?? a?.id ?? a?._id ?? "") || null;
const callbyPhone = (a) => a?.phone ?? a?.mobile ?? a?.contactNumber ?? null;
const lc = (s) => String(s || "").trim().toLowerCase();

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

async function main() {
  const agents = await fetchCallbyAgents();

  console.log(`\ncallby returned ${agents.length} agent(s). Sample raw records:\n`);
  for (const a of agents.slice(0, 3)) console.log(JSON.stringify(a, null, 2));
  console.log(
    "\n^ Confirm which field is the callby id and whether a phone is present " +
      "before running with --apply.\n",
  );

  await mongoose.connect(MONGODB_URI);
  const coll = mongoose.connection.collection("employees");

  const employees = await coll
    .find(
      { isactive: { $ne: false }, mergedInto: null },
      { projection: { name: 1, phone: 1, employeeId: 1, role: 1, branch: 1, callbyUserId: 1, tlName: 1 } },
    )
    .toArray();

  const alreadyLinked = employees.filter((e) => e.callbyUserId);
  const openEmployees = employees.filter((e) => !e.callbyUserId);
  const linkedCallbyIds = new Set(alreadyLinked.map((e) => String(e.callbyUserId)));
  const openAgents = agents.filter((a) => !linkedCallbyIds.has(callbyId(a)));

  const empByPhone = indexBy(openEmployees, (e) => normalizePhone(e.phone));
  const empByName = indexBy(openEmployees, (e) => lc(e.name));
  const agentByPhone = indexBy(openAgents, (a) => normalizePhone(callbyPhone(a)));
  const agentByName = indexBy(openAgents, (a) => lc(a.name));

  const linked = []; // { employee, agent, method }
  const ambiguous = []; // { reason, detail }
  const usedEmpIds = new Set();
  const usedAgentIds = new Set();

  const tryMatch = (emp, agent, method) => {
    if (usedEmpIds.has(String(emp._id)) || usedAgentIds.has(callbyId(agent))) return;
    usedEmpIds.add(String(emp._id));
    usedAgentIds.add(callbyId(agent));
    linked.push({ employee: emp, agent, method });
  };

  // Pass 1 — phone, unique on both sides
  for (const [phone, emps] of empByPhone) {
    const ags = agentByPhone.get(phone) || [];
    if (emps.length === 1 && ags.length === 1) {
      tryMatch(emps[0], ags[0], "phone");
    } else if (emps.length && ags.length) {
      ambiguous.push({
        reason: "phone collision",
        detail: `${phone}: ${emps.length} employee(s) / ${ags.length} callby agent(s)`,
      });
    }
  }

  // Pass 2 — exact lower-cased name, unique on both sides, not already used
  for (const [name, emps] of empByName) {
    const freeEmps = emps.filter((e) => !usedEmpIds.has(String(e._id)));
    const ags = (agentByName.get(name) || []).filter((a) => !usedAgentIds.has(callbyId(a)));
    if (freeEmps.length === 1 && ags.length === 1) {
      tryMatch(freeEmps[0], ags[0], "name");
    } else if (freeEmps.length && ags.length) {
      ambiguous.push({
        reason: "name collision",
        detail: `"${name}": ${freeEmps.length} employee(s) / ${ags.length} callby agent(s)`,
      });
    }
  }

  const unmatchedEmployees = openEmployees.filter((e) => !usedEmpIds.has(String(e._id)));
  const unmatchedAgents = openAgents.filter((a) => !usedAgentIds.has(callbyId(a)));

  // --- report ---------------------------------------------------------------
  const line = "-".repeat(72);

  console.log(line);
  console.log(`LINKED (${linked.length})   ${alreadyLinked.length} were already linked before this run`);
  console.log(line);
  for (const { employee, agent, method } of linked) {
    console.log(
      `  [${method}] ${String(employee.name).padEnd(26)} ${(employee.employeeId || "-").padEnd(12)} ` +
        `-> callby ${callbyId(agent)}  (${agent.name || "?"})`,
    );
  }

  console.log(`\n${line}`);
  console.log(`UNMATCHED EMPLOYEES (${unmatchedEmployees.length}) — no callby link after this run`);
  console.log(line);
  for (const e of unmatchedEmployees) {
    console.log(
      `  ${String(e.name).padEnd(26)} ${(e.phone || "-").padEnd(14)} ${(e.employeeId || "-").padEnd(12)} ` +
        `${String(e.role || "-").padEnd(16)} ${e.branch || "-"}`,
    );
  }

  console.log(`\n${line}`);
  console.log(`UNMATCHED CALLBY USERS (${unmatchedAgents.length}) — no ryan-crm Employee`);
  console.log(line);
  for (const a of unmatchedAgents) {
    console.log(
      `  id ${String(callbyId(a)).padEnd(26)} ${String(a.name || "?").padEnd(26)} ` +
        `TL: ${a.tlName || "-"}`,
    );
  }

  console.log(`\n${line}`);
  console.log(`AMBIGUOUS — skipped, needs manual linking (${ambiguous.length})`);
  console.log(line);
  for (const x of ambiguous) console.log(`  ${x.reason}: ${x.detail}`);

  const denom = linked.length + alreadyLinked.length + unmatchedEmployees.length;
  const rate = denom ? Math.round(((linked.length + alreadyLinked.length) / denom) * 100) : 0;
  console.log(`\n${line}`);
  console.log(
    `MATCH RATE: ${rate}%  (${linked.length + alreadyLinked.length} linked / ${denom} employees; ` +
      `${unmatchedEmployees.length} unmatched employees, ${unmatchedAgents.length} unmatched callby users)`,
  );
  console.log(line);

  if (APPLY && linked.length) {
    const ops = linked.map(({ employee, agent }) => {
      const set = { callbyUserId: callbyId(agent) };
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
