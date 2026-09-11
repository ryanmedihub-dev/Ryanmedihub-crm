import mongoose from "mongoose";

// Manual attendance record (Owner Panel v2, Part 6). Nothing in either
// system tracks real presence — no punch-in, no login/heartbeat — so this is
// deliberately a human-confirmed record, not an automatic one. The call-
// activity page can SUGGEST a status from callby call data, but a status is
// only ever written here by a person clicking a button; `source` says which.
const attendanceSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    // Day-level, normalized to UTC midnight for that calendar day.
    date: { type: Date, required: true },
    status: { type: String, enum: ["Present", "Half-day", "Absent", "Leave", "Holiday"], required: true },
    // What the call-activity heuristic suggested, if anything — kept for
    // audit even if a human picked something different.
    suggestedStatus: { type: String, enum: ["Present", "Half-day", "Absent", null], default: null },
    source: { type: String, enum: ["manual", "suggested"], default: "manual" },
    note: { type: String, default: "" },
    markedBy: { name: String, email: String },
    markedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1 });

export default mongoose.models.Attendance || mongoose.model("Attendance", attendanceSchema);
