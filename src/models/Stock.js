import mongoose from "mongoose";
import Patient from "./Patient.js";

const stockSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },

    location: {
      type: String,
      trim: true,
    },

    totalQuantity: {
      type: Number,
      default: 0,
    },

    transactions: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transactions",
    },

    vendors: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Vendor",
      },
    ],

    gstNo: {
      type: String,
    },

    weight: {
      type: Number,
    },

    unit: {
      type: String,
    },

    mrp: {
      type: Number,
      required: true,
    },
    purchaseAmt: {
      type: Number,
    },
    soldAmt: {
      type: Number,
    },

    expiry: {
      type: Date,
    },

    editors: [
      {
        name: String,
        email: String,
        branch: String,
        date: {
          type: Date,
          default: Date.now,
        },
        updatedFields: [
          {
            name: String,
            previousValue: String,
            newValue: String,
          },
        ],
      },
    ],
    createdBy: {
      name: String,
      email: String,
      branch: String,
      date: {
        type: Date,
        default: Date.now,
      },
    },
  },

  { timestamps: true },
);

// /api/stocks/get filters and sorts by these on every page load (dashboard +
// every inner stocks page) — without them each request is a full collection scan.
stockSchema.index({ location: 1, name: 1 });
stockSchema.index({ totalQuantity: 1 });
stockSchema.index({ expiry: 1 });

export default mongoose.models.Stock || mongoose.model("Stock", stockSchema);
