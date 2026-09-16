import mongoose from 'mongoose';
import { ALL_BRANCHES } from '@/lib/branches';

const employeeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  employeeId: {
    type: String,
    trim: true,
    default: ""
  },
  role: {
    type: String,
    required: [true, 'Role is required'],
    trim: true
  },
  isactive : {
    type: Boolean,
    default: true
  },
  branch: {
    type: String,
    enum: ALL_BRANCHES,
    default: "Delhi"
  },
  patient: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient"  }],
  salaryStructure: {
    baseSalary: { type: Number, default: 0, min: 0 },
    salaryType: { type: String, enum: ["Monthly", "Daily", "Hourly"], default: "Monthly" },
    effectiveFrom: { type: Date, default: Date.now }
  },
  incentiveRate: { type: Number, default: 0, min: 0 },
  callbyUserId: { type: String, default: null, index: true },
  dateOfJoining: { type: Date, default: null },
  tlName: { type: String, default: "", trim: true },
  managerName: { type: String, default: "", trim: true },
  mergedInto: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null, index: true },
  mergedAt:   { type: Date, default: null },
  mergedBy:   { name: String, email: String },
}, {
  timestamps: true
});

employeeSchema.index({ role: 1, isactive: 1, branch: 1 });
employeeSchema.index({ branch: 1 });
employeeSchema.index({ employeeId: 1 });

export default mongoose.models.Employee || mongoose.model('Employee', employeeSchema);