import mongoose from "mongoose";

// Full audit + replayable record of one duplicate-employee merge. `operations` carries the
// exact document ids touched per reference path so the revert moves back precisely those,
// never a document that legitimately started on the survivor.
const employeeMergeSchema = new mongoose.Schema(
  {
    survivorId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    duplicateId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true, index: true },

    survivorSnapshot: { type: mongoose.Schema.Types.Mixed },
    duplicateSnapshot: { type: mongoose.Schema.Types.Mixed },

    fieldChoices: { type: mongoose.Schema.Types.Mixed },
    conflictResolutions: { type: mongoose.Schema.Types.Mixed },

    operations: [
      {
        model: String,
        path: String,
        kind: String,
        documentIds: [{ type: mongoose.Schema.Types.ObjectId }],
        modifiedCount: Number,
      },
    ],

    relabelledPayables: [
      { payableId: { type: mongoose.Schema.Types.ObjectId }, previousLabel: String, newLabel: String },
    ],
    cancelledPayables: [{ type: mongoose.Schema.Types.ObjectId }],

    survivorPatientAdded: [{ type: mongoose.Schema.Types.ObjectId }], // patient ids unioned in

    totalReferences: Number,
    verification: { type: mongoose.Schema.Types.Mixed },

    status: { type: String, enum: ["completed", "reverted", "failed"], default: "completed", index: true },
    note: String,

    performedBy: { name: String, email: String },
    performedAt: { type: Date, default: Date.now },
    revertedBy: { name: String, email: String },
    revertedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export default mongoose.models.EmployeeMerge || mongoose.model("EmployeeMerge", employeeMergeSchema);
