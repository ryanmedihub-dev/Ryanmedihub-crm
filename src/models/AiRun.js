import mongoose from "mongoose";

const stageMsSchema = new mongoose.Schema(
  { collect: { type: Number, default: 0 }, compute: { type: Number, default: 0 }, analyze: { type: Number, default: 0 }, verify: { type: Number, default: 0 } },
  { _id: false },
);

const aiRunSchema = new mongoose.Schema(
  {
    feature: { type: String, required: true, index: true },
    kind: { type: String, enum: ["brief", "verdicts", "deep"], required: true },
    scopeKey: { type: String, default: "" },
    userEmail: { type: String, required: true, index: true },
    model: { type: String, default: null },
    cache: { type: String, enum: ["HIT", "MISS", "FORCED"], default: "MISS" },
    
    outcome: { type: String, required: true, index: true },
    errorMessage: { type: String, maxlength: 300, default: null },
    stageMs: { type: stageMsSchema, default: () => ({}) },
    latencyMs: { type: Number, default: 0 },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    costUsd: { type: Number, default: 0 },
    payloadChars: { type: Number, default: 0 },
    rowsAnalyzed: { type: Number, default: 0 },
    grounded: { type: Boolean, default: null },
    ungroundedCount: { type: Number, default: 0 },
    confidence: { type: String, default: null },
  },
  { timestamps: true },
);

aiRunSchema.index({ createdAt: -1 });
aiRunSchema.index({ feature: 1, createdAt: -1 });
aiRunSchema.index({ userEmail: 1, createdAt: -1 });

export default mongoose.models.AiRun || mongoose.model("AiRun", aiRunSchema);
