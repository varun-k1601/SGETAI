const mongoose = require("mongoose");

function hasValidEmbeddingLength(value) {
  return value === undefined || value === null || (Array.isArray(value) && value.length === 768);
}

const resumeChunkSchema = new mongoose.Schema(
  {
    chunkId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true
    },
    resumeId: {
      type: String,
      required: true,
      index: true,
      trim: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobSeeker",
      required: true,
      index: true
    },
    sectionType: {
      type: String,
      enum: ["Experience", "Education", "Skills", "Projects", "Certifications", "Achievements", "Research", "Other"],
      required: true,
      index: true
    },
    text: {
      type: String,
      required: true
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
    chunkIndex: {
      type: Number,
      required: true,
      default: 0
    },
    confidence: {
      type: Number,
      min: 0,
      max: 100,
      default: 100
    },
    embeddingStatus: {
      type: String,
      enum: ["Pending", "Completed", "Failed"],
      default: "Pending"
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  { timestamps: false }
);

resumeChunkSchema.index({ resumeId: 1, chunkIndex: 1 });
resumeChunkSchema.index({ userId: 1, sectionType: 1 });

module.exports = mongoose.model("ResumeChunk", resumeChunkSchema);
