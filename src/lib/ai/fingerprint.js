import { createHash } from "crypto";

// Stable JSON stringify: object keys sorted recursively so the same data
// always produces the same string regardless of build order.
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

/** sha256 hex of an object's stable JSON form. Used to detect "data unchanged". */
export function fingerprint(obj) {
  return createHash("sha256").update(stableStringify(obj)).digest("hex");
}
