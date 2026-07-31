const JobSeeker = require("../models/JobSeeker");
const Organization = require("../models/Organization");
const OrganizationMember = require("../models/OrganizationMember");

const roleModelMap = {
  seeker: JobSeeker,
  organization: Organization
};

function getModelForRole(role) {
  return roleModelMap[role] || null;
}

// Unchanged: for role === "organization", authUser.id is (and stays) the Organization's own
// _id — every existing caller of this function across the backend relies on that.
async function findUserByAuth(authUser) {
  const Model = getModelForRole(authUser?.role);

  if (!Model) {
    return null;
  }

  return Model.findById(authUser.id);
}

// NEW, purely additive — resolves the acting OrganizationMember (the individual HR person who is
// actually logged in), separate from findUserByAuth above which resolves the company. Only
// present for role === "organization" sessions that were issued after this feature shipped (see
// authController.js's buildAuthPayload); returns null for seeker/admin sessions or legacy
// organization sessions with no memberId yet.
async function findMemberByAuth(authUser) {
  if (authUser?.role !== "organization" || !authUser?.memberId) {
    return null;
  }

  return OrganizationMember.findById(authUser.memberId);
}

module.exports = {
  roleModelMap,
  getModelForRole,
  findUserByAuth,
  findMemberByAuth
};
