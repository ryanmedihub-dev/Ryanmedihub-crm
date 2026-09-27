import mongoose from "mongoose";
import { ALL_BRANCHES } from "@/lib/branches";

const adSpendSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    branch: { type: String, required: true, enum: ALL_BRANCHES },
    platform: { type: String, enum: ["Meta", "Google"], required: true },
    
    
    
    
    campaignName: { type: String, default: "" },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "AdCampaign", default: null, index: true },
    amount: { type: Number, required: true, min: 0 },
    
    
    
    clicks: { type: Number, default: null, min: 0 },
    enteredBy: { name: String, email: String },
  },
  { timestamps: true }
);

adSpendSchema.index({ date: 1, branch: 1, platform: 1 });
adSpendSchema.index({ campaignId: 1, date: -1 });

export default mongoose.models.AdSpend || mongoose.model("AdSpend", adSpendSchema);
