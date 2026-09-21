import mongoose from "mongoose";
import { ALL_BRANCHES } from "@/lib/branches";

// One lead row as delivered by an ad platform, uploaded against a specific campaign.
//
// WHY A SEPARATE COLLECTION AND NOT models/Leads.js
// Leads is the website-form / Collab intake table, keyed on a free-text `tag` that names a
// platform and nothing finer. Campaign leads arrive in bulk, belong to exactly one campaign,
// carry arbitrary per-campaign form answers, and must be revertible as a batch. Bolting that
// onto Leads would change the meaning of every existing Leads row and every query over it.
//
// WHAT THIS IS NOT
// Not a patient, not a callby Lead, not a CRM record of any kind. It is the raw upload,
// preserved as delivered. Everything else — was it called, did it convert, what did it earn —
// is JOINED at read time by phone, never copied onto this document. Copying would create a
// third place that has to be kept in sync with Patient and with callby.
const campaignLeadSchema = new mongoose.Schema(
  {
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: "AdCampaign", required: true, index: true },
    platform: { type: String, enum: ["Meta", "Google"], required: true },
    branch: { type: String, enum: ALL_BRANCHES, required: true },

    name: { type: String, trim: true, default: "" },
    phone: { type: String, required: true, trim: true }, // as uploaded
    phoneNormalized: { type: String, required: true, index: true }, // lib/phone.js normalizePhone
    email: { type: String, trim: true, lowercase: true, default: "" },
    city: { type: String, trim: true, default: "" },

    // The platform's own lead timestamp when the file carries one, else the upload time. This
    // is what the date filter ranges on — "leads that arrived on the 14th", not "rows typed in
    // on the 15th".
    leadDate: { type: Date, required: true, index: true },

    // Per-campaign form answers with no first-class column. An ordered ARRAY of {label, value},
    // not an object — the platform returns questions in the order they were asked and that is
    // the order that reads correctly to a human. Same decision, same reasoning, as
    // callby's Lead.extraDetails.
    extraDetails: [{ _id: false, label: String, value: String }],

    platformLeadId: { type: String, default: "", index: true, sparse: true },

    uploadBatch: { type: mongoose.Schema.Types.ObjectId, ref: "UploadBatch", required: true, index: true },
    uploadedBy: { name: String, email: String },
  },
  { timestamps: true },
);

// One row per phone per campaign. Re-uploading the same file is a no-op rather than a
// duplicate; the SAME person arriving from TWO campaigns is legitimate and stays two rows
// (the reporting layer flags the overlap instead of the schema forbidding it).
campaignLeadSchema.index({ campaign: 1, phoneNormalized: 1 }, { unique: true });
campaignLeadSchema.index({ leadDate: -1 });
campaignLeadSchema.index({ platform: 1, branch: 1, leadDate: -1 });

export default mongoose.models.CampaignLead || mongoose.model("CampaignLead", campaignLeadSchema);
