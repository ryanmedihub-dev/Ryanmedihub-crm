// node --test scripts/test/owner-dates.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { toISTDateKey, istDayBucket, periodBounds, daysInPeriod, IST_TZ } from "../../src/lib/owner/dates.js";

test("toISTDateKey: IST midnight serialised in UTC maps to the IST calendar day", () => {
  // 2026-09-16 00:00 IST === 2026-09-15T18:30:00Z — slice(0,10) would say the 15th.
  assert.equal(toISTDateKey("2026-09-15T18:30:00.000Z"), "2026-09-16");
  assert.equal(toISTDateKey("2026-09-16T18:29:59.999Z"), "2026-09-16");
  assert.equal(toISTDateKey("2026-09-16T18:30:00.000Z"), "2026-09-17");
  assert.equal(toISTDateKey(""), "");
  assert.equal(toISTDateKey("not a date"), "");
});

test("istDayBucket carries the IST timezone", () => {
  assert.deepEqual(istDayBucket("$createdAt"), {
    $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: IST_TZ },
  });
});

test("periodBounds does not re-floor the client window", () => {
  const b = periodBounds("2026-09-15T18:30:00.000Z", "2026-09-16T18:29:59.999Z");
  assert.equal(b.$gte.toISOString(), "2026-09-15T18:30:00.000Z");
  assert.equal(b.$lte.toISOString(), "2026-09-16T18:29:59.999Z");
  assert.equal(periodBounds("", ""), null);
});

test("daysInPeriod is inclusive and never below 1", () => {
  assert.equal(daysInPeriod("2026-09-15T18:30:00.000Z", "2026-09-16T18:29:59.999Z"), 1);
  assert.equal(daysInPeriod("2026-09-09T18:30:00.000Z", "2026-09-16T18:29:59.999Z"), 7);
  assert.equal(daysInPeriod("", ""), 1);
});
