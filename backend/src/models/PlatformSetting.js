const mongoose = require("mongoose");

const proAutoApplyPolicySchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: true
    },
    matchThreshold: {
      type: Number,
      min: 56,
      max: 100,
      default: 70
    },
    maxDailyApplications: {
      type: Number,
      min: 1,
      max: 50,
      default: 10
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin"
    },
    updatedAt: Date
  },
  { _id: false }
);

const platformSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    proAutoApplyPolicy: {
      type: proAutoApplyPolicySchema,
      default: () => ({})
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("PlatformSetting", platformSettingSchema);
