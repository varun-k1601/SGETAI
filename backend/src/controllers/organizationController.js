const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const Organization = require("../models/Organization");
const JobSeeker = require("../models/JobSeeker");
const { sanitizeOrganizationProfile } = require("../utils/profileAccess");
const { getReadableFileUrl } = require("../utils/supabaseService");

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

  // Convert logo filePath to readable URL
  if (profile.logo?.filePath && !profile.logo?.url) {
    try {
      profile.logo = {
        ...profile.logo,
        url: await getReadableFileUrl(profile.logo.filePath)
      };
    } catch (error) {
      // silently fail
    }
  }

  return sendSuccess(res, {
    message: "Organization profile fetched successfully.",
    profile
  });
});

module.exports = {
  getOrganizationProfile
};
