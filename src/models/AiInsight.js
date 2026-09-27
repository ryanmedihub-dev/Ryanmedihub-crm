import mongoose from "mongoose";

const aiInsightSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true }, 
    feature: { type: String, required: true, index: true },
    kind: { type: String, enum: ["brief", "verdicts", "deep"], required: true },
    scope: { type: mongoose.Schema.Types.Mixed, default: {} }, 
    fingerprint: { type: String, required: true },
    output: { type: mongoose.Schema.Types.Mixed, required: true }, 
    entities: { type: mongoose.Schema.Types.Mixed, default: {} },
    facts: { type: mongoose.Schema.Types.Mixed, default: {} },
    model: { type: String, default: null },
    generatedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    grounding: {
      grounded: { type: Boolean, default: null },
      checked: { type: Number, default: 0 },
      ungrounded: { type: [String], default: [] },
    },
    feedback: {
      up: { type: Number, default: 0 },
      down: { type: Number, default: 0 },
      lastBy: { type: String, default: null },
    },
  },
  { timestamps: true },
);

aiInsightSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.AiInsight || mongoose.model("AiInsight", aiInsightSchema);
