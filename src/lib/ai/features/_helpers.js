import { AI_MAX_PAYLOAD_CHARS } from "../config";

export function round(n, d = 0) {
  const f = 10 ** d;
  return Math.round((Number(n) || 0) * f) / f;
}

export function pct(a, b) {
  if (!b) return 0;
  return round((a / b) * 100, 1);
}

export function sumBy(rows, key) {
  return (rows || []).reduce((s, r) => s + (Number(r?.[key]) || 0), 0);
}

export function topN(rows, key, n) {
  return [...(rows || [])].sort((a, b) => (Number(b?.[key]) || 0) - (Number(a?.[key]) || 0)).slice(0, n);
}

export function bottomN(rows, key, n) {
  return [...(rows || [])].sort((a, b) => (Number(a?.[key]) || 0) - (Number(b?.[key]) || 0)).slice(0, n);
}

export function distribution(rows, buckets) {
  const out = Object.fromEntries(Object.keys(buckets).map((k) => [k, 0]));
  for (const r of rows || []) {
    for (const [label, test] of Object.entries(buckets)) {
      if (test(r)) {
        out[label] += 1;
        break;
      }
    }
  }
  return out;
}

export function slim(obj, allowKeys) {
  const out = {};
  for (const k of allowKeys) if (obj && k in obj) out[k] = obj[k];
  return out;
}

export function periodLabel(from, to) {
  if (!from && !to) return "all time";
  const f = from ? String(from).slice(0, 10) : "…";
  const t = to ? String(to).slice(0, 10) : "…";
  return f === t ? f : `${f} to ${t}`;
}

export function prevWindow(from, to) {
  if (!from || !to) return { from: "", to: "" };
  const start = new Date(from);
  const end = new Date(to);
  const spanMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - spanMs);
  return { from: prevStart.toISOString(), to: prevEnd.toISOString() };
}

export function capPayload(facts, maxChars = AI_MAX_PAYLOAD_CHARS) {
  const out = facts;
  let guard = 500; 
  while (JSON.stringify(out).length > maxChars && guard-- > 0) {
    const arrayKeys = Object.keys(out).filter((k) => Array.isArray(out[k]) && out[k].length > 0);
    if (!arrayKeys.length) break;
    
    let target = arrayKeys[0];
    for (const k of arrayKeys) if (out[k].length >= out[target].length) target = k;
    out[target] = out[target].slice(0, -1);
    out.truncated = true;
  }
  return out;
}
