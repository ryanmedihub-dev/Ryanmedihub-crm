import mongoose from "mongoose";

// A small, admin-editable TL -> Manager lookup for the Owner Panel v2 Leadership
// page (Part 1). Deliberately its OWN model rather than a new kind bolted onto
// src/models/MasterData.js — that collection is tightly special-cased for the 5
// finance kinds (expense categories, payment methods, routing) with its own
// guardrails/validator; an HR concern doesn't belong in that coupling. Same
// spirit though: immutable join key, editable display label, retire-not-delete,
// audit log.
//
// There is no manager layer anywhere in ryan-crm or callby — callby only has a
// free-text `tlName` shared by many agents. This model is the one place a
// manager gets assigned, one row per TL, so re-parenting a whole team under a
// different manager is a single edit instead of retyping it on every employee.

const tlManagerMapSchema = new mongoose.Schema(
  {
    // Normalized (trim + lowercase) join key — must match how callers group
    // Employee.tlName / callby tlName. Immutable after creation: renaming the
    // underlying TL name means retiring this row and creating a new one, same
    // convention as MasterData.value.
    tlNameKey: { type: String, required: true, unique: true, trim: true, lowercase: true },

    // Display spelling, as most commonly seen in callby/Employee data.
    tlName: { type: String, required: true, trim: true },

    managerName: { type: String, required: true, trim: true },

    isActive: { type: Boolean, default: true },

    log: [
      {
        action: {
          type: String,
          enum: ["Created", "Manager Changed", "Label Changed", "Retired", "Restored"],
        },
        previousValue: String,
        newValue: String,
        performedBy: { name: String, email: String },
        performedAt: { type: Date, default: Date.now },
      },
    ],

    createdBy: {
      name: String,
      email: String,
      date: { type: Date, default: Date.now },
    },
  },
  { timestamps: true },
);

tlManagerMapSchema.index({ isActive: 1 });

export default mongoose.models.TlManagerMap || mongoose.model("TlManagerMap", tlManagerMapSchema);
