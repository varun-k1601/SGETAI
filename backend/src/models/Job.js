const mongoose = require("mongoose");

function hasValidEmbeddingLength(value) {
  return value === undefined || value === null || (Array.isArray(value) && value.length === 768);
}

const salarySchema = new mongoose.Schema(
  {
    min: Number,
    max: Number,
    currency: { type: String, trim: true }
  },
  { _id: false }
);

const jobSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true
    },
    location: { type: String, trim: true },
    industry: { type: String, trim: true },
    type: {
      type: String,
      enum: ["Full-time", "Part-time", "Contract", "Internship", "Remote"]
    },
    salary: salarySchema,
    requirements: { type: [String], default: [] },
    skills: { type: [String], default: [] },
    skillsRequired: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ["Draft", "Active", "Closed"],
      default: "Active"
    },
    embedding: {
      type: [Number],
      select: false,
      default: undefined,
      validate: {
        validator: hasValidEmbeddingLength,
        message: "embedding must contain exactly 768 dimensions."
      }
    },
    hiddenRoles: { type: [String], select: false, default: [] },
    autoApplyEnabled: { type: Boolean, default: true },
    autoApplyThreshold: {
      type: Number,
      min: 0,
      max: 100
    },
    autoApplyUseAIScoring: { type: Boolean, default: false },
    autoApplyDailyCap: {
      type: Number,
      min: 1,
      max: 1000,
      default: undefined
    }
  },
  { timestamps: true }
);

jobSchema.pre("validate", function validateAutoApplySettings(next) {
  if (this.autoApplyThreshold !== undefined && this.autoApplyThreshold !== null) {
    const threshold = Number(this.autoApplyThreshold);

    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
      this.invalidate(
        "autoApplyThreshold",
        "autoApplyThreshold must be between 0 and 100 when specified."
      );
    }
  }

  next();
});

jobSchema.index({ organizationId: 1, createdAt: -1 });
jobSchema.index({ title: "text", skillsRequired: "text", description: "text" }, {
  weights: { title: 5, skillsRequired: 3, description: 1 }
});
jobSchema.index({ status: 1, location: 1, industry: 1 });

module.exports = mongoose.model("Job", jobSchema);
