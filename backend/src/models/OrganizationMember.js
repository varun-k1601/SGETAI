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
    // Invite links are stateless JWTs, so nothing about a previously issued link is recorded
    // anywhere. Without this counter, re-inviting someone would silently revive EVERY link ever
    // sent to them — including one that leaked or was forwarded — because the token only asserts
    // a memberId and completeInvite only checks that the member is currently "Invited".
    // Bumped on every invite, re-invite and resend; the value is embedded in the token and must
    // match on redemption, so exactly one link is live at a time. Legacy tokens carry no version
    // and are compared against 0, which is what already-outstanding invites were issued under.
    inviteTokenVersion: { type: Number, default: 0 },
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
