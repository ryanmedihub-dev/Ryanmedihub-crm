import mongoose from "mongoose";
import { ALL_BRANCHES } from "@/lib/branches";

const adCampaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    
    
    
    
    nameKey: { type: String, required: true, trim: true, lowercase: true },
    platform: { type: String, enum: ["Meta", "Google"], required: true },
    status: { type: String, enum: ["Active", "Paused", "Ended"], default: "Active" },
    branch: { type: String, enum: ALL_BRANCHES, required: true },
    objective: { type: String, default: "" },
    targetLocations: [{ type: String, trim: true }],
    targetAgeMin: { type: Number, default: null },
    targetAgeMax: { type: Number, default: null },
    targetGender: { type: String, enum: ["All", "Male", "Female"], default: "All" },
    dailyBudget: { type: Number, default: 0, min: 0 },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    
    platformCampaignId: { type: String, default: "" },
    notes: { type: String, default: "" },
    createdBy: { name: String, email: String },
    updatedBy: { name: String, email: String },
  },
  { timestamps: true },
);

adCampaignSchema.index({ platform: 1, status: 1, branch: 1 });
adCampaignSchema.index({ platform: 1, nameKey: 1 }, { unique: true });

export default mongoose.models.AdCampaign || mongoose.model("AdCampaign", adCampaignSchema);
