import mongoose from "mongoose";
import { ALL_BRANCHES } from "@/lib/branches";

const campaignLeadSchema = new mongoose.Schema(
  {
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: "AdCampaign", required: true, index: true },
    platform: { type: String, enum: ["Meta", "Google"], required: true },
    branch: { type: String, enum: ALL_BRANCHES, required: true },

    name: { type: String, trim: true, default: "" },
    phone: { type: String, required: true, trim: true }, 
    phoneNormalized: { type: String, required: true, index: true }, 
    email: { type: String, trim: true, lowercase: true, default: "" },
    city: { type: String, trim: true, default: "" },

    
    
    
    leadDate: { type: Date, required: true, index: true },

    
    
    
    
    extraDetails: [{ _id: false, label: String, value: String }],

    platformLeadId: { type: String, default: "", index: true, sparse: true },

    uploadBatch: { type: mongoose.Schema.Types.ObjectId, ref: "UploadBatch", required: true, index: true },
    uploadedBy: { name: String, email: String },
  },
  { timestamps: true },
);

campaignLeadSchema.index({ campaign: 1, phoneNormalized: 1 }, { unique: true });
campaignLeadSchema.index({ leadDate: -1 });
campaignLeadSchema.index({ platform: 1, branch: 1, leadDate: -1 });

export default mongoose.models.CampaignLead || mongoose.model("CampaignLead", campaignLeadSchema);
