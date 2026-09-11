import { formatCurrency } from "@/lib/financeUI";

// Owner-panel formatters. Convention: missing data reads "—", never ₹0 / 0 — a blank cell and
// a real zero mean different things on a dashboard. Money delegates to the shared
// formatCurrency so there is one currency formatter, not two that can drift.
const missing = (n) => n == null || (typeof n === "number" && Number.isNaN(n));

export const rupee = (n) => (missing(n) ? "—" : formatCurrency(Math.round(n)));
export const num = (n) => (missing(n) ? "—" : new Intl.NumberFormat("en-IN").format(n));
export const roasFmt = (n) => (missing(n) ? "—" : `${Number(n).toFixed(2)}×`);
export const pct = (n, digits = 0) => (missing(n) ? "—" : `${(n * 100).toFixed(digits)}%`);
export const fmtDate = (v) =>
  v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
// Was copy-pasted per-page (agent-360, live-workforce, ...) — one shared version for
// Part 2's calls/leads pages, which need it constantly (call/lead timestamps).
export const fmtDateTime = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};
export const fmtTime = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
};
/** Seconds -> "Xh Ym" / "Xm" — for call duration and active-window spans. */
export const fmtDurationShort = (totalSeconds) => {
  const s = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};
/** Days between now and a past date, floored — "3" not "3.4". Null-safe. */
export const daysAgo = (v) => {
  if (!v) return null;
  const d = new Date(v).getTime();
  if (Number.isNaN(d)) return null;
  return Math.max(0, Math.floor((Date.now() - d) / 86400000));
};
