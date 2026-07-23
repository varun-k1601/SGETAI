const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const Follow = require("../models/Follow");
const Organization = require("../models/Organization");
const JobSeeker = require("../models/JobSeeker");
const { createNotification } = require("../services/notificationService");

const followOrganization = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can follow organizations.");
  }

  const [seeker, organization] = await Promise.all([
    JobSeeker.findById(req.user.id),
    Organization.findById(req.params.organizationId)
  ]);

  if (!seeker) {
    throw new ApiError(404, "Job seeker not found.");
  }

  if (!organization) {
    throw new ApiError(404, "Organization not found.");
  }

  if (organization.verificationStatus !== "Verified" || !organization.domainMatched) {
    throw new ApiError(403, "You can only follow verified organizations.");
  }

  let follow;
  try {
    follow = await Follow.create({
      jobSeekerId: seeker._id,
      organizationId: organization._id
    });
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, "You are already following this organization.");
    }
    throw error;
  }

  await createNotification({
    recipientId: organization._id,
    recipientRole: "organization",
    type: "follow",
    title: "New follower",
    message: `${seeker.firstName} ${seeker.lastName} started following your organization.`,
    metadata: { jobSeekerId: seeker._id }
  });

  return sendSuccess(res, {
    message: "Organization followed successfully.",
    follow
  }, 201);
});

const unfollowOrganization = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can unfollow organizations.");
  }

  const result = await Follow.findOneAndDelete({
    jobSeekerId: req.user.id,
    organizationId: req.params.organizationId
  });

  if (!result) {
    throw new ApiError(404, "Follow relationship not found.");
  }

  return sendSuccess(res, {
    message: "Organization unfollowed successfully."
  });
});

const updateFollowPreferences = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can update follow preferences.");
  }

  const seeker = await JobSeeker.findById(req.user.id).select("isPro");
  if (!seeker) {
    throw new ApiError(404, "Job seeker not found.");
  }

  const follow = await Follow.findOne({
    jobSeekerId: req.user.id,
    organizationId: req.params.organizationId
  });

  if (!follow) {
    throw new ApiError(404, "Follow relationship not found.");
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "notifyJobs")) {
    if (req.body.notifyJobs === true && !seeker.isPro) {
      throw new ApiError(403, "Job notifications are available only for Pro users.");
    }

    follow.notificationPreferences.notifyJobs = Boolean(req.body.notifyJobs);
  }

  await follow.save();

  return sendSuccess(res, {
    message: "Follow preferences updated successfully.",
    follow
  });
});

const listFollows = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can view followed organizations.");
  }

  const follows = await Follow.find({ jobSeekerId: req.user.id })
    .populate("organizationId", "companyName industry websiteUrl verificationStatus")
    .sort({ createdAt: -1 });

  return sendSuccess(res, {
    message: "Followed organizations fetched successfully.",
    follows
  });
});

module.exports = {
  followOrganization,
  unfollowOrganization,
  updateFollowPreferences,
  listFollows
};
