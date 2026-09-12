// Runs every Sanya tool against live data and prints the exact JSON string
// each would put in the OpenAI `tool` message, then runs the PII guard over a
// synthetic request body built from them. No model call, no cost.
import mongoose from "mongoose";
const { default: dbConnect } = await import("@/lib/db"); await dbConnect();
const { TOOLS, runTool } = await import("@/lib/sanya/tools");
const { assertRequestBodyClean, assertNoPII } = await import("@/lib/sanya/pii");
const args = { dateFrom: "2026-08-01", dateTo: "2026-09-11" };
const outDir = process.argv[2];
const fs = await import("node:fs");
const messages = [];
for (const t of TOOLS) {
  const a = t.name === "get_employee_stats" ? { ...args, section: "Agent" } : args;
  const t0 = Date.now();
  try {
    const r = await runTool(t.name, a);
    const content = JSON.stringify({ ...r.data, verifyAt: r.verifyAt });
    messages.push({ role: "tool", tool_call_id: "x", name: t.name, content });
    console.log(`OK   ${t.name.padEnd(26)} ${Date.now() - t0}ms  ${content.length} chars  verify=${r.verifyAt.href}`);
    if (outDir) fs.writeFileSync(`${outDir}/tool-${t.name}.json`, JSON.stringify(JSON.parse(content), null, 2));
  } catch (e) {
    console.log(`FAIL ${t.name.padEnd(26)} ${e.message}`);
  }
}
try { assertRequestBodyClean({ messages }); console.log("\nPII guard over all tool results: CLEAN"); } catch (e) { console.log("\nPII guard: BLOCKED —", e.message); }
// negative test: the guard must catch a leak
try { assertNoPII({ rows: [{ label: "x", phone: "9876543210" }] }); console.log("negative test FAILED (phone not caught)"); } catch (e) { console.log("negative test OK:", e.message); }
try { assertNoPII({ topDialers: [{ name: "Aisha Khan", count: 3 }] }); console.log("negative test FAILED (name key not caught)"); } catch (e) { console.log("negative test OK:", e.message); }
await mongoose.disconnect();
