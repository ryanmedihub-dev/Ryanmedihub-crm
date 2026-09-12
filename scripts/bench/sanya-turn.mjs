// Drives one Sanya turn in-process and prints every event + the outgoing
// OpenAI payloads (SANYA_LOG_PAYLOADS=1). Costs real tokens.
//   SANYA_LOG_PAYLOADS=1 node --env-file=.env --import ./scripts/bench/register.mjs scripts/bench/sanya-turn.mjs "question"
import mongoose from "mongoose";
const { default: dbConnect } = await import("@/lib/db"); await dbConnect();
const { runSanyaTurn } = await import("@/lib/sanya/engine");
const q = process.argv[2] || "How many patients did we get this month, by status?";
let text = "";
await runSanyaTurn({
  user: { email: "bench@local", role: "owner" },
  messages: [{ role: "user", content: q }],
  emit: (e) => { if (e.type === "delta") { text += e.text; } else console.log("EVENT", JSON.stringify(e)); },
});
console.log("\nANSWER:\n" + text);
await mongoose.disconnect();
