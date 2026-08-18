const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const { sendEmail } = require("../utils/email");
const { requireNonEmptyString } = require("../utils/validation");
const { createAccessToken, createRefreshToken } = require("../utils/jwt");

const Organization = require("../models/Organization");
const OrganizationMember = require("../models/OrganizationMember");

const MANAGER_ROLES = ["Owner", "Admin"];
const MEMBER_ROLES = ["Owner", "Admin", "Recruiter"];
const INVITE_TOKEN_TYPE = "org-member-invite";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function getFrontendUrl() {
  return (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
}

function signInviteToken(memberId) {
  return jwt.sign({ type: INVITE_TOKEN_TYPE, memberId }, process.env.JWT_SECRET, {
    expiresIn: "7d"
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

const inviteMember = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const role = MEMBER_ROLES.includes(req.body.role) ? req.body.role : "Recruiter";

  if (!email) {
    throw new ApiError(400, "email is required.");
  }

  const [existingMember, organization] = await Promise.all([
    OrganizationMember.findOne({ email }),
    Organization.findById(req.user.id)
  ]);

  if (existingMember) {
    throw new ApiError(409, "A team member with this email already exists.");
  }

  if (!organization) {
    throw new ApiError(404, "Organization not found.");
  }

  const member = await OrganizationMember.create({
    organizationId: organization._id,
    email,
    firstName: req.body.firstName || "",
    lastName: req.body.lastName || "",
    role,
    status: "Invited",
    invitedBy: req.orgMember._id
  });

  const token = signInviteToken(member._id.toString());
  const setupLink = `${getFrontendUrl()}/team/accept-invite?token=${encodeURIComponent(token)}`;

  await sendEmail(
    email,
    `You've been invited to join ${organization.companyName} on sgetai`,
    `
      <p>${req.orgMember.firstName || "A teammate"} invited you to join <strong>${organization.companyName}</strong>'s hiring team as ${role}.</p>
      <p>Set up your password to get started:</p>
      <p><a href="${setupLink}">${setupLink}</a></p>
      <p>This link is valid for 7 days.</p>
    `
  ).catch((error) => {
    // Invite is already persisted — a delivery failure shouldn't roll it back, but is worth
    // knowing about server-side (mirrors the fire-and-forget email pattern used elsewhere).
    console.error(`Failed to send team invite email to ${email}:`, error.message);
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
  const lastName = requireNonEmptyString(req.body.lastName, "lastName");

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
