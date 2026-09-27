import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    
    date: { type: Date, required: true },
    status: { type: String, enum: ["Present", "Half-day", "Absent", "Leave", "Holiday"], required: true },
    
    
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
