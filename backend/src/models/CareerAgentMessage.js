const mongoose = require("mongoose");

const careerAgentMessageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobSeeker",
      required: true,
      index: true
    },
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 6000
    },
    intent: { type: String, trim: true },
    expiresAt: {
      type: Date,
      required: true
    }
  },
  { timestamps: true }
);

careerAgentMessageSchema.index({ userId: 1, createdAt: -1 });
careerAgentMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("CareerAgentMessage", careerAgentMessageSchema);
