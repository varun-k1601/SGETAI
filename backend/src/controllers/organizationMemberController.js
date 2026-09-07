const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const ApiError = require("../utils/ApiError");
const googleCalendar = require("../services/googleCalendarService");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const { sendEmail } = require("../utils/email");
const { requireNonEmptyString, optionalString } = require("../utils/validation");
const { createAccessToken, createRefreshToken } = require("../utils/jwt");

const Organization = require("../models/Organization");
const OrganizationMember = require("../models/OrganizationMember");

const MANAGER_ROLES = ["Owner", "Admin"];
const MEMBER_ROLES = ["Owner", "Admin", "Recruiter"];
const INVITABLE_ROLES = ["Admin", "Recruiter"];
const INVITE_TOKEN_TYPE = "org-member-invite";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

/* Cuts a member's Google Calendar connection: asks Google to drop the grant, then clears the
   stored tokens. Loaded with select:false fields explicitly, because that is the only way to read
   a refresh token, and the only reason to read one here is to revoke it. */
async function revokeMemberCalendarGrant(memberId) {
  const withTokens = await googleCalendar.loadConnection(memberId);

  if (!withTokens?.googleCalendarConnection) {
    return;
  }

  await googleCalendar.revokeToken(withTokens.googleCalendarConnection.refreshToken);
  withTokens.googleCalendarConnection = undefined;
  await withTokens.save();
}

function getFrontendUrl() {
  return (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
}

function signInviteToken(memberId, tokenVersion = 0) {
  return jwt.sign(
    { type: INVITE_TOKEN_TYPE, memberId, v: tokenVersion },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// "Owner" is deliberately not invitable. Ownership is transferred through
// PUT /organization/members/:id/role, which carries the last-Owner guard; granting it through an
// emailed link would let an Admin mint a second Owner without that check ever running.
// Enforced here rather than only in the UI dropdown, which is cosmetic.
function resolveInvitableRole(requestedRole) {
  if (requestedRole === "Owner") {
    throw new ApiError(400, "Owner cannot be assigned through an invite. Invite them, then change their role.");
  }

  return INVITABLE_ROLES.includes(requestedRole) ? requestedRole : "Recruiter";
}

// One place that builds the link and sends it, so invite / re-invite / resend cannot drift apart.
// Fire-and-forget by design: the member record is already persisted, and a mail failure must not
// roll back the invite or fail the response.
function sendInviteEmail({ organization, member, role, invitedByName, setupLink, intro }) {
  return sendEmail(
    member.email,
    `You've been invited to join ${organization.companyName} on sgetai`,
    `
      <p>${invitedByName || "A teammate"} ${intro} <strong>${organization.companyName}</strong>'s hiring team as ${role}.</p>
      <p>Set up your password to get started:</p>
      <p><a href="${setupLink}">${setupLink}</a></p>
      <p>This link is valid for 7 days, and replaces any earlier invite link you were sent.</p>
    `
  ).catch((error) => {
    // Invite is already persisted — a delivery failure shouldn't roll it back, but is worth
    // knowing about server-side (mirrors the fire-and-forget email pattern used elsewhere).
    console.error(`Failed to send team invite email to ${member.email}:`, error.message);
  });
}

function buildAuthResponseForMember(organization, member) {
  const payload = {
    id: organization._id.toString(),
    role: "organization",
    email: member.email,
    username: organization.username,
    memberId: member._id.toString(),
    memberRole: member.role
  };

  return {
    accessToken: createAccessToken(payload),
    refreshToken: createRefreshToken(payload),
    role: "organization",
    userId: organization._id,
    email: member.email,
    username: organization.username,
    memberId: member._id,
    memberRole: member.role
  };
}

function toMemberResponse(member) {
  return {
    _id: member._id,
    firstName: member.firstName,
    lastName: member.lastName,
    email: member.email,
    role: member.role,
    status: member.status,
    recruiterIntroOptOut: Boolean(member.recruiterIntroOptOut),
    createdAt: member.createdAt
  };
}

// The acting member's own settings — deliberately not routed through requireOrgMemberRole, since
// every Active member (Recruiter included) must be able to stop automatic candidate
// introductions to themselves without needing Owner/Admin rights. Resolved from req.user.memberId
// only: no member id is accepted from the body or params, so this can never toggle someone else.
async function loadActingMember(req) {
  if (!req.user.memberId) {
    throw new ApiError(401, "Please sign in again to refresh your account permissions.");
  }

  const member = await OrganizationMember.findOne({
    _id: req.user.memberId,
    organizationId: req.user.id
  });

  if (!member || member.status !== "Active") {
    throw new ApiError(403, "You do not have permission to access this resource.");
  }

  return member;
}

const getMyMemberSettings = asyncHandler(async (req, res) => {
  const member = await loadActingMember(req);

  return sendSuccess(res, {
    message: "Member settings fetched successfully.",
    member: toMemberResponse(member)
  });
});

const updateMyMemberSettings = asyncHandler(async (req, res) => {
  const member = await loadActingMember(req);

  if (req.body.recruiterIntroOptOut !== undefined) {
    member.recruiterIntroOptOut = Boolean(req.body.recruiterIntroOptOut);
  }

  await member.save();

  return sendSuccess(res, {
    message: "Member settings updated.",
    member: toMemberResponse(member)
  });
});

// Handles all three entry states for an email address:
//   no member        -> create a fresh "Invited" record
//   "Disabled"       -> RE-INVITE: revive the SAME document (see below), applying the new role
//   "Invited"        -> RESEND: fresh link, no state change beyond invitedBy/role
//   "Active"         -> 409; they are already on the team, and role changes belong to PUT /:id/role
//
// Re-invite mutates the existing document rather than creating another one. Job.postedByMemberId
// points at that _id and jobController resolves "Posted by {name}" through it, so a second record
// would orphan the person's entire posting history — and OrganizationMember.email is unique, so
// the insert would fail regardless.
const inviteMember = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const requestedRole = req.body.role;

  if (!email) {
    throw new ApiError(400, "email is required.");
  }

  // passwordHash is select:false; it is loaded explicitly because re-invite must be able to
  // clear it, and an unselected path cannot be reliably unset on save.
  const [existingMember, organization] = await Promise.all([
    OrganizationMember.findOne({ email }).select("+passwordHash"),
    Organization.findById(req.user.id)
  ]);

  if (!organization) {
    throw new ApiError(404, "Organization not found.");
  }

  if (existingMember) {
    // OrganizationMember.email is globally unique with no organization scope, so this lookup can
    // return another company's member. Re-invite MUTATES the document it finds, so without this
    // check one workspace could clear another workspace's member password and mail itself a link
    // into their team. The generic message is deliberate: it does not disclose that the address
    // belongs to a different organization.
    if (String(existingMember.organizationId) !== String(organization._id)) {
      throw new ApiError(409, "A team member with this email already exists.");
    }

    if (existingMember.status === "Active") {
      throw new ApiError(409, "A team member with this email already exists.");
    }

    const wasDisabled = existingMember.status === "Disabled";
    // A removed Owner is a real case (a founder leaves and comes back). Their stored role cannot
    // be carried through an invite, so when no role is supplied it steps down to Admin rather
    // than failing the re-invite outright — an Owner can promote them again afterwards. An
    // EXPLICIT "Owner" in the request is still rejected by resolveInvitableRole.
    const role =
      requestedRole === undefined || requestedRole === null || requestedRole === ""
        ? (INVITABLE_ROLES.includes(existingMember.role) ? existingMember.role : "Admin")
        : resolveInvitableRole(requestedRole);

    existingMember.role = role;
    existingMember.status = "Invited";
    existingMember.invitedBy = req.orgMember._id;
    // Invalidates every previously issued link for this person, including the one that is being
    // replaced right now.
    existingMember.inviteTokenVersion = (existingMember.inviteTokenVersion || 0) + 1;

    if (wasDisabled) {
      // SECURITY: resolveOrganizationLoginByEmail only excludes "Disabled", so an "Invited"
      // member with a surviving passwordHash can log in immediately. Flipping a removed person
      // back to "Invited" without clearing it would hand them their old access back without them
      // ever opening the new link. They must set a new password through completeInvite.
      existingMember.passwordHash = undefined;
      // Same reasoning as removeMember: the calendar grant was cut when they were removed, and a
      // returning teammate re-consents rather than inheriting a stale one.
      await revokeMemberCalendarGrant(existingMember._id);
      existingMember.googleCalendarConnection = undefined;
    }

    await existingMember.save();

    const token = signInviteToken(existingMember._id.toString(), existingMember.inviteTokenVersion);
    sendInviteEmail({
      organization,
      member: existingMember,
      role,
      invitedByName: req.orgMember.firstName,
      setupLink: `${getFrontendUrl()}/team/accept-invite?token=${encodeURIComponent(token)}`,
      intro: wasDisabled ? "has invited you back to" : "invited you to join"
    });

    return sendSuccess(res, {
      message: wasDisabled
        ? "Invite sent again to a previously removed teammate."
        : "Invite resent.",
      member: toMemberResponse(existingMember)
    });
  }

  const role = resolveInvitableRole(requestedRole);
  const member = await OrganizationMember.create({
    organizationId: organization._id,
    email,
    firstName: req.body.firstName || "",
    lastName: req.body.lastName || "",
    role,
    status: "Invited",
    invitedBy: req.orgMember._id,
    inviteTokenVersion: 1
  });

  const token = signInviteToken(member._id.toString(), member.inviteTokenVersion);
  sendInviteEmail({
    organization,
    member,
    role,
    invitedByName: req.orgMember.firstName,
    setupLink: `${getFrontendUrl()}/team/accept-invite?token=${encodeURIComponent(token)}`,
    intro: "invited you to join"
  });

  return sendSuccess(
    res,
    {
      message: "Invite sent.",
      member: toMemberResponse(member)
    },
    201
  );
});

const completeInvite = asyncHandler(async (req, res) => {
  const token = String(req.body.token || "");
  const password = String(req.body.password || "");
  const firstName = requireNonEmptyString(req.body.firstName, "firstName");
  // Optional: plenty of people have a single legal name, and requiring a surname locked them out
  // of accepting an invite entirely. Everything downstream already copes — memberDisplayName
  // falls back to firstName then email, and the avatar initial does the same.
  const lastName = optionalString(req.body.lastName) || "";

  if (!token) {
    throw new ApiError(400, "Invite token is required.");
  }

  if (password.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters.");
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new ApiError(401, "Invite link is invalid or expired.");
  }

  if (decoded.type !== INVITE_TOKEN_TYPE || !decoded.memberId) {
    throw new ApiError(400, "Invite link is not valid.");
  }

  const member = await OrganizationMember.findById(decoded.memberId);

  if (!member || member.status !== "Invited") {
    throw new ApiError(410, "This invite has already been used or is no longer valid.");
  }

  // Exactly one link is live per member. A token issued before the latest invite — an earlier
  // link that was forwarded, leaked, or simply superseded by a resend — is refused even though
  // it is still correctly signed and unexpired. Tokens minted before versioning existed carry no
  // `v` and are compared against 0, which is the value those members still hold.
  if ((decoded.v || 0) !== (member.inviteTokenVersion || 0)) {
    throw new ApiError(410, "This invite link has been replaced by a newer one. Please use the most recent invite email.");
  }

  const organization = await Organization.findById(member.organizationId);

  if (!organization) {
    throw new ApiError(404, "Organization not found.");
  }

  member.passwordHash = await bcrypt.hash(password, 10);
  member.firstName = firstName;
  member.lastName = lastName;
  member.status = "Active";
  await member.save();

  return sendSuccess(res, {
    message: "Account set up successfully.",
    ...buildAuthResponseForMember(organization, member)
  });
});

const listMembers = asyncHandler(async (req, res) => {
  const members = await OrganizationMember.find({ organizationId: req.user.id }).sort({ createdAt: 1 });

  return sendSuccess(res, {
    message: "Team members fetched successfully.",
    members: members.map(toMemberResponse)
  });
});

const updateMemberRole = asyncHandler(async (req, res) => {
  const nextRole = req.body.role;

  if (!MEMBER_ROLES.includes(nextRole)) {
    throw new ApiError(400, `role must be one of: ${MEMBER_ROLES.join(", ")}.`);
  }

  const member = await OrganizationMember.findOne({
    _id: req.params.id,
    organizationId: req.user.id
  });

  if (!member) {
    throw new ApiError(404, "Team member not found.");
  }

  if (member.role === "Owner" && nextRole !== "Owner") {
    const otherOwners = await OrganizationMember.countDocuments({
      organizationId: req.user.id,
      role: "Owner",
      status: "Active",
      _id: { $ne: member._id }
    });

    if (!otherOwners) {
      throw new ApiError(400, "Cannot change role: this is the last remaining Owner.");
    }
  }

  member.role = nextRole;
  await member.save();

  return sendSuccess(res, {
    message: "Member role updated.",
    member: toMemberResponse(member)
  });
});

const removeMember = asyncHandler(async (req, res) => {
  const member = await OrganizationMember.findOne({
    _id: req.params.id,
    organizationId: req.user.id
  });

  if (!member) {
    throw new ApiError(404, "Team member not found.");
  }

  if (member.role === "Owner") {
    const otherActiveOwners = await OrganizationMember.countDocuments({
      organizationId: req.user.id,
      role: "Owner",
      status: "Active",
      _id: { $ne: member._id }
    });

    if (!otherActiveOwners) {
      throw new ApiError(400, "Cannot remove the last remaining Owner.");
    }
  }

  // Disabled, not deleted — historically-posted jobs (Job.postedByMemberId) still need a real
  // member document to resolve against.
  member.status = "Disabled";

  /* Their Google Calendar grant goes with them. A removed recruiter's OAuth tokens are live
     credentials against a personal Google account: leaving them on a disabled row would mean this
     app still holds the ability to write to the calendar of someone it no longer employs, and
     would keep working until Google's own expiry. Revoked at Google as well as cleared here, so it
     also disappears from that person's own account permissions page.

     Interviews they already scheduled keep their googleEventId and stay visible; what is gone is
     this app's ability to touch that calendar again. Rescheduling one of those returns a clear
     "that calendar is no longer connected" rather than silently writing to someone else's. */
  await revokeMemberCalendarGrant(member._id);

  await member.save();

  return sendSuccess(res, {
    message: "Team member removed.",
    member: toMemberResponse(member)
  });
});

module.exports = {
  MANAGER_ROLES,
  inviteMember,
  completeInvite,
  getMyMemberSettings,
  updateMyMemberSettings,
  listMembers,
  updateMemberRole,
  removeMember
};
