import mongoose from "mongoose";

/**
 * ImportLog — persists the outcome of every patient bulk-import run.
 * One document per import session; records[] holds per-row results.
 *
 * A subsequent normal patient edit via the regular Patient save() route
 * will recalculate ops.status based on real clinical data (surgeryDate,
 * payments, counsellor, visitDate). The CLOSED status set during import
 * is therefore intentionally not permanent and can evolve normally.
 */
const recordSchema = new mongoose.Schema(
  {
    rowIndex:        { type: Number, required: true },
    name:            String,
    phone:           String,
    phoneNormalized: String,
    branch:          String,
    service:         String,
    gender:          String,
    /** "created" | "status_updated" | "existing_closed" | "ambiguous_match" | "missing_name" | "invalid_phone" | "duplicate_source" | "error" */
    result:          { type: String, required: true },
    patientId:       { type: mongoose.Schema.Types.ObjectId, ref: "Patient" },
    oldStatus:       String,
    newStatus:       String,
    reason:          String,
  },
  { _id: false }
);

const importLogSchema = new mongoose.Schema(
  {
    /** Stable identifier for this import batch — used for idempotency checks */
    importId:      { type: String, required: true, unique: true, index: true },
    /** "dry_run" | "committed" */
    mode:          { type: String, required: true, enum: ["dry_run", "committed"] },
    importedBy: {
      name:   { type: String, required: true },
      email:  { type: String, required: true },
      branch: String,
    },
    totalRows:     { type: Number, default: 0 },
    created:       { type: Number, default: 0 },
    statusUpdated: { type: Number, default: 0 },
    alreadyClosed: { type: Number, default: 0 },
    ambiguous:     { type: Number, default: 0 },
    skipped:       { type: Number, default: 0 },
    errors:        { type: Number, default: 0 },
    records:       [recordSchema],
    completedAt:   Date,
  },
  { timestamps: true }
);

export default mongoose.models.ImportLog ||
  mongoose.model("ImportLog", importLogSchema);
