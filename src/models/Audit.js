import mongoose from "mongoose";
import Patient from "./Patient";
import { ALL_BRANCHES } from "@/lib/branches";
import { masterDataEnum } from "@/lib/masterData/validator";

const auditSchema = new mongoose.Schema({
  costType: {
    type: String,
    required: true,
    enum: ["Revenue", "Expenses"],
  },
  method: {
    type: String,
    ...masterDataEnum("PAYMENT_METHOD", "method"),
  },
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient",
  },
  newPatient: {
    name : String, 
    phone: Number
  },
  procedure: {
    type: String,
    enum: [
      "Sapphire FUE",
      "DHI",
      "Turkish DHI",
      "Beard Transplant",
      "PRP",
      "GFC",
      "Medicine",
      "Other",
    ],
  },
  paymentType: {
    type: String,
    enum: ["Booking", "Pending", "Full-payment", "Other"],
  },
  paymentId: String,
  branch: {
    type: String,
    enum: ALL_BRANCHES,
  },
  expense: String,
  discount: {
    type: Number,
    default: 0,
  },
  amount: {
    type: Number,
    required: true,
  },
  date: {
    type: Date,
    default: Date.now(),
  },
  expenseGiver: String,
  remarks: String,
  createdBy: {
    name: String,
    email: String,
    branch: String,
    date: {
      type: Date,
      default: Date.now,
    },
  },
});

export default mongoose.models.Audit ||
  mongoose.model("Audit", auditSchema);
