import mongoose from "mongoose";
import { COLLAB_BRANCHES } from "@/lib/branches";

const COLLECTION_MODES = ["upi", "cash", "card", "banking", "bajaj_loan", "fibe_loan", "other"];

const collabCaseSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },
    clinic: {
      type: String,
      enum: COLLAB_BRANCHES,
      required: true,
      index: true,
    },

    packageAmount: { type: Number, required: true, min: 0 },
    clinicShare: { type: Number, required: true, min: 0, default: 20000 },

    procedure: {
      type: String,
      required: true,
      enum: [
        "Sapphire FUE",
        "DHI",
        "Turkish DHI",
        "Beard Transplant",
        "PRP",
        "Alopecia",
        "Headwash",
        "Canacot",
        "Mesotherapy",
        "GFC",
        "Medicine",
        "Other",
      ],
    },

    clinicCollections: [
      {
        amount: { type: Number, required: true, min: 0 },
        discount: { type: Number, default: 0, min: 0 },
        collectedBy: { type: String, enum: ["US", "CLINIC"], default: "CLINIC" },
        date: { type: Date, default: Date.now },
        mode: { type: String, enum: COLLECTION_MODES },
        reference: String,
        receiptMode: String,
        furtherMode: String,
        note: String,
        recordedBy: { name: String, email: String },
        recordedAt: { type: Date, default: Date.now },
      },
    ],

    clinicSharePayable: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payable",
      default: null,
    },
    clinicShareReceivable: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Receivable",
      default: null,
    },

    clinicShareSettledAt: { type: Date, default: null },

    status: {
      type: String,
      enum: ["OPEN", "SETTLED", "CANCELLED"],
      default: "OPEN",
    },
    remarks: String,

    log: [
      {
        action: {
          type: String,
          enum: [
            "Created",
            "Package Revised",
            "Share Revised",
            "Collection Added",
            "Clinic Share Crystallised",
            "Cancelled",
            "Note Added",
          ],
        },
        previousValue: String,
        newValue: String,
        note: String,
        performedBy: { name: String, email: String },
        performedAt: { type: Date, default: Date.now },
      },
    ],

    createdBy: {
      name: String,
      email: String,
      branch: String,
      date: { type: Date, default: Date.now },
    },
  },
  { timestamps: true },
);

collabCaseSchema.index({ clinic: 1, status: 1 });
collabCaseSchema.index({ patient: 1 });

export default mongoose.models.CollabCase ||
  mongoose.model("CollabCase", collabCaseSchema);
