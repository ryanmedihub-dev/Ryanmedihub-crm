import mongoose from "mongoose";
import { normalizePhone } from "@/lib/phone";
import { ALL_BRANCHES } from "@/lib/branches";

const patientSchema = new mongoose.Schema(
  {
    personal: {
      name: String,
      phone: {
        type: String,
        unique: true,
      },
      phoneNormalized: {
        type: String,
        index: true,
        sparse: true,
      },
      email: String,
      age: Number,
      gender: {
        type: String,
      },
      branch: {
        type: String,
      },
      address: String,
      profession: String,
      visitDate: Date,
      reference: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee",
      },
      purpose: String,
      packageQuoted: Number,
      techniqueQuoted: String,
      remarks: String,
    },
    counselling: {
      counsellor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee",
      },
      techniqueSuggested: {
        type: String,
      },
      finlpackage: Number,
      graftsSuggested: Number,
      readyForSurgery: { type: Boolean, default: false },
      notes: String,
      additionalbenefits: [String],
      medicines: [String],
      hairlossType: String,
      areaofConcern: String,
      hairlossreason: String,
      hairlossduration: String,
    },
    medical: {
      allergies: String,
      medicalHistory: {
        type: String,
      },
      bloodGroup: {
        type: String,
      },
      sugar: String,
      bp: String,
      pulse: String,
      weight: String,
      hiv: String,
      hcv: String,
    },
    surgery: {
      surgeryDate: Date,
      location: {
        type: String,
      },
      OT: Number,
      technique: {
        type: String,
      },
      graftsneed: Number,
      graftsImplanted: Number,
      donorCondition: String,
      doctor: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Employee",
        },
      ],
      seniorTech: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Employee",
        },
      ],
      implanterRight: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Employee",
        },
      ],
      implanterLeft: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Employee",
        },
      ],
      graftingPerson: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Employee",
        },
      ],
      helper: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Employee",
        },
      ],
    },
    afterSurgery: {
      headwashDate: Date,
      bandageRemovalDate: Date,
      prp: [
        {
          prpNumber: Number,
          date: Date,
          type: { type: String, enum: ["PRP", "GFC", "Canacot", "Biotin"], default: "PRP" },
        },
      ],
    },
    payments: {
      amountReceived: { type: Number, default: 0 },
      pendingAmount: { type: Number, default: 0 },
      medicineAmount: { type: Number, default: 0 },
      discount: { type: Number, default: 0 },
      totalAmount: { type: Number, default: 0 },
      transactions: [
        { type: mongoose.Schema.Types.ObjectId, ref: "Transactions" },
      ],
    },
    incentives: [
      {
        employee: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Employee",
          required: true,
          index: true,
        },
        employeeName: String,
        role: String,
        purpose: { type: String, required: true },
        amount: { type: Number, required: true, min: 0 },
        date: { type: Date, default: Date.now },
        branch: { type: String, enum: ALL_BRANCHES },
        payableId: { type: mongoose.Schema.Types.ObjectId, ref: "Payable", default: null },
        remarks: String,
        isCancelled: { type: Boolean, default: false },
        log: [
          {
            action: {
              type: String,
              enum: ["Created", "Amount Revised", "Cancelled", "Note Added"],
            },
            previousValue: String,
            newValue: String,
            note: String,
            performedBy: { name: String, email: String },
            performedAt: { type: Date, default: Date.now },
          },
        ],
        createdBy: {
          name: String,
          email: String,
          branch: String,
          date: { type: Date, default: Date.now },
        },
      },
    ],
    products: [{
      stocks : {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Stock"
      },
      quantity: Number,
      amount: Number,
    }],
    documents: {
      images: [String],
      consentForm: [String],
      suregeryForm: [String],
      consultForm: [String],
    },
    ops: {
      status: {
        type: String,
        enum: [
          "NEW",
          "NOT_VISITED",
          "NOT_CONVERTED",
          "CONSULTED",
          "SURGERY_BOOKED",
          "BOOKING_DONE",
          "CLOSED",
        ],
        default: "NEW",
      },
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
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

patientSchema.virtual("totalIncentives").get(function () {
  return (this.incentives || [])
    .filter((i) => !i.isCancelled)
    .reduce((sum, i) => sum + (i.amount || 0), 0);
});

patientSchema.pre("save", async function () {
  const patient = this;
  const currentDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const isVisitDatePast =
    patient.personal?.visitDate && patient.personal.visitDate < currentDate;

  if (!patient.ops) {
    patient.ops = {};
  }

  if (patient.isModified("personal.phone")) {
    const normalized = normalizePhone(patient.personal?.phone);
    if (patient.personal) patient.personal.phoneNormalized = normalized;
  }

  if (patient.counselling?.finlpackage) {
    patient.payments = patient.payments || {};

    // On a brand-new document Mongoose reports every path — defaults included — as
    // modified, so `isModified("payments.totalAmount")` is true even when the caller
    // never set it (it just carries the schema default of 0). That made the collab
    // book-consult flow save a final package that never reached payments.totalAmount,
    // which is the figure the collab case / "Total Package" reads. For new docs fall
    // back to inspecting the value itself; keep the isModified guard for updates so a
    // deliberately revised package still flows through.
    const totalSetDeliberately = patient.isNew
      ? (patient.payments.totalAmount || 0) > 0
      : patient.isModified("payments.totalAmount");
    if (!totalSetDeliberately) {
      patient.payments.totalAmount = patient.counselling.finlpackage;
    }

    const pendingSetDeliberately = patient.isNew
      ? (patient.payments.pendingAmount || 0) > 0
      : patient.isModified("payments.pendingAmount");
    if (!pendingSetDeliberately) {
      patient.payments.pendingAmount =
        (patient.payments.totalAmount || patient.counselling.finlpackage) -
        (patient.payments.amountReceived || 0) -
        (patient.payments.discount || 0);
    }
  }

  const amountReceived = patient.payments?.amountReceived || 0;
  const totalAmount    = patient.payments?.totalAmount    || 0;
  const pendingAmount  = patient.payments?.pendingAmount;

  if (patient.surgery?.surgeryDate) {
    patient.ops.status = "CLOSED";
  } else if (totalAmount > 0 && pendingAmount != null && pendingAmount <= 0) {
    patient.ops.status = "SURGERY_BOOKED";
  } else if (amountReceived > 0) {
    patient.ops.status = "BOOKING_DONE";
  } else if (patient.counselling?.counsellor && amountReceived === 0) {
    patient.ops.status = "NOT_CONVERTED";
  } else if (isVisitDatePast) {
    patient.ops.status = "NOT_VISITED";
  } else {
    patient.ops.status = "NEW";
  }
});

patientSchema.index({ "personal.branch": 1, "ops.status": 1 });
// Owner Panel v2 Part 3: every one of the six Patients report pages filters
// branch + status and sorts/ranges on createdAt — the index above has no sort
// key, so it can't serve the sort without an in-memory step once the match set
// is more than a handful of rows.
patientSchema.index({ "personal.branch": 1, "ops.status": 1, createdAt: -1 });
patientSchema.index({ "personal.branch": 1, "personal.visitDate": -1 });
patientSchema.index({ "surgery.surgeryDate": -1 });
patientSchema.index({ "counselling.counsellor": 1 });
patientSchema.index({ "personal.reference": 1 });
patientSchema.index({ "personal.name": 1 });
patientSchema.index({ "incentives.employee": 1, "incentives.isCancelled": 1 });
patientSchema.index({
  "personal.name": "text",
  "personal.phone": "text",
  "personal.email": "text",
});

export default mongoose.models.Patient || mongoose.model("Patient", patientSchema);
