#!/usr/bin/env node
// Part 10, step 1 — coverage audit. Every src/app/owner/**/page.jsx must wire
// AiBriefPanel/AiDeepReview directly, or via one of the shared config-driven
// shells (EmployeeReportPage/PatientReportPage/LeadStatusReportPage/
// InterviewStatusReportPage — AI wired through their `config.aiFeature`) or
// EmployeeDetailPage (wires employee.deep unconditionally, no config needed).
// Pure static analysis — no DB, no auth, safe to run anywhere.
// `node scripts/ai-coverage-check.mjs`

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const OWNER_DIR = path.join(SRC, "app", "owner");

// Pages that legitimately carry no AI — chat UI, placeholders, and the AI
// section landing itself (ticker + coverage-map preview only, per the Part 9
// spec — no brief on the hub page). `employees/links` was originally allowed
// "brief only" rather than a full exemption — it has one, so it is not listed
// here (a page WITH AI wired should never need to be in this set).
const EXPECTED_EXCEPTIONS = new Set(["calls/sim-health", "ai/clinical-quality", "ai/sanya", "ai"]);

const CONFIG_SHELLS = ["EmployeeReportPage", "PatientReportPage", "LeadStatusReportPage", "InterviewStatusReportPage"];
const HARDCODED_SHELLS = ["EmployeeDetailPage"];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (entry === "page.jsx") out.push(full);
  }
  return out;
}

function resolveImportPath(fromFile, spec) {
  let target;
  if (spec.startsWith("@/")) target = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) target = path.resolve(path.dirname(fromFile), spec);
  else return null; // an npm package, not local source
  for (const ext of ["", ".js", ".jsx"]) {
    const p = target + ext;
    try {
      if (statSync(p).isFile()) return p;
    } catch {
      /* try next extension */
    }
  }
  return null;
}

// Does `file` (or a "…config" named import it re-exports from, one hop) set
// an `aiFeature: "…"` key anywhere?
function fileHasAiFeature(file, seen = new Set()) {
  if (seen.has(file)) return false;
  seen.add(file);
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return false;
  }
  if (/aiFeature\s*:\s*["'`]/.test(text)) return true;
  const importRe = /import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/g;
  let m;
  while ((m = importRe.exec(text))) {
    const names = m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]);
    if (!names.some((n) => /config/i.test(n))) continue;
    const resolved = resolveImportPath(file, m[2]);
    if (resolved && fileHasAiFeature(resolved, seen)) return true;
  }
  return false;
}

function checkPage(file) {
  const text = readFileSync(file, "utf8");
  if (/\bAiBriefPanel\b/.test(text) || /\bAiDeepReview\b/.test(text)) return { covered: true, how: "direct AiBriefPanel/AiDeepReview" };
  for (const shell of HARDCODED_SHELLS) {
    if (new RegExp(`\\b${shell}\\b`).test(text)) return { covered: true, how: `${shell} (wires AI unconditionally)` };
  }
  for (const shell of CONFIG_SHELLS) {
    if (new RegExp(`\\b${shell}\\b`).test(text)) {
      if (fileHasAiFeature(file)) return { covered: true, how: `${shell} config` };
      return { covered: false, how: `${shell} used, but no aiFeature found in its config` };
    }
  }
  if (/useAiInsight\(\s*["'`][a-zA-Z0-9._-]+["'`]/.test(text)) return { covered: true, how: "useAiInsight (no panel component, but wired)" };
  return { covered: false, how: "no AI signal found" };
}

const pages = walk(OWNER_DIR).sort();
const rows = pages.map((file) => {
  const rel = path.relative(OWNER_DIR, path.dirname(file)).replace(/\\/g, "/");
  const key = rel === "." ? "" : rel;
  const result = checkPage(file);
  const expected = EXPECTED_EXCEPTIONS.has(key);
  return { key: key || "(dashboard-less /owner root — no page.jsx expected)", file: path.relative(ROOT, file), ...result, expected };
});

const gaps = rows.filter((r) => !r.covered && !r.expected);
const staleExceptions = rows.filter((r) => r.covered && r.expected);

console.log("AI coverage audit — src/app/owner/**/page.jsx\n");
const pad = (s, n) => String(s).padEnd(n);
for (const r of rows) {
  const status = !r.covered ? (r.expected ? "EXCEPTED" : "GAP") : r.expected ? "OK+EXPT" : "OK";
  console.log(`${pad(status, 10)} ${pad(r.key, 34)} ${r.how}`);
}

console.log(`\n${rows.length} pages checked · ${rows.length - gaps.length} covered or excepted · ${gaps.length} gap(s).`);
if (staleExceptions.length) {
  console.log(`\nNote: ${staleExceptions.length} page(s) in EXPECTED_EXCEPTIONS actually have AI wired now — harmless, just means that exception entry is stale:`);
  for (const r of staleExceptions) console.log(`  - ${r.key}`);
}
if (gaps.length) {
  console.log("\nGaps (fix or add to EXPECTED_EXCEPTIONS with a reason):");
  for (const g of gaps) console.log(`  - ${g.key}  (${g.file}) — ${g.how}`);
  process.exit(1);
}
process.exit(0);
