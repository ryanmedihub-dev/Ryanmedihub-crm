"use client";

// One client fetch wrapper for every owner page. It:
//   • checks res.ok — a 401 auth bounce / 500 HTML error page no longer lands in the generic
//     catch as "Network error"
//   • reads the body as text first, so a non-JSON error body doesn't throw on res.json()
//   • honours the app's { success:false, message } convention
//   • distinguishes an AbortController cancel from a real failure
//
// Returns a consistent shape: { ok, status, data, error, aborted }.
export async function ownerFetch(input, init) {
  let res;
  try {
    res = await fetch(input, init);
  } catch (err) {
    if (err?.name === "AbortError") return { ok: false, aborted: true, status: 0, data: null, error: null };
    return { ok: false, status: 0, data: null, error: "Couldn't reach the server — check your connection and try again." };
  }

  const raw = await res.text().catch(() => "");
  let body = null;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = null; // HTML error page, proxy text, empty auth redirect, …
    }
  }

  if (!res.ok) {
    const fallback =
      res.status === 401
        ? "Your session has expired — please sign in again."
        : res.status === 403
          ? "You don't have access to this data."
          : res.status === 502 || res.status === 503 || res.status === 504
            ? "The upstream service (callby) didn't respond — try again in a moment."
            : `Request failed (HTTP ${res.status}).`;
    return { ok: false, status: res.status, data: body, error: body?.message || body?.error || fallback };
  }

  if (body && body.success === false) {
    return { ok: false, status: res.status, data: body, error: body.message || body.error || "The request could not be completed." };
  }

  return { ok: true, status: res.status, data: body, error: null };
}
