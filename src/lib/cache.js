import { Redis } from "@upstash/redis";

// Upstash's HTTP client, not ioredis. Vercel runs this app as serverless functions, and a TCP
// Redis client opens a new connection per cold lambda with no way to pool across invocations —
// the standard route to exhausting a Redis instance's connection limit. An HTTP client has no
// connection to leak. If this ever moves to a long-lived Node server, ioredis becomes the
// better choice and this comment is the reason to revisit.
//
// FAIL-OPEN BY DESIGN. Redis is a speed layer over MongoDB and never a source of truth. With
// Redis unreachable, misconfigured, or simply not provisioned, every helper below returns as
// if it were a miss and the caller goes to Mongo. Nothing here may ever turn into a 500.

const URL_ = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// Bump on any deploy that changes the SHAPE of a cached payload. Invalidates everything at
// once without a FLUSHDB, which would also wipe anything else sharing the instance.
const CACHE_VERSION = process.env.CACHE_VERSION || "v1";
const PREFIX = `ryan:${CACHE_VERSION}:`;

const redis = URL_ && TOKEN ? new Redis({ url: URL_, token: TOKEN }) : null;

let degradedUntil = 0; // circuit breaker — see below

export const cacheEnabled = () => !!redis && Date.now() >= degradedUntil;

// After a failure, stop trying for 30s. Without this, a down Redis adds an HTTP timeout to
// EVERY request — the cache would make the app slower than having no cache at all.
function markDegraded(err) {
  degradedUntil = Date.now() + 30_000;
  console.error("[cache] degraded for 30s:", err?.message || err);
}

/**
 * Build a namespaced key. Pass the session whenever the response is scoped to a user's
 * role/branch — see rule 0.3. Omitting it on a scoped route is a data-leak bug.
 */
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
    return await redis.get(key); // Upstash deserializes JSON itself
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

/**
 * The one helper every cached route should use.
 * Miss or Redis-down -> runs producer() and returns its value either way.
 *
 * `meta`, if passed, gets a `.status` of "HIT" | "MISS" | "BYPASS" set on it — routes use this
 * to emit the X-Cache header without paying for a second round trip just to ask.
 */
export async function cached(key, ttlSeconds, producer, meta) {
  const hit = await cacheGet(key);
  if (hit !== null && hit !== undefined) {
    if (meta) meta.status = "HIT";
    return hit;
  }
  if (meta) meta.status = cacheEnabled() ? "MISS" : "BYPASS";
  const value = await producer();
  // Never cache an empty/failed shape — a transient error would otherwise be served for the
  // whole TTL window.
  if (value !== null && value !== undefined) {
    // Fire and forget: the caller should not wait on the write.
    cacheSet(key, value, ttlSeconds);
  }
  return value;
}

/**
 * Invalidate by namespace. SCAN, never KEYS — KEYS blocks the whole instance and this runs on
 * user-facing write paths.
 */
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
