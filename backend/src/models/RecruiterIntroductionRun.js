const mongoose = require("mongoose");

// Follows AutoApplyRun's shape on purpose (same ready/candidatesEvaluated/skippedReasons/
// warnings/errors vocabulary) so the two audit trails read alike, but stays a separate
// collection: AutoApplyRun is already surfaced to seekers through GET /pro/auto-apply/runs and
// drives the Automations activity stream, and folding a second, org-triggered run type into it
// would change what that endpoint returns.
const recruiterIntroductionRunSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      index: true
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      index: true
    },
    hrMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrganizationMember",
      index: true
    },
    source: {
      type: String,
      enum: ["job_created", "job_published"],
      default: "job_created"
    },
    ranAt: { type: Date, default: Date.now },
    // False whenever the run bailed before evaluating anyone (job inactive, no posting member,
    // HR opted out, platform switch off) — the reason is always in skippedReasons.
    ready: { type: Boolean, default: false },
    candidatesEvaluated: { type: Number, default: 0 },
    introductionsCreated: { type: Number, default: 0 },
    introducedSeekerIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "JobSeeker" }],
      default: []
    },
    skippedReasons: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    warnings: { type: [String], default: [] },
    errors: { type: [String], default: [] }
  },
  { timestamps: true, suppressReservedKeysWarning: true }
);

recruiterIntroductionRunSchema.index({ jobId: 1, createdAt: -1 });
recruiterIntroductionRunSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.model("RecruiterIntroductionRun", recruiterIntroductionRunSchema);
