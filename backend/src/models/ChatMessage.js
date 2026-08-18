const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatSession",
      required: true,
      index: true
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    senderRole: {
      type: String,
      enum: ["seeker", "organization"],
      required: true
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000
    },
    readBy: {
      type: [mongoose.Schema.Types.ObjectId],
      default: []
    },
    // Additive and empty for every message the existing composer sends. Currently only set by the
    // recruiter-introduction worker, which stamps { aiAssisted, autoSent, source, ... } so both
    // chat UIs can label a message the seeker did not personally type — never send something on a
    // user's behalf that they cannot see and identify as automated.
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

chatMessageSchema.index({ sessionId: 1, createdAt: 1 });

module.exports = mongoose.model("ChatMessage", chatMessageSchema);
