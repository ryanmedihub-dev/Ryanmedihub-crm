// Source adapters: the key reuse trick. Most owner numbers live inside
// existing route handlers (or the lib functions behind them) — the AI engine
// never re-implements a query, it calls the same code the page calls.

/**
 * Invoke an existing App Router route handler in-process and return its JSON.
 * The session resolves from the *current* request's cookies (getServerSession
 * reads next/headers, which is request-scoped async local storage — this
 * still works when the handler is called directly rather than through HTTP),
 * so the owner's own auth applies — no bypass, no internal token.
 *
 * GET (default): `params` become the query string. POST (`body` given):
 * a couple of owner routes (counsellor-conversion, surgery-planner) only take
 * a JSON body, not query params — same in-process call, just a different verb.
 */
export async function callRoute(handler, { path, params = {}, routeParams = null, body = null }) {
  const url = new URL(`http://internal${path}`);
  const method = body ? "POST" : "GET";
  if (!body) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  const req = new Request(url, {
    method,
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const ctx = routeParams ? { params: Promise.resolve(routeParams) } : undefined;
  const res = await handler(req, ctx);
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.success === false) {
    const err = new Error(json?.message || `Source ${path} failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return json;
}
