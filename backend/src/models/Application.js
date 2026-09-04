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
    /* THE SEEKER-PROFILE-VS-JOB SCORE, AND ONLY THAT — computeCandidateMatch(seeker, job),
       captured at apply time.

       This is the same formula recommendationController.js uses for the "match %" on /jobs, which
       is the point: the two pages now agree by construction rather than by coincidence. It used to
       hold whichever of four unrelated scorers ran last (scoreResumeAgainstJob on the manual path,
       computeAutoApplyCompositeMatch or computeFinalAutoApplyScore on the auto path, and the
       Gemini borderline score on top of those), so /jobs and /applied disagreed on every row, in
       both directions — the signature of two formulas, not one formula at two times.

       Snapshot, not live: this is the score as it stood WHEN THE SEEKER APPLIED, so it stays
       honest about the decision that was actually made. The UI labels it "Match when applied" for
       that reason. */
    atsScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    atsTag: { type: String, trim: true },
    // The tailored resume's own score against the job description (scoreResumeAgainstJob on the
    // manual path, computeResumeJobMatch's resumeKeywordScore on the auto path) — a different
    // formula from atsScore above. Kept separate so atsScore is never overwritten by an unrelated
    // scorer after the threshold check has already passed. Both write sites now honour that.
    resumeMatchScore: {
      type: Number,
      min: 0,
      max: 100
    },
    resumeMatchTag: { type: String, trim: true },
    /* THE AUTO-APPLY AUDIT TRAIL. The number that actually cleared the threshold used to be
       persisted nowhere: the pre-filter composite was overwritten by the post-resume blend, the
       vector term was discarded, and the threshold itself was never recorded — so an auto-apply
       decision could not be checked after the fact. A seeker could see "55% match · Auto-applied"
       against a 70 threshold and reasonably conclude the gate was broken, when in truth neither
       displayed number was the one the gate ever saw.

       gateScore is the value compared against `threshold`, so gateScore >= threshold holds for
       every auto-applied row by construction. Auto-apply only; absent on manual applications. */
    autoApplyDecision: {
      gateScore: { type: Number, min: 0, max: 100 },
      gateTag: { type: String, trim: true },
      threshold: { type: Number, min: 0, max: 100 },
      // computeAutoApplyCompositeMatch (plus the Gemini borderline override when it ran) — the
      // cheap pre-filter that only decided whether generating a resume was worth the call.
      prefilterScore: { type: Number, min: 0, max: 100 },
      // Normalised cosine similarity for this seeker+job pair, or null when either side had no
      // usable embedding. Null means "no signal", never "similarity of zero".
      vectorScore: { type: Number, min: 0, max: 100, default: null },
      // "final_resume_blend" (the post-resume gate ran) | "prefilter_composite" (default-resume
      // fallback, so the pre-filter was the last gate) | "gemini_borderline".
      gateSource: { type: String, trim: true },
      decidedAt: Date
    },
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
