const mongoose = require("mongoose");

const proAutoApplyPolicySchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: true
    },
    matchThreshold: {
      type: Number,
      min: 56,
      max: 100,
      default: 70
    },
    maxDailyApplications: {
      type: Number,
      min: 1,
      max: 50,
      default: 10
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin"
    },
    updatedAt: Date
  },
  { _id: false }
);

// Caps for automatic candidate introductions to an individual HR member. Deliberately much
// tighter than the auto-apply policy above: an application lands in an ATS queue, an
// introduction lands in a named person's inbox, so the blast radius of a bad default is a real
// human being spammed. Every default here is chosen to be obviously-too-conservative rather than
// plausibly-too-loose — an admin raising them is a deliberate act.
const proRecruiterIntroPolicySchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: true
    },
    // Cap per (HR member, job) — how many candidates one posting can push at one recruiter.
    maxIntroductionsPerJobPerRecruiter: {
      type: Number,
      min: 1,
      max: 50,
      default: 3
    },
    // Cap per HR member per calendar day across every job they have posted, so a recruiter who
    // publishes six roles in one morning does not receive six times the per-job cap.
    maxIntroductionsPerRecruiterPerDay: {
      type: Number,
      min: 1,
      max: 100,
      default: 10
    },
    // Outbound cap per seeker per calendar day, reserved atomically the same way auto-apply
    // reserves its own slot.
    maxDailyIntroductionsPerSeeker: {
      type: Number,
      min: 1,
      max: 25,
      default: 3
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin"
    },
    updatedAt: Date
  },
  { _id: false }
);

const platformSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    proAutoApplyPolicy: {
      type: proAutoApplyPolicySchema,
      default: () => ({})
    },
    proRecruiterIntroPolicy: {
      type: proRecruiterIntroPolicySchema,
      default: () => ({})
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("PlatformSetting", platformSettingSchema);
