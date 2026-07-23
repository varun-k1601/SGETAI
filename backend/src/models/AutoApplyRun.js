const mongoose = require("mongoose");

const autoApplyRunResultSchema = new mongoose.Schema(
  {
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job" },
    title: { type: String, trim: true },
    companyName: { type: String, trim: true },
    status: {
      type: String,
      enum: ["applied", "skipped"],
      required: true
    },
    reason: { type: String, trim: true },
    score: Number,
    tag: { type: String, trim: true },
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: "Application" },
    matchedHiddenRoles: { type: [String], default: [] }
  },
  { _id: false }
);

const autoApplyRunSchema = new mongoose.Schema(
  {
    seekerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobSeeker",
      index: true
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      index: true
    },
    source: {
      type: String,
      enum: ["manual_test", "preference_enabled", "job_created", "job_auto_apply_enabled"],
      default: "manual_test"
    },
    ranAt: { type: Date, default: Date.now },
    ready: { type: Boolean, default: false },
    readiness: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    reason: { type: String, trim: true },
    jobsChecked: { type: Number, default: 0 },
    matchingJobs: { type: Number, default: 0 },
    applicationsCreated: { type: Number, default: 0 },
    candidatesEvaluated: { type: Number, default: 0 },
    appliedSeekerIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "JobSeeker" }],
      default: []
    },
    skippedReasons: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    warnings: { type: [String], default: [] },
    errors: { type: [String], default: [] },
    results: { type: [autoApplyRunResultSchema], default: [] }
  },
  { timestamps: true, suppressReservedKeysWarning: true }
);

autoApplyRunSchema.index({ seekerId: 1, createdAt: -1 });
autoApplyRunSchema.index({ jobId: 1, createdAt: -1 });

module.exports = mongoose.model("AutoApplyRun", autoApplyRunSchema);
