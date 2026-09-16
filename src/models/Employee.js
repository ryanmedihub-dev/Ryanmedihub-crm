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

  // --- callby bridge (Owner Panel v2, Part 0) -------------------------------
  // ryan-crm and callby are two databases with no foreign key between them.
  // `callbyUserId` holds the callby user id (as a string) once an Employee has
  // been reconciled to their callby account — by scripts/sync-callby-links.mjs
  // (Employee.employeeId == callby's ryanEmployeeCode, code only, no name
  // matching) first, then the /owner/employees/links UI for the leftovers.
  // Everything that needs an employee's calls/leads/target joins through this field.
  callbyUserId: { type: String, default: null, index: true },

  // Not previously tracked on Employee. `tlName` mirrors callby's free-text TL
  // string (seeded by the reconciliation script, editable after). `managerName`
  // has NO source system yet — it stays empty until the TL->Manager hierarchy
  // question is settled; do not synthesise a value for it.
  dateOfJoining: { type: Date, default: null },
  tlName: { type: String, default: "", trim: true },
  managerName: { type: String, default: "", trim: true },
  // -----------------------------------------------------------------------------

  // Set when this record was merged into another as a duplicate. It is soft-retired, not
  // deleted: name gets a "[MERGED]" prefix, isactive: false, and every list/picker filters
  // `mergedInto: null` so it can never be chosen again.
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