const mongoose = require("mongoose");

const mediaSchema = new mongoose.Schema(
  {
    url: { type: String, trim: true },
    filePath: { type: String, trim: true },
    fileType: {
      type: String,
      enum: ["image", "video", "document"]
    }
  },
  { _id: false }
);

const certificationSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, required: true },
    description: { type: String, trim: true },
    media: mediaSchema
  },
  { _id: true, timestamps: true }
);

const researchSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, required: true },
    paperType: {
      type: String,
      enum: ["Conference", "Journal", "Whitepaper", "Other"],
      default: "Other"
    },
    description: { type: String, trim: true },
    media: mediaSchema
  },
  { _id: true, timestamps: true }
);

const achievementSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, required: true },
    description: { type: String, trim: true },
    media: mediaSchema
  },
  { _id: true, timestamps: true }
);

const projectSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, required: true },
    description: { type: String, trim: true },
    startDate: Date,
    endDate: Date,
    projectUrl: { type: String, trim: true },
    repositoryUrl: { type: String, trim: true },
    mediaFiles: {
      type: [mediaSchema],
      default: [],
      validate: [(value) => value.length <= 5, "Projects allow up to 5 media files."]
    },
    documents: {
      type: [mediaSchema],
      default: [],
      validate: [(value) => value.length <= 3, "Projects allow up to 3 documents."]
    }
  },
  { _id: true, timestamps: true }
);

module.exports = {
  mediaSchema,
  certificationSchema,
  researchSchema,
  achievementSchema,
  projectSchema
};
