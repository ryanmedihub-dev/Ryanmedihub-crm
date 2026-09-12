import mongoose from "mongoose";
const { default: dbConnect } = await import("@/lib/db"); await dbConnect();
const q = "dateFrom=2026-08-01&dateTo=2026-09-11";
{
  const o = await (await (await import("./_old/salary.js")).GET(new Request(`http://b/x?${q}`))).json();
  const n = await (await (await import("@/app/api/owner/finance/salary-incentive/route")).GET(new Request(`http://b/x?${q}&pageSize=200&page=1`))).json();
  const n2 = await (await (await import("@/app/api/owner/finance/salary-incentive/route")).GET(new Request(`http://b/x?${q}&pageSize=200&page=2`))).json();
  const sum = (rows, k) => Math.round(rows.reduce((s, r) => s + (r[k] || 0), 0));
  console.log("salary-incentive: old rows", o.rows.length, "new total", n.total, "| old sums", sum(o.rows,"baseSalaryDue"), sum(o.rows,"salaryPaid"), sum(o.rows,"incentivePaid"), "| new totals", Math.round(n.totals.salaryDue), Math.round(n.totals.salaryPaid), Math.round(n.totals.incentivePaid));
  const oB = o.byBranch.map(r => `${r.key}:${Math.round(r.salaryDue)}:${r.count}`).join(" "), nB = n.byBranch.map(r => `${r.key}:${Math.round(r.salaryDue)}:${r.count}`).join(" ");
  console.log("  byBranch equal:", oB === nB, oB === nB ? "" : `\n   old ${oB}\n   new ${nB}`);
  const oM = o.byMonth.map(r => `${r.key}:${Math.round(r.salaryDue)}`).join(" "), nM = n.byMonth.map(r => `${r.key}:${Math.round(r.salaryDue)}`).join(" ");
  console.log("  byMonth equal:", oM === nM, oM === nM ? "" : `\n   old ${oM}\n   new ${nM}`);
  const oU = o.byOperatingUnit.map(r => `${r.key}:${Math.round(r.salaryDue)}`).join(" "), nU = n.byOperatingUnit.map(r => `${r.key}:${Math.round(r.salaryDue)}`).join(" ");
  console.log("  byUnit equal:", oU === nU, oU === nU ? "" : `\n   old ${oU}\n   new ${nU}`);
  const ids = new Set([...n.rows, ...n2.rows].map(r => r.id)); console.log("  pages 1+2 unique ids", ids.size, "of", n.rows.length + n2.rows.length);
  const oMap = new Map(o.rows.map(r => [r.id, r])); let d = 0;
  for (const r of [...n.rows, ...n2.rows]) { const a = oMap.get(r.id); if (!a) { d++; continue; } for (const k of ["baseSalaryDue","salaryPaid","salaryPending","incentiveDue","incentivePaid","operatingUnit","monthKey","role","branch"]) if (JSON.stringify(a[k]) !== JSON.stringify(r[k])) { d++; console.log("   diff", r.name, k, a[k], r[k]); } }
  console.log("  row diffs:", d);
}
{
  const o = await (await (await import("./_old/attendance.js")).GET(new Request(`http://b/x?date=2026-09-10`))).json();
  const n = await (await (await import("@/app/api/owner/ai/attendance/route")).GET(new Request(`http://b/x?date=2026-09-10&pageSize=200`))).json();
  console.log("attendance: old summary", JSON.stringify(o.summary), "new", JSON.stringify(n.summary));
  const oMap = new Map(o.rows.map(r => [r.id, r])); let d = 0;
  for (const r of n.rows) { const a = oMap.get(r.id); if (!a) { d++; continue; } for (const k of ["totalCalls","connectedCalls","targetAchievement","suggestedStatus","markedStatus","callbyLinked","activeWindowStart"]) if (JSON.stringify(a[k]) !== JSON.stringify(r[k])) { d++; console.log("   diff", r.name, k, a[k], r[k]); } }
  console.log("  row diffs over first", n.rows.length, ":", d);
}
await mongoose.disconnect();
