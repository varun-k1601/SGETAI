const mongoose = require("mongoose");

/* A GOOGLE CALENDAR CONNECTION BELONGS TO A PERSON, NOT A COMPANY.
   ------------------------------------------------------------------------------------------------
   This is the one place in the schema where that distinction is load-bearing. Everywhere else the
   organization side of this app treats req.user.id (the Organization's _id) as the actor; a
   calendar token cannot work that way. Two recruiters at the same company have two different
   Google accounts, and storing one token on Organization would mean recruiter B's interview lands
   on recruiter A's personal calendar, is sent from A's address, and cannot be revoked by A without
   breaking B. So it lives here, on the member who granted it, and every read is keyed to the
   acting req.user.memberId.

   Both tokens are select:false: they are never part of a normal member read, never serialised into
   an API response, and the only code that asks for them is googleCalendarService, explicitly.

   `scopes` records what Google ACTUALLY granted (from the token response's own `scope` field), not
   what we asked for — a member can approve sign-in and decline calendar access, and a connection
   that cannot write events must not claim it can. */
const googleCalendarConnectionSchema = new mongoose.Schema(
  {
    // The Google account the events will be created on, shown on the card so a recruiter can see
    // WHICH of their accounts is bound before they schedule anything against it.
    googleEmail: { type: String, trim: true, lowercase: true },
    googleUserId: { type: String, trim: true },
    accessToken: { type: String, select: false },
    // Without this the connection dies silently an hour after consent. Google only issues one on
    // the first consent unless access_type=offline AND prompt=consent are both sent, so the
    // connect flow refuses to store a connection that arrives without it.
    refreshToken: { type: String, select: false },
    scopes: { type: [String], default: [] },
    expiresAt: Date,
    connectedAt: Date,
    // Set when Google rejects the refresh token (invalid_grant — the member revoked access from
    // their Google security page, or the grant expired). The card reads this and stops claiming
    // Connected: a badge is a claim about system state, and this is the state changing under us
    // without a request ever reaching this app.
    revokedAt: Date
  },
  { _id: false }
);

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
    recruiterIntroOptOut: { type: Boolean, default: false },
    // Per-member Google Calendar connection — see the schema comment at the top of this file for
    // why it is here and not on Organization.
    googleCalendarConnection: { type: googleCalendarConnectionSchema, default: undefined }
  },
  { timestamps: true }
);

organizationMemberSchema.index({ organizationId: 1, status: 1 });

module.exports = mongoose.model("OrganizationMember", organizationMemberSchema);
