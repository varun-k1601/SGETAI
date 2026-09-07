const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const Organization = require("../models/Organization");
const JobSeeker = require("../models/JobSeeker");
const { sanitizeOrganizationProfile } = require("../utils/profileAccess");
const { attachMediaUrl } = require("../services/mediaUrlService");
const { countOrganizationFollowers } = require("../services/followerCountService");

const getOrganizationProfile = asyncHandler(async (req, res) => {
  const organization = await Organization.findById(req.params.id);

  if (!organization) {
    throw new ApiError(404, "Organization not found.");
  }

  const isOwner = req.user?.id === organization._id.toString();
  let includeRepresentativeDetails = isOwner;

  if (!includeRepresentativeDetails && req.user?.role === "seeker") {
    const seeker = await JobSeeker.findById(req.user.id).select("isPro");
    includeRepresentativeDetails = Boolean(seeker?.isPro);
  }

  let profile = sanitizeOrganizationProfile(organization, {
    includeRepresentativeDetails
  });

  // A SIGNED URL, not the stored one. The stored logo.url is a /object/public/ link against the
  // private bucket and 400s "Bucket not found"; the old `&& !profile.logo?.url` guard meant this
  // never even ran for an organization that had uploaded a logo, because the dead URL was already
  // there. attachMediaUrl always re-signs, and returns the object unchanged if signing fails so the
  // page falls back to the company initial rather than a broken image.
  profile.logo = await attachMediaUrl(profile.logo);

  // The same number the owner sees on their own profile page, from the same helper — a public
  // visitor and the company must never be looking at two different counts of the same thing.
  // Public on purpose: it is an aggregate, it reveals nobody, and it is the only follower-shaped
  // data either endpoint returns.
  profile.followerCount = await countOrganizationFollowers(organization._id);

  return sendSuccess(res, {
    message: "Organization profile fetched successfully.",
    profile
  });
});

module.exports = {
  getOrganizationProfile
};
