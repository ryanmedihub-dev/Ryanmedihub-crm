import mongoose from "mongoose";
const oldQ = await import(process.argv[2]);
const newQ = await import("@/lib/owner/employeeReportQuery");
const { default: dbConnect } = await import("@/lib/db"); await dbConnect();
const base = "dateFrom=2026-08-01&dateTo=2026-09-11";
const strip = (r) => { const { performance, ...rest } = r; return { ...rest, perfScore: performance?.score ?? null, perfBand: performance?.band ?? null, perfIns: performance?.insufficientData ?? null }; };
for (const section of ["Agent", "Counsellor", "HR", "Other"]) {
  const o = await (await oldQ.runEmployeeReportQuery(new Request(`http://b/x?${base}&pageSize=200&sortBy=name`), section)).json();
  const n = await (await newQ.runEmployeeReportQuery(new Request(`http://b/x?${base}&pageSize=200&sortBy=name`), section)).json();
  const oMap = new Map(o.rows.map((r) => [r.id, strip(r)]));
  let diffs = 0;
  for (const r of n.rows) {
    const a = oMap.get(r.id); const b = strip(r);
    if (!a) { diffs++; console.log("  missing in old", r.name); continue; }
    for (const k of Object.keys(b)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) { diffs++; console.log(`  ${r.name} ${k}: old=${JSON.stringify(a[k])} new=${JSON.stringify(b[k])}`); }
  }
  const kOld = o.kpis.map((k) => `${k.label}=${k.value}`).join(", "), kNew = n.kpis.map((k) => `${k.label}=${k.value}`).join(", ");
  console.log(`${section}: old total ${o.total} new total ${n.total}; row field diffs ${diffs}; kpis equal: ${kOld === kNew}`);
  if (kOld !== kNew) console.log("   old:", kOld, "\n   new:", kNew);
}
// cross-page sort check
for (const [section, sortBy, dir] of [["Agent", "totalCalls", "desc"], ["Agent", "performance", "desc"], ["Agent", "name", "asc"], ["Surgery", "graftsImplanted", "desc"]]) {
  const all = []; let page = 1, total = Infinity;
  while ((page - 1) * 10 < total) {
    const j = await (await newQ.runEmployeeReportQuery(new Request(`http://b/x?${base}&pageSize=10&page=${page}&sortBy=${sortBy}&sortDir=${dir}`), section)).json();
    total = j.total; all.push(...j.rows); page++;
    if (page > 60) break;
  }
  const ids = new Set(all.map((r) => r.id));
  const val = (r) => sortBy === "performance" ? (r.performance?.score ?? null) : r[sortBy];
  let ordered = true;
  for (let i = 1; i < all.length; i++) {
    const a = val(all[i - 1]), b = val(all[i]);
    if (a == null || b == null) continue;
    const cmp = typeof a === "string" ? a.localeCompare(b, "en", { sensitivity: "base" }) : a - b;
    if (dir === "desc" ? cmp < 0 : cmp > 0) { ordered = false; console.log("   out of order at", i, a, b); break; }
  }
  console.log(`${section} by ${sortBy} ${dir}: ${all.length} rows over ${page - 1} pages, unique ids ${ids.size}, total ${total}, ordered=${ordered}`);
}
await mongoose.disconnect();
