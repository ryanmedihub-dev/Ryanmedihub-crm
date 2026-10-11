// node --test src/lib/owner/dates.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { istDayEdge, istPeriodBounds, toISTDateKey } from "./dates.js";

// IST is UTC+5:30, so an IST day runs 18:30Z the previous day → 18:29:59.999Z.
test("date-only values widen to the whole IST day", () => {
  assert.equal(istDayEdge("2026-10-11", "start").toISOString(), "2026-10-10T18:30:00.000Z");
  assert.equal(istDayEdge("2026-10-11", "end").toISOString(), "2026-10-11T18:29:59.999Z");
});

test("the end edge covers the last day's evening in IST", () => {
  // The bug this guards: new Date("2026-10-11") is 05:30 IST, so a $lte there
  // dropped everything booked after 05:30 on the final day.
  const end = istDayEdge("2026-10-11", "end");
  const eveningIST = new Date("2026-10-11T17:00:00+05:30");
  assert.ok(eveningIST <= end, "17:00 IST on the last day must be inside the window");
});

test("full ISO timestamps pass through unchanged", () => {
  const iso = "2026-10-11T09:15:00.000Z";
  assert.equal(istDayEdge(iso, "start").toISOString(), iso);
  assert.equal(istDayEdge(iso, "end").toISOString(), iso);
});

test("blank and invalid values yield null, not Invalid Date", () => {
  for (const v of ["", null, undefined, "not-a-date"]) {
    assert.equal(istDayEdge(v, "start"), null, `${JSON.stringify(v)} should be null`);
  }
});

test("istPeriodBounds builds a mongo range, or null when unbounded", () => {
  const b = istPeriodBounds("2026-10-01", "2026-10-11");
  assert.equal(b.$gte.toISOString(), "2026-09-30T18:30:00.000Z");
  assert.equal(b.$lte.toISOString(), "2026-10-11T18:29:59.999Z");

  assert.equal(istPeriodBounds("", ""), null);
  assert.deepEqual(Object.keys(istPeriodBounds("2026-10-01", "")), ["$gte"]);
});

test("toISTDateKey reports the IST calendar day, not the UTC one", () => {
  // 18:30Z is already the next day in IST.
  assert.equal(toISTDateKey("2026-09-15T18:30:00.000Z"), "2026-09-16");
  assert.equal(toISTDateKey("2026-09-15T18:29:00.000Z"), "2026-09-15");
});
