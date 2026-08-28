const mongoose = require("mongoose");
const { mediaSchema } = require("./subschemas");

const tailoredResumeSchema = new mongoose.Schema(
  {
    latex: { type: String },
    fileName: { type: String, trim: true },
    generatedAt: Date,
    source: {
      type: String,
      enum: ["ManualApply", "AutoApply", "ProTools"],
      default: "ManualApply"
    },
    // Which of the six layouts this document was built with. Recorded so a resume that renders
    // wrong can be reproduced from the stored application alone; without it the only way back is
    // to re-derive the hash of a candidate id that may since have been overridden.
    templateVariant: {
      type: String,
      enum: ["a", "b", "c", "d", "e", "f"]
    },
    profileSectionsUsed: {
      objective: { type: Boolean, default: false },
      educationCount: { type: Number, default: 0 },
      experienceCount: { type: Number, default: 0 },
      projectCount: { type: Number, default: 0 },
      skillCount: { type: Number, default: 0 },
      certificationCount: { type: Number, default: 0 },
      achievementCount: { type: Number, default: 0 }
    }
  },
  { _id: false }
);

const applicationSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true
    },
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
    status: {
      type: String,
      enum: ["Pending", "UnderReview", "Interview", "Accepted", "Rejected", "Withdrawn"],
      default: "Pending"
    },
    atsScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    atsTag: { type: String, trim: true },
    // The tailored resume's own score against the job description (scoreResumeAgainstJob) — a
    // different formula from atsScore (the seeker-profile-vs-job composite that actually gated
    // an auto-apply decision against the threshold). Kept separate so atsScore is never
    // overwritten by an unrelated scorer after the threshold check has already passed.
    resumeMatchScore: {
      type: Number,
      min: 0,
      max: 100
    },
    resumeMatchTag: { type: String, trim: true },
    trustScore: { type: Number, default: 0 },
    trustScoreTag: { type: String, trim: true },
    verificationStatus: {
      type: String,
      enum: ["Pending", "InProgress", "Verified"],
      default: "Pending"
    },
    source: {
      type: String,
      enum: ["Manual", "AutoApply", "auto"],
      default: "Manual"
    },
    tailoredResume: tailoredResumeSchema,
    attachedResume: {
      media: mediaSchema,
      originalName: { type: String, trim: true },
      uploadedAt: Date,
      source: {
        type: String,
        enum: ["ManualUpload"],
        default: "ManualUpload"
      }
    },
    withdrawnAt: Date,
    reappliedAt: Date,
    acceptedAt: Date,
    ragAnalysis: {
      resumeId: { type: String, trim: true },
      matchScore: { type: Number, min: 0, max: 100 },
      matchTag: { type: String, trim: true },
      skillsMatch: {
        required: { type: [String], default: [] },
        found: { type: [String], default: [] },
        missing: { type: [String], default: [] },
        matchPercentage: { type: Number, min: 0, max: 100 }
      },
      strengths: { type: [String], default: [] },
      weaknesses: { type: [String], default: [] },
      recruiterSummary: { type: String, trim: true },
      retrievedChunks: [
        {
          chunkId: { type: String, trim: true },
          sectionType: { type: String, trim: true },
          relevanceScore: { type: Number, min: 0, max: 1 },
          text: { type: String }
        }
      ],
      analysisSource: { type: String, enum: ["rag", "legacy-ats", "none"], default: "none" },
      analysisTimestamp: Date
    }
  },
  { timestamps: true }
);

applicationSchema.index({ jobId: 1, jobSeekerId: 1 }, { unique: true });

module.exports = mongoose.model("Application", applicationSchema);
