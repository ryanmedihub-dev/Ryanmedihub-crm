

const NUMBER_RE = /[₹]?-?\d[\d,]*(?:\.\d+)?\s*(?:%|k|K|L|Cr)?/g;

function parseNumberToken(token) {
  const cleaned = token.trim();
  const suffixMatch = cleaned.match(/(%|k|K|L|Cr)$/);
  const suffix = suffixMatch?.[1] || "";
  const numPart = cleaned.replace(/[₹,]/g, "").replace(/(%|k|K|L|Cr)$/, "").trim();
  const n = parseFloat(numPart);
  if (!Number.isFinite(n)) return null;
  if (suffix === "%") return { value: n, isPercent: true };
  if (suffix === "k" || suffix === "K") return { value: n * 1_000, isPercent: false };
  if (suffix === "L") return { value: n * 100_000, isPercent: false };
  if (suffix === "Cr") return { value: n * 10_000_000, isPercent: false };
  return { value: n, isPercent: false };
}

function collectStrings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectStrings(v, out));
  return out;
}

function collectNumbers(value, out = []) {
  if (typeof value === "number" && Number.isFinite(value)) out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectNumbers(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectNumbers(v, out));
  return out;
}

function expandFactNumbers(raw) {
  const set = new Set();
  for (const n of raw) {
    set.add(Math.round(n));
    set.add(Math.round(n * 10) / 10);
    set.add(n * 100); 
    set.add(Math.round(n * 100));
    set.add(Math.round(n / 1000)); 
    set.add(Math.round((n / 100_000) * 10) / 10); 
  }
  return set;
}

export function checkGrounding(output, facts) {
  const factNumbers = collectNumbers(facts);
  const factSet = expandFactNumbers(factNumbers);
  const outputStrings = collectStrings(output);

  const seen = new Set();
  const ungrounded = [];
  let checked = 0;

  for (const s of outputStrings) {
    const tokens = s.match(NUMBER_RE) || [];
    for (const token of tokens) {
      const parsed = parseNumberToken(token);
      if (!parsed) continue;
      const { value } = parsed;
      if (Number.isInteger(value) && Math.abs(value) <= 10) continue; 
      checked += 1;
      const grounded = [...factSet].some((f) => Math.abs(f - value) <= Math.max(1, Math.abs(f) * 0.01));
      if (!grounded && !seen.has(token.trim())) {
        seen.add(token.trim());
        ungrounded.push(token.trim());
      }
    }
  }

  return { grounded: ungrounded.length === 0, checked, ungrounded: ungrounded.slice(0, 10) };
}
