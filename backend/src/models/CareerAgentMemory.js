const mongoose = require("mongoose");

const careerAgentMemorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobSeeker",
      required: true,
      unique: true,
      index: true
    },
    targetRoles: { type: [String], default: [] },
    preferredLocations: { type: [String], default: [] },
    skillGoals: { type: [String], default: [] },
    resumeIssues: { type: [String], default: [] },
    careerGoal: { type: String, trim: true },
    lastConcern: { type: String, trim: true },
    lastIntent: { type: String, trim: true },
    // Most recently uploaded document (e.g. a resume) so follow-up questions in the same
    // conversation can be answered even when the user does not re-attach the file.
    lastDocumentText: { type: String, trim: true },
    lastDocumentName: { type: String, trim: true },
    lastDocumentAt: { type: Date },
    facts: {
      type: [String],
      default: [],
      validate: [(value) => value.length <= 30, "Career agent memory stores up to 30 facts."]
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("CareerAgentMemory", careerAgentMemorySchema);
