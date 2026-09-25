#!/usr/bin/env node
// Part 10, step 2 — privacy audit CLI. Two halves:
//   1. Static: scan every src/lib/ai/features/*.js for the object keys it
//      writes, building an allow-list. Always runs, no server needed.
//   2. Live: hit the dev-only GET /api/owner/ai/debug/payloads (requires
//      `npm run dev` running AND an authenticated owner/super-admin session
//      cookie — this repo's routes resolve auth via next/headers()'s
//      request-scoped async local storage, which only exists inside a real
//      Next.js request, so there is no way to run collect()/compute() against
//      live data from a bare script without one). Pass the cookie via
//      --cookie="next-auth.session-token=..." or the AI_DEBUG_SESSION_COOKIE
//      env var, copied from the browser's devtools after logging in as owner
//      on the dev server.
//
// `node scripts/ai-privacy-check.mjs [--base=http://localhost:3000] [--cookie=...]`
// Exit codes: 0 = live check ran and every feature passed. 1 = live check ran
// and something failed (fix the feature). 2 = live check could not run (no
// server / no session) — the static allow-list still printed, nothing to fix
// on this script's account.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FEATURES_DIR = path.join(ROOT, "src", "lib", "ai", "features");

function arg(name, fallback = "") {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

// ---- 1. static allow-list -------------------------------------------------

function buildStaticAllowList() {
  const keys = new Set();
  for (const entry of readdirSync(FEATURES_DIR)) {
    if (!entry.endsWith(".js") || entry === "index.js" || entry === "_helpers.js") continue;
    const text = readFileSync(path.join(FEATURES_DIR, entry), "utf8");
    const re = /(?<![.\w])([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g;
    let m;
    while ((m = re.exec(text))) keys.add(m[1]);
  }
  return keys;
}

const allowList = buildStaticAllowList();
console.log(`Static scan: ${allowList.size} distinct object keys found across src/lib/ai/features/*.js\n`);

// ---- 2. live check ---------------------------------------------------------

const base = arg("base", "http://localhost:3000");
const cookie = arg("cookie", process.env.AI_DEBUG_SESSION_COOKIE || "");

if (!cookie) {
  console.log("No session cookie supplied (--cookie=... or AI_DEBUG_SESSION_COOKIE) — skipping the live check.");
  console.log("To run it for real: `npm run dev`, log in as an owner/super-admin in the browser, copy the");
  console.log("next-auth session cookie from devtools, then re-run with --cookie=\"<name>=<value>\".\n");
  console.log("Allow-list sample (first 40):", [...allowList].sort().slice(0, 40).join(", "));
  process.exit(2);
}

const url = `${base}/api/owner/ai/debug/payloads?allowKeys=${encodeURIComponent([...allowList].join(","))}`;
let res;
try {
  res = await fetch(url, { headers: { cookie } });
} catch (err) {
  console.error(`Could not reach ${base} — is \`npm run dev\` running? (${err.message})`);
  process.exit(2);
}
if (!res.ok) {
  console.error(`Debug route returned ${res.status} — check the cookie is a valid, current owner/super-admin session.`);
  process.exit(2);
}
const data = await res.json();
if (!data.success) {
  console.error(`Debug route error: ${data.message}`);
  process.exit(2);
}

console.log(`Live check @ ${data.checkedAt}: ${data.total} features · ${data.ok} ok · ${data.failed} failed · ${data.skipped} skipped\n`);
for (const r of data.results) {
  const status = r.ok ? "OK" : r.skipped ? "SKIP" : "FAIL";
  console.log(`${status.padEnd(5)} ${r.feature.padEnd(28)} ${String(r.payloadChars).padStart(6)} chars`);
  for (const issue of r.issues) console.log(`        - ${issue}`);
}

if (data.failed > 0) {
  console.error(`\n${data.failed} feature(s) failed the privacy check — fix before shipping.`);
  process.exit(1);
}
console.log("\nAll features that could run passed the privacy check.");
process.exit(0);
