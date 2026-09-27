export const LOAN_ACCOUNTS = ["Bajaj Loan", "Fibe Loan"];

export const CASH_TONES = {
  emerald: { box: "border-emerald-100 bg-emerald-50/40", label: "text-emerald-700", icon: "text-emerald-300" },
  rose: { box: "border-rose-100 bg-rose-50/40", label: "text-rose-700", icon: "text-rose-300" },
  indigo: { box: "border-indigo-100 bg-indigo-50/40", label: "text-indigo-700", icon: "text-indigo-300" },
};

export const AGEING_BUCKET_ORDER = ["current", "1-30", "31-60", "61-90", "90+"];

export function periodRange(preset, custom) {
  let to = new Date();
  to.setHours(23, 59, 59, 999);
  let from;
  if (preset === "custom" && custom?.from) {
    from = new Date(custom.from);
    from.setHours(0, 0, 0, 0);
    to = custom.to ? new Date(custom.to) : new Date(custom.from);
    to.setHours(23, 59, 59, 999);
  } else if (preset === "30") {
    from = new Date();
    from.setDate(from.getDate() - 29);
    from.setHours(0, 0, 0, 0);
  } else if (preset === "90") {
    from = new Date();
    from.setDate(from.getDate() - 89);
    from.setHours(0, 0, 0, 0);
  } else {
    from = new Date(to.getFullYear(), to.getMonth(), 1);
    from.setHours(0, 0, 0, 0);
  }
  const lengthMs = Math.max(to.getTime() - from.getTime(), 0);
  const priorTo = new Date(from.getTime() - 1);
  const priorFrom = new Date(priorTo.getTime() - lengthMs);
  return { from, to, priorFrom, priorTo };
}

export const iso = (d) => d.toISOString().slice(0, 10);

export const bucketMap = (rows) => {
  const map = {};
  (rows || []).forEach((r) => {
    if (r._id) map[r._id] = (map[r._id] || 0) + (r.totalPending || 0);
  });
  return map;
};

export const overdueAmount = (rows) =>
  (rows || []).filter((r) => r._id && r._id !== "current").reduce((s, r) => s + (r.totalPending || 0), 0);

export const overdueCount = (rows) =>
  (rows || []).filter((r) => r._id && r._id !== "current").reduce((s, r) => s + (r.count || 0), 0);
