import { cacheKey, cacheGet, cacheSet } from "@/lib/cache";

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

export const CALLBY_CACHE_TTL_MS = 60_000;
const L1_TTL_MS = 15_000;

const l1 = new Map(); 

export async function fetchCallbyCached(path, { params, cacheTtlMs = CALLBY_CACHE_TTL_MS } = {}) {
  const key = `${path}?${new URLSearchParams(params || {}).toString()}`;
  const now = Date.now();
  const hit = l1.get(key);
  if (hit && hit.expires > now) return hit.promise;

  const redisKey = cacheKey("callby", { path, ...(params || {}) });
  const promise = (async () => {
    const cachedValue = await cacheGet(redisKey);
    if (cachedValue !== null && cachedValue !== undefined) return cachedValue;

    const value = await fetchCallby(path, { params });
    cacheSet(redisKey, value, Math.ceil(cacheTtlMs / 1000)); 
    return value;
  })().catch((err) => {
    l1.delete(key); 
    throw err;
  });

  l1.set(key, { expires: now + L1_TTL_MS, promise });
  
  if (l1.size > 200) {
    for (const [k, v] of l1) if (v.expires <= now) l1.delete(k);
  }
  return promise;
}
