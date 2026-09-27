import mongoose from "mongoose";
import { ALL_BRANCHES, COLLAB_BRANCHES } from "@/lib/branches";
import { masterDataEnum } from "@/lib/masterData/validator";
import { NON_CASH_METHODS } from "@/constants/bankRouting";
import { fireSheetWebhook } from "@/lib/sheetsWebhook";
import "@/models/Patient";

const transactionSchema = new mongoose.Schema(
  {
    transactionCategory: {
      type: String,
      enum: ["TRANSPLANT", "SERVICE", "MEDICINE", "EXPENSE"],
    },

    batchId: {
      type: String,
      index: true,
    },

    patientName: {
      type: String,
    },
    patientPhone: {
      type: String,
    },

    quantity: {
      type: Number,
    },
    perSessionCost: {
      type: Number,
    },

    medicineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stock",
    },
    perUnitCost: {
      type: Number,
    },

    expenseGiver: {
      type: {
        type: String,
        enum: ["VENDOR", "EMPLOYEE", "PATIENT", "MANUAL"],
      },
      vendorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Vendor",
      },
      refId: {
        type: mongoose.Schema.Types.ObjectId,
      },
      name: String,
    },

    payableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payable",
      index: true,
      default: null,
    },

    receivableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Receivable",
      index: true,
      default: null,
    },

    isSettlement: { type: Boolean, default: false, index: true },

    
    
    
    advanceSettlementIds: [{ type: mongoose.Schema.Types.ObjectId }],

    reversalOf: { type: mongoose.Schema.Types.ObjectId, ref: "Transactions", default: null, index: true },
    isReversed: { type: Boolean, default: false },
    reversalReason: { type: String, default: "" },

    receivableAllocations: [
      {
        receivableId: { type: mongoose.Schema.Types.ObjectId, ref: "Receivable", required: true },
        amount: { type: Number, required: true, min: 0 },
      },
    ],

    receipts: [
      {
        url: String,
        publicId: String,
        fileName: String,
        fileType: { type: String, enum: ["image", "pdf"] },
        uploadedBy: { name: String, email: String },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    collabSplit: {
      ourShare: { type: Number, default: 0 },
      clinicShare: { type: Number, default: 0 },
      ourReceived: { type: Number, default: 0 },
      clinicReceived: { type: Number, default: 0 },
    },

    collabRef: {
      caseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CollabCase",
        index: true,
        default: null,
      },
      settlementId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CollabSettlement",
        index: true,
        default: null,
      },
      payableId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Payable",
        index: true,
        default: null,
      },
      receivableId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Receivable",
        index: true,
        default: null,
      },
      crystallisation: { type: Boolean, default: false },
    },

    externalParty: {
      direction: {
        type: String,
        enum: ["RECEIVED_BY", "PAID_BY"],
        default: null,
      },
      name: String,
      method: String,
      partyKind: {
        type: String,
        enum: ["VENDOR", "EMPLOYEE", "PATIENT", "MANUAL"],
        default: null,
      },
      partyRefId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
      linkedPayableId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Payable",
        default: null,
      },
      linkedReceivableId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Receivable",
        default: null,
      },
    },

    taxDetails: {
      baseAmount: Number,
      gstRate: Number,
      gstAmount: Number,
      invoiceTotal: Number,
      tdsApplied: { type: Boolean, default: false },
      tdsRate: Number,
      tdsAmount: Number,
      tdsCategory: String,
    },

    costType: {
      type: String,
      required: true,
      enum: ["Revenue", "Expenses"],
    },

    
    
    method: {
      type: String,
      ...masterDataEnum("PAYMENT_METHOD", "method"),
    },

    receiptMode: { type: String, default: "" },
    
    
    
    furtherMode: {
      type: String,
      default: "",
      required: [
        function () { return !NON_CASH_METHODS.includes(this.method); },
        "Account (furtherMode) is required",
      ],
    },

    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
    },

    procedure: {
      type: String,
      enum: [
        "Sapphire FUE",
        "DHI",
        "Turkish DHI",
        "Beard Transplant",
        "PRP",
        "Alopecia",
        "Headwash",
        "Canacot",
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
      required: true,
    },

    expense: String,
    expenseType: String,

    commissionReceiver: {
      type: {
        type: String,
        enum: ["Patient", "Employee", "MANUAL"],
      },
      refId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: "commissionReceiver.type",
      },
      name: { type: String, trim: true },
    },

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
      default: Date.now,
    },

    expenseGiverOld: String,

    remarks: String,

    approvalStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "APPROVED",
    },

    approvalActionBy: {
      name: String,
      phone: String,
      date: Date,
    },

    whatsappApprovalMessages: [
      {
        phone: String,
        messageId: String,
        sentAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    stock: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stock",
    },

    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
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
        updatedFields: [
          {
            name: String,
            previousValue: String,
            newValue: String,
          },
        ],
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
  { timestamps: true },
);

transactionSchema.pre("save", async function () {
  if (!this.transactionCategory) {
    if (this.costType === "Revenue") {
      if (
        ["Sapphire FUE", "DHI", "Turkish DHI", "Beard Transplant"].includes(
          this.procedure,
        )
      ) {
        this.transactionCategory = "TRANSPLANT";
      } else if (["PRP", "GFC" , "Alopecia", "Headwash", "Canacot",].includes(this.procedure)) {
        this.transactionCategory = "SERVICE";
      } else if (this.procedure === "Medicine") {
        this.transactionCategory = "MEDICINE";
      }
    } else if (this.costType === "Expenses") {
      this.transactionCategory = "EXPENSE";
    }
  }

  if (this.transactionCategory === "EXPENSE" && this.expenseGiver) {
    this.costType = "Expenses";
    const giverType = this.expenseGiver.type;
    this.expenseGiverOld =
      giverType === "VENDOR"
        ? `Vendor: ${this.expenseGiver.name}`
        : giverType === "EMPLOYEE"
          ? `Employee: ${this.expenseGiver.name}`
          : giverType === "PATIENT"
            ? `Patient: ${this.expenseGiver.name}`
            : this.expenseGiver.name;
  } else if (this.transactionCategory !== "EXPENSE") {
    this.costType = "Revenue";
  }
});

transactionSchema.pre("save", async function () {
  const split = this.collabSplit;
  if (!split) return;

  const ourShare = split.ourShare || 0;
  const clinicShare = split.clinicShare || 0;
  const ourReceived = split.ourReceived || 0;
  const clinicReceived = split.clinicReceived || 0;

  if (!ourShare && !clinicShare && !ourReceived && !clinicReceived) return;

  if (!COLLAB_BRANCHES.includes(this.branch)) {
    throw new Error(
      `collabSplit is only valid on collab clinic branches — "${this.branch}" is not one of: ${COLLAB_BRANCHES.join(", ")}`,
    );
  }

  const negatives = Object.entries({ ourShare, clinicShare, ourReceived, clinicReceived })
    .filter(([, v]) => v < 0)
    .map(([k]) => k);
  if (negatives.length > 0) {
    throw new Error(`collabSplit amounts cannot be negative: ${negatives.join(", ")}`);
  }

  if (!this.patient) {
    throw new Error("collabSplit requires a linked patient to validate against the package total");
  }

  const patient = await mongoose
    .model("Patient")
    .findById(this.patient)
    .select("payments.totalAmount")
    .lean();
  if (!patient) {
    throw new Error("collabSplit validation failed — linked patient not found");
  }

  const totalPackage = patient.payments?.totalAmount || 0;
  if (totalPackage <= 0) {
    throw new Error(
      "This patient has no final package set. Set the patient's package (counselling → final package) before creating a collab case.",
    );
  }

  const discount = this.discount || 0;
  const netPackage = Math.round((totalPackage - discount) * 100) / 100;

  const EPSILON = 0.01;
  if (Math.abs(ourShare + clinicShare - netPackage) > EPSILON) {
    throw new Error(
      `Collab split must equal the package total: ourShare (${ourShare}) + clinicShare (${clinicShare}) = ${ourShare + clinicShare}, but the package is ${totalPackage}${discount ? ` minus a discount of ${discount} = ${netPackage}` : ""}`,
    );
  }

  if (ourReceived + clinicReceived - netPackage > EPSILON) {
    throw new Error(
      `Collected amount exceeds the package: ourReceived (${ourReceived}) + clinicReceived (${clinicReceived}) = ${ourReceived + clinicReceived}, but the package is only ${netPackage}`,
    );
  }
});

transactionSchema.virtual("medicineDetails", {
  ref: "Stock",
  localField: "medicineId",
  foreignField: "_id",
  justOne: true,
});

transactionSchema.virtual("patientDetails", {
  ref: "Patient",
  localField: "patient",
  foreignField: "_id",
  justOne: true,
});

transactionSchema.virtual("vendorDetails", {
  ref: "Vendor",
  localField: "expenseGiver.vendorId",
  foreignField: "_id",
  justOne: true,
});

transactionSchema.set("toJSON", { virtuals: true });
transactionSchema.set("toObject", { virtuals: true });

transactionSchema.index({ date: -1 });
transactionSchema.index({ costType: 1, date: -1 });
transactionSchema.index({ branch: 1, date: -1 });
transactionSchema.index({ branch: 1, costType: 1, date: -1 });
transactionSchema.index({ patient: 1 });
transactionSchema.index({ approvalStatus: 1, date: -1 });

transactionSchema.index({ furtherMode: 1, date: 1 });
transactionSchema.index({ approvalStatus: 1, date: 1 });
transactionSchema.index({ approvalStatus: 1, costType: 1, date: 1 });
transactionSchema.index({ date: -1, method: 1 });
transactionSchema.index({ branch: 1, transactionCategory: 1, date: -1 });


transactionSchema.index(
  { payableId: 1, approvalStatus: 1, method: 1, date: 1 },
  { partialFilterExpression: { payableId: { $type: "objectId" } } },
);
transactionSchema.index(
  { receivableId: 1, approvalStatus: 1, method: 1, date: 1 },
  { partialFilterExpression: { receivableId: { $type: "objectId" } } },
);




transactionSchema.pre("save", function () {
  this.$locals.wasNew = this.isNew;
});
transactionSchema.post("save", function (doc) {
  if (doc.$locals.wasNew) fireSheetWebhook("Transactions", doc);
});

export default mongoose.models.Transactions ||
  mongoose.model("Transactions", transactionSchema);
