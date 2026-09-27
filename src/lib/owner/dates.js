

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
