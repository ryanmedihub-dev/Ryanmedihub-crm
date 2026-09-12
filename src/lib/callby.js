
const CALLBY_API_URL = process.env.CALLBY_API_URL;
const CALLBY_SERVICE_TOKEN = process.env.CALLBY_SERVICE_TOKEN;

export class CallbyError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "CallbyError";
    this.status = status;
  }
}

export async function fetchCallby(path, { params, method = "GET", body } = {}) {
  if (!CALLBY_API_URL || !CALLBY_SERVICE_TOKEN) {
    throw new CallbyError("CALLBY_API_URL / CALLBY_SERVICE_TOKEN not configured", 500);
  }

  const qs = params ? `?${new URLSearchParams(params).toString()}` : "";

  // Cap how long the Owner panel will wait on callby. 20s is generous for a
  // real-but-slow response, but short enough that an unreachable/hung endpoint
  // surfaces the standard error card instead of spinning forever.
  const CALLBY_TIMEOUT_MS = 20000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CALLBY_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${CALLBY_API_URL}${path}${qs}`, {
      method,
      headers: {
        Authorization: `Bearer ${CALLBY_SERVICE_TOKEN}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === "AbortError" || controller.signal.aborted) {
      throw new CallbyError(
        "callby didn't respond in time — it may be slow or unreachable",
        504,
      );
    }
    throw new CallbyError(
      `Could not reach callby: ${err?.message || "network error"}`,
      502,
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    let message = `Callby request failed: ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
    }
    throw new CallbyError(message, res.status);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Short-TTL read cache.
//
// The Owner panel's Employees/Agents list is ~2.2s per request, and ~2.0s of
// that is this one HTTP round trip to callby's workforce-summary (measured with
// scripts/bench/owner-endpoints.mjs). Every page turn / column sort / filter
// change re-fetched it. Reports tolerate a minute of staleness, so identical
// GETs within CALLBY_CACHE_TTL_MS are served from memory instead.
//
// Scope: per Node process (on Vercel, per warm lambda) — a cold instance still
// pays the fetch once. Errors are never cached. Only opt-in callers use it
// (pass { cacheTtlMs }); anything live (calls/live, retry queue) keeps hitting
// callby directly.
// ---------------------------------------------------------------------------
export const CALLBY_CACHE_TTL_MS = 60_000;

const cache = new Map(); // key -> { expires, promise }

export async function fetchCallbyCached(path, { params, cacheTtlMs = CALLBY_CACHE_TTL_MS } = {}) {
  const key = `${path}?${new URLSearchParams(params || {}).toString()}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.promise;

  const promise = fetchCallby(path, { params }).catch((err) => {
    cache.delete(key); // never serve a failure twice
    throw err;
  });
  cache.set(key, { expires: now + cacheTtlMs, promise });
  // Bound the map so a long-lived process can't grow it without limit.
  if (cache.size > 200) {
    for (const [k, v] of cache) if (v.expires <= now) cache.delete(k);
  }
  return promise;
}
