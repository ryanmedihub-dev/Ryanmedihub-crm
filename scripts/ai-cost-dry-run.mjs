#!/usr/bin/env node
// Part 10, step 3 — cost dry-run. Estimates OpenAI spend for two scenarios
// using payload sizes from step 2 (scripts/ai-privacy-check.mjs) when
// available, or a documented estimate otherwise (this environment has no
// live, authenticated dev session to measure real payloads — see that
// script's own header). tokens ~= chars/4, same rule of thumb the spec asks
// for; pricing from src/lib/sanya/config.js (the one place both the insight
// engine and Sanya read it from).
//
// `node scripts/ai-cost-dry-run.mjs [--payloads=<path-to-live-check-json>]`
// With --payloads, pass the JSON body scripts/ai-privacy-check.mjs's live
// check printed (or fetch it yourself and save it) for real per-feature sizes.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { costUsd } from "../src/lib/sanya/config.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FEATURES_DIR = path.join(ROOT, "src", "lib", "ai", "features");

// Mirrors src/lib/ai/config.js's env-overridable defaults — duplicated here
// (not imported) because that file pulls in "@/lib/sanya/config" via the
// jsconfig path alias, which a bare `node` script can't resolve without a
// bundler. Keep these two in sync if the defaults ever change.
const AI_BRIEF_MODEL = process.env.AI_BRIEF_MODEL || "gpt-4o-mini";
const AI_DEEP_MODEL = process.env.AI_DEEP_MODEL || "gpt-4o";
const AI_MONTHLY_BUDGET_USD = Number(process.env.AI_MONTHLY_BUDGET_USD || 40);
const AI_MAX_OUTPUT_TOKENS = { brief: 900, verdicts: 1400, deep: 1400 };
const SYSTEM_PROMPT_OVERHEAD_CHARS = 900; // BUSINESS_CONTEXT + rules + allowed links, roughly

// No live measurement available in this environment — this is a documented
// assumption, not a measured average. Most facts objects built across Parts
// 1-9 landed well under the AI_MAX_PAYLOAD_CHARS=24000 cap (topN(10)/(20)
// slices, single-page aggregates); 6000 chars is a deliberately conservative
// middle estimate, not a floor or a ceiling.
const ASSUMED_TYPICAL_PAYLOAD_CHARS = 6000;
const WORST_CASE_PAYLOAD_CHARS = 24000; // AI_MAX_PAYLOAD_CHARS hard cap

function arg(name, fallback = "") {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

// ---- enumerate every (feature, kind) pair, statically -----------------------

function modelFor(kind) {
  return kind === "deep" ? AI_DEEP_MODEL : AI_BRIEF_MODEL;
}

function listFeatureKindPairs() {
  const pairs = [];
  for (const entry of readdirSync(FEATURES_DIR)) {
    if (!entry.endsWith(".js") || entry === "index.js" || entry === "_helpers.js") continue;
    const text = readFileSync(path.join(FEATURES_DIR, entry), "utf8");
    // Matches `"feature.key": {` ... `kinds: [...]` within a reasonable window.
    const featureRe = /"([a-zA-Z][a-zA-Z0-9_]*\.[a-zA-Z][a-zA-Z0-9_]*)":\s*\{([\s\S]{0,400}?)kinds:\s*\[([^\]]*)\]/g;
    let m;
    while ((m = featureRe.exec(text))) {
      const [, feature, , kindsRaw] = m;
      const kinds = kindsRaw.split(",").map((s) => s.trim().replace(/["'`]/g, "")).filter(Boolean);
      for (const kind of kinds) pairs.push({ feature, kind, file: entry });
    }
  }
  return pairs;
}

// ---- optional real payload sizes from a saved privacy-check run -----------

function loadRealSizes(file) {
  if (!file || !existsSync(file)) return null;
  try {
    const json = JSON.parse(readFileSync(file, "utf8"));
    const byFeature = new Map((json.results || []).map((r) => [r.feature, r.payloadChars]));
    return byFeature;
  } catch {
    return null;
  }
}

function estimateCostUsd({ payloadChars, kind }) {
  const promptTokens = Math.ceil((payloadChars + SYSTEM_PROMPT_OVERHEAD_CHARS) / 4);
  const completionTokens = AI_MAX_OUTPUT_TOKENS[kind] || AI_MAX_OUTPUT_TOKENS.brief;
  return costUsd(modelFor(kind), promptTokens, completionTokens);
}

const pairs = listFeatureKindPairs();
const realSizes = loadRealSizes(arg("payloads"));
const usingReal = !!realSizes;

console.log(`${pairs.length} (feature, kind) pairs found across the registry.`);
console.log(usingReal ? "Using real payload sizes from the supplied --payloads file.\n" : "No --payloads file supplied — using documented size assumptions (see script header).\n");

function scenarioCost(payloadCharsFor) {
  let total = 0;
  for (const p of pairs) total += estimateCostUsd({ payloadChars: payloadCharsFor(p), kind: p.kind });
  return total;
}

const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();

function report(label, sizeFn) {
  const tourCost = scenarioCost(sizeFn);
  // Busy day: every page 5x, 30% cache HIT (no OpenAI call) -> 3.5 real analyze calls/pair/day.
  const busyDayCost = tourCost * 3.5;
  const monthlyProjection = busyDayCost * daysInMonth;

  console.log(`--- ${label} ---`);
  console.log(`One full page tour (every feature/kind once): $${tourCost.toFixed(4)}`);
  console.log(`Busy day (5x/page, 30% cache hit -> 3.5 real runs): $${busyDayCost.toFixed(4)}`);
  console.log(`Busy-day monthly projection (x${daysInMonth} days): $${monthlyProjection.toFixed(2)}`);
  const overBudget = monthlyProjection > AI_MONTHLY_BUDGET_USD;
  console.log(`AI_MONTHLY_BUDGET_USD = $${AI_MONTHLY_BUDGET_USD} -> ${overBudget ? `EXCEEDS budget by $${(monthlyProjection - AI_MONTHLY_BUDGET_USD).toFixed(2)}` : "within budget"}`);
  console.log("");
  return { tourCost, busyDayCost, monthlyProjection, overBudget };
}

// Real per-feature sizes when available (fallback to the assumed typical size for any feature
// the live check skipped, e.g. an id-only deep feature); the documented assumption otherwise.
const typical = report(
  "Typical-case estimate",
  (p) => (usingReal ? realSizes.get(p.feature) ?? ASSUMED_TYPICAL_PAYLOAD_CHARS : ASSUMED_TYPICAL_PAYLOAD_CHARS),
);
if (usingReal) console.log("(Typical-case above used real per-feature sizes where available.)\n");
const worst = report("Worst-case ceiling (every feature at AI_MAX_PAYLOAD_CHARS=24000)", () => WORST_CASE_PAYLOAD_CHARS);

if (typical.overBudget || worst.overBudget) {
  console.log("Over budget in at least one scenario. Before raising AI_MONTHLY_BUDGET_USD, raise ttlMin on");
  console.log("low-value/low-traffic features first (HR pages, finance.rent, employees.links) — a longer TTL");
  console.log("directly cuts real (non-HIT) runs, which is what actually drives cost here.");
}
