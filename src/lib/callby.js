
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
