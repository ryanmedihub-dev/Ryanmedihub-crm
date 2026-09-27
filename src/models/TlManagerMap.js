import mongoose from "mongoose";

const tlManagerMapSchema = new mongoose.Schema(
  {
    
    
    
    
    tlNameKey: { type: String, required: true, unique: true, trim: true, lowercase: true },

    
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
