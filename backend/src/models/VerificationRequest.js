const mongoose = require("mongoose");
const { createVerificationSchedule } = require("../utils/verificationSchedule");

const verificationRequestSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      required: true,
      index: true
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true
    },
    jobSeekerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobSeeker",
      required: true
    },
    experienceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    managerEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    status: {
      type: String,
      enum: ["Pending", "Submitted", "Expired"],
      default: "Pending"
    },
    requestedAt: {
      type: Date,
      default: Date.now
    },
    gracePeriodEndsAt: {
      type: Date,
      default() {
        return createVerificationSchedule(this.requestedAt || new Date()).gracePeriodEndsAt;
      }
    },
    nextReminderAt: {
      type: Date,
      default() {
        return createVerificationSchedule(this.requestedAt || new Date()).nextReminderAt;
      }
    },
    submittedAt: Date,
    lastReminderSentAt: Date,
    reminderCount: {
      type: Number,
      default: 0
    },
    managerRating: Number,
    managerFeedback: {
      type: String,
      trim: true
    }
  },
  { timestamps: true }
);

verificationRequestSchema.index(
  { applicationId: 1, experienceId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "Pending" } }
);

module.exports = mongoose.model("VerificationRequest", verificationRequestSchema);
