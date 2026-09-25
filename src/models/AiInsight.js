import mongoose from "mongoose";

// The persisted result cache — works even without Redis, and is what the
// "What AI saw" drawer reads. `facts` is the exact ALIASED payload sent to
// OpenAI (never real names); `entities` is our own alias -> label map, held
// only in this DB, never sent to OpenAI.
const aiInsightSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true }, // `${feature}|${kind}|${scopeKey}`
    feature: { type: String, required: true, index: true },
    kind: { type: String, enum: ["brief", "verdicts", "deep"], required: true },
    scope: { type: mongoose.Schema.Types.Mixed, default: {} }, // whitelisted params only
    fingerprint: { type: String, required: true },
    output: { type: mongoose.Schema.Types.Mixed, required: true }, // validated + rehydrated
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
