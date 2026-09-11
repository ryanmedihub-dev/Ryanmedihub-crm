import mongoose from "mongoose";
import { ALL_BRANCHES } from "@/lib/branches";

const adSpendSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    branch: { type: String, required: true, enum: ALL_BRANCHES },
    platform: { type: String, enum: ["Meta", "Google"], required: true },
    // Free text, kept for backward compatibility and as the fallback for
    // historical/one-off spend rows with no matching AdCampaign (Owner Panel
    // v2, Part 4). New entries should prefer campaignId; campaignName is
    // still shown/stored for those.
    campaignName: { type: String, default: "" },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "AdCampaign", default: null, index: true },
    amount: { type: Number, required: true, min: 0 },
    // Optional, hand-entered — there is no click data anywhere in this app or
    // callby. Only here so CPC (spend / clicks) can be shown; null means "not
    // entered", never treated as 0.
    clicks: { type: Number, default: null, min: 0 },
    enteredBy: { name: String, email: String },
  },
  { timestamps: true }
);

adSpendSchema.index({ date: 1, branch: 1, platform: 1 });
adSpendSchema.index({ campaignId: 1, date: -1 });

export default mongoose.models.AdSpend || mongoose.model("AdSpend", adSpendSchema);
