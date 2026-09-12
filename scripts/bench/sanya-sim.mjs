// Exercises the Sanya engine with a FAKE OpenAI (only api.openai.com is stubbed;
// tools, Mongo, callby and the usage log are real). Round 1 streams a tool
// call for get_patients_by_status; round 2 streams a final answer. No cost.
import mongoose from "mongoose";
const { default: dbConnect } = await import("@/lib/db"); await dbConnect();
process.env.OPENAI_API_KEY ||= "sim";
const realFetch = globalThis.fetch;
let round = 0;
const sse = (chunks) => new Response(new ReadableStream({ start(c) { const e = new TextEncoder(); for (const ch of chunks) c.enqueue(e.encode("data: " + JSON.stringify(ch) + "\n\n")); c.enqueue(e.encode("data: [DONE]\n\n")); c.close(); } }), { status: 200 });
globalThis.fetch = async (url, init) => {
  if (!String(url).includes("api.openai.com")) return realFetch(url, init);
  const body = JSON.parse(init.body);
  round += 1;
  if (round === 1) {
    return sse([
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "get_patients_by_status", arguments: "" } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "{\"dateFrom\":\"2026-09-01\"," } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "\"dateTo\":\"2026-09-11\"}" } }] } }] },
      { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
      { choices: [], usage: { prompt_tokens: 1500, completion_tokens: 40 } },
    ]);
  }
  const toolMsg = body.messages.find((m) => m.role === "tool");
  const data = JSON.parse(toolMsg.content);
  const text = `**${data.totalPatients} patients** from 2026-09-01 to 2026-09-11 (${data.byStatus.map((s) => `${s.status}: ${s.count}`).join(", ")}).\n\nVerify: [Patients overview](${data.verifyAt.href})`;
  const parts = text.match(/.{1,20}/gs);
  return sse([...parts.map((t) => ({ choices: [{ delta: { content: t } }] })), { choices: [{ delta: {}, finish_reason: "stop" }] }, { choices: [], usage: { prompt_tokens: 2100, completion_tokens: 90 } }]);
};
const { runSanyaTurn } = await import("@/lib/sanya/engine");
const { default: SanyaUsage } = await import("@/models/SanyaUsage");
let text = ""; const events = [];
await runSanyaTurn({ user: { email: "sim@local", role: "owner" }, messages: [{ role: "user", content: "patients this month by status?" }], emit: (e) => { if (e.type === "delta") text += e.text; else events.push(e); } });
console.log("events:", events.map((e) => e.type + (e.name ? ":" + e.name : "") + (e.code ? ":" + e.code : "")).join(" | "));
console.log("answer:\n" + text);
const done = events.find((e) => e.type === "done"); console.log("usage:", JSON.stringify(done?.usage), "verify:", JSON.stringify(done?.verify));
const log = await SanyaUsage.findOne({ userEmail: "sim@local" }).sort({ createdAt: -1 }).lean();
console.log("logged:", JSON.stringify({ outcome: log.outcome, rounds: log.modelRounds, tools: log.toolCalls.map((t) => [t.name, t.ok, t.ms]), tokens: [log.promptTokens, log.completionTokens], costUsd: log.costUsd, latencyMs: log.latencyMs, refused: log.refused }));
await SanyaUsage.deleteMany({ userEmail: "sim@local" });
await mongoose.disconnect();
