import mongoose from 'mongoose';

const interviewerSchema = new mongoose.Schema({
  date: {
    type: Date,
    default: Date.now,
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
  },
  position: {
    type: String,
    required: [true, 'Position is required'],
    trim: true,
  },
  phone: {
    type: String,
    trim: true,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
  },
  address: {
    type: String,
    trim: true,
  },
  previousSalary: {
    type: Number,
    default: 0,
  },
  expectedSalary: {
    type: Number,
    default: 0,
  },
  finalSalary: {
    type: Number,
    default: 0,
  },
  experienceType: {
    type: String,
    enum: ['Fresher', 'Experienced'],
    default: 'Fresher',
  },
  yearsOfExperience: {
    type: Number,
    default: 0,
  },
  reference: {
    type: String,
    trim: true,
  },
  previousCompany: {
    type: String,
    trim: true,
  },
  previousCompanyContact: {
    type: String,
    trim: true,
  },
  previousPosition: {
    type: String,
    trim: true,
  },
  reasonForLeaving: {
    type: String,
    trim: true,
  },
  source: {
    type: String,
    trim: true,
  },
  interviewDate: {
    type: Date,
  },
  communication: {
    type: Number,
    min: 1,
    max: 10,
  },
  technicalKnowledge: {
    type: Number,
    min: 1,
    max: 10,
  },
  personality: {
    type: Number,
    min: 1,
    max: 10,
  },
  motivation: {
    type: Number,
    min: 1,
    max: 10,
  },
  stability: {
    type: Number,
    min: 1,
    max: 10,
  },
  hrComments: {
    type: String,
    trim: true,
  },
  finalReference: {
    type: String,
    trim: true,
  },
  finalRemarks: {
    type: String,
    trim: true,
  },
  assignedHr: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    default: null,
  },
  status: {
    type: String,
    enum: ['Applied', 'Interview Scheduled', 'Selected', 'Rejected', 'On Hold'],
    default: 'Applied',
  },
  // Owner Panel v2, Part 5: there was no way to know whether a Selected
  // candidate actually joined — set once, manually, from the Selected page
  // ("Mark as Joined"). Null means "not marked yet", not "didn't join".
  hiredEmployeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    default: null,
  },
}, {
  timestamps: true,
});

export default mongoose.models.Interviewer || mongoose.model('Interviewer', interviewerSchema);
