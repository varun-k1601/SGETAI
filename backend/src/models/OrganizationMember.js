const mongoose = require("mongoose");

// The real login identity for the organization side of the app — Organization itself remains the
// company profile (name/industry/logo/verification/billing), but individual HR/recruiter people
// each get their own OrganizationMember record so they can log in separately, be individually
// revoked, and have their own posted jobs traceable back to them (see Job.postedByMemberId).
//
// Deliberately NOT wired into req.user.id (which stays the Organization's own _id everywhere,
// unchanged, for backward compatibility with the ~45 existing call sites across the backend that
// already assume req.user.id === Organization._id). The acting member is instead carried
// separately as req.user.memberId, used only by team-management endpoints and job attribution.
const organizationMemberSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true
    },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    passwordHash: {
      type: String,
      select: false
    },
    role: {
      type: String,
      enum: ["Owner", "Admin", "Recruiter"],
      default: "Recruiter"
    },
    status: {
      type: String,
      enum: ["Active", "Invited", "Disabled"],
      default: "Active"
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrganizationMember"
    },
    // Per-person kill switch for automatic candidate introductions on jobs this member posts (see
    // recruiterIntroductionWorker.js). Opt-OUT rather than opt-in because the receiving side is
    // identified individually and can always stop it; the sending side is opt-in
    // (autoApplyPreferences.autoIntroduceToRecruiters) because it acts on someone's behalf.
    recruiterIntroOptOut: { type: Boolean, default: false }
  },
  { timestamps: true }
);

organizationMemberSchema.index({ organizationId: 1, status: 1 });

module.exports = mongoose.model("OrganizationMember", organizationMemberSchema);
