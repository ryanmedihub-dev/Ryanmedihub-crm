// IST-safe date helpers for the owner panel. Safe on both server and client.
//
// Filter windows come from the browser as ISO (UTC) strings; IST midnight is
// "…T18:30:00.000Z" of the previous calendar day, so `iso.slice(0, 10)` is
// wrong for anything that needs a calendar date (callby date params, drill
// links, $dateToString day buckets). Always go through these instead.

export const IST_TZ = "Asia/Kolkata";

const keyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** ISO string | Date | ms -> "YYYY-MM-DD" in IST. Falsy -> "". */
export function toISTDateKey(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return keyFormatter.format(d);
}

/** Today's calendar date in IST as "YYYY-MM-DD". */
export function todayISTKey() {
  return toISTDateKey(new Date());
}

/** Aggregation expression: bucket a date field by IST calendar day. */
export function istDayBucket(fieldExpr) {
  return { $dateToString: { format: "%Y-%m-%d", date: fieldExpr, timezone: IST_TZ } };
}

/**
 * {$gte, $lte} for a client-supplied ISO window. The client already aligns
 * `from`/`to` to day boundaries in the user's zone; re-flooring with
 * setHours() on a UTC server shifts the window by 5h30, so don't.
 */
/** Inclusive number of calendar days in a client window (min 1). */
export function daysInPeriod(from, to) {
  if (!from || !to) return 1;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  // Windows end at 23:59:59.999, so a 1-day window is just under 1 × 86400000.
  return Math.max(1, Math.ceil(ms / 86400000));
}

export function periodBounds(from, to) {
  const q = {};
  if (from) q.$gte = new Date(from);
  if (to) q.$lte = new Date(to);
  return Object.keys(q).length ? q : null;
}
