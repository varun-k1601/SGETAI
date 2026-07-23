const mongoose = require("mongoose");

const generatedArtifactSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobSeeker",
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: ["resume", "linkedin_post", "recruiter_dm", "job_matches"],
      required: true
    },
    title: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["Draft", "Ready"],
      default: "Ready"
    },
    textContent: { type: String, trim: true },
    fileUrl: { type: String, trim: true },
    filePath: { type: String, trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

generatedArtifactSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("GeneratedArtifact", generatedArtifactSchema);
