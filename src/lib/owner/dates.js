

export const IST_TZ = "Asia/Kolkata";

const keyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function toISTDateKey(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return keyFormatter.format(d);
}

export function todayISTKey() {
  return toISTDateKey(new Date());
}

export function istDayBucket(fieldExpr) {
  return { $dateToString: { format: "%Y-%m-%d", date: fieldExpr, timezone: IST_TZ } };
}

export function istMonthKeys(from, to) {
  if (!from || !to) return [];
  const start = toISTDateKey(from);
  const end = toISTDateKey(to);
  if (!start || !end) return [];
  let [y, m] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  const out = [];
  while (y < ey || (y === ey && m <= em)) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export function daysInPeriod(from, to) {
  if (!from || !to) return 1;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  
  return Math.max(1, Math.ceil(ms / 86400000));
}

export function periodBounds(from, to) {
  const q = {};
  if (from) q.$gte = new Date(from);
  if (to) q.$lte = new Date(to);
  return Object.keys(q).length ? q : null;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Resolve one end of a filter window to an instant.
 *
 * A date-only "YYYY-MM-DD" (what an `<input type="date">` submits) is widened
 * to the edge of that IST day. Taking it literally means UTC midnight, which
 * is 05:30 IST — so a `$lte` would cut the last day short by 18.5 hours.
 * A full ISO timestamp is already an instant and is passed through.
 */
export function istDayEdge(value, edge) {
  if (!value) return null;
  if (!DATE_ONLY.test(String(value).trim())) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const [y, m, d] = String(value).trim().split("-").map(Number);
  const istMidnightUTC = Date.UTC(y, m - 1, d, edge === "end" ? 23 : 0, edge === "end" ? 59 : 0, edge === "end" ? 59 : 0, edge === "end" ? 999 : 0);
  return new Date(istMidnightUTC - 5.5 * 60 * 60 * 1000);
}

/** periodBounds, but date-only inputs cover the whole IST day. */
export function istPeriodBounds(from, to) {
  const q = {};
  const start = istDayEdge(from, "start");
  const end = istDayEdge(to, "end");
  if (start) q.$gte = start;
  if (end) q.$lte = end;
  return Object.keys(q).length ? q : null;
}
