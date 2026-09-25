import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { FEATURES } from "@/lib/ai/features";
import { createAliasBook } from "@/lib/ai/alias";
import { assertNoPII } from "@/lib/sanya/pii";
import { capPayload } from "@/lib/ai/features/_helpers";

// Part 10, step 2 (privacy audit) — dev-only. Runs every registered feature's
// collect()+compute() against real dev data for a default 30-day scope and
// checks the resulting facts payload the SAME way engine.js would, MINUS the
// OpenAI call: assertNoPII(), a stricter "no string over 60 chars" rule (a
// long string is almost always a leaked remark/note, not a real aggregate
// value), and — when `?allowKeys=` is passed (scripts/ai-privacy-check.mjs
// supplies this from a static scan of every feature file) — no object key
// outside that list, catching a stray spread (`...r`) pulling in a raw DB
// field a static read-through of the code wouldn't show.
//
// Never calls OpenAI: only collect()+compute() run, engine.js's analyze/
// verify/persist stages are never reached. Gated to non-production + owner
// role — this exists to be run from a real logged-in dev session, not CI.

const ALLOWED_ROLES = ["owner", "super-admin"];
const MAX_STRING_LEN = 60;

// A handful of features need a scope key beyond the generic date/branch
// window to run at all (a `preset` enum, or a document `id`). Presets get a
// real value so the check actually exercises them; `id`-only deep features
// have no safe default (a document id isn't guessable) and are left to the
// generic "collect/compute failed" skip path below — that's a coverage gap
// in this tool, not a privacy gap in the feature.
const SCOPE_OVERRIDES = {
  "hr.status": { preset: "selected" },
  "leads.status": { preset: "interested" },
  "patients.preset": { preset: "all" },
};

function defaultScope() {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 86400000);
  return { from: from.toISOString(), to: to.toISOString(), dateFrom: from.toISOString(), dateTo: to.toISOString(), branch: "", date: to.toISOString().slice(0, 10) };
}

function collectKeys(value, set = new Set()) {
  if (Array.isArray(value)) {
    for (const v of value) collectKeys(v, set);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      set.add(k);
      collectKeys(v, set);
    }
  }
  return set;
}

function longestString(value, max = { len: 0, sample: "" }) {
  if (typeof value === "string") {
    if (value.length > max.len) { max.len = value.length; max.sample = value.slice(0, 80); }
  } else if (Array.isArray(value)) {
    for (const v of value) longestString(v, max);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) longestString(v, max);
  }
  return max;
}

export async function GET(req) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ success: false, message: "Not available in production" }, { status: 404 });
  }
  const session = await getServerSession(authOptions);
  if (!session || !ALLOWED_ROLES.includes(session?.user?.role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const allowKeys = (searchParams.get("allowKeys") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const ALLOW = new Set(allowKeys);

  const results = [];
  for (const [key, feature] of Object.entries(FEATURES)) {
    const row = { feature: key, title: feature.title, page: feature.page, ok: false, skipped: false, payloadChars: 0, issues: [] };
    const scope = { ...defaultScope(), ...(SCOPE_OVERRIDES[key] || {}) };
    const kind = feature.kinds?.[0] || "brief";
    try {
      const raw = await feature.collect(scope, { session, signal: undefined }, kind);
      const book = createAliasBook();
      const { facts } = feature.compute(raw, book, scope, kind);
      const capped = capPayload(facts);
      row.payloadChars = JSON.stringify(capped).length;

      try {
        assertNoPII(capped);
      } catch (err) {
        row.issues.push(`assertNoPII: ${err.message}`);
      }

      const longest = longestString(capped);
      if (longest.len > MAX_STRING_LEN) {
        row.issues.push(`string value ${longest.len} chars (max ${MAX_STRING_LEN}): "${longest.sample}…"`);
      }

      if (ALLOW.size) {
        for (const k of collectKeys(capped)) {
          if (!ALLOW.has(k)) row.issues.push(`key not in the static allow-list: "${k}"`);
        }
      }

      row.ok = row.issues.length === 0;
    } catch (err) {
      row.skipped = true;
      row.issues.push(`collect/compute did not run (likely needs a scope this check doesn't supply, e.g. a document id): ${err.message}`);
    }
    results.push(row);
  }

  const failed = results.filter((r) => !r.ok && !r.skipped);
  return NextResponse.json({
    success: true,
    checkedAt: new Date().toISOString(),
    total: results.length, ok: results.filter((r) => r.ok).length, failed: failed.length, skipped: results.filter((r) => r.skipped).length,
    results,
  });
}
