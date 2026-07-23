const JobSeeker = require("../models/JobSeeker");
const Organization = require("../models/Organization");

const roleModelMap = {
  seeker: JobSeeker,
  organization: Organization
};

function getModelForRole(role) {
  return roleModelMap[role] || null;
}

async function findUserByAuth(authUser) {
  const Model = getModelForRole(authUser?.role);

  if (!Model) {
    return null;
  }

  return Model.findById(authUser.id);
}

module.exports = {
  roleModelMap,
  getModelForRole,
  findUserByAuth
};
