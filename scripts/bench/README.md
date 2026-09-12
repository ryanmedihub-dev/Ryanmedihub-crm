# Owner API bench harness

Runs the real Owner API route handlers in-process (no HTTP server, no login):
`loader.mjs` maps `@/` to `src/` and stubs only `next-auth` with an owner session.

    node --env-file=.env --import ./scripts/bench/register.mjs scripts/bench/owner-endpoints.mjs [label]
    node --env-file=.env --import ./scripts/bench/register.mjs scripts/bench/sanya-tools.mjs [out-dir]
    node --env-file=.env --import ./scripts/bench/register.mjs scripts/bench/sanya-sim.mjs
    SANYA_LOG_PAYLOADS=1 node --env-file=.env --import ./scripts/bench/register.mjs scripts/bench/sanya-turn.mjs "question"

- `owner-endpoints.mjs` — median/min/max ms + payload size per list endpoint (5 runs after a warm-up).
- `verify-employees.mjs` — row-for-row parity of the Employees query against an older copy, plus a
  cross-page sort/uniqueness check. `verify-lists.mjs` does the same for salary-incentive/attendance
  (expects old copies under `scripts/bench/_old/`, e.g. from `git show <rev>:<path>`).
- `sanya-tools.mjs` — runs every Sanya tool on live data, prints the exact tool-message JSON, runs the PII guard.
- `sanya-sim.mjs` — a full Sanya turn with a stubbed OpenAI (everything else real). No cost.
- `sanya-turn.mjs` — a real turn (costs tokens; needs a valid OPENAI_API_KEY).
