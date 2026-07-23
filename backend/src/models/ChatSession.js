const mongoose = require("mongoose");

const participantSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    role: {
      type: String,
      enum: ["seeker", "organization"],
      required: true
    }
  },
  { _id: false }
);

const chatSessionSchema = new mongoose.Schema(
  {
    participants: {
      type: [participantSchema],
      validate: [(value) => value.length === 2, "Chat sessions require exactly two participants."]
    },
    participantKey: {
      type: String,
      required: true,
      unique: true
    },
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    lastMessage: { type: String, trim: true },
    lastMessageAt: Date
  },
  { timestamps: true }
);

chatSessionSchema.index({ "participants.userId": 1, "participants.role": 1, lastMessageAt: -1 });

module.exports = mongoose.model("ChatSession", chatSessionSchema);
