

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
