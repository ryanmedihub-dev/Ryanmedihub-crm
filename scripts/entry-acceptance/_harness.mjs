// Shared connect/cleanup helpers for the entry-acceptance scripts.
//
// SAFETY: there is no separate seeded test database in this repo (checked — only
// MONGODB_URI exists, and it points at the same live Atlas cluster the whole app uses).
// These scripts therefore refuse to run unless BOTH:
//   1. ENTRY_ACCEPTANCE_MONGODB_URI is set (a URI you've confirmed is safe to write
//      throwaway documents to and delete again — a scratch DB/collection, ideally),
//   2. ENTRY_ACCEPTANCE_CONFIRM=I_UNDERSTAND is set, as a second, explicit opt-in.
// Falling back to MONGODB_URI is deliberately NOT supported here — see the Phase B
// response for why. Every document these scripts create is tagged remarks:
// "ENTRY_ACCEPTANCE_TEST" and each script deletes everything it created in a `finally`
// block, but the safety gate above is the real protection, not the cleanup.
//
// Run with:  node --env-file=.env scripts/entry-acceptance/<scenario>.mjs

import mongoose from "mongoose";

export const TEST_TAG = "ENTRY_ACCEPTANCE_TEST";

export async function connectForAcceptance() {
  const uri = process.env.ENTRY_ACCEPTANCE_MONGODB_URI;
  const confirmed = process.env.ENTRY_ACCEPTANCE_CONFIRM === "I_UNDERSTAND";
  if (!uri || !confirmed) {
    console.error(
      "Refusing to run: set ENTRY_ACCEPTANCE_MONGODB_URI to a database you've confirmed is\n" +
        "safe to write test documents to, and ENTRY_ACCEPTANCE_CONFIRM=I_UNDERSTAND.\n" +
        "This repo has no separate test database today — see AUDIT.md / the Phase B response.",
    );
    process.exit(1);
  }
  await mongoose.connect(uri);
}

export async function disconnectAcceptance() {
  await mongoose.disconnect();
}

const results = [];

export function record(scenario, expected, actual, pass) {
  results.push({ scenario, expected, actual, pass });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${scenario}`);
  if (!pass) {
    console.log(`    expected: ${expected}`);
    console.log(`    actual:   ${actual}`);
  }
}

export function printResultsTable() {
  console.log("\n| Scenario | Expected | Actual | Result |");
  console.log("|---|---|---|---|");
  for (const r of results) {
    console.log(`| ${r.scenario} | ${r.expected} | ${r.actual} | ${r.pass ? "PASS" : "FAIL"} |`);
  }
  const failed = results.filter((r) => !r.pass).length;
  if (failed > 0) process.exitCode = 1;
  return results;
}

export function fakeActorSession(overrides = {}) {
  return {
    user: {
      name: "Entry Acceptance Script",
      email: "entry-acceptance@script.local",
      role: "admin",
      branch: "Delhi",
      ...overrides,
    },
  };
}
