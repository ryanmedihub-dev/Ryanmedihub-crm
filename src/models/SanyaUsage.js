import mongoose from "mongoose";

// One document per Sanya chat turn (/api/owner/ai/sanya). Feeds the cost
// ceiling, the per-user rate limit and /owner/ai/health. Deliberately does
// NOT store the question or answer text — only shape/size — so this log can
// never become a second copy of anything sensitive the owner typed.
const toolCallSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    args: { type: mongoose.Schema.Types.Mixed, default: {} }, // dates/branch/section only — tools take no free text
    ms: { type: Number, default: 0 },
    ok: { type: Boolean, default: true },
    error: { type: String, default: null },
  },
  { _id: false },
);

const sanyaUsageSchema = new mongoose.Schema(
  {
    userEmail: { type: String, required: true, index: true },
    userRole: { type: String, default: null },
    model: { type: String, required: true },
    questionChars: { type: Number, default: 0 },
    answerChars: { type: Number, default: 0 },
    historyTurns: { type: Number, default: 0 },
    toolCalls: { type: [toolCallSchema], default: [] },
    modelRounds: { type: Number, default: 0 }, // completions requests made for this turn
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    costUsd: { type: Number, default: 0 },
    latencyMs: { type: Number, default: 0 },
    // "refused" = the assistant answered with the fixed "I don't have that data" phrase.
    refused: { type: Boolean, default: false },
    // outcome: ok | error | rate_limited | budget_exceeded | pii_blocked
    outcome: { type: String, default: "ok", index: true },
    errorMessage: { type: String, default: null },
  },
  { timestamps: true },
);

sanyaUsageSchema.index({ createdAt: -1 });
sanyaUsageSchema.index({ userEmail: 1, createdAt: -1 });

export default mongoose.models.SanyaUsage || mongoose.model("SanyaUsage", sanyaUsageSchema);
