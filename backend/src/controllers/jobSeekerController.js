const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const JobSeeker = require("../models/JobSeeker");
const Connection = require("../models/Connection");
const { sanitizeSeekerProfile } = require("../utils/profileAccess");
const { requireNonEmptyString } = require("../utils/validation");

async function canAccessNetworkOnlyProfile(viewer, seekerId) {
  if (!viewer?.id || viewer.role !== "seeker") {
    return false;
  }

  return Boolean(await Connection.exists({
    status: "Accepted",
    $or: [
      { requester: viewer.id, recipient: seekerId },
      { requester: seekerId, recipient: viewer.id }
    ]
  }));
}

const updateVisibility = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can update profile visibility.");
  }

  const profileVisibility = requireNonEmptyString(req.body.profileVisibility, "profileVisibility");

  if (!["Public", "Private", "NetworkOnly"].includes(profileVisibility)) {
    throw new ApiError(400, "profileVisibility must be Public, Private, or NetworkOnly.");
  }

  const seeker = await JobSeeker.findById(req.user.id);

  if (!seeker) {
    throw new ApiError(404, "Job seeker not found.");
  }

  if (profileVisibility === "NetworkOnly" && !seeker.isPro) {
    throw new ApiError(403, "NetworkOnly visibility is available only for Pro users.");
  }

  seeker.profileVisibility = profileVisibility;
  await seeker.save();

  return sendSuccess(res, {
    message: "Profile visibility updated successfully.",
    profileVisibility: seeker.profileVisibility
  });
});

const getSeekerProfile = asyncHandler(async (req, res) => {
  const seeker = await JobSeeker.findById(req.params.id);

  if (!seeker) {
    throw new ApiError(404, "Job seeker not found.");
  }

  const isOwner = req.user?.id === seeker._id.toString();

  if (isOwner) {
    return sendSuccess(res, {
      message: "Seeker profile fetched successfully.",
      profile: sanitizeSeekerProfile(seeker, { includePrivate: true })
    });
  }

  if (seeker.profileVisibility === "Private") {
    throw new ApiError(403, "This profile is private.");
  }

  if (seeker.profileVisibility === "NetworkOnly") {
    const hasNetworkAccess = await canAccessNetworkOnlyProfile(req.user, seeker._id);

    if (!hasNetworkAccess) {
      throw new ApiError(403, "This profile is visible only to the seeker's network.");
    }
  }

  return sendSuccess(res, {
    message: "Seeker profile fetched successfully.",
    profile: sanitizeSeekerProfile(seeker)
  });
});

module.exports = {
  updateVisibility,
  getSeekerProfile
};
