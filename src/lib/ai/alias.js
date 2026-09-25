// Pseudonymisation between the DB and OpenAI. A feature's compute() replaces
// every person/team/campaign/vendor with a stable alias token before the
// payload leaves the server; labels never travel — they're only used to
// rehydrate the model's response back into something the owner can read.

const KIND_PREFIX = { E: "E", P: "P", T: "T", C: "C", V: "V", K: "K" };
const ALIAS_RE = /\b[EPTCVK]\d{2,3}\b/g;

export function createAliasBook() {
  const byKey = new Map(); // "E:<id>" -> alias
  const entities = new Map(); // alias -> { alias, kind, id, label }
  const counters = { E: 0, P: 0, T: 0, C: 0, V: 0, K: 0 };

  function alias(kind, id, label) {
    const prefix = KIND_PREFIX[kind];
    if (!prefix) throw new Error(`createAliasBook: unknown kind "${kind}"`);
    const key = `${prefix}:${id}`;
    const existing = byKey.get(key);
    if (existing) return existing;
    counters[prefix] += 1;
    const token = `${prefix}${String(counters[prefix]).padStart(2, "0")}`;
    byKey.set(key, token);
    entities.set(token, { alias: token, kind: prefix, id: String(id), label: label ?? "" });
    return token;
  }

  // Deep-walk any JSON-able value, replacing alias tokens found in strings
  // with their label. Returns the rehydrated copy; does not mutate `value`.
  function rehydrate(value) {
    if (typeof value === "string") {
      return value.replace(ALIAS_RE, (token) => entities.get(token)?.label || token);
    }
    if (Array.isArray(value)) return value.map(rehydrate);
    if (value && typeof value === "object") {
      const out = {};
      for (const [k, v] of Object.entries(value)) out[k] = rehydrate(v);
      return out;
    }
    return value;
  }

  return {
    alias,
    rehydrate,
    entities: () => Array.from(entities.values()),
  };
}
