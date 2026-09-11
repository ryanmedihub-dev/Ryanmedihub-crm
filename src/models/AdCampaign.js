import mongoose from "mongoose";
import { ALL_BRANCHES } from "@/lib/branches";

// Manually-maintained ad campaign records (Owner Panel v2, Part 4) — there is
// no Meta/Google API integration (a deliberate decision); every field here is
// hand-entered by the owner/admin. Never hard-deleted: a campaign with spend
// history against it is retired via status:"Ended" so nothing orphans.
const adCampaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Normalized (trim + lowercase) join/uniqueness key — mirrors the
    // immutable-key pattern used elsewhere (e.g. TlManagerMap.tlNameKey,
    // Part 1). Uniqueness is per platform: the same campaign name can exist
    // once on Meta and once on Google without colliding.
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
    // Optional, for future reconciliation if a real API integration is ever added.
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
