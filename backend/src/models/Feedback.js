const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    userModel: { type: String, enum: ["JobSeeker", "Organization"], required: true },
    message: { type: String, required: true, trim: true },
    type: { type: String, trim: true, default: "user_feedback" },
    status: { type: String, enum: ["New", "Reviewed"], default: "New" }
  },
  { timestamps: true }
);

feedbackSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Feedback", feedbackSchema);
