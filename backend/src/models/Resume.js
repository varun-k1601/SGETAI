const mongoose = require("mongoose");

const textQualitySchema = new mongoose.Schema(
  {
    wordCount: { type: Number, default: 0 },
    signalCount: { type: Number, default: 0 },
    pdfJunkCount: { type: Number, default: 0 },
    isReadable: { type: Boolean, default: false }
  },
  { _id: false }
);

const resumeSchema = new mongoose.Schema(
  {
    resumeId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobSeeker",
      required: true,
      index: true
    },
    filename: {
      type: String,
      required: true,
      trim: true
    },
    fileType: {
      type: String,
      enum: ["pdf", "docx", "doc", "txt", "pptx"],
      required: true
    },
    originalText: {
      type: String,
      select: false
    },
    textQuality: textQualitySchema,
    totalChunks: {
      type: Number,
      default: 0
    },
    isDraft: {
      type: Boolean,
      default: false,
      index: true
    },
    status: {
      type: String,
      enum: ["Processing", "Ready", "Failed"],
      default: "Processing"
    },
    errorMessage: {
      type: String,
      trim: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

resumeSchema.index({ userId: 1, uploadedAt: -1 });
resumeSchema.index({ userId: 1, isDraft: 1 });

module.exports = mongoose.model("Resume", resumeSchema);
