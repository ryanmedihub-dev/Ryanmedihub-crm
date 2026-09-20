# Redis read cache

`src/lib/cache.js` puts Upstash Redis (HTTP client, not `ioredis` — see the file's own comment
for why that matters on Vercel) in front of the expensive read paths: Owner panel, finance
reads, and the callby fetch. It is a speed layer only. Unset `UPSTASH_REDIS_REST_URL` /
`UPSTASH_REDIS_REST_TOKEN`, or any Redis failure, and every route falls straight back to Mongo —
never a 500. A 30s circuit breaker (`markDegraded`) stops retrying a down Redis so an outage
doesn't add HTTP timeouts to every request.

## Scoping (read before adding a new cached route)

This is a multi-branch, multi-role system (`resolveBranchFilter()` in `src/lib/branches.js`) —
the same URL returns different data for a Delhi admin, a Collab user, and an owner. Any route
whose response depends on the session **must** pass `session` into `cacheKey()`, which folds
`role` and `branch` into the key. Omitting it on a scoped route is a data-leak bug, not a
performance trade-off.

## Namespaces

Fixed list — add a new one here before using it in code.

| Namespace | Covers | Invalidated by |
|---|---|---|
| `callby` | every cross-system fetch to the callby API (`fetchCallbyCached`) | nothing (TTL only) |
| `owner` | `/api/owner/*` read routes | finance + patient + employee writes |
| `finance` | payables, receivables, advances, borrowings, account-transfers, payments, receipts, close-book, transactions, admin dashboard reads | any finance write |
| `masterdata` | `/api/master-data/*` lists | master-data writes |
| `patients` | patient lists/dashboards, patient incentives | patient create/update/delete |
| `employees` | employee lists and finance summaries | employee create/update/delete/merge, incentives |
| `reports` | `/api/admin/reports`, `/api/super-admin/reports` | TTL only (plus close-book close/reopen) |

## TTLs

| Route group | TTL |
|---|---|
| `owner/dashboard`, `statistics`, `conversion`, `forecast`, and other report-style Owner GETs not in a more specific bucket below | 60s |
| `owner/employees/*` | 120s |
| `owner/finance/*` | 60s |
| `owner/marketing/*`, `owner/hr/*` | 180s |
| `owner/patients/*`, `owner/leads/*` (report views) | 60s |
| `owner/calls/live`, `owner/leads/retry`, `owner/live-workforce`, `owner/ai/*` | not cached |
| `payables/grouped\|list\|summary`, `receivables/grouped\|list\|summary\|open`, `advances/grouped\|list\|open-for-party`, `borrowings/grouped\|list`, `account-transfers/list\|balances`, `payments/grouped`, `receipts/grouped` | 45s |
| `close-book/overview\|balance-sheet\|pnl\|cash-flow\|ledger\|accounts` | 15s |
| `transactions/get-all\|get-data` | 30s |
| `admin/dashboard\|expense-by-head\|sales-summary` | 60s |
| `master-data/lists` (global, not session-scoped — same for every role) | 60s |

## `CACHE_VERSION`

Bump the `CACHE_VERSION` env var on any deploy that changes the *shape* of a cached payload
(new/renamed field, different array vs object, etc.). It's prefixed into every key
(`ryan:<version>:...`), so bumping it makes every old key simply stop matching instead of
requiring a `FLUSHDB` — which would also wipe anything else sharing the Redis instance.

## Adding a new cached route

```js
import { cacheKey, cached } from "@/lib/cache";

const meta = {};
const key = cacheKey("finance", { route: "payables-list", ...Object.fromEntries(searchParams) }, session);
const data = await cached(key, 45, async () => { /* existing handler body */ }, meta);
const res = NextResponse.json(data);
res.headers.set("X-Cache", meta.status);
return res;
```

Never cache a write path (`POST`/`PATCH`/`PUT`/`DELETE`). Every write that changes data a
cached route reads must call `cacheInvalidate(...namespaces)` after its DB write resolves and
before it returns.

## Verifying it's working

Judge by the `X-Cache: HIT|MISS|BYPASS` response header, not by page feel. `GET
/api/health/cache` (owner/super-admin only) reports `{ enabled, version, pingMs }`.
