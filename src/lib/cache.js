import { Redis } from "@upstash/redis";

const URL_ = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const CACHE_VERSION = process.env.CACHE_VERSION || "v1";
const PREFIX = `ryan:${CACHE_VERSION}:`;

const redis = URL_ && TOKEN ? new Redis({ url: URL_, token: TOKEN }) : null;

let degradedUntil = 0; 

export const cacheEnabled = () => !!redis && Date.now() >= degradedUntil;

function markDegraded(err) {
  degradedUntil = Date.now() + 30_000;
  console.error("[cache] degraded for 30s:", err?.message || err);
}

export function cacheKey(namespace, parts = {}, session = null) {
  const scope = session
    ? `r=${session?.user?.role || "?"}|b=${session?.user?.branch || "?"}`
    : "global";
  const flat = Object.keys(parts)
    .sort()
    .map((k) => {
      const v = parts[k];
      if (v === undefined || v === null || v === "") return null;
      return `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`;
    })
    .filter(Boolean)
    .join("&");
  return `${PREFIX}${namespace}:${scope}:${flat}`;
}

export async function cacheGet(key) {
  if (!cacheEnabled()) return null;
  try {
    return await redis.get(key); 
  } catch (err) {
    markDegraded(err);
    return null;
  }
}

export async function cacheSet(key, value, ttlSeconds) {
  if (!cacheEnabled()) return;
  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch (err) {
    markDegraded(err);
  }
}

export async function cached(key, ttlSeconds, producer, meta) {
  const hit = await cacheGet(key);
  if (hit !== null && hit !== undefined) {
    if (meta) meta.status = "HIT";
    return hit;
  }
  if (meta) meta.status = cacheEnabled() ? "MISS" : "BYPASS";
  const value = await producer();
  
  
  if (value !== null && value !== undefined) {
    
    cacheSet(key, value, ttlSeconds);
  }
  return value;
}

export async function cacheInvalidate(...namespaces) {
  if (!cacheEnabled() || !namespaces.length) return;
  try {
    for (const ns of namespaces) {
      let cursor = 0;
      do {
        const [next, keys] = await redis.scan(cursor, { match: `${PREFIX}${ns}:*`, count: 200 });
        cursor = Number(next);
        if (keys?.length) await redis.del(...keys);
      } while (cursor !== 0);
    }
  } catch (err) {
    markDegraded(err);
  }
}

export { PREFIX, CACHE_VERSION };
