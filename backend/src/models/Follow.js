const mongoose = require("mongoose");

const followSchema = new mongoose.Schema(
  {
    jobSeekerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobSeeker",
      required: true
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true
    },
    notificationPreferences: {
      notifyJobs: { type: Boolean, default: false }
    }
  },
  { timestamps: true }
);

followSchema.index({ jobSeekerId: 1, organizationId: 1 }, { unique: true });

module.exports = mongoose.model("Follow", followSchema);
