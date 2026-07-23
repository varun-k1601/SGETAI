const mongoose = require("mongoose");

const connectionSchema = new mongoose.Schema(
  {
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobSeeker",
      required: true
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobSeeker",
      required: true
    },
    status: {
      type: String,
      enum: ["Pending", "Accepted", "Rejected", "Ignored"],
      default: "Pending"
    },
    respondedAt: Date
  },
  { timestamps: true }
);

connectionSchema.index({ requester: 1, recipient: 1 }, { unique: true });

module.exports = mongoose.model("Connection", connectionSchema);
