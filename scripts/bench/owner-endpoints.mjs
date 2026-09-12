// Times the real Owner API route handlers in-process (see loader.mjs).
//   node --env-file=.env --import ./scripts/bench/register.mjs scripts/bench/owner-endpoints.mjs [label]
// Prints median/min/max wall time per endpoint over N runs after one warm-up,
// plus the JSON payload size — so a "before" and "after" can be compared like
// for like.
import mongoose from "mongoose";

const RUNS = Number(process.env.BENCH_RUNS || 5);
const LABEL = process.argv[2] || "";

const CASES = [
  { name: "employees/agents (p1, name asc)", mod: "@/app/api/owner/employees/agents/route", url: "/api/owner/employees/agents?page=1&pageSize=25&dateFrom=2026-08-01&dateTo=2026-09-11" },
  { name: "employees/agents (p2, totalCalls desc)", mod: "@/app/api/owner/employees/agents/route", url: "/api/owner/employees/agents?page=2&pageSize=25&sortBy=totalCalls&sortDir=desc&dateFrom=2026-08-01&dateTo=2026-09-11" },
  { name: "employees/counsellors", mod: "@/app/api/owner/employees/counsellors/route", url: "/api/owner/employees/counsellors?page=1&pageSize=25&dateFrom=2026-08-01&dateTo=2026-09-11" },
  { name: "employees/surgery-staff", mod: "@/app/api/owner/employees/surgery-staff/route", url: "/api/owner/employees/surgery-staff?page=1&pageSize=25&dateFrom=2026-08-01&dateTo=2026-09-11" },
  { name: "employees/hr", mod: "@/app/api/owner/employees/hr/route", url: "/api/owner/employees/hr?page=1&pageSize=25&dateFrom=2026-08-01&dateTo=2026-09-11" },
  { name: "employees/other-staff", mod: "@/app/api/owner/employees/other-staff/route", url: "/api/owner/employees/other-staff?page=1&pageSize=25&dateFrom=2026-08-01&dateTo=2026-09-11" },
  { name: "finance/salary-incentive", mod: "@/app/api/owner/finance/salary-incentive/route", url: "/api/owner/finance/salary-incentive?dateFrom=2026-08-01&dateTo=2026-09-11" },
  { name: "finance/expenses", mod: "@/app/api/owner/finance/expenses/route", url: "/api/owner/finance/expenses?dateFrom=2026-08-01&dateTo=2026-09-11" },
  { name: "hr/by-position", mod: "@/app/api/owner/hr/by-position/route", url: "/api/owner/hr/by-position?dateFrom=2026-01-01&dateTo=2026-09-11" },
  { name: "ai/attendance", mod: "@/app/api/owner/ai/attendance/route", url: "/api/owner/ai/attendance?date=2026-09-10" },
];

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

const results = [];
for (const c of CASES) {
  const mod = await import(c.mod);
  const req = new Request(`http://bench.local${c.url}`);
  const times = [];
  let bytes = 0, status = 0, rows = null, total = null;
  for (let i = 0; i <= RUNS; i++) {
    const t0 = performance.now();
    const res = await mod.GET(req.clone());
    const text = await res.text();
    const dt = performance.now() - t0;
    if (i === 0) { // warm-up run: record shape, not time
      status = res.status; bytes = Buffer.byteLength(text);
      try { const j = JSON.parse(text); rows = Array.isArray(j.rows) ? j.rows.length : null; total = j.total ?? j.pagination?.total ?? null; } catch {}
      continue;
    }
    times.push(dt);
  }
  results.push({ endpoint: c.name, status, "median ms": Math.round(median(times)), "min ms": Math.round(Math.min(...times)), "max ms": Math.round(Math.max(...times)), rows, total, KB: Math.round(bytes / 1024) });
}
console.log(`\nBENCH ${LABEL} — ${RUNS} timed runs each after 1 warm-up`);
console.table(results);
await mongoose.disconnect();
