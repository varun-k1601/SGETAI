const Follow = require("../models/Follow");

// How many seekers follow one company.
//
// Follow carries a unique compound index on { jobSeekerId, organizationId }, so a row IS a
// follower and countDocuments is exact — no $group, no de-duping. Kept in one place because two
// endpoints answer with this number (the owner's own GET /profile/me and the public
// GET /organizations/:id) and they must never be able to disagree.
//
// COUNT ONLY, deliberately. Nothing here returns who the followers are: a recruiter enumerating
// every seeker who followed them is a different feature with its own privacy question, and adding
// the list to a count helper is how that would arrive by accident.
async function countOrganizationFollowers(organizationId) {
  if (!organizationId) {
    return 0;
  }

  return Follow.countDocuments({ organizationId });
}

module.exports = { countOrganizationFollowers };
